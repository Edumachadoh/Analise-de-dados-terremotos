# Terremotos no mundo — USGS

Aplicação web para análise de terremotos registrados no mundo inteiro, com dados do catálogo público do Serviço Geológico dos Estados Unidos (USGS).

## Estrutura do repositório

O projeto tem duas partes que conversam **somente por uma API REST**:

```
├── backend/                  # API REST (Django + Django REST Framework)
│   ├── api/, config/         #   a API: modelos, rotas, serviços de USGS, estatísticas e machine learning
│   ├── data/raw/             #   CSVs de terremotos coletados do USGS
│   ├── notebooks/            #   notebooks de análise (Data Science)
│   └── scripts/              #   scripts do projeto antigo (coleta, preparo, modelos, clustering)
├── ui/                       # interface web (React + Vite): veja ui/README.md
└── readme.md
```

- **Para rodar o back e o front juntos**, siga o passo a passo de [`ui/README.md`](ui/README.md).
- **`backend/scripts/`** guarda código do projeto antigo que **ainda não foi integrado à API**:
  `preparo.py` lê arquivos CSV, JSON e XML (a API ainda não tem a rota de envio de arquivo) e
  `coleta.py` gera CSVs por região (Chile, Japão, Indonésia, Califórnia ou global). `modelos.py`, `clustering.py` e os notebooks estão vazios.

> **Atenção:** as seções **Como rodar o projeto**, **Estrutura do projeto** e **Fluxo de dados**, mais abaixo,
> descrevem a versão antiga em Streamlit (pasta `app/`), que foi substituída pelo React em `ui/`. Elas precisam
> ser reescritas. As seções **Dados na API**, **Dados utilizados** e **Limitações dos dados** estão atualizadas.

---

## Sumário

1. [Dados na API](#dados-na-api)
2. [Como rodar o projeto](#como-rodar-o-projeto)
3. [Estrutura do projeto](#estrutura-do-projeto)
4. [Fluxo de dados](#fluxo-de-dados)
5. [Dados utilizados](#dados-utilizados)
6. [Limitações dos dados](#limitações-dos-dados)

---

## Dados na API

A API guarda os terremotos no banco SQLite (`backend/db.sqlite3`). Os dados vêm do USGS e cobrem **o mundo inteiro**, com **magnitude a partir de 2,5**, nos **últimos 3 anos**.

### Configuração

Os parâmetros da coleta ficam em `backend/config/settings.py`:

```python
REGIAO_ANALISE = (-90.0, 90.0, -180.0, 180.0)  # (lat_min, lat_max, lon_min, lon_max): mundo inteiro
MAGNITUDE_MINIMA_COLETA = 2.5                  # magnitude mínima padrão da coleta
ANOS_COLETA_PADRAO = 3                         # base padrão: últimos 3 anos
ANOS_RETREINO = 6                              # re-treino com atualização: últimos 6 anos
```

Para analisar só uma região, basta trocar `REGIAO_ANALISE` por um recorte menor. Por exemplo, Japão: `(24.0, 46.0, 122.0, 146.0)`.

### Carregar os dados

Com o ambiente do `backend/` ativo:

```bash
python manage.py importar_terremotos                         # USGS, últimos 3 anos, M >= 2,5
python manage.py importar_terremotos --anos 6                # últimos 6 anos
python manage.py importar_terremotos --magnitude-minima 4.0  # outra magnitude mínima
python manage.py importar_terremotos --arquivo caminho.csv   # a partir de um CSV com as colunas do USGS
```

A mesma importação pode ser feita pela API (`POST /api/coletas/`) ou pela tela **Dados** da interface. Eventos que já estão no banco são atualizados, não duplicados, porque a comparação é feita pelo `id` do USGS.

### Base atual

| | |
|---|---|
| Terremotos | 83.306 |
| Com magnitude ≥ 4 | 49.408 |
| Magnitude | de 2,5 a 8,8 |
| Período | 30/10/2023 a 29/10/2026 |

### Impacto no modelo de machine learning

O modelo divide o mapa em células de 1° × 1° (cerca de 110 km de lado) e estima, para cada uma, a probabilidade de um terremoto acima da magnitude-alvo nos próximos 30 dias. No mundo inteiro, a grade completa teria 64.800 células, e a maioria delas fica em oceanos ou em regiões estáveis que nunca registram eventos. Por isso **só entram as células com ao menos um terremoto na base**. Com a base atual e magnitude-alvo 4,0, são 5.393 células e cerca de 189 mil linhas de treino.

---

## Como rodar o projeto

### Pré-requisitos

- Python **3.10** ou mais recente
- Conexão com a internet na primeira execução, para baixar os dados

### 1. Clonar o repositório

```bash
git clone <url-do-repositorio>
cd terremotos
```

### 2. Criar o ambiente virtual

O ambiente virtual isola as bibliotecas do projeto das instaladas no computador.

```bash
python -m venv .venv
```

### 3. Ativar o ambiente virtual

**PowerShell:**

```powershell
.venv\Scripts\activate
```

**Prompt de Comando:**

```cmd
.venv\Scripts\activate.bat
```

Com o ambiente ativo, o terminal passa a mostrar `(.venv)` no início da linha.

### 4. Instalar as dependências

```bash
pip install -r requirements.txt
```

| Biblioteca | Uso |
|---|---|
| `pandas` | manipulação dos dados em tabelas (DataFrames) |
| `requests` | requisições HTTP à API do USGS |
| `streamlit` | interface web da aplicação |

### 5. Iniciar a aplicação

```bash
streamlit run app/app.py
```

O navegador abre automaticamente em `http://localhost:8501`.

Na **primeira execução**, a aplicação baixa os dados do USGS, o que pode levar alguns minutos. Nas seguintes, ela lê o arquivo já salvo e abre na hora. Para baixar os dados de novo, use o botão **Atualizar dados da API** na barra lateral.

### Coletar os dados sem abrir a aplicação

```bash
python src/coleta.py
```

### Alterar os filtros da coleta

Os filtros ficam no topo de `src/coleta.py`:

```python
REGIAO = "chile"         # "global" ou uma das regiões cadastradas
MAGNITUDE_MINIMA = None  # None = todas as magnitudes; ou um número, ex.: 5.0
ANOS = 3                 # quantos anos para trás, a partir de hoje
FORMATO = "csv"          # "csv", "geojson" ou "ambos"
```

Cada combinação de filtros gera um arquivo com nome próprio, então uma coleta nova não apaga a anterior.

---

## Estrutura do projeto

```
terremotos/
├── app/
│   └── app.py           # interface web (Streamlit): ponto de entrada
├── src/
│   ├── __init__.py      # torna src um pacote importável
│   └── coleta.py        # consulta à API do USGS e gravação dos dados
├── data/
│   └── raw/             # dados brutos baixados da API
├── notebooks/           # análises exploratórias
├── requirements.txt
└── README.md
```

A lógica de dados fica em `src/` e é importada tanto pela aplicação quanto pelos notebooks, para que os dois trabalhem sempre com a mesma base.

---

## Fluxo de dados

```
streamlit run app/app.py
        │
        ▼
┌──────────────────────────────────────────────────────────┐
│ 1. Streamlit sobe um servidor web (localhost:8501)       │
└──────────────────────────────────────────────────────────┘
        │  o navegador abre a página
        ▼
┌──────────────────────────────────────────────────────────┐
│ 2. Streamlit executa app/app.py de cima a baixo          │
└──────────────────────────────────────────────────────────┘
        │  app.py chama obter_dados()
        ▼
┌──────────────────────────────────────────────────────────┐
│ 3. Cache do Streamlit (@st.cache_data)                   │
│    ├─ resultado guardado? → devolve o DataFrame          │
│    └─ não → coleta.carregar_ou_coletar()                 │
└──────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────┐
│ 4. src/coleta.py                                         │
│    ├─ arquivo em data/raw/ existe? → lê o CSV            │
│    └─ não → executar()                                   │
│          ├─ divide o período em janelas de 1 ano         │
│          ├─ count: confere o total de cada janela        │
│          ├─ query: baixa a janela em GeoJSON             │
│          ├─ achata o GeoJSON em tabela                   │
│          └─ salva o CSV em data/raw/                     │
└──────────────────────────────────────────────────────────┘
        │  DataFrame do pandas
        ▼
┌──────────────────────────────────────────────────────────┐
│ 5. app.py recebe o DataFrame e o mantém na memória       │
└──────────────────────────────────────────────────────────┘
        │  st.metric(), st.dataframe() ...
        ▼
┌──────────────────────────────────────────────────────────┐
│ 6. Streamlit converte cada chamada em componente visual  │
│    e envia ao navegador                                  │
└──────────────────────────────────────────────────────────┘
```

### Etapa por etapa

**1. O servidor.** O comando `streamlit run` inicia um servidor web local. Nesse momento o `app.py` ainda não rodou: ele é o roteiro que o servidor executa quando alguém abre a página.

**2. A execução do app.** Quando o navegador se conecta, o Streamlit executa o `app.py` do início ao fim. O `import streamlit as st` não inicia nada; apenas dá acesso às funções `st.*`.

**3. O cache.** A função `obter_dados()` tem o decorador `@st.cache_data`. Na primeira chamada, ela executa e guarda o resultado; nas seguintes, devolve o resultado guardado sem refazer o trabalho.

**4. A coleta.** O `app.py` não sabe de onde vêm os dados: ele só pede a `coleta.carregar_ou_coletar()`. É o `coleta.py` que decide entre ler o arquivo salvo e consultar a API. Quando consulta, ele:

- divide o período em janelas de um ano;
- confere o total de cada janela pelo método `count` antes de baixar;
- se uma janela passar do limite de 20.000 eventos da API, divide-a ao meio e repete o processo;
- baixa os eventos em GeoJSON pelo método `query`;
- converte o GeoJSON em tabela e remove duplicatas pelo `id`;
- salva o resultado em `data/raw/`.

**5. Os dados na memória.** O resultado volta como um DataFrame do pandas, guardado numa variável do `app.py`. O Streamlit não recebe nem armazena a tabela inteira.

**6. A exibição.** Cada função `st.*` é uma instrução de exibição. O Streamlit transforma cada uma num componente da página e envia ao navegador. Exibir `df.head(100)` envia só essas 100 linhas, mesmo que a tabela tenha milhares.

### O que acontece a cada interação

A cada clique ou mudança de filtro, o Streamlit **executa o `app.py` inteiro novamente**. O cache é o que impede que cada interação dispare uma nova consulta à API: a coleta roda uma vez, e as execuções seguintes reaproveitam o resultado.

O botão **Atualizar dados da API** é a exceção: ele limpa o cache e chama a coleta com `forcar=True`, que ignora o arquivo salvo e baixa tudo de novo.

---

## Dados utilizados

### Fonte

Os dados vêm do **ANSS Comprehensive Earthquake Catalog (ComCat)**, mantido pelo **USGS**. O catálogo reúne eventos sísmicos registrados por redes sismográficas do mundo inteiro e é atualizado continuamente.

| | |
|---|---|
| Serviço | FDSN Event Web Service |
| Documentação | https://earthquake.usgs.gov/fdsnws/event/1/ |
| Acesso | público e gratuito, sem cadastro ou chave de API |
| Licença | dados do governo dos EUA, em domínio público |

### Escopo da coleta

| Critério | Valor |
|---|---|
| Região | mundo inteiro |
| Coordenadas | latitude de -90 a 90, longitude de -180 a 180 |
| Magnitude | ≥ 2,5 |
| Período | últimos 3 anos, contados a partir da data da coleta |
| Tipo de evento | apenas terremotos (`eventtype=earthquake`) |
| Destino | banco da API (`backend/db.sqlite3`) |

### Por que magnitude mínima de 2,5

Sem filtro de magnitude, o catálogo tem cerca de **428 mil** terremotos no mundo em 3 anos. A maioria são microtremores registrados pela rede densa de sensores dos EUA, o que concentraria a base artificialmente nesse país e deixaria a importação e o treino muito mais lentos. Com magnitude ≥ 2,5, a base fica com cerca de **83 mil** eventos e ainda inclui tremores pequenos, que o modelo usa como sinal de atividade da região. Com magnitude ≥ 4, seriam cerca de 49 mil.

### Requisição utilizada

Os dados são baixados em GeoJSON, porque é o formato que traz os campos de impacto (`tsunami`, `alert`, `sig`), ausentes no CSV da API. Exemplo de uma das requisições feitas pela coleta, para uma janela de um ano:

```
https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=2025-10-29T00:00:00&endtime=2026-10-29T00:00:00&eventtype=earthquake&minlatitude=-90&maxlatitude=90&minlongitude=-180&maxlongitude=180&minmagnitude=2.5
```

A API do USGS devolve no máximo 20.000 eventos por consulta. Como um ano do mundo inteiro passa desse limite, a coleta confere o total pelo método `count` e divide a janela ao meio até cada parte caber numa consulta.

### Colunas do arquivo

O CSV salvo em `data/raw/` é gerado pela coleta a partir do GeoJSON, com uma linha por terremoto.

**Identificação e localização**

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | texto | identificador único do evento no catálogo |
| `longitude` | decimal | longitude do epicentro, em graus |
| `latitude` | decimal | latitude do epicentro, em graus |
| `depth` | decimal | profundidade do hipocentro, em km |
| `place` | texto | descrição do local (ex.: "45 km W of Valparaíso, Chile") |

**Magnitude e tempo**

| Coluna | Tipo | Descrição |
|---|---|---|
| `mag` | decimal | magnitude do evento |
| `magType` | texto | escala da magnitude (`ml`, `mb`, `mww` etc.) |
| `time` | inteiro | horário de origem, em milissegundos desde 01/01/1970 (UTC) |
| `updated` | inteiro | última atualização do registro, em milissegundos |

O `time` é mantido como veio da fonte. A conversão para data é feita na etapa de tratamento.

**Impacto**

| Coluna | Tipo | Descrição |
|---|---|---|
| `tsunami` | 0 ou 1 | 1 quando o USGS emitiu uma mensagem de tsunami para o evento |
| `alert` | texto | nível de alerta PAGER: `green`, `yellow`, `orange`, `red` |
| `sig` | inteiro | índice de significância calculado pelo USGS (0 a 1000+) |
| `felt` | inteiro | número de relatos de pessoas que sentiram o tremor |
| `cdi` | decimal | intensidade máxima relatada pela população (0 a 12) |
| `mmi` | decimal | intensidade máxima estimada na escala Mercalli Modificada (0 a 12) |

**Qualidade do registro**

| Coluna | Tipo | Descrição |
|---|---|---|
| `nst` | inteiro | número de estações usadas para localizar o evento |
| `gap` | decimal | maior lacuna azimutal entre estações, em graus |
| `dmin` | decimal | distância até a estação mais próxima, em graus |
| `rms` | decimal | erro quadrático médio do ajuste, em segundos |
| `status` | texto | `automatic` ou `reviewed` (revisado por um analista) |
| `net` | texto | rede sismográfica responsável pelo registro |
| `type` | texto | tipo do evento |

### Campos derivados

Na etapa de tratamento, são criados a partir das colunas originais:

| Campo | Origem | Descrição |
|---|---|---|
| `data_hora` | `time` | data e hora convertidas para datetime UTC |
| `ano`, `mes` | `time` | componentes de data para análises temporais |
| `faixa_profundidade` | `depth` | raso (< 70 km), intermediário (70–300 km) ou profundo (> 300 km) |

As faixas de profundidade seguem a classificação usual em sismologia.

### Por que o mundo inteiro

A pergunta do projeto é onde existe maior chance de um terremoto acima de uma magnitude. Restringir a base a um país deixaria de fora regiões muito ativas, como o Japão, a Indonésia e a costa do Pacífico das Américas. Com a base global, o modelo compara todas as zonas sísmicas entre si, e a análise visual mostra o Círculo de Fogo do Pacífico e as demais bordas de placas tectônicas.

---

## Limitações dos dados

- **Escalas de magnitude diferentes.** A base mistura tremores pequenos, medidos em escalas locais como a `ml`, com eventos grandes, medidos pela magnitude de momento (`mww`). As escalas não são diretamente equivalentes, e o campo `magType` deve ser considerado nas análises.
- **Completude desigual.** Tremores pequenos só são detectados perto das estações sismográficas, e a densidade de estações varia muito entre países. Mesmo com magnitude ≥ 2,5, regiões com redes densas (EUA, Japão) registram mais eventos pequenos que regiões remotas ou oceânicas. A ausência de eventos numa área pode refletir falta de cobertura, não falta de atividade.
- **Campos de impacto quase vazios.** `felt`, `cdi`, `mmi` e `alert` só existem quando houve relatos da população ou avaliação de impacto, o que é raro em tremores pequenos.
- **`tsunami` indica uma mensagem, não um tsunami.** O valor 1 significa que o USGS emitiu um aviso, segundo um protocolo baseado principalmente em magnitude e localização. Não confirma que uma onda ocorreu.
- **Dados revisáveis.** Eventos recentes podem estar com `status=automatic` e ter localização ou magnitude ajustadas depois.
- **Células, não cidades.** O modelo trabalha com células de latitude e longitude. O nome de um lugar só aparece no campo `place` do USGS (ex.: "45 km E of Sendai, Japan"), que descreve a posição em relação à cidade mais próxima.
- **Variáveis físicas ausentes.** O catálogo não traz o mecanismo de falha nem o deslocamento do fundo do mar.

---

## Referências

- USGS FDSN Event Web Service: https://earthquake.usgs.gov/fdsnws/event/1/
- Formato GeoJSON do USGS: https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
- Documentação do ComCat: https://earthquake.usgs.gov/data/comcat/
- Documentação do Streamlit: https://docs.streamlit.io/