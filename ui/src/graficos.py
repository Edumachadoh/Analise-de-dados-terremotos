"""
Funções que montam os gráficos (Plotly). Recebem um DataFrame e nomes de
colunas e devolvem uma figura; quem exibe é a interface em app/.
"""

import pandas as pd
import plotly.express as px

ESCALA = "YlOrRd"


def histograma(df: pd.DataFrame, coluna: str, bins: int = 30):
    return px.histogram(df, x=coluna, nbins=bins, title=f"Distribuição de {coluna}")


def barras(df: pd.DataFrame, coluna: str, topo: int = 15):
    contagem = df[coluna].value_counts().head(topo).reset_index()
    contagem.columns = [coluna, "quantidade"]
    return px.bar(contagem, x=coluna, y="quantidade", title=f"{coluna}: mais frequentes")


def pizza(df: pd.DataFrame, coluna: str, topo: int = 8):
    contagem = df[coluna].astype(str).value_counts()
    if len(contagem) > topo:  # agrupa o resto para a pizza continuar legível
        resto = contagem.iloc[topo:].sum()
        contagem = pd.concat([contagem.iloc[:topo], pd.Series({"outros": resto})])
    return px.pie(names=contagem.index, values=contagem.values, title=f"Proporção de {coluna}")


def serie_temporal(df: pd.DataFrame, coluna_data: str, freq: str = "ME"):
    por_periodo = df.set_index(coluna_data).resample(freq).size().reset_index(name="eventos")
    return px.line(por_periodo, x=coluna_data, y="eventos", title="Eventos ao longo do tempo")


def dispersao(df: pd.DataFrame, x: str, y: str, cor: str | None = None):
    amostra = df.sample(min(len(df), 5000), random_state=0)  # evita travar o navegador
    return px.scatter(amostra, x=x, y=y, color=cor, opacity=0.6, title=f"{y} × {x}")


def boxplot(df: pd.DataFrame, categoria: str, valor: str):
    return px.box(df, x=categoria, y=valor, title=f"{valor} por {categoria}")


def correlacao(df: pd.DataFrame, colunas: list[str]):
    matriz = df[colunas].corr().round(2)
    return px.imshow(matriz, text_auto=True, color_continuous_scale="RdBu_r",
                     zmin=-1, zmax=1, title="Correlação entre variáveis")


def mapa(df: pd.DataFrame, lat: str, lon: str, cor: str | None = None,
         tamanho: str | None = None, hover: list[str] | None = None):
    amostra = df.dropna(subset=[lat, lon])
    if tamanho:  # tamanho precisa ser positivo
        amostra = amostra[amostra[tamanho] > 0]
    amostra = amostra.sample(min(len(amostra), 8000), random_state=0)
    fig = px.scatter_map(
        amostra, lat=lat, lon=lon, color=cor, size=tamanho, hover_data=hover,
        color_continuous_scale=ESCALA, size_max=14, zoom=3,
        map_style="open-street-map", title="Mapa dos eventos",
    )
    fig.update_layout(margin=dict(l=0, r=0, t=40, b=0), height=560)
    return fig
