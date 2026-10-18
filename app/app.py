"""
Aplicação web do projeto.

Para iniciar, a partir da raiz do projeto:
    streamlit run app/app.py

Ao abrir, a aplicação carrega os dados já coletados ou, se ainda não
existirem, roda a coleta configurada em src/coleta.py.
"""

import sys
from pathlib import Path

import streamlit as st

# O Streamlit só enxerga a pasta app/. Adicionamos a raiz do projeto ao
# caminho de importação para conseguir importar o pacote src.
RAIZ = Path(__file__).resolve().parent.parent
if str(RAIZ) not in sys.path:
    sys.path.insert(0, str(RAIZ))

from src import coleta  # noqa: E402  (import depois do ajuste do sys.path)


st.set_page_config(page_title="Terremotos", layout="wide")


@st.cache_data(show_spinner=False)
def obter_dados(forcar: bool = False):
    """
    Cache: o Streamlit reexecuta este arquivo inteiro a cada clique.
    Sem o cache, cada interação chamaria a API de novo.
    """
    return coleta.carregar_ou_coletar(forcar=forcar)


st.title("Terremotos")

filtro_mag = ("todas as magnitudes" if coleta.MAGNITUDE_MINIMA is None
              else f"magnitude ≥ {coleta.MAGNITUDE_MINIMA:g}")
st.caption(f"Região: {coleta.REGIAO} · {filtro_mag} · últimos {coleta.ANOS} anos · fonte: USGS")

# Botão para baixar os dados de novo, ignorando o arquivo e o cache
if st.sidebar.button("Atualizar dados da API"):
    obter_dados.clear()
    with st.spinner("Baixando dados atualizados do USGS..."):
        df = obter_dados(forcar=True)
    st.sidebar.success("Dados atualizados.")
else:
    primeira_vez = not coleta.arquivo_saida().exists()
    mensagem = ("Primeira execução: baixando os dados do USGS. Pode levar alguns minutos..."
                if primeira_vez else "Carregando dados...")
    try:
        with st.spinner(mensagem):
            df = obter_dados()
    except Exception as erro:
        st.error(f"Não foi possível obter os dados: {erro}")
        st.stop()

if df.empty:
    st.warning("A coleta não retornou nenhum evento com os filtros configurados.")
    st.stop()

col1, col2, col3 = st.columns(3)
col1.metric("Eventos", f"{len(df):,}".replace(",", "."))
col2.metric("Maior magnitude", f"{df['mag'].max():.1f}")
col3.metric("Com alerta de tsunami", int(df["tsunami"].fillna(0).sum()))

st.subheader("Amostra dos dados")
st.dataframe(df.head(100), use_container_width=True)

st.caption(f"Arquivo: data/raw/{coleta.arquivo_saida().name}")