# Terremotos no Chile — USGS

Aplicação web em Python para análise de terremotos registrados na região do Chile, com dados do catálogo público do Serviço Geológico dos Estados Unidos (USGS).

Ao iniciar, a aplicação verifica se os dados já foram baixados. Se ainda não foram, ela consulta a API do USGS, salva os dados localmente e os exibe no navegador.

---

## Sumário

1. [Como rodar o projeto](#como-rodar-o-projeto)
2. [Estrutura do projeto](#estrutura-do-projeto)
3. [Fluxo de dados](#fluxo-de-dados)
4. [Dados utilizados](#dados-utilizados)
5. [Limitações dos dados](#limitações-dos-dados)

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
| Região | Chile |
| Coordenadas | latitude de -56 a -17, longitude de -76 a -66 |
| Magnitude | todas, sem limite mínimo |
| Período | últimos 3 anos, contados a partir da data da coleta |
| Tipo de evento | apenas terremotos (`eventtype=earthquake`) |
| Arquivo gerado | `data/raw/terremotos_chile_mtodas_3anos.csv` |

O recorte é um retângulo geográfico. Por isso ele inclui também parte do Oceano Pacífico e pequenas áreas de países vizinhos, como Argentina, Bolívia e Peru.

### Requisição utilizada

Os dados são baixados em GeoJSON, porque é o formato que traz os campos de impacto (`tsunami`, `alert`, `sig`), ausentes no CSV da API. Exemplo de uma das requisições feitas pela coleta, para uma janela de um ano:

```
https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=2025-10-18T00:00:00&endtime=2026-10-18T00:00:00&eventtype=earthquake&minlatitude=-56&maxlatitude=-17&minlongitude=-76&maxlongitude=-66
```

Como não há filtro de magnitude, o parâmetro `minmagnitude` não é enviado. Assim a API devolve todos os eventos, inclusive os de magnitude negativa, que existem nas escalas locais.

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

### Por que o Chile

O Chile fica sobre a zona de subducção onde a Placa de Nazca mergulha sob a Placa Sul-Americana, uma das regiões sismicamente mais ativas do mundo. Isso garante um volume grande de eventos em poucos anos e permite observar terremotos rasos, junto à costa, e profundos, sob a cordilheira, numa mesma base.

---

## Limitações dos dados

- **Escalas de magnitude diferentes.** Sem limite mínimo, a base mistura tremores pequenos, medidos em escalas locais como a `ml`, com eventos grandes, medidos pela magnitude de momento (`mww`). As escalas não são diretamente equivalentes, e o campo `magType` deve ser considerado nas análises.
- **Completude desigual.** Tremores muito pequenos só são detectados perto das estações sismográficas. A ausência de eventos pequenos numa área pode refletir falta de cobertura, não falta de atividade.
- **Campos de impacto quase vazios.** `felt`, `cdi`, `mmi` e `alert` só existem quando houve relatos da população ou avaliação de impacto, o que é raro em tremores pequenos.
- **`tsunami` indica uma mensagem, não um tsunami.** O valor 1 significa que o USGS emitiu um aviso, segundo um protocolo baseado principalmente em magnitude e localização. Não confirma que uma onda ocorreu.
- **Dados revisáveis.** Eventos recentes podem estar com `status=automatic` e ter localização ou magnitude ajustadas depois.
- **Recorte retangular.** O retângulo da coleta não segue as fronteiras do país e inclui áreas oceânicas e de países vizinhos.
- **Variáveis físicas ausentes.** O catálogo não traz o mecanismo de falha nem o deslocamento do fundo do mar.

---

## Referências

- USGS FDSN Event Web Service: https://earthquake.usgs.gov/fdsnws/event/1/
- Formato GeoJSON do USGS: https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
- Documentação do ComCat: https://earthquake.usgs.gov/data/comcat/
- Documentação do Streamlit: https://docs.streamlit.io/