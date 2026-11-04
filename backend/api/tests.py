"""
Testes da API. Rodar com:
    python manage.py test

O USGS é simulado com unittest.mock: os testes não acessam a internet e
rodam iguais em qualquer computador.
"""

import json
import shutil
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

import numpy as np
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import Coleta, ModeloTreinado, Regiao, Terremoto
from .services import estatisticas, importacao, ml, zonas
from .services.usgs import ErroUSGS

AGORA = datetime(2026, 10, 1, tzinfo=timezone.utc)


def _retangulos(caixas):
    return {"type": "MultiPolygon", "coordinates": [
        [[[lon_min, lat_min], [lon_max, lat_min], [lon_max, lat_max],
          [lon_min, lat_max], [lon_min, lat_min]]]
        for lat_min, lat_max, lon_min, lon_max in caixas]}


def criar_regiao(codigo="japan", nome="Japan", caixas=((24, 46, 122, 146),),
                 tipo=Regiao.Tipo.CONTINENTE, margem=0, **campos) -> Regiao:
    """
    Uma região de teste: cada caixa (lat_min, lat_max, lon_min, lon_max) vira um retângulo do
    polígono. `margem` (graus) alarga a faixa de costa dos continentes.
    """
    campos.setdefault("ordem", Regiao.objects.count())
    costa = {}
    if tipo == Regiao.Tipo.CONTINENTE:
        costa = _retangulos([(a - margem, b + margem, c - margem, d + margem)
                             for a, b, c, d in caixas])
    return Regiao.objects.create(codigo=codigo, nome=nome, tipo=tipo, geometria=_retangulos(caixas),
                                 costa=costa, caixas=[list(c) for c in caixas], **campos)


def criar_terremoto(**campos) -> Terremoto:
    padrao = dict(usgs_id=f"t{Terremoto.objects.count()}", latitude=35.7, longitude=139.7,
                  profundidade_km=30, magnitude=4.0, data_hora=AGORA, local="Teste, Japão")
    padrao.update(campos)
    terremoto = Terremoto(**padrao)
    zonas.atribuir([terremoto])  # as regiões precisam existir antes dos terremotos
    terremoto.save()
    return terremoto


def feature_usgs(id_, mag=4.6, lat=38.3, lon=142.4, prof=40.0, dias_atras=10):
    """Uma feature no formato GeoJSON devolvido pelo USGS."""
    ms = int((AGORA - timedelta(days=dias_atras)).timestamp() * 1000)
    return {"id": id_, "geometry": {"coordinates": [lon, lat, prof]},
            "properties": {"mag": mag, "time": ms, "updated": ms, "place": "Teste, Japão",
                           "tsunami": 0, "magType": "mb", "felt": None, "alert": None}}


def criar_base_sintetica(meses=24, semente=0):
    """
    Base com atividade concentrada em três células, para o ML ter padrão a aprender.
    """
    gerador = np.random.default_rng(semente)
    focos = [(35.5, 140.5, 0.6), (38.5, 142.5, 0.4), (33.5, 135.5, 0.3)]
    terremotos = []
    for dia in range(meses * 30):
        for lat, lon, chance in focos:
            if gerador.random() < chance / 6:
                terremotos.append(Terremoto(
                    usgs_id=f"s{len(terremotos)}", latitude=lat + gerador.uniform(-0.4, 0.4),
                    longitude=lon + gerador.uniform(-0.4, 0.4), profundidade_km=50,
                    magnitude=float(gerador.choice([4.0, 4.6, 5.0])),
                    data_hora=AGORA - timedelta(days=dia)))
    Terremoto.objects.bulk_create(terremotos)


