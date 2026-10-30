"""
Testes da API. Rodar com:
    python manage.py test

O USGS é simulado com unittest.mock: os testes não acessam a internet e
rodam iguais em qualquer computador.
"""

import shutil
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

import numpy as np
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import Coleta, ModeloTreinado, Terremoto
from .services import importacao, ml
from .services.usgs import ErroUSGS

AGORA = datetime(2026, 10, 1, tzinfo=timezone.utc)


def criar_terremoto(**campos) -> Terremoto:
    padrao = dict(usgs_id=f"t{Terremoto.objects.count()}", latitude=35.7, longitude=139.7,
                  profundidade_km=30, magnitude=4.0, data_hora=AGORA, local="Teste, Japão")
    padrao.update(campos)
    return Terremoto.objects.create(**padrao)


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
