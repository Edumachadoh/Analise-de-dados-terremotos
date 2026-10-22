"""Página 1: upload do arquivo e visão geral dos dados."""

import streamlit as st

from comum import carregar_base_padrao, obter_df, origem
from src import preparo

st.title("Upload e dados")

arquivo = st.file_uploader("Envie um arquivo de dados", type=list(preparo.EXTENSOES),
                           help="CSV, XML ou JSON com colunas consistentes entre uploads.")
if arquivo is not None and st.session_state.get("arquivo_atual") != (arquivo.name, arquivo.size):
    try:
        st.session_state["df"] = preparo.preparar(preparo.ler_arquivo(arquivo, arquivo.name))
        st.session_state["origem"] = f"Arquivo enviado · {arquivo.name}"
        st.session_state["arquivo_atual"] = (arquivo.name, arquivo.size)
    except ValueError as erro:
        st.error(str(erro))

col_a, col_b = st.columns([1, 1])
if col_a.button("Usar a base padrão (USGS)"):
    carregar_base_padrao()
    st.session_state.pop("arquivo_atual", None)
if col_b.button("Atualizar dados da API"):
    carregar_base_padrao(forcar=True)
    st.session_state.pop("arquivo_atual", None)

df = obter_df()
st.caption(f"Base ativa: {origem()}")

c1, c2, c3 = st.columns(3)
c1.metric("Linhas", f"{len(df):,}".replace(",", "."))
c2.metric("Colunas", df.shape[1])
c3.metric("Valores nulos", f"{df.isna().mean().mean() * 100:.1f}%")

st.subheader("Amostra dos dados")
st.dataframe(df.head(100), width="stretch")

st.subheader("Resumo das colunas")
st.dataframe(preparo.resumo(df), width="stretch")