class TerremotoApiTests(TestCase):
    def setUp(self):
        self.cliente = APIClient()
        criar_terremoto(magnitude=6.5, profundidade_km=20)
        criar_terremoto(magnitude=4.1, profundidade_km=150, data_hora=AGORA - timedelta(days=400))
        criar_terremoto(magnitude=5.0, profundidade_km=350)

    def test_lista_paginada(self):
        resposta = self.cliente.get("/api/terremotos/")
        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(resposta.json()["count"], 3)

    def test_filtros(self):
        r = self.cliente.get("/api/terremotos/?magnitude_min=5")
        self.assertEqual(r.json()["count"], 2)
        r = self.cliente.get("/api/terremotos/?faixa_profundidade=intermediario")
        self.assertEqual(r.json()["results"][0]["magnitude"], 4.1)
        r = self.cliente.get("/api/terremotos/?data_inicio=2026-01-01")
        self.assertEqual(r.json()["count"], 2)

    def test_filtro_invalido_400(self):
        self.assertEqual(self.cliente.get("/api/terremotos/?magnitude_min=abc").status_code, 400)

    def test_crud(self):
        dados = {"usgs_id": "manual", "latitude": 35.7, "longitude": 139.8,
                 "profundidade_km": 30, "magnitude": 4.2, "data_hora": "2026-10-01T12:00:00Z"}
        criado = self.cliente.post("/api/terremotos/", dados, format="json")
        self.assertEqual(criado.status_code, 201)
        self.assertEqual(criado.json()["faixa_profundidade"], "raso")
        url = f"/api/terremotos/{criado.json()['id']}/"
        self.assertEqual(self.cliente.patch(url, {"magnitude": 4.5}, format="json").json()["magnitude"], 4.5)
        self.assertEqual(self.cliente.delete(url).status_code, 204)
        self.assertEqual(self.cliente.get(url).status_code, 404)

    def test_validacao_de_faixas(self):
        dados = {"usgs_id": "x", "latitude": -120, "longitude": 139.8,
                 "profundidade_km": 30, "magnitude": 14, "data_hora": "2026-10-01T12:00:00Z"}
        resposta = self.cliente.post("/api/terremotos/", dados, format="json")
        self.assertEqual(resposta.status_code, 400)
        self.assertIn("latitude", resposta.json())
        self.assertIn("magnitude", resposta.json())

    def test_usgs_id_unico(self):
        dados = {"usgs_id": "t0", "latitude": 35, "longitude": 140, "profundidade_km": 10,
                 "magnitude": 4, "data_hora": "2026-10-01T12:00:00Z"}
        self.assertEqual(self.cliente.post("/api/terremotos/", dados, format="json").status_code, 400)


class RegiaoTests(TestCase):
    def setUp(self):
        self.cliente = APIClient()
        criar_regiao()
        criar_regiao("america-do-sul", "América do Sul", [(-56, -17, -76, -66)])
        criar_terremoto(latitude=35.7, longitude=139.7)          # Japão
        criar_terremoto(latitude=36.0, longitude=140.0)          # Japão
        criar_terremoto(latitude=-33.4, longitude=-70.6)         # América do Sul

    def test_filtro_por_regiao(self):
        japao = self.cliente.get("/api/terremotos/?regiao=japan").json()
        sul = self.cliente.get("/api/terremotos/?regiao=america-do-sul").json()
        self.assertEqual((japao["count"], sul["count"]), (2, 1))

    def test_regiao_inexistente_400(self):
        self.assertEqual(self.cliente.get("/api/terremotos/?regiao=atlantida").status_code, 400)

    def test_estatisticas_respeitam_a_regiao(self):
        self.assertEqual(self.cliente.get("/api/estatisticas/?regiao=america-do-sul").json()["total"], 1)

    def test_lista_com_contagem_de_terremotos(self):
        regioes = {r["codigo"]: r for r in self.cliente.get("/api/regioes/").json()}
        self.assertEqual(regioes["japan"]["total_terremotos"], 2)
        self.assertEqual(regioes["america-do-sul"]["total_terremotos"], 1)
        criar_regiao("africa", "África", [(-35, 37, -18, 52)])
        com_dados = self.cliente.get("/api/regioes/?com_dados=true").json()
        self.assertEqual({r["codigo"] for r in com_dados}, {"japan", "america-do-sul"})

    def test_detalhe_da_regiao(self):
        dados = self.cliente.get("/api/regioes/japan/").json()
        self.assertEqual((dados["nome"], dados["total_terremotos"]), ("Japan", 2))
        self.assertEqual(self.cliente.get("/api/regioes/atlantida/").status_code, 404)

    def test_importar_regiao_sem_recorte_400(self):
        criar_regiao("vazia", "Sem recorte", [], tipo=Regiao.Tipo.OCEANO)
        resposta = self.cliente.post("/api/regioes/vazia/importar/", {}, format="json")
        self.assertEqual(resposta.status_code, 400)


class ClassificacaoTests(TestCase):
    """Terra, costa e mar aberto: a regra que decide a região de cada terremoto."""

    def setUp(self):
        criar_regiao("ilha", "Ilha", [(30, 40, 130, 140)], margem=2)
        criar_regiao("ilha-vizinha", "Ilha vizinha", [(30, 40, 143, 150)], margem=2)
        criar_regiao("mar", "Mar", [(0, 60, 100, 170)], tipo=Regiao.Tipo.OCEANO)
        self.classificador = zonas.Classificador()

    def test_em_terra(self):
        self.assertEqual(self.classificador.zona_do_ponto(35, 135), "ilha")
        self.assertEqual(self.classificador.zona_do_ponto(35, 145), "ilha-vizinha")

    def test_no_mar_perto_da_costa_vai_para_o_continente_mais_proximo(self):
        # 141,2° e 141,9° estão na costa das duas ilhas; ganha a mais próxima
        self.assertEqual(self.classificador.zona_do_ponto(35, 141.2), "ilha")
        self.assertEqual(self.classificador.zona_do_ponto(35, 141.9), "ilha-vizinha")

    def test_no_mar_aberto_vai_para_o_oceano(self):
        self.assertEqual(self.classificador.zona_do_ponto(10, 120), "mar")

    def test_fora_de_todos_os_poligonos_vai_para_o_oceano_mais_proximo(self):
        self.assertEqual(self.classificador.zona_do_ponto(-50, 0), "mar")

    def test_reclassificar_concorda_com_atribuir(self):
        pontos = [(35, 135), (35, 145), (35, 141.2), (35, 141.9), (10, 120), (-50, 0)]
        lista = [Terremoto(usgs_id=f"p{i}", latitude=lat, longitude=lon, profundidade_km=10,
                           magnitude=4.0, data_hora=AGORA) for i, (lat, lon) in enumerate(pontos)]
        zonas.atribuir(lista)
        esperado = {t.usgs_id: t.zona for t in lista}
        for t in lista:
            t.zona = "errada"
        Terremoto.objects.bulk_create(lista)
        contagem = zonas.reclassificar()
        self.assertEqual(dict(Terremoto.objects.values_list("usgs_id", "zona")), esperado)
        self.assertEqual(sum(contagem.values()), len(pontos))

    @mock.patch("api.services.usgs.buscar_terremotos")
    def test_importacao_grava_a_regiao_do_evento(self, buscar):
        # consultado pelo oceano, mas o evento está na ilha
        buscar.return_value = [feature_usgs("a", lat=35, lon=135)]
        importacao.importar_do_usgs(1, regiao=Regiao.objects.get(codigo="mar"))
        self.assertEqual(Terremoto.objects.get(usgs_id="a").zona, "ilha")


class EstatisticaTests(TestCase):
    def setUp(self):
        self.cliente = APIClient()
        criar_terremoto(magnitude=6.5, profundidade_km=20)
        criar_terremoto(magnitude=4.1, profundidade_km=150)
        criar_terremoto(magnitude=2.8, profundidade_km=10, data_hora=AGORA - timedelta(days=40))

    def test_resumo(self):
        dados = self.cliente.get("/api/estatisticas/").json()
        self.assertEqual(dados["total"], 3)
        self.assertEqual(dados["mais_forte"]["magnitude"], 6.5)

    def test_resumo_respeita_filtros(self):
        self.assertEqual(self.cliente.get("/api/estatisticas/?magnitude_min=4").json()["total"], 2)

    def test_por_faixas(self):
        magnitude = {f["faixa"]: f["total"] for f in
                     self.cliente.get("/api/estatisticas/por-magnitude/").json()}
        self.assertEqual(magnitude["menor que 3"], 1)
        self.assertEqual(magnitude["6 ou mais"], 1)
        profundidade = {f["faixa"]: f["total"] for f in
                        self.cliente.get("/api/estatisticas/por-profundidade/").json()}
        self.assertEqual(profundidade, {"raso": 2, "intermediario": 1, "profundo": 0})

    def test_por_mes(self):
        meses = self.cliente.get("/api/estatisticas/por-mes/").json()
        self.assertEqual([m["mes"] for m in meses], ["2026-08", "2026-10"])

    def test_correlacao(self):
        dados = self.cliente.get("/api/estatisticas/correlacao/").json()
        self.assertEqual(dados["colunas"], estatisticas.CAMPOS_CORRELACAO)
        self.assertAlmostEqual(dados["valores"][0][0], 1)
        self.assertAlmostEqual(dados["valores"][0][1], dados["valores"][1][0])
        self.assertIsNone(dados["valores"][0][2])  # nenhum evento de teste tem estações

    def test_analises_do_ml_sem_dados_suficientes(self):
        self.assertEqual(self.cliente.get("/api/estatisticas/janelas/").json(), [])
        self.assertEqual(self.cliente.get("/api/estatisticas/casos-positivos/").json(), [])


class AnalisesDoMlTests(TestCase):
    def setUp(self):
        self.cliente = APIClient()
        criar_base_sintetica()

    def test_janelas(self):
        janelas = {j["feature"]: j["auc"] for j in self.cliente.get("/api/estatisticas/janelas/").json()}
        self.assertEqual(list(janelas), estatisticas.JANELAS)
        self.assertTrue(all(0 <= auc <= 1 for auc in janelas.values()))

    def test_janelas_por_faixa_cobrem_a_tabela_do_ml(self):
        painel, _ = ml.montar_painel(ml._dataframe(Terremoto.objects.all()), 4.5, 1.0)
        for janela in self.cliente.get("/api/estatisticas/janelas/").json():
            self.assertEqual(sum(f["linhas"] for f in janela["faixas"]), len(painel))
            self.assertEqual(sum(f["positivos"] for f in janela["faixas"]), int(painel["alvo"].sum()))

    def test_casos_positivos_bate_com_a_tabela_do_ml(self):
        linhas = self.cliente.get("/api/estatisticas/casos-positivos/").json()
        self.assertEqual(len(linhas), len(estatisticas.TAMANHOS_CELULA) * len(estatisticas.ALVOS))
        um_grau = next(l for l in linhas if l["tamanho_celula"] == 1.0 and l["magnitude_alvo"] == 4.5)
        painel, _ = ml.montar_painel(ml._dataframe(Terremoto.objects.all()), 4.5, 1.0)
        self.assertEqual(um_grau["linhas"], len(painel))
        self.assertEqual(um_grau["positivos"], int(painel["alvo"].sum()))


class ImportacaoTests(TestCase):
    @mock.patch("api.services.usgs.buscar_terremotos")
    def test_importa_e_atualiza_sem_duplicar(self, buscar):
        buscar.return_value = [feature_usgs("a"), feature_usgs("b")]
        coleta = importacao.importar_do_usgs(anos=3)
        self.assertEqual((coleta.novos, coleta.atualizados), (2, 0))

        buscar.return_value = [feature_usgs("a", mag=5.1), feature_usgs("c")]
        coleta = importacao.importar_do_usgs(anos=3)
        self.assertEqual((coleta.novos, coleta.atualizados), (1, 1))
        self.assertEqual(Terremoto.objects.count(), 3)
        self.assertEqual(Terremoto.objects.get(usgs_id="a").magnitude, 5.1)

    def test_converte_coordenadas_e_tempo(self):
        registro = importacao.registro_de_feature(feature_usgs("a", lat=38, lon=142, prof=12))
        terremoto = importacao.terremoto_de_registro(registro)
        self.assertEqual((terremoto.latitude, terremoto.longitude), (38, 142))
        self.assertEqual(terremoto.profundidade_km, 12)
        self.assertEqual(terremoto.data_hora, AGORA - timedelta(days=10))

    @mock.patch("api.services.usgs.buscar_terremotos")
    def test_post_coleta(self, buscar):
        buscar.return_value = [feature_usgs("a")]
        resposta = APIClient().post("/api/coletas/", {"anos": 2}, format="json")
        self.assertEqual(resposta.status_code, 201)
        self.assertEqual(resposta.json()["novos"], 1)
        buscar.assert_called_once_with(2, 2.5)

    @mock.patch("api.services.usgs.buscar_terremotos", side_effect=ErroUSGS("fora do ar"))
    def test_post_coleta_com_usgs_fora_do_ar(self, _):
        resposta = APIClient().post("/api/coletas/", {"anos": 2}, format="json")
        self.assertEqual(resposta.status_code, 502)
        self.assertEqual(resposta.json()["status"], "erro")
        self.assertEqual(Coleta.objects.get().status, Coleta.Status.ERRO)


def csv_usgs(*linhas, cabecalho=None):
    """Arquivo CSV em memória com as colunas do USGS (as mesmas de data/raw/)."""
    cabecalho = cabecalho or ("id,mag,magType,time,updated,place,tsunami,alert,sig,felt,cdi,mmi,"
                              "nst,gap,dmin,rms,status,net,type,longitude,latitude,depth")
    ms = int(AGORA.timestamp() * 1000)
    corpo = "\n".join([cabecalho] + [linha.format(ms=ms) for linha in linhas])
    return SimpleUploadedFile("teste.csv", corpo.encode("utf-8"), content_type="text/csv")


LINHA_CSV = ('{id},{mag},mb,{{ms}},{{ms}},"10 km E of Sendai, Japan",0,,300,,,,30,50,0.4,0.6,'
             'reviewed,us,{tipo},142.0,38.2,40.0')


class UploadCsvTests(TestCase):
    def setUp(self):
        self.cliente = APIClient()

    def enviar(self, arquivo, **campos):
        return self.cliente.post("/api/coletas/upload/", {"arquivo": arquivo, **campos},
                                 format="multipart")

    def test_importa_csv_com_colunas_do_usgs(self):
        resposta = self.enviar(csv_usgs(LINHA_CSV.format(id="a", mag=4.6, tipo="earthquake"),
                                        LINHA_CSV.format(id="b", mag=3.0, tipo="earthquake")))
        self.assertEqual(resposta.status_code, 201, resposta.json())
        self.assertEqual((resposta.json()["novos"], resposta.json()["origem"]), (2, "teste.csv"))
        terremoto = Terremoto.objects.get(usgs_id="a")
        self.assertEqual((terremoto.latitude, terremoto.longitude, terremoto.magnitude),
                         (38.2, 142.0, 4.6))
        self.assertEqual(terremoto.data_hora, AGORA)

    def test_aceita_time_em_data_iso(self):
        """O mesmo evento com time no formato do banco (data ISO em UTC)."""
        linha = LINHA_CSV.replace("{{ms}},{{ms}}", "2026-10-01 00:00:00.000000,2026-10-01 00:00:00")
        resposta = self.enviar(csv_usgs(linha.format(id="a", mag=4.6, tipo="earthquake")))
        self.assertEqual(resposta.json()["novos"], 1, resposta.json())
        self.assertEqual(Terremoto.objects.get().data_hora, AGORA)
        self.assertEqual(importacao.ms_em_texto(int(AGORA.timestamp() * 1000)),
                         "2026-10-01 00:00:00.000000")

    def test_reenvio_atualiza_sem_duplicar(self):
        self.enviar(csv_usgs(LINHA_CSV.format(id="a", mag=4.6, tipo="earthquake")))
        resposta = self.enviar(csv_usgs(LINHA_CSV.format(id="a", mag=5.0, tipo="earthquake")))
        self.assertEqual((resposta.json()["novos"], resposta.json()["atualizados"]), (0, 1))
        self.assertEqual(Terremoto.objects.get().magnitude, 5.0)

    def test_descarta_magnitude_baixa_e_outros_tipos(self):
        resposta = self.enviar(csv_usgs(LINHA_CSV.format(id="a", mag=4.6, tipo="earthquake"),
                                        LINHA_CSV.format(id="b", mag=1.2, tipo="earthquake"),
                                        LINHA_CSV.format(id="c", mag=4.0, tipo="quarry blast")))
        self.assertEqual(resposta.json()["novos"], 1)
        self.assertIn("2 linha(s) descartada(s)", resposta.json()["mensagem"])

    def test_magnitude_minima_configuravel(self):
        resposta = self.enviar(csv_usgs(LINHA_CSV.format(id="b", mag=1.2, tipo="earthquake")),
                               magnitude_minima=0)
        self.assertEqual(resposta.json()["novos"], 1)

    def test_colunas_ausentes_400(self):
        resposta = self.enviar(csv_usgs("a,4.5", cabecalho="id,mag"))
        self.assertEqual(resposta.status_code, 400)
        self.assertIn("Colunas ausentes", resposta.json()["mensagem"])
        self.assertEqual(Coleta.objects.get().status, Coleta.Status.ERRO)

    def test_extensao_invalida_400(self):
        arquivo = SimpleUploadedFile("dados.txt", b"id,mag", content_type="text/plain")
        resposta = self.enviar(arquivo)
        self.assertEqual(resposta.status_code, 400)
        self.assertIn("arquivo", resposta.json())
        self.assertFalse(Coleta.objects.exists())

    def test_sem_arquivo_400(self):
        resposta = self.cliente.post("/api/coletas/upload/", {}, format="multipart")
        self.assertEqual(resposta.status_code, 400)


