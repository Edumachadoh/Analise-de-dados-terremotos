"""
Estado compartilhado entre as páginas do app.

O DataFrame ativo fica em st.session_state["df"]; a página de upload o troca
e as demais apenas o leem.
"""

import streamlit as st

from src import coleta, preparo


@st.cache_data(show_spinner=False)
def dados_padrao(forcar: bool = False):
    """Cache: o Streamlit reexecuta o script a cada clique; sem ele a API seria chamada de novo."""
    return preparo.preparar(coleta.carregar_ou_coletar(forcar=forcar))


def carregar_base_padrao(forcar: bool = False) -> None:
    """Carrega a base do USGS (baixando se preciso) como base ativa."""
    if forcar:
        dados_padrao.clear()
    primeira_vez = not coleta.arquivo_saida().exists()
    mensagem = ("Primeira execução: baixando os dados do USGS. Pode levar alguns minutos..."
                if primeira_vez or forcar else "Carregando dados...")
    with st.spinner(mensagem):
        st.session_state["df"] = dados_padrao(forcar=forcar)
    filtro = ("todas as magnitudes" if coleta.MAGNITUDE_MINIMA is None
              else f"M ≥ {coleta.MAGNITUDE_MINIMA:g}")
    st.session_state["origem"] = f"USGS · {coleta.REGIAO} · {filtro} · últimos {coleta.ANOS} anos"


def obter_df():
    """Devolve o DataFrame ativo; se não houver dados, avisa e interrompe a página."""
    df = st.session_state.get("df")
    if df is None or df.empty:
        st.info("Nenhum dado carregado. Envie um arquivo na página Upload e dados.")
        st.stop()
    return df


def origem() -> str:
    return st.session_state.get("origem", "")
