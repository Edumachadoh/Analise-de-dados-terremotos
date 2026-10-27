"""Página 2: gráficos de análise, montados a partir das colunas da base ativa."""

import streamlit as st

from comum import obter_df, origem
from src import graficos, preparo

st.title("Análise")
st.caption(f"Base ativa: {origem()}")

df = obter_df()
numericas = preparo.colunas_numericas(df)
categoricas = preparo.colunas_categoricas(df)
datas = preparo.colunas_data(df)

# Filtros na barra lateral: um slider por coluna numérica escolhida
st.sidebar.subheader("Filtros")
filtro_col = st.sidebar.selectbox("Filtrar por", ["(nenhum)"] + numericas)
if filtro_col != "(nenhum)":
    serie = df[filtro_col].dropna()
    minimo, maximo = float(serie.min()), float(serie.max())
    if minimo < maximo:
        faixa = st.sidebar.slider(filtro_col, minimo, maximo, (minimo, maximo))
        df = df[df[filtro_col].between(*faixa)]

if datas:
    col_data = datas[0]
    inicio, fim = df[col_data].min(), df[col_data].max()
    if inicio < fim:
        periodo = st.sidebar.slider("Período", inicio.to_pydatetime(), fim.to_pydatetime(),
                                    (inicio.to_pydatetime(), fim.to_pydatetime()))
        df = df[df[col_data].between(*periodo)]

st.metric("Linhas após os filtros", f"{len(df):,}".replace(",", "."))
if df.empty:
    st.warning("Nenhuma linha atende aos filtros.")
    st.stop()

if numericas:
    c1, c2 = st.columns(2)
    with c1:
        col_hist = st.selectbox("Histograma de", numericas, key="hist")
        st.plotly_chart(graficos.histograma(df, col_hist), width="stretch")
    with c2:
        if len(numericas) > 1:
            x = st.selectbox("Eixo X", numericas, key="dx")
            y = st.selectbox("Eixo Y", numericas, index=1, key="dy")
            st.plotly_chart(graficos.dispersao(df, x, y), width="stretch")

if categoricas:
    c3, c4 = st.columns(2)
    with c3:
        col_barra = st.selectbox("Barras de", categoricas, key="barra")
        st.plotly_chart(graficos.barras(df, col_barra), width="stretch")
    with c4:
        col_pizza = st.selectbox("Pizza de", categoricas, key="pizza")
        st.plotly_chart(graficos.pizza(df, col_pizza), width="stretch")

if datas:
    st.plotly_chart(graficos.serie_temporal(df, datas[0]), width="stretch")

if categoricas and numericas:
    c5, c6 = st.columns(2)
    cat = c5.selectbox("Boxplot: categoria", categoricas, key="box_cat")
    val = c6.selectbox("Boxplot: valor", numericas, key="box_val")
    st.plotly_chart(graficos.boxplot(df, cat, val), width="stretch")

if len(numericas) > 1:
    escolhidas = st.multiselect("Colunas na matriz de correlação", numericas,
                                default=numericas[:8])
    if len(escolhidas) > 1:
        st.plotly_chart(graficos.correlacao(df, escolhidas), width="stretch")
