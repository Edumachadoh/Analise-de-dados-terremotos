"""
Ponto de entrada da aplicação web.

Para iniciar, a partir da raiz do projeto:
    streamlit run app/app.py

Ao abrir, carrega os dados já coletados (ou roda a coleta de src/coleta.py) e
monta a navegação entre as páginas de app/paginas/.
"""

import sys
from pathlib import Path

import streamlit as st

# O Streamlit só enxerga a pasta app/. Adicionamos a raiz do projeto ao
# caminho de importação para conseguir importar o pacote src.
RAIZ = Path(__file__).resolve().parent.parent
if str(RAIZ) not in sys.path:
    sys.path.insert(0, str(RAIZ))

from comum import carregar_base_padrao  # noqa: E402  (import depois do ajuste do sys.path)


st.set_page_config(page_title="Terremotos", page_icon=":earth:", layout="wide")

if "df" not in st.session_state:
    try:
        carregar_base_padrao()
    except Exception as erro:
        st.error(f"Não foi possível obter os dados padrão: {erro}")

st.sidebar.title("Terremotos")

navegacao = st.navigation([
    st.Page("paginas/upload.py", title="Upload e dados", icon=":material/upload_file:", default=True),
    st.Page("paginas/analise.py", title="Análise", icon=":material/bar_chart:"),
    st.Page("paginas/mapa.py", title="Mapa", icon=":material/map:"),
])
navegacao.run()
