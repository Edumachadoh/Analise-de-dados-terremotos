"""Página 3: mapa interativo (exige colunas de latitude e longitude)."""

import streamlit as st

from comum import obter_df, origem
from src import graficos, preparo

st.title("Mapa")
st.caption(f"Base ativa: {origem()}")

df = obter_df()
coords = preparo.detectar_coordenadas(df)
if coords is None:
    st.warning("Esta base não tem colunas de latitude e longitude (ex.: latitude/longitude ou lat/lon).")
    st.stop()
lat, lon = coords
numericas = [c for c in preparo.colunas_numericas(df) if c not in coords]

st.sidebar.subheader("Mapa")
cor = st.sidebar.selectbox("Colorir por", ["(nenhum)"] + numericas,
                           index=(numericas.index("mag") + 1) if "mag" in numericas else 0)
tamanho = st.sidebar.selectbox("Tamanho por", ["(nenhum)"] + numericas,
                               index=(numericas.index("mag") + 1) if "mag" in numericas else 0)

filtro_col = st.sidebar.selectbox("Filtrar por", ["(nenhum)"] + numericas,
                                  index=(numericas.index("mag") + 1) if "mag" in numericas else 0)
if filtro_col != "(nenhum)":
    serie = df[filtro_col].dropna()
    minimo, maximo = float(serie.min()), float(serie.max())
    if minimo < maximo:
        faixa = st.sidebar.slider(filtro_col, minimo, maximo, (minimo, maximo))
        df = df[df[filtro_col].between(*faixa)]

st.metric("Eventos no mapa", f"{len(df):,}".replace(",", "."))
if df.empty:
    st.warning("Nenhuma linha atende ao filtro.")
    st.stop()

hover = [c for c in ("place", "mag", "depth", "time") if c in df.columns]
st.plotly_chart(
    graficos.mapa(df, lat, lon,
                  cor=None if cor == "(nenhum)" else cor,
                  tamanho=None if tamanho == "(nenhum)" else tamanho,
                  hover=hover or None),
    width="stretch",
)
st.caption("Mostra no máximo 8.000 pontos (amostra aleatória) para o mapa continuar fluido.")