class UploadJsonXmlTests(TestCase):
    """Upload de .json (lista, objeto com lista e GeoJSON) e .xml."""

    def setUp(self):
        self.cliente = APIClient()

    def enviar(self, nome, conteudo, **campos):
        arquivo = SimpleUploadedFile(nome, conteudo.encode("utf-8"))
        return self.cliente.post("/api/coletas/upload/", {"arquivo": arquivo, **campos},
                                 format="multipart")

    REGISTRO = {"id": "a", "mag": 4.6, "time": 1759276800000, "latitude": 38.2,
                "longitude": 142.0, "depth": 40.0, "place": "10 km E of Sendai, Japan"}

    def test_json_lista_de_registros(self):
        resposta = self.enviar("dados.json", json.dumps([self.REGISTRO, {**self.REGISTRO, "id": "b"}]))
        self.assertEqual(resposta.status_code, 201, resposta.json())
        self.assertEqual(resposta.json()["novos"], 2)
        self.assertEqual(Terremoto.objects.get(usgs_id="a").local, "10 km E of Sendai, Japan")

    def test_json_objeto_com_lista_dentro(self):
        resposta = self.enviar("dados.json", json.dumps({"terremotos": [self.REGISTRO]}))
        self.assertEqual(resposta.json()["novos"], 1, resposta.json())

    def test_geojson_do_usgs(self):
        feature = {"type": "Feature", "id": "g1",
                   "properties": {"mag": 5.1, "time": 1759276800000, "place": "Chile", "type": "earthquake"},
                   "geometry": {"type": "Point", "coordinates": [-70.6, -33.4, 25.0]}}
        resposta = self.enviar("dados.geojson.json", json.dumps({"type": "FeatureCollection", "features": [feature]}))
        self.assertEqual(resposta.status_code, 201, resposta.json())
        terremoto = Terremoto.objects.get(usgs_id="g1")
        self.assertEqual((terremoto.latitude, terremoto.longitude, terremoto.profundidade_km),
                         (-33.4, -70.6, 25.0))

    def test_xml(self):
        linhas = "".join(
            "<evento>" + "".join(f"<{k}>{v}</{k}>" for k, v in {**self.REGISTRO, "id": i}.items()) + "</evento>"
            for i in ("a", "b"))
        resposta = self.enviar("dados.xml", f"<terremotos>{linhas}</terremotos>")
        self.assertEqual(resposta.status_code, 201, resposta.json())
        self.assertEqual(resposta.json()["novos"], 2)

    def test_json_sem_coluna_obrigatoria_400(self):
        resposta = self.enviar("dados.json", json.dumps([{"id": "a", "mag": 4.0}]))
        self.assertEqual(resposta.status_code, 400)
        self.assertIn("Colunas ausentes no JSON", resposta.json()["mensagem"])

    def test_xml_sem_coluna_obrigatoria_400(self):
        resposta = self.enviar("dados.xml", "<t><e><id>a</id><mag>4.0</mag></e></t>")
        self.assertEqual(resposta.status_code, 400)
        self.assertIn("Colunas ausentes no XML", resposta.json()["mensagem"])

    def test_json_invalido_400(self):
        resposta = self.enviar("dados.json", "{isto não é json")
        self.assertEqual(resposta.status_code, 400)
        self.assertIn("Não foi possível ler o JSON", resposta.json()["mensagem"])

    def test_xml_invalido_400(self):
        resposta = self.enviar("dados.xml", "<abre><sem-fechar>")
        self.assertEqual(resposta.status_code, 400)
        self.assertIn("Não foi possível ler o XML", resposta.json()["mensagem"])
        self.assertEqual(Coleta.objects.get().status, Coleta.Status.ERRO)


class MlTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.pasta = tempfile.mkdtemp()  # modelos dos testes não vão para media/
        cls.override = override_settings(PASTA_MODELOS=Path(cls.pasta))
        cls.override.enable()

    @classmethod
    def tearDownClass(cls):
        cls.override.disable()
        shutil.rmtree(cls.pasta, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.cliente = APIClient()
        criar_base_sintetica()

    def test_validacao_de_parametros(self):
        with self.assertRaises(ml.ErroModelo):
            ml.validar_parametros("knn", {"n_neighbors": 0})
        with self.assertRaises(ml.ErroModelo):
            ml.validar_parametros("knn", {"vizinhos": 5})
        with self.assertRaises(ml.ErroModelo):
            ml.validar_parametros("rede_neural", {"camadas": "abc"})
        self.assertEqual(ml.validar_parametros("arvore_decisao", {})["max_depth"], 5)

    def test_painel_nao_usa_o_futuro(self):
        """A feature de um período só pode depender de períodos anteriores."""
        df = ml._dataframe(Terremoto.objects.all())
        painel, _ = ml.montar_painel(df, 4.5, 1.0)
        celula = painel[(painel.cel_lat == 35) & (painel.cel_lon == 140)].sort_values("periodo")
        np.testing.assert_array_equal(celula["eventos_periodo_anterior"].iloc[1:].to_numpy(),
                                      celula["n_alvo"].iloc[:-1].to_numpy())

    def test_treina_todos_os_algoritmos(self):
        for algoritmo in ml.ALGORITMOS:
            resposta = self.cliente.post("/api/modelos/", {"algoritmo": algoritmo},
                                         format="json")
            self.assertEqual(resposta.status_code, 201, resposta.json())
            self.assertIsNotNone(resposta.json()["metricas"]["roc_auc"])
        self.assertEqual(ModeloTreinado.objects.filter(ativo=True).count(), 1)

    def test_previsao_e_ativacao(self):
        primeiro = self.cliente.post("/api/modelos/", {"algoritmo": "arvore_decisao"},
                                     format="json").json()
        self.cliente.post("/api/modelos/", {"algoritmo": "knn"}, format="json")
        self.cliente.post(f"/api/modelos/{primeiro['id']}/ativar/")

        dados = self.cliente.get("/api/previsoes/?limite=3").json()
        self.assertEqual(dados["algoritmo"], "arvore_decisao")
        self.assertEqual(len(dados["celulas"]), 3)
        # o foco mais ativo deve estar entre as regiões mais prováveis
        centros = [(c["centro"]["latitude"], c["centro"]["longitude"]) for c in dados["celulas"]]
        self.assertIn((35.5, 140.5), centros)

    def test_previsao_por_ponto_e_fora_da_regiao(self):
        self.cliente.post("/api/modelos/", {"algoritmo": "arvore_decisao"}, format="json")
        ponto = self.cliente.get("/api/previsoes/?latitude=35.3&longitude=140.2").json()
        self.assertEqual(ponto["total_celulas"], 1)
        self.assertEqual(self.cliente.get("/api/previsoes/?latitude=95&longitude=-70").status_code, 400)

    def test_sem_modelo_404(self):
        self.assertEqual(self.cliente.get("/api/previsoes/").status_code, 404)

    def test_magnitude_alvo_sem_casos_400(self):
        resposta = self.cliente.post("/api/modelos/", {"algoritmo": "knn", "magnitude_alvo": 7.5},
                                     format="json")
        self.assertEqual(resposta.status_code, 400)

    @mock.patch("api.services.usgs.buscar_terremotos")
    def test_retreino_atualiza_dados_com_6_anos(self, buscar):
        buscar.return_value = [feature_usgs("novo", mag=5.5, lat=35.4, lon=140.3)]
        resposta = self.cliente.post("/api/modelos/", {"algoritmo": "arvore_decisao",
                                                       "atualizar_dados": True}, format="json")
        self.assertEqual(resposta.status_code, 201)
        buscar.assert_called_once_with(6, 2.5)
        self.assertTrue(Terremoto.objects.filter(usgs_id="novo").exists())

    def test_apagar_modelo_remove_arquivo(self):
        modelo = self.cliente.post("/api/modelos/", {"algoritmo": "knn"}, format="json").json()
        arquivo = ml.settings.PASTA_MODELOS / ModeloTreinado.objects.get(pk=modelo["id"]).arquivo
        self.assertTrue(arquivo.exists())
        self.assertEqual(self.cliente.delete(f"/api/modelos/{modelo['id']}/").status_code, 204)
        self.assertFalse(arquivo.exists())


class ImportacaoPorRegiaoTests(TestCase):
    def setUp(self):
        self.regiao = criar_regiao()

    @mock.patch("api.services.usgs.buscar_terremotos")
    def test_importa_a_regiao_pela_api(self, buscar):
        buscar.return_value = [feature_usgs("a")]
        resposta = APIClient().post("/api/regioes/japan/importar/", {"anos": 2}, format="json")
        self.assertEqual(resposta.status_code, 201)
        self.assertEqual(resposta.json()["novos"], 1)
        # consulta só as caixas da região, com a magnitude de completude dela
        buscar.assert_called_once_with(2, 4.0, self.regiao.caixas)

    @mock.patch("api.services.usgs.buscar_terremotos", side_effect=ErroUSGS("fora do ar"))
    def test_usgs_fora_do_ar_na_importacao_da_regiao(self, _):
        resposta = APIClient().post("/api/regioes/japan/importar/", {"anos": 2}, format="json")
        self.assertEqual(resposta.status_code, 502)
        self.assertEqual(Coleta.objects.get().status, Coleta.Status.ERRO)

    def test_importar_regiao_inexistente_404(self):
        resposta = APIClient().post("/api/regioes/atlantida/importar/", {}, format="json")
        self.assertEqual(resposta.status_code, 404)


class CorrecaoDeContinentesTests(TestCase):
    """O Natural Earth põe a Rússia inteira na Europa e a Guiana Francesa na França."""

    def test_russia_e_guiana_francesa(self):
        from api.management.commands.carregar_regioes import _partes_por_continente
        from shapely.geometry import box, shape
        from shapely.ops import unary_union

        def pais(nome, continente, *caixas):
            return {"properties": {"ADMIN": nome, "CONTINENT": continente},
                    "geometry": {"type": "MultiPolygon", "coordinates": [
                        [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]
                        for y0, y1, x0, x1 in caixas]}}

        partes = _partes_por_continente([
            pais("Russia", "Europe", (50, 70, 30, 170)),            # Europa e Sibéria
            pais("France", "Europe", (42, 50, -5, 8), (2, 6, -54, -52)),  # França e Guiana
        ])
        europa, asia = unary_union(partes["Europe"]), unary_union(partes["Asia"])
        sul = unary_union(partes["South America"])
        self.assertTrue(europa.contains(shape({"type": "Point", "coordinates": [40, 60]})))
        self.assertTrue(asia.contains(shape({"type": "Point", "coordinates": [100, 60]})))
        self.assertFalse(europa.intersects(box(60, 50, 170, 70).buffer(-1)))
        self.assertTrue(sul.contains(shape({"type": "Point", "coordinates": [-53, 4]})))
        self.assertFalse(europa.intersects(box(-54, 2, -52, 6)))
