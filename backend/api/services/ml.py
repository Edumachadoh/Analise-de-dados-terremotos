"""
Machine learning: probabilidade de terremoto por região no próximo período.

A pergunta respondida é:
    "Quais regiões do Japão têm maior probabilidade de registrar um terremoto
     de magnitude >= X nos próximos 30 dias?"

Como funciona:
1. O Japão é dividido em células (padrão: 1° x 1°, cerca de 110 km de lado).
2. O tempo é dividido em períodos de 30 dias, contados para trás a partir do
   terremoto mais recente da base. Assim nenhum período fica incompleto.
3. Para cada célula e período, o alvo é: houve ao menos um terremoto com
   magnitude >= X? As features são o histórico da célula ANTES do período.
4. O teste usa os últimos períodos (divisão temporal), simulando prever o
   futuro com o passado. Uma divisão aleatória deixaria o modelo "ver o futuro".
5. Depois da avaliação, o modelo é re-treinado com todos os períodos e salvo
   para gerar as previsões.
"""

from datetime import timedelta
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from django.conf import settings
from django.db import transaction
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (average_precision_score, f1_score, precision_score,
                             recall_score, roc_auc_score)
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

from ..models import ModeloTreinado, Terremoto

DIAS_PERIODO = 30
PERIODOS_MINIMOS_TREINO = 6

FEATURES = [
    "cel_lat",                  # posição da célula
    "cel_lon",
    "eventos_periodo_anterior",  # terremotos >= alvo no período anterior
    "eventos_3_periodos",        # ... nos 3 períodos anteriores
    "eventos_12_periodos",       # ... nos 12 períodos anteriores
    "taxa_historica",            # fração dos períodos passados com ao menos um evento
    "atividade_geral_3_periodos",  # terremotos de qualquer magnitude nos 3 anteriores
]


class ErroModelo(ValueError):
    """Dados ou parâmetros insuficientes para treinar ou prever."""


# =============================================================================
# Algoritmos disponíveis e seus parâmetros configuráveis
# =============================================================================
# "fixos" são parâmetros que o usuário não altera: class_weight="balanced"
# compensa o desbalanceamento (a maioria das células não tem terremoto) e
# random_state deixa o resultado reproduzível.
ALGORITMOS = {
    "regressao_logistica": {
        "nome": "Regressão logística",
        "descricao": "Modelo linear e interpretável. Serve de referência simples.",
        "classe": LogisticRegression,
        "padronizar": True,
        "fixos": {"class_weight": "balanced", "max_iter": 2000},
        "parametros": {
            "C": {"tipo": "float", "padrao": 1.0, "min": 0.001, "max": 1000,
                  "descricao": "Inverso da regularização: menor = modelo mais simples"},
        },
    },
    "arvore_decisao": {
        "nome": "Árvore de decisão",
        "descricao": "Aprende regras do tipo 'se... então'. Fácil de interpretar.",
        "classe": DecisionTreeClassifier,
        "padronizar": False,
        "fixos": {"class_weight": "balanced", "random_state": 42},
        "parametros": {
            "max_depth": {"tipo": "int", "padrao": 5, "min": 1, "max": 30,
                          "descricao": "Profundidade máxima da árvore"},
            "min_samples_leaf": {"tipo": "int", "padrao": 5, "min": 1, "max": 500,
                                 "descricao": "Mínimo de amostras em cada folha"},
        },
    },
    "knn": {
        "nome": "K vizinhos mais próximos (KNN)",
        "descricao": "Classifica pela maioria dos casos mais parecidos.",
        "classe": KNeighborsClassifier,
        "padronizar": True,  # KNN usa distância: sem padronizar, a maior escala domina
        "fixos": {},
        "parametros": {
            "n_neighbors": {"tipo": "int", "padrao": 15, "min": 1, "max": 200,
                            "descricao": "Número de vizinhos considerados"},
            "weights": {"tipo": "escolha", "padrao": "uniform",
                        "opcoes": ["uniform", "distance"],
                        "descricao": "uniform: votos iguais; distance: vizinhos próximos pesam mais"},
        },
    },
    "random_forest": {
        "nome": "Random Forest",
        "descricao": "Conjunto de árvores (ensemble). Robusto e mostra a importância das features.",
        "classe": RandomForestClassifier,
        "padronizar": False,
        "fixos": {"class_weight": "balanced", "random_state": 42, "n_jobs": -1},
        "parametros": {
            "n_estimators": {"tipo": "int", "padrao": 300, "min": 10, "max": 1000,
                             "descricao": "Número de árvores"},
            "max_depth": {"tipo": "int", "padrao": None, "min": 1, "max": 50, "nulo": True,
                          "descricao": "Profundidade máxima (vazio = sem limite)"},
            "min_samples_leaf": {"tipo": "int", "padrao": 5, "min": 1, "max": 500,
                                 "descricao": "Mínimo de amostras em cada folha"},
        },
    },
    "gradient_boosting": {
        "nome": "Gradient Boosting",
        "descricao": "Árvores treinadas em sequência, cada uma corrigindo a anterior.",
        "classe": GradientBoostingClassifier,
        "padronizar": False,
        "fixos": {"random_state": 42},
        "parametros": {
            "n_estimators": {"tipo": "int", "padrao": 100, "min": 10, "max": 1000,
                             "descricao": "Número de etapas (árvores)"},
            "learning_rate": {"tipo": "float", "padrao": 0.1, "min": 0.001, "max": 1,
                              "descricao": "Taxa de aprendizado: menor = passos mais cuidadosos"},
            "max_depth": {"tipo": "int", "padrao": 3, "min": 1, "max": 10,
                          "descricao": "Profundidade de cada árvore"},
        },
    },
    "rede_neural": {
        "nome": "Rede neural (MLP)",
        "descricao": "Perceptron multicamadas. Captura relações não lineares.",
        "classe": MLPClassifier,
        "padronizar": True,  # redes neurais convergem mal com escalas diferentes
        "fixos": {"random_state": 42, "early_stopping": True},
        "parametros": {
            "camadas": {"tipo": "texto", "padrao": "32,16",
                        "descricao": "Neurônios por camada oculta, separados por vírgula"},
            "alpha": {"tipo": "float", "padrao": 0.0001, "min": 0.000001, "max": 1,
                      "descricao": "Regularização L2"},
            "max_iter": {"tipo": "int", "padrao": 500, "min": 50, "max": 3000,
                         "descricao": "Máximo de épocas de treino"},
        },
    },
}


def listar_algoritmos() -> list[dict]:
    """Algoritmos e parâmetros, no formato devolvido pela API (sem a classe Python)."""
    return [
        {"id": chave, "nome": a["nome"], "descricao": a["descricao"],
         "parametros": a["parametros"]}
        for chave, a in ALGORITMOS.items()
    ]


def validar_parametros(algoritmo: str, parametros: dict | None) -> dict:
    """
    Confere os parâmetros enviados pelo usuário e completa com os padrões.
    Devolve o dicionário validado; levanta ErroModelo com mensagem clara.
    """
    if algoritmo not in ALGORITMOS:
        raise ErroModelo(f"Algoritmo '{algoritmo}' não existe. Opções: {list(ALGORITMOS)}.")
    especificacao = ALGORITMOS[algoritmo]["parametros"]
    parametros = parametros or {}

    desconhecidos = set(parametros) - set(especificacao)
    if desconhecidos:
        raise ErroModelo(f"Parâmetros desconhecidos para {algoritmo}: {sorted(desconhecidos)}. "
                         f"Aceitos: {list(especificacao)}.")

    validados = {}
    for nome, spec in especificacao.items():
        valor = parametros.get(nome, spec["padrao"])
        if valor is None or valor == "":
            if spec.get("nulo") or spec["padrao"] is None:
                validados[nome] = None
                continue
            valor = spec["padrao"]
        try:
            if spec["tipo"] == "int":
                if isinstance(valor, float) and not valor.is_integer():
                    raise ValueError
                valor = int(valor)
            elif spec["tipo"] == "float":
                valor = float(valor)
            elif spec["tipo"] == "texto":
                valor = str(valor)
        except (TypeError, ValueError):
            raise ErroModelo(f"'{nome}' deve ser do tipo {spec['tipo']}.") from None

        if spec["tipo"] in ("int", "float") and not spec["min"] <= valor <= spec["max"]:
            raise ErroModelo(f"'{nome}' deve estar entre {spec['min']} e {spec['max']}.")
        if spec["tipo"] == "escolha" and valor not in spec["opcoes"]:
            raise ErroModelo(f"'{nome}' deve ser uma destas opções: {spec['opcoes']}.")
        validados[nome] = valor

    if algoritmo == "rede_neural":
        _camadas(validados["camadas"])  # valida o formato já aqui
    return validados


def _camadas(texto: str) -> tuple[int, ...]:
    try:
        camadas = tuple(int(n) for n in texto.split(",") if n.strip())
    except ValueError:
        raise ErroModelo("'camadas' deve ser uma lista de inteiros, ex.: 32,16") from None
    if not camadas or len(camadas) > 5 or any(not 1 <= n <= 512 for n in camadas):
        raise ErroModelo("'camadas' deve ter de 1 a 5 camadas, cada uma com 1 a 512 neurônios.")
    return camadas


def criar_pipeline(algoritmo: str, parametros: dict) -> Pipeline:
    """Monta o Pipeline do scikit-learn: [padronização] -> classificador."""
    info = ALGORITMOS[algoritmo]
    kwargs = dict(parametros)
    if algoritmo == "rede_neural":
        kwargs["hidden_layer_sizes"] = _camadas(kwargs.pop("camadas"))
    classificador = info["classe"](**kwargs, **info["fixos"])

    etapas = []
    if info["padronizar"]:
        # Dentro do Pipeline, o StandardScaler aprende média e desvio só com o
        # treino; aplicá-lo antes da divisão vazaria informação do teste.
        etapas.append(("padronizacao", StandardScaler()))
    etapas.append(("classificador", classificador))
    return Pipeline(etapas)


# =============================================================================
# Preparação dos dados: tabela célula x período
# =============================================================================
def _dataframe(queryset) -> pd.DataFrame:
    df = pd.DataFrame.from_records(
        queryset.values("data_hora", "latitude", "longitude", "magnitude")
    )
    if df.empty:
        raise ErroModelo("Não há terremotos no banco. Importe os dados primeiro.")
    df["data_hora"] = pd.to_datetime(df["data_hora"], utc=True)
    return df


def _grade(tamanho_celula: float) -> pd.DataFrame:
    """Todas as células do recorte do Japão (canto inferior esquerdo de cada uma)."""
    lat_min, lat_max, lon_min, lon_max = settings.REGIAO_ANALISE
    lats = np.arange(lat_min, lat_max, tamanho_celula)
    lons = np.arange(lon_min, lon_max, tamanho_celula)
    return pd.DataFrame([(round(a, 4), round(o, 4)) for a in lats for o in lons],
                        columns=["cel_lat", "cel_lon"])


def _celula(valor, origem, tamanho):
    """Canto da célula que contém o valor: origem + n * tamanho."""
    return np.round(origem + np.floor((valor - origem) / tamanho) * tamanho, 4)


def montar_painel(df: pd.DataFrame, magnitude_alvo: float, tamanho_celula: float,
                  incluir_proximo: bool = False) -> tuple[pd.DataFrame, pd.Timestamp]:
    """
    Monta a tabela célula x período com o alvo e as features.

    O período 0 é o mais antigo. Com incluir_proximo=True, acrescenta o período
    seguinte ao último (sem alvo), que é o que será previsto.
    Devolve (painel, data_referencia), sendo a data de referência o fim do
    último período completo.
    """
    lat_min, _, lon_min, _ = settings.REGIAO_ANALISE
    referencia = df["data_hora"].max()
    duracao = pd.Timedelta(days=DIAS_PERIODO)

    # Períodos contados para trás a partir do terremoto mais recente
    atras = ((referencia - df["data_hora"]) // duracao).astype(int)
    n_periodos = int((referencia - df["data_hora"].min()) // duracao)  # descarta o mais antigo, incompleto
    if n_periodos < PERIODOS_MINIMOS_TREINO:
        raise ErroModelo(f"São necessários ao menos {PERIODOS_MINIMOS_TREINO} períodos de "
                         f"{DIAS_PERIODO} dias; a base cobre {n_periodos}.")

    df = df.assign(
        periodo=n_periodos - 1 - atras,
        cel_lat=_celula(df["latitude"], lat_min, tamanho_celula),
        cel_lon=_celula(df["longitude"], lon_min, tamanho_celula),
    )
    df = df[df["periodo"] >= 0]

    total = df.groupby(["cel_lat", "cel_lon", "periodo"]).size().rename("n_total")
    alvo = (df[df["magnitude"] >= magnitude_alvo]
            .groupby(["cel_lat", "cel_lon", "periodo"]).size().rename("n_alvo"))

    # Produto cartesiano: toda célula em todo período, inclusive os sem eventos
    ultimo = n_periodos + (1 if incluir_proximo else 0)
    periodos = pd.DataFrame({"periodo": range(ultimo)})
    painel = _grade(tamanho_celula).merge(periodos, how="cross")
    painel = (painel.set_index(["cel_lat", "cel_lon", "periodo"])
              .join(total).join(alvo).fillna(0).reset_index())
    painel = painel.sort_values(["cel_lat", "cel_lon", "periodo"]).reset_index(drop=True)
    painel["alvo"] = (painel["n_alvo"] > 0).astype(int)

    # Features: só o passado. shift(1) desloca uma posição, então o período t
    # enxerga até t-1 e nunca o próprio resultado.
    grupo = painel.groupby(["cel_lat", "cel_lon"])
    anterior_alvo = grupo["n_alvo"].shift(1)
    anterior_total = grupo["n_total"].shift(1)
    anterior_ocorreu = grupo["alvo"].shift(1)
    chave = [painel["cel_lat"], painel["cel_lon"]]

    painel["eventos_periodo_anterior"] = anterior_alvo
    painel["eventos_3_periodos"] = (anterior_alvo.groupby(chave)
                                    .transform(lambda s: s.rolling(3, min_periods=1).sum()))
    painel["eventos_12_periodos"] = (anterior_alvo.groupby(chave)
                                     .transform(lambda s: s.rolling(12, min_periods=1).sum()))
    painel["taxa_historica"] = (anterior_ocorreu.groupby(chave)
                                .transform(lambda s: s.expanding().mean()))
    painel["atividade_geral_3_periodos"] = (anterior_total.groupby(chave)
                                            .transform(lambda s: s.rolling(3, min_periods=1).sum()))

    # O período 0 não tem passado: sai da tabela
    painel = painel[painel["periodo"] > 0].reset_index(drop=True)
    if incluir_proximo:
        # o período a prever não tem alvo conhecido
        painel.loc[painel["periodo"] == n_periodos, ["alvo", "n_alvo", "n_total"]] = np.nan
    return painel, referencia


# =============================================================================
# Treino e avaliação
# =============================================================================
def _metricas(y, prob, baseline) -> dict:
    previsto = (prob >= 0.5).astype(int)
    duas_classes = len(set(y)) > 1

    def seguro(funcao, *args, **kwargs):
        return round(float(funcao(*args, **kwargs)), 4) if duas_classes else None

    return {
        "roc_auc": seguro(roc_auc_score, y, prob),
        "precisao_media": seguro(average_precision_score, y, prob),
        "f1": round(float(f1_score(y, previsto, zero_division=0)), 4),
        "precisao": round(float(precision_score(y, previsto, zero_division=0)), 4),
        "recall": round(float(recall_score(y, previsto, zero_division=0)), 4),
        "baseline_roc_auc": seguro(roc_auc_score, y, baseline),
        "baseline_precisao_media": seguro(average_precision_score, y, baseline),
    }


def _importancias(pipeline: Pipeline) -> dict | None:
    """Importância das features, quando o algoritmo oferece."""
    modelo = pipeline.named_steps["classificador"]
    if hasattr(modelo, "feature_importances_"):
        valores = modelo.feature_importances_
    elif hasattr(modelo, "coef_"):
        valores = np.abs(modelo.coef_[0])  # magnitude do coeficiente (features padronizadas)
    else:
        return None
    return {f: round(float(v), 4) for f, v in sorted(zip(FEATURES, valores), key=lambda x: -x[1])}


def treinar(algoritmo: str, parametros: dict | None = None, magnitude_alvo: float = 4.5,
            meses_teste: int = 6, tamanho_celula: float = 1.0,
            anos: int | None = None) -> ModeloTreinado:
    """
    Treina, avalia e salva um modelo; o novo modelo passa a ser o ativo.

    anos: usa só os terremotos dos últimos `anos` anos da base (None = todos).
    """
    parametros = validar_parametros(algoritmo, parametros)

    queryset = Terremoto.objects.all()
    if anos:
        mais_recente = queryset.order_by("-data_hora").values_list("data_hora", flat=True).first()
        if mais_recente:
            queryset = queryset.filter(data_hora__gte=mais_recente - timedelta(days=365 * anos))
    df = _dataframe(queryset)
    painel, _ = montar_painel(df, magnitude_alvo, tamanho_celula)

    # Divisão temporal: os últimos `meses_teste` períodos são o teste
    corte = painel["periodo"].max() - meses_teste
    treino, teste = painel[painel["periodo"] <= corte], painel[painel["periodo"] > corte]
    if treino["periodo"].nunique() < PERIODOS_MINIMOS_TREINO:
        raise ErroModelo("Poucos períodos para treino. Reduza meses_teste ou importe mais anos.")
    if treino["alvo"].nunique() < 2:
        raise ErroModelo(f"Nenhum terremoto de magnitude >= {magnitude_alvo} no período de "
                         "treino. Reduza a magnitude-alvo ou importe mais anos.")

    pipeline = criar_pipeline(algoritmo, parametros)
    pipeline.fit(treino[FEATURES], treino["alvo"])
    probabilidades = pipeline.predict_proba(teste[FEATURES])[:, 1]

    metricas = _metricas(teste["alvo"].to_numpy(), probabilidades,
                         teste["taxa_historica"].to_numpy())
    metricas.update({
        "supera_baseline": (metricas["precisao_media"] is not None
                            and metricas["precisao_media"] > metricas["baseline_precisao_media"]),
        "amostras_treino": int(len(treino)),
        "amostras_teste": int(len(teste)),
        "taxa_positivos_teste": round(float(teste["alvo"].mean()), 4),
        "importancia_features": _importancias(pipeline),
    })

    # Avaliado o modelo, ele é re-treinado com todos os períodos para prever o futuro
    pipeline_final = criar_pipeline(algoritmo, parametros)
    pipeline_final.fit(painel[FEATURES], painel["alvo"])

    with transaction.atomic():
        modelo = ModeloTreinado.objects.create(
            algoritmo=algoritmo, parametros=parametros, magnitude_alvo=magnitude_alvo,
            tamanho_celula=tamanho_celula, meses_teste=meses_teste,
            dados_inicio=df["data_hora"].min().to_pydatetime(),
            dados_fim=df["data_hora"].max().to_pydatetime(),
            total_terremotos=len(df), metricas=metricas,
        )
        settings.PASTA_MODELOS.mkdir(parents=True, exist_ok=True)
        caminho = settings.PASTA_MODELOS / f"modelo_{modelo.pk}.joblib"
        joblib.dump({"pipeline": pipeline_final, "features": FEATURES}, caminho)
        modelo.arquivo = caminho.name
        modelo.save(update_fields=["arquivo"])
        ativar(modelo)
    return modelo


@transaction.atomic
def ativar(modelo: ModeloTreinado) -> ModeloTreinado:
    """Torna este o modelo usado nas previsões (só um fica ativo)."""
    ModeloTreinado.objects.exclude(pk=modelo.pk).update(ativo=False)
    modelo.ativo = True
    modelo.save(update_fields=["ativo"])
    return modelo


# =============================================================================
# Previsão
# =============================================================================
def _carregar(modelo: ModeloTreinado):
    caminho = settings.PASTA_MODELOS / modelo.arquivo if modelo.arquivo else None
    if not caminho or not Path(caminho).exists():
        raise ErroModelo(f"Arquivo do modelo {modelo.pk} não encontrado. Treine novamente.")
    return joblib.load(caminho)


def prever(modelo: ModeloTreinado, latitude: float | None = None,
           longitude: float | None = None, limite: int | None = None) -> dict:
    """
    Probabilidade de cada célula ter um terremoto de magnitude >= alvo nos
    próximos 30 dias após o terremoto mais recente da base.
    Com latitude e longitude, devolve só a célula que contém o ponto.
    """
    salvo = _carregar(modelo)
    df = _dataframe(Terremoto.objects.all())
    painel, referencia = montar_painel(df, modelo.magnitude_alvo, modelo.tamanho_celula,
                                       incluir_proximo=True)
    futuro = painel[painel["periodo"] == painel["periodo"].max()].copy()

    if latitude is not None and longitude is not None:
        lat_min, lat_max, lon_min, lon_max = settings.REGIAO_ANALISE
        if not (lat_min <= latitude < lat_max and lon_min <= longitude < lon_max):
            raise ErroModelo(f"O ponto está fora da região analisada: latitude de {lat_min} a "
                             f"{lat_max}, longitude de {lon_min} a {lon_max}.")
        futuro = futuro[
            (futuro["cel_lat"] == _celula(latitude, lat_min, modelo.tamanho_celula))
            & (futuro["cel_lon"] == _celula(longitude, lon_min, modelo.tamanho_celula))
        ]

    futuro["probabilidade"] = salvo["pipeline"].predict_proba(futuro[salvo["features"]])[:, 1]
    futuro = futuro.sort_values("probabilidade", ascending=False)
    if limite:
        futuro = futuro.head(limite)

    tam = modelo.tamanho_celula
    celulas = [
        {
            "latitude_min": float(r.cel_lat), "latitude_max": round(float(r.cel_lat + tam), 4),
            "longitude_min": float(r.cel_lon), "longitude_max": round(float(r.cel_lon + tam), 4),
            "centro": {"latitude": round(float(r.cel_lat + tam / 2), 4),
                       "longitude": round(float(r.cel_lon + tam / 2), 4)},
            "probabilidade": round(float(r.probabilidade), 4),
            "eventos_ultimos_12_periodos": int(r.eventos_12_periodos),
            "taxa_historica": round(float(r.taxa_historica), 4),
        }
        for r in futuro.itertuples()
    ]
    return {
        "modelo": modelo.pk,
        "algoritmo": modelo.algoritmo,
        "magnitude_alvo": modelo.magnitude_alvo,
        "periodo_previsto": {
            "inicio": referencia.isoformat(),
            "fim": (referencia + pd.Timedelta(days=DIAS_PERIODO)).isoformat(),
        },
        "total_celulas": len(celulas),
        "celulas": celulas,
    }
