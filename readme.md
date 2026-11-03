# Terremotos por região — USGS

Aplicação web para análise de terremotos por **região** (cada continente e cada oceano), com dados do catálogo público do Serviço Geológico dos Estados Unidos (USGS). Na interface, o usuário escolhe uma região e todas as telas (painel, mapa e dados) passam a analisar só ela. O machine learning não foi alterado: continua global, como antes.

## Estrutura do repositório

O projeto tem duas partes que conversam **somente por uma API REST**:

```
├── backend/                  # API REST (Django + Django REST Framework)
│   ├── api/, config/         #   a API: modelos, rotas, serviços de USGS, estatísticas e machine learning
│   ├── data/                 #   polígonos das regiões (Natural Earth), CSV de exemplo e casos de teste do upload
│   └── scripts/              #   arquivos vazios, não implementados
├── ui/                       # interface web (React + Vite); veja ui/README.md
└── readme.md
```

- **Para rodar o back e o front juntos**, siga [Como rodar o projeto](#como-rodar-o-projeto).
- **Para entender o código da API**, veja [Arquivos da API](#arquivos-da-api) e [Fluxo de uma requisição](#fluxo-de-uma-requisição).
- **Para entender a divisão em continentes e oceanos**, veja [Regiões](#regiões-continentes-e-oceanos).
- **Para a interface**, veja [Interface](#interface).

---

## Sumário

1. [Como rodar o projeto](#como-rodar-o-projeto)
2. [Comandos da base de dados](#comandos-da-base-de-dados)
3. [Endpoints da API](#endpoints-da-api)
4. [Dados na API](#dados-na-api)
5. [Regiões: continentes e oceanos](#regiões-continentes-e-oceanos)
6. [Arquivos da API](#arquivos-da-api)
7. [Fluxo de uma requisição](#fluxo-de-uma-requisição)
8. [Interface](#interface)
9. [Testes](#testes)
10. [Dados utilizados](#dados-utilizados)
11. [Limitações dos dados](#limitações-dos-dados)

---

## Como rodar o projeto

São dois processos rodando ao mesmo tempo, cada um no seu terminal: a **API** (Django, porta 8000) e a **interface** (React + Vite, porta 5173). A interface acessa a API pelo proxy do Vite, então não é preciso configurar CORS.

### Pré-requisitos

- **Python 3.12** ou mais recente (exigido pelo Django 6)
- **Node.js 20.19** ou mais recente (exigido pelo Vite 8), com o `npm`
- Internet na primeira execução, para baixar os dados do USGS

### 1. Clonar o repositório

```bash
git clone https://github.com/Edumachadoh/Analise-de-dados-terremotos.git
cd Analise-de-dados-terremotos
```

### 2. Back-end (API)

Todos os comandos desta etapa são rodados dentro de `backend/`.

**2.1. Criar e ativar o ambiente virtual**

```bash
cd backend
python -m venv .venv
```

| Terminal | Ativação |
|---|---|
| PowerShell | `.venv\Scripts\activate` |
| Prompt de Comando | `.venv\Scripts\activate.bat` |
| Linux / macOS | `source .venv/bin/activate` |

Com o ambiente ativo, o terminal mostra `(.venv)` no início da linha.

**2.2. Instalar as dependências**

```bash
pip install -r requirements.txt
```

| Biblioteca | Uso |
|---|---|
| `Django` | framework web: banco de dados, rotas, admin |
| `djangorestframework` | API REST: serializers, views e respostas JSON |
| `django-filter` | filtros por parâmetro de URL (`?magnitude_min=5`) |
| `pandas`, `numpy` | leitura de CSV, limpeza e montagem da tabela de treino |
| `shapely` | geometria: decide em qual continente ou oceano cai cada terremoto |
| `scikit-learn`, `joblib` | modelos de machine learning e gravação dos modelos treinados |
| `requests` | chamadas à API do USGS |
| `python-dotenv` | leitura do arquivo `.env` |

**2.3. Criar o arquivo `.env`**

O `.env` guarda as configurações sensíveis e **não deve ir para o git**. Crie o arquivo `backend/.env` com:

```
SECRET_KEY=cole-aqui-a-chave-gerada
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
```

Para gerar uma chave:

```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

Sem a `SECRET_KEY`, o Django não inicia e mostra a mensagem `SECRET_KEY não definida`.

**2.4. Criar as tabelas do banco**

```bash
python manage.py migrate
```

Esse comando cria o arquivo `backend/db.sqlite3` com as tabelas `api_regiao`, `api_terremoto`, `api_coleta` e `api_modelotreinado`.

**2.5. Carregar os terremotos**

```bash
python manage.py carregar_regioes
python manage.py importar_terremotos
```

O primeiro comando cadastra as 12 regiões (7 continentes e 5 oceanos, veja [Regiões](#regiões-continentes-e-oceanos)) e classifica os terremotos que já estão no banco. O segundo baixa do USGS os terremotos do mundo inteiro dos últimos 3 anos, com magnitude ≥ 2,5, como antes. Para importar só uma região, use a interface: escolha a região e clique em "Buscar no USGS" (ou `POST /api/regioes/{codigo}/importar/`), que baixa só o que cai na região, com magnitude ≥ 4,0 por padrão. Outras formas de carregar dados estão em [Comandos da base de dados](#comandos-da-base-de-dados).

Os códigos são `africa`, `antartida`, `asia`, `europa`, `america-do-norte`, `oceania`, `america-do-sul`, `oceano-pacifico`, `oceano-atlantico`, `oceano-indico`, `oceano-artico` e `oceano-antartico` (também em `GET /api/regioes/`).

**2.6. Iniciar a API**

```bash
python manage.py runserver
```

A API fica em `http://127.0.0.1:8000/api/`. Aberta no navegador, essa página lista os endpoints e permite testá-los (API navegável do Django REST Framework).

### 3. Front-end (interface)

Em **outro terminal**, a partir da raiz do repositório:

```bash
cd ui
npm install
npm run dev
```

A interface fica em `http://localhost:5173`. As chamadas para `/api` são repassadas pelo Vite para `http://127.0.0.1:8000`, então **a API precisa estar rodando** (a interface não tem mais uma fonte própria de dados). Se a API estiver em outro endereço, copie `ui/.env.example` para `ui/.env` e ajuste `VITE_API_URL`.

Na primeira abertura, a tela **Regiões** mostra o mapa. Escolha uma região que já tem terremotos e clique em "Analisar", ou escolha uma sem dados e clique em "Buscar no USGS".

### 4. Treinar o primeiro modelo

As previsões só funcionam depois que existe um modelo treinado. Treine pela tela **Modelos** da interface ou pela API (veja [Endpoints da API](#endpoints-da-api)):

```bash
curl -X POST http://127.0.0.1:8000/api/modelos/ -H "Content-Type: application/json" -d "{\"algoritmo\": \"random_forest\", \"magnitude_alvo\": 4.0}"
```

No PowerShell, use `curl.exe` em vez de `curl`.

### 5. Rodar os testes

Dentro de `backend/`, com o ambiente ativo:

```bash
python manage.py test api
```

Os testes simulam o USGS e usam um banco temporário: não acessam a internet nem alteram o `db.sqlite3`.

### Resumo do dia a dia

Depois da primeira instalação, para abrir o projeto basta:

| Terminal 1 (`backend/`) | Terminal 2 (`ui/`) |
|---|---|
| `.venv\Scripts\activate` | `npm run dev` |
| `python manage.py runserver` | |

---

## Comandos da base de dados

Todos os comandos `python manage.py` são rodados dentro de `backend/`, com o ambiente virtual ativo.

### Baixar do USGS e gravar no banco

```bash
python manage.py carregar_regioes                         # cadastra continentes e oceanos e classifica os terremotos
python manage.py importar_terremotos                      # últimos 3 anos, M >= 2,5 (padrão)
python manage.py importar_terremotos --anos 6             # últimos 6 anos
python manage.py importar_terremotos --magnitude-minima 4.0  # outra magnitude mínima
```

Eventos que já estão no banco são **atualizados, não duplicados**: a comparação é feita pelo `id` do USGS. Pela API, o equivalente é `POST /api/coletas/` (mundo inteiro) ou `POST /api/regioes/{codigo}/importar/` (só uma região).

### Baixar um período do USGS para um CSV (sem gravar no banco)

```bash
python manage.py baixar_csv --de 6 --ate 3                         # de 6 a 3 anos atrás, M >= 2,5
python manage.py baixar_csv --de 6 --ate 3 --magnitude-minima 4.0
```

O arquivo é salvo em `backend/data/`, com nome como `terremotos_global_m2.5_6a3anos.csv`. As colunas são as do USGS (veja [Colunas do arquivo](#colunas-do-arquivo)), e `time` e `updated` saem como data ISO em UTC, no formato da tabela `api_terremoto` (ex.: `2024-04-29 14:11:19.731000`).

### Importar um CSV

**Pela API (upload):**

```bash
curl -F "arquivo=@data/terremotos_global_m2.5_6a3anos.csv" http://127.0.0.1:8000/api/coletas/upload/
```

**Pelo terminal:**

```bash
python manage.py importar_terremotos --arquivo data/terremotos_global_m2.5_6a3anos.csv
```

O CSV precisa ter as colunas do USGS. São obrigatórias `id`, `mag`, `time`, `latitude`, `longitude` e `depth`; as demais são opcionais. A coluna `time` pode vir em milissegundos (como na API do USGS) ou como data ISO (como nos CSVs gerados pelo `baixar_csv` e no CSV baixado do site do USGS). Linhas inválidas, de outro tipo de evento (`type` diferente de `earthquake`) ou abaixo da magnitude mínima (padrão 2,5) são descartadas, e a quantidade aparece na `mensagem` da coleta. Um CSV não precisa de região: cada terremoto gravado recebe a região a que pertence pelas coordenadas.

### Exemplo: montar uma base de 6 anos

```bash
python manage.py importar_terremotos           # últimos 3 anos, direto do USGS
python manage.py baixar_csv --de 6 --ate 3     # de 6 a 3 anos atrás, em CSV
curl -F "arquivo=@data/terremotos_global_m2.5_6a3anos.csv" http://127.0.0.1:8000/api/coletas/upload/
```

Os dois períodos precisam **emendar** (6 a 3 anos + 3 anos até hoje). O modelo trabalha com períodos de 30 dias seguidos: um intervalo sem dados seria interpretado como meses sem nenhum terremoto no mundo e estragaria o treino.

### Ver o estado da base

```bash
curl http://127.0.0.1:8000/api/regioes/                           # quantos terremotos há em cada continente e oceano
curl http://127.0.0.1:8000/api/estatisticas/                      # total, magnitudes, período e o evento mais forte
curl "http://127.0.0.1:8000/api/estatisticas/?regiao=asia"        # o mesmo, só da Ásia
curl http://127.0.0.1:8000/api/coletas/                           # histórico de importações
```

### Limpar a base

A API não tem um endpoint para apagar tudo de uma vez. Use o shell do Django:

```bash
python manage.py shell
```

E, dentro dele, uma das opções:

```python
from api.models import Terremoto, Coleta

# a) apagar todos os terremotos e o histórico de importações
Terremoto.objects.all().delete()
Coleta.objects.all().delete()

# b) apagar só os terremotos com mais de 3 anos
from datetime import timedelta
from django.utils import timezone
Terremoto.objects.filter(data_hora__lt=timezone.now() - timedelta(days=365 * 3)).delete()

exit()
```

As regiões (`api_regiao`) não são apagadas por isso; se mudar os polígonos em `data/fontes/`, rode `python manage.py carregar_regioes` para recalcular a região de cada terremoto. Depois de limpar ou trocar a base, **treine os modelos de novo**: cada modelo usa a base que existia no momento do treino. Para recomeçar do zero, também é possível apagar o arquivo `backend/db.sqlite3` e rodar `python manage.py migrate` de novo.

---

## Endpoints da API

Base: `http://127.0.0.1:8000/api/`. Todas as respostas são JSON. Listas são paginadas com 50 itens por página (`?page=2`); a resposta traz `count`, `next`, `previous` e `results`.

### Visão geral

Para saber quais ações gravam no banco, veja [O que grava no banco e o que não grava](#o-que-grava-no-banco-e-o-que-não-grava).

| Método | Endpoint | Funcionalidade |
|---|---|---|
| GET | `/api/` | página inicial da API: lista os grupos de endpoints (navegável no navegador) |
| GET | `/api/terremotos/` | lista os terremotos do banco, 50 por página, com filtros (região, magnitude, profundidade, datas, coordenadas, local, tsunami, alerta) e ordenação |
| POST | `/api/terremotos/` | cadastra um terremoto manualmente; valida as faixas de latitude, longitude, profundidade e magnitude e recusa `usgs_id` repetido |
| GET | `/api/terremotos/{id}/` | mostra um terremoto, incluindo a faixa de profundidade calculada (raso, intermediário ou profundo) |
| PUT, PATCH | `/api/terremotos/{id}/` | altera um terremoto: todos os campos (PUT) ou só alguns (PATCH) |
| DELETE | `/api/terremotos/{id}/` | apaga um terremoto |
| GET | `/api/estatisticas/` | resumo da base: total, magnitude média e máxima, período coberto e o terremoto mais forte |
| GET | `/api/estatisticas/por-mes/` | quantidade e magnitude média de terremotos por mês (gráfico de linha do tempo) |
| GET | `/api/estatisticas/por-magnitude/` | quantidade por faixa de magnitude (gráfico de barras ou pizza) |
| GET | `/api/estatisticas/por-profundidade/` | quantidade e magnitude média por faixa de profundidade |
| GET | `/api/coletas/` | histórico de importações: quando, de onde (USGS ou nome do CSV), status e quantos eventos novos e atualizados |
| GET | `/api/coletas/{id}/` | detalhe de uma importação, incluindo a mensagem de erro ou de linhas descartadas |
| GET | `/api/regioes/` | os continentes e oceanos (tipo, magnitude de completude) e `total_terremotos`, quantos eventos da base pertencem a cada um. `?com_dados=true` lista só os que têm |
| GET | `/api/regioes/mapa/` | os polígonos de todas as regiões (GeoJSON), da faixa de costa dos continentes e o ponto onde escrever o nome; é o que a interface desenha no mapa |
| GET | `/api/regioes/{codigo}/` | detalhe de uma região |
| POST | `/api/coletas/` | baixa do USGS os terremotos do mundo inteiro dos últimos N anos e grava no banco, atualizando os que já existem |
| POST | `/api/regioes/{codigo}/importar/` | baixa do USGS os terremotos da região dos últimos N anos (`anos`, `magnitude_minima`) e grava no banco, atualizando os que já existem |
| POST | `/api/coletas/upload/` | recebe um arquivo CSV com as colunas do USGS, valida, descarta linhas inválidas e grava no banco sem duplicar |
| GET | `/api/modelos/` | lista os modelos treinados, com algoritmo, parâmetros, métricas e qual está ativo |
| POST | `/api/modelos/` | treina um modelo com o algoritmo e os parâmetros escolhidos; o novo modelo passa a ser o ativo. Com `atualizar_dados`, baixa dados novos antes (re-treino) |
| GET | `/api/modelos/{id}/` | detalhe de um modelo: métricas de teste, comparação com o baseline e importância das features |
| DELETE | `/api/modelos/{id}/` | apaga um modelo e o arquivo salvo em `media/modelos/` |
| POST | `/api/modelos/{id}/ativar/` | escolhe qual modelo é usado nas previsões (só um fica ativo) |
| GET | `/api/modelos/algoritmos/` | lista os 6 algoritmos disponíveis e os parâmetros configuráveis de cada um, com padrão, mínimo e máximo |
| GET | `/api/previsoes/` | usa o modelo ativo para estimar a probabilidade de cada região ter um terremoto acima da magnitude-alvo nos próximos 30 dias |

O painel administrativo do Django fica em `/admin/` (crie um usuário com `python manage.py createsuperuser`).

### Terremotos

Filtros de `GET /api/terremotos/`, que valem também para todos os endpoints de `/api/estatisticas/`:

| Parâmetro | Exemplo | Descrição |
|---|---|---|
| `magnitude_min`, `magnitude_max` | `?magnitude_min=5` | faixa de magnitude |
| `profundidade_min`, `profundidade_max` | `?profundidade_max=70` | faixa de profundidade, em km |
| `data_inicio`, `data_fim` | `?data_inicio=2025-01-01` | período (AAAA-MM-DD) |
| `regiao` | `?regiao=america-do-sul` | código do continente ou oceano (veja [Regiões](#regiões-continentes-e-oceanos)); código inexistente dá 400 |
| `latitude_min`, `latitude_max`, `longitude_min`, `longitude_max` | `?latitude_min=24&latitude_max=46` | recorte geográfico |
| `local` | `?local=japan` | texto contido no local (sem diferenciar maiúsculas) |
| `faixa_profundidade` | `?faixa_profundidade=raso` | `raso`, `intermediario` ou `profundo` |
| `tsunami` | `?tsunami=true` | com mensagem de tsunami |
| `alerta` | `?alerta=red` | nível de alerta PAGER |
| `ordering` | `?ordering=-magnitude` | ordenação por `data_hora`, `magnitude` ou `profundidade_km` (`-` = decrescente) |

Exemplo: os terremotos mais fortes da Ásia em 2025:

```
GET /api/terremotos/?regiao=asia&data_inicio=2025-01-01&data_fim=2025-12-31&ordering=-magnitude
```

### Regiões e importação

**`GET /api/regioes/`**: as 12 regiões, cada uma com `codigo`, `nome`, `tipo` (`continente` ou `oceano`), `magnitude_completude` e `total_terremotos`. Sem paginação.

**`POST /api/regioes/{codigo}/importar/`**: baixa do USGS os terremotos da região. Corpo JSON, todos os campos opcionais:

```json
{"anos": 3, "magnitude_minima": 4.0}
```

Sem `magnitude_minima`, vale a magnitude de completude da região. **`POST /api/coletas/`** continua baixando o mundo inteiro (corpo `{"anos": 3, "magnitude_minima": 2.5}`). **`POST /api/coletas/upload/`**: envia um CSV, em `multipart/form-data`:

| Campo | Obrigatório | Descrição |
|---|---|---|
| `arquivo` | sim | `.csv` com as colunas do USGS, até 50 MB |
| `magnitude_minima` | não | padrão 2,5 |

As três respondem com o registro da coleta:

```json
{"id": 5, "origem": "usgs", "status": "concluida",
 "recebidos": 8093, "novos": 120, "atualizados": 7973, "mensagem": ""}
```

| Status HTTP | Quando |
|---|---|
| 201 | importação concluída |
| 400 | dados inválidos: extensão errada, arquivo grande demais, CSV ilegível, colunas obrigatórias faltando ou, na importação, região sem recorte para consultar |
| 404 | região inexistente (`POST /api/regioes/{codigo}/importar/`) |
| 502 | o USGS não respondeu (em `POST /api/regioes/{codigo}/importar/` e em `POST /api/coletas/`) |

### Modelos (machine learning)

**`POST /api/modelos/`**: treina um modelo. Corpo JSON:

```json
{
  "algoritmo": "random_forest",
  "parametros": {"n_estimators": 300, "max_depth": 10},
  "magnitude_alvo": 4.0,
  "meses_teste": 6,
  "tamanho_celula": 1.0,
  "atualizar_dados": false
}
```

| Campo | Padrão | Descrição |
|---|---|---|
| `algoritmo` | obrigatório | um dos algoritmos da tabela abaixo |
| `parametros` | padrões do algoritmo | hiperparâmetros (veja `GET /api/modelos/algoritmos/`) |
| `magnitude_alvo` | 4.5 | prever terremotos com magnitude ≥ este valor (2,5 a 8) |
| `meses_teste` | 6 | quantos períodos de 30 dias, os mais recentes, ficam para o teste |
| `tamanho_celula` | 1.0 | lado da célula em graus: 0.5, 1.0 ou 2.0 |
| `anos` | toda a base | usar só os últimos N anos da base |
| `atualizar_dados` | false | se `true`, baixa do USGS os últimos 6 anos antes de treinar (re-treino com dados novos) |

| `algoritmo` | Nome | Parâmetros configuráveis |
|---|---|---|
| `regressao_logistica` | Regressão logística | `C` |
| `arvore_decisao` | Árvore de decisão | `max_depth`, `min_samples_leaf` |
| `knn` | K vizinhos mais próximos | `n_neighbors`, `weights` |
| `random_forest` | Random Forest | `n_estimators`, `max_depth`, `min_samples_leaf` |
| `gradient_boosting` | Gradient Boosting | `n_estimators`, `learning_rate`, `max_depth` |
| `rede_neural` | Rede neural (MLP) | `camadas`, `alpha`, `max_iter` |

A resposta traz as métricas de teste (ROC AUC, precisão média, F1, comparação com o baseline histórico) e a importância das features. Status: 201 quando treinado, 400 quando os parâmetros são inválidos ou a base não tem dados suficientes, 502 quando `atualizar_dados` falha no USGS.

### Previsões

**`GET /api/previsoes/`**: probabilidade de cada célula ter um terremoto com magnitude ≥ a magnitude-alvo do modelo nos 30 dias seguintes ao terremoto mais recente da base.

| Parâmetro | Descrição |
|---|---|
| `limite` | devolve só as N células mais prováveis |
| `latitude`, `longitude` | devolve só a célula que contém o ponto (informe os dois) |
| `modelo` | id do modelo; padrão: o modelo ativo |

Exemplos:

```
GET /api/previsoes/?limite=10                         # as 10 regiões mais prováveis
GET /api/previsoes/?latitude=35.7&longitude=139.7     # a célula de Tóquio
```

Cada célula da resposta traz os limites de latitude e longitude, o centro, a `probabilidade`, os eventos dos últimos 12 períodos e a taxa histórica. Status: 404 quando ainda não há modelo treinado, 400 para parâmetros inválidos.

---

## Dados na API

A API guarda os terremotos no banco SQLite (`backend/db.sqlite3`). Os dados vêm do USGS, região por região, com a **magnitude de completude de cada região** (padrão 4,0) como mínima, nos **últimos 3 anos**. Cada terremoto guarda a região a que pertence na coluna `zona`.

### Configuração

Os parâmetros da coleta ficam em `backend/config/settings.py`:

```python
REGIAO_ANALISE = (-90.0, 90.0, -180.0, 180.0)  # (lat_min, lat_max, lon_min, lon_max): mundo inteiro
MAGNITUDE_MINIMA_COLETA = 2.5                  # magnitude mínima padrão da coleta
ANOS_COLETA_PADRAO = 3                         # base padrão: últimos 3 anos
ANOS_RETREINO = 6                              # re-treino com atualização: últimos 6 anos
```

Esses valores valem para `POST /api/coletas/`, para `importar_terremotos`, para o upload de CSV e para o re-treino. A importação **por região** (`POST /api/regioes/{codigo}/importar/`, usada pela interface) consulta só as caixas da região e usa por padrão a **magnitude de completude** dela (`Regiao.magnitude_completude`, 4,0), que pode ser ajustada no admin (`/admin/`).

O upload de CSV (`POST /api/coletas/upload/`) aceita só a extensão `.csv` e no máximo 50 MB, definidos em `UPLOAD_EXTENSOES` e `UPLOAD_TAMANHO_MAXIMO_MB`.

Os comandos para carregar, exportar e limpar os dados estão em [Comandos da base de dados](#comandos-da-base-de-dados).

### Base atual

Números da base de desenvolvimento (importação global antiga, M ≥ 2,5, mais as importações por região); a sua pode ser diferente.

| | |
|---|---|
| Terremotos | 165.163 |
| Com magnitude ≥ 4 | 97.366 |
| Magnitude | de 2,5 a 8,8 |
| Período | 31/10/2020 a 02/11/2026 |

| Região | Terremotos |
|---|---|
| América do Norte | 55.269 |
| Oceano Pacífico | 45.179 |
| Ásia | 34.039 |
| América do Sul | 8.093 |
| Oceania | 8.158 |
| Oceano Atlântico | 6.495 |
| Oceano Índico | 3.643 |
| Europa | 2.310 |
| África | 1.119 |
| Oceano Antártico | 437 |
| Oceano Ártico | 344 |
| Antártida | 76 |

### Impacto no modelo de machine learning

O modelo divide o mapa em células de 1° × 1° (cerca de 110 km de lado) e estima, para cada uma, a probabilidade de um terremoto acima da magnitude-alvo nos próximos 30 dias. No mundo inteiro, a grade completa teria 64.800 células, e a maioria delas fica em oceanos ou em regiões estáveis que nunca registram eventos. Por isso **só entram as células com ao menos um terremoto na base**. Com a base atual e magnitude-alvo 4,0, são 5.393 células e cerca de 189 mil linhas de treino.

---

## Regiões: continentes e oceanos

A unidade de análise é a **região**: um dos 7 continentes (África, Antártida, Ásia, Europa, América do Norte, Oceania, América do Sul) ou um dos 5 oceanos (Pacífico, Atlântico, Índico, Ártico, Antártico). Estatísticas, mapa, dados e importação do USGS são de uma região, e a interface analisa uma por vez. O machine learning (modelos e previsões) não usa as regiões.

| Código | Região | Tipo |
|---|---|---|
| `africa`, `antartida`, `asia`, `europa` | África, Antártida, Ásia, Europa | continente |
| `america-do-norte`, `america-do-sul`, `oceania` | América do Norte, América do Sul, Oceania | continente |
| `oceano-pacifico`, `oceano-atlantico`, `oceano-indico`, `oceano-artico`, `oceano-antartico` | Oceano Pacífico, Atlântico, Índico, Ártico, Antártico | oceano |

### De onde vêm os polígonos

`python manage.py carregar_regioes` monta as regiões a partir de dois arquivos do [Natural Earth](https://www.naturalearthdata.com/) (domínio público, resolução 110 m) em `backend/data/fontes/`:

- `ne_110m_admin_0_countries.geojson`: os países, com o campo `CONTINENT`. Cada continente é a união dos seus países.
- `ne_110m_geography_marine_polys.geojson`: os oceanos. O Pacífico e o Atlântico juntam as partes norte e sul.

Duas correções sobre o Natural Earth, que o comando aplica: a Rússia a leste dos Urais (60°E, mais a Chukotka, do outro lado do antimeridiano) vai para a **Ásia**, e não para a Europa; e a Guiana Francesa vai para a **América do Sul**, e não para a França.

Cada continente também ganha uma `costa`: o polígono dele com uma faixa de 2° (cerca de 200 km) de mar em volta. As regiões ficam na tabela `api_regiao`, com o polígono, a `costa`, as caixas para consultar o USGS e a `magnitude_completude`, que não é sobrescrita ao recarregar. O comando também recalcula a região de todos os terremotos da base.

### Como um terremoto recebe a região

A regra está em `api/services/zonas.py`, e o teste ponto-em-polígono é feito em lote com o `shapely`:

1. **dentro de um continente:** é daquele continente;
2. **no mar, junto à costa** (até uns 200 km): é do continente mais próximo dentre os que alcançam o ponto. Assim a costa e a fossa do Chile ficam na América do Sul, e a do Japão na Ásia;
3. **no mar aberto:** é do oceano que contém o ponto (ou o mais próximo, nos mares que os polígonos dos oceanos não cobrem).

O resultado fica gravado na coluna `Terremoto.zona`, então cada evento pertence a **uma região só** e as estatísticas de duas regiões nunca contam o mesmo terremoto. A classificação acontece na importação (inclusive no upload de CSV) e em `carregar_regioes`. O filtro `?regiao=` da API é só `zona = codigo`.

Para consultar o USGS usa-se uma **caixa** (retângulo) por parte da região. As caixas das regiões se sobrepõem e pegam eventos de vizinhas; eles são gravados normalmente, cada um na sua região.

---

## Arquivos da API

```
backend/
├── manage.py                      # ponto de entrada dos comandos do Django
├── requirements.txt               # dependências Python
├── .env                           # SECRET_KEY, DEBUG, ALLOWED_HOSTS (não vai para o git)
├── db.sqlite3                     # banco de dados (criado pelo migrate; não vai para o git)
├── media/modelos/                 # modelos treinados (.joblib), criada no primeiro treino
├── config/                        # configuração do projeto Django
│   ├── settings.py
│   ├── urls.py
│   ├── wsgi.py
│   └── asgi.py
├── api/                           # a aplicação: tudo o que a API faz
│   ├── models.py
│   ├── serializers.py
│   ├── views.py
│   ├── urls.py
│   ├── filters.py
│   ├── admin.py
│   ├── apps.py
│   ├── tests.py
│   ├── coleta.py                  # script antigo, independente da API
│   ├── services/                  # regras de negócio
│   │   ├── usgs.py
│   │   ├── importacao.py
│   │   ├── zonas.py               # decide a região de cada terremoto
│   │   ├── estatisticas.py
│   │   └── ml.py
│   ├── management/commands/       # comandos do terminal (python manage.py ...)
│   │   ├── carregar_regioes.py
│   │   ├── importar_terremotos.py
│   │   └── baixar_csv.py
│   └── migrations/
│       ├── 0001_initial.py
│       └── 0002_regioes.py
├── data/
│   ├── fontes/                              # polígonos do Natural Earth (países e oceanos)
│   ├── terremotos_global_m2.5_6a3anos.csv   # exemplo real para o upload (6 a 3 anos atrás)
│   └── testes_upload/                       # casos de teste manuais do upload
└── scripts/                       # dois arquivos vazios, não implementados
```

A API segue uma divisão em camadas: as **views** só recebem a requisição e devolvem a resposta; a validação fica nos **serializers**; e a regra de negócio (USGS, importação, estatísticas, machine learning) fica em **`services/`**, sem depender de HTTP. Assim a mesma função de importação serve ao endpoint, ao comando do terminal e aos testes.

### Configuração (`config/`)

| Arquivo | Função |
|---|---|
| `settings.py` | configurações do Django e do projeto: banco SQLite, apps instaladas, paginação (50 por página), região analisada, magnitude mínima da coleta, anos padrão, limites do upload e pasta dos modelos. Lê a `SECRET_KEY` do `.env` e não inicia sem ela. |
| `urls.py` | rotas principais: `/admin/` (painel do Django) e `/api/` (repassa para `api/urls.py`) |
| `wsgi.py` | ponto de entrada do servidor web (usado pelo `runserver` e por servidores de produção) |
| `asgi.py` | ponto de entrada para servidores assíncronos; padrão do Django, não usado hoje |

### Núcleo da API (`api/`)

| Arquivo | Função |
|---|---|
| `models.py` | define as quatro tabelas do banco. **`Regiao`**: um continente ou oceano (polígono, faixa de costa, caixas para consultar o USGS, magnitude de completude e tamanho da célula). **`Terremoto`**: um evento do USGS (local, coordenadas, profundidade, magnitude, data, impacto, qualidade do registro e a região `zona`), com `usgs_id` único e a faixa de profundidade calculada. **`Coleta`**: o registro de cada importação (origem, status, recebidos, novos, atualizados, mensagem). **`ModeloTreinado`**: um modelo de ML (algoritmo, parâmetros, métricas, período dos dados, se é o ativo), como era. |
| `serializers.py` | converte objetos em JSON e valida o que chega. Valida as faixas de latitude e magnitude, o upload (extensão, tamanho, magnitude mínima), os campos do treino (algoritmo e hiperparâmetros) e os parâmetros da previsão. |
| `views.py` | os seis grupos de endpoints (ViewSets): `RegiaoViewSet` (lista, mapa e importação do USGS por região), `TerremotoViewSet` (CRUD), `EstatisticaViewSet`, `ColetaViewSet` (importação do USGS, histórico e upload de CSV), `ModeloViewSet` (treino, ativação, algoritmos) e `PrevisaoViewSet`. Decide o status HTTP de cada resposta. |
| `urls.py` | registra os ViewSets num `DefaultRouter`, que gera as URLs de `/api/` e a página navegável com a lista de endpoints |
| `filters.py` | `TerremotoFilter`: os filtros por parâmetro de URL (região, magnitude, profundidade, datas, coordenadas, local, faixa de profundidade, tsunami, alerta) |
| `admin.py` | registra as quatro tabelas no painel `/admin/` (os polígonos das regiões ficam de fora do formulário) |
| `apps.py` | configuração da aplicação `api` para o Django |
| `tests.py` | os 47 testes automatizados (veja [Testes](#testes)) |
| `coleta.py` | **script antigo, independente da API**: baixa uma região do USGS (`chile`, `japao`, `indonesia`, `california` ou `global`) e salva CSV em `backend/data/raw/`. Roda com `python api/coleta.py`, com os filtros no topo do arquivo. Nada na API o importa; o comando `baixar_csv` faz o mesmo papel usando o cliente da API. |

### Regras de negócio (`api/services/`)

| Arquivo | Função |
|---|---|
| `usgs.py` | cliente da API do USGS. Monta os parâmetros (caixas, período, magnitude), refaz a requisição em falhas de rede e contorna o limite de 20.000 eventos por consulta: confere o total com `count` e divide a janela ao meio até caber. `buscar_terremotos(anos, magnitude, caixas)` baixa os últimos N anos; `buscar_periodo(inicio, fim, magnitude, caixas)` baixa um intervalo. Com várias caixas, consulta uma por vez e remove duplicatas. **Não acessa o banco.** |
| `importacao.py` | grava os terremotos no banco. Converte GeoJSON (API do USGS) e CSV em objetos `Terremoto`; no CSV, confere as colunas obrigatórias, aceita `time` em milissegundos ou data ISO e descarta linhas inválidas. Atribui a região de cada evento (`zonas.py`), insere os novos e atualiza os existentes pelo `usgs_id` (sem duplicar), em lote, e registra o resultado numa `Coleta`. `importar_do_usgs(anos, magnitude, regiao=None)` consulta o mundo inteiro ou, com `regiao`, as caixas dela. |
| `zonas.py` | classifica os terremotos em continentes e oceanos. `Classificador` testa muitos pontos de uma vez com o `shapely` (dentro do continente, faixa de costa, oceano); `atribuir` preenche a região de eventos ainda não salvos e `reclassificar` recalcula a base inteira, gravando só o que mudou. |
| `estatisticas.py` | agregações para os gráficos: resumo (total, magnitudes, período, evento mais forte), contagem por mês, por faixa de magnitude e por faixa de profundidade. Recebe a consulta já filtrada. |
| `ml.py` | machine learning. Lista os 6 algoritmos e valida os hiperparâmetros; monta a tabela **célula × período de 30 dias** com o alvo (houve terremoto ≥ magnitude-alvo?) e as features, que só olham o passado; treina com divisão temporal (os últimos períodos são o teste), calcula as métricas e compara com um baseline; salva o modelo em `media/modelos/`; e gera as previsões por célula. |

### Comandos do terminal (`api/management/commands/`)

| Arquivo | Comando | Função |
|---|---|---|
| `carregar_regioes.py` | `python manage.py carregar_regioes` | cria ou atualiza os continentes e oceanos a partir de `data/fontes/` e reclassifica os terremotos da base |
| `importar_terremotos.py` | `python manage.py importar_terremotos` | baixa do USGS e grava no banco, ou importa um CSV com `--arquivo` |
| `baixar_csv.py` | `python manage.py baixar_csv --de 6 --ate 3` | baixa um período do USGS e salva em CSV em `backend/data/`, **sem gravar no banco** |

### Banco de dados (`api/migrations/`)

| Arquivo | Função |
|---|---|
| `0001_initial.py` | cria as tabelas `api_terremoto`, `api_coleta` e `api_modelotreinado` quando se roda `python manage.py migrate` |
| `0002_regioes.py` | cria `api_regiao` e a coluna `zona` dos terremotos |

---

## Fluxo de uma requisição

```
Navegador / interface React / curl
        │  POST /api/coletas/upload/  (arquivo CSV)
        ▼
config/urls.py ──► api/urls.py        encontra a rota e o ViewSet
        │
        ▼
api/views.py (ColetaViewSet.upload)   recebe a requisição
        │
        ▼
api/serializers.py                    valida: extensão .csv, tamanho, magnitude mínima
        │  inválido → 400 com o erro por campo
        ▼
api/services/importacao.py            lê o CSV com pandas, confere as colunas,
        │                             descarta linhas inválidas, converte em Terremoto
        ▼
api/models.py  ──►  db.sqlite3        insere os novos e atualiza os existentes (usgs_id)
        │                             e registra a Coleta
        ▼
Resposta JSON                         201 com recebidos, novos, atualizados e mensagem
```

Os outros endpoints seguem o mesmo caminho, trocando o serviço: a importação do USGS passa por `usgs.py` e por `zonas.py` (que atribui a região de cada evento) antes de `importacao.py`; as estatísticas usam `filters.py` (inclusive `?regiao=`) e `estatisticas.py`; o treino e as previsões usam `ml.py`, sem relação com as regiões.

---

## Interface

A interface (`ui/`, React + Vite; detalhes em [`ui/README.md`](ui/README.md)) fala só com a API e analisa **uma região por vez**:

| Tela | O que mostra |
|---|---|
| **Regiões** | tela inicial: um mapa com os continentes (e a faixa de mar junto à costa) e os oceanos, e, ao lado dele, o painel da região escolhida (botão Analisar e importação do USGS) e a lista de todas as regiões, com a contagem de terremotos. Dali se escolhe a região, se analisa e se importam dados do USGS |
| **Painel** | totais, terremotos por mês, por faixa de magnitude e de profundidade, correlações e a análise que prepara o ML |
| **Mapa** | epicentros da região, com cor e tamanho pela coluna escolhida |
| **Dados** | tabela paginada, histórico de importações da região, busca no USGS e envio de CSV |

Os filtros da barra lateral valem para Painel, Mapa e Dados; a região escolhida vai junto em todas as consultas como `?regiao=`. O mapa da tela Regiões vem de `GET /api/regioes/mapa/`, os mesmos polígonos que o back usa para classificar os terremotos. As telas Modelos e Previsões continuam desligadas no menu, como estavam, e não usam as regiões. O gráfico "por região sísmica" do Painel usa caixas próprias (`ui/src/lib/regioesSismicas.js`), independentes das regiões da API.

---

## Testes

### Testes automatizados

Ficam em `backend/api/tests.py` e rodam com:

```bash
python manage.py test api
```

São **47 testes**, em nove grupos:

| Classe | Testes | O que verifica |
|---|---|---|
| `TerremotoApiTests` | 6 | paginação, filtros, filtro inválido (400), CRUD completo (criar, alterar, apagar), validação das faixas de latitude e magnitude, `usgs_id` duplicado (400) |
| `RegiaoTests` | 6 | filtro `?regiao=` (e código inexistente, 400), estatísticas por região, lista de regiões com a contagem de terremotos e `?com_dados=true`, detalhe (e 404), importação de região sem recorte (400) |
| `ClassificacaoTests` | 6 | a regra de terra, costa e mar: dentro do continente, mar junto à costa vai para o continente mais próximo, mar aberto vai para o oceano, ponto fora de todos os polígonos vai para o oceano mais próximo, `reclassificar` igual a `atribuir`, importação que grava a região do evento |
| `CorrecaoDeContinentesTests` | 1 | a Rússia a leste dos Urais vai para a Ásia e a Guiana Francesa para a América do Sul |
| `EstatisticaTests` | 4 | resumo, resumo com filtros, contagem por faixa de magnitude e de profundidade, contagem por mês |
| `ImportacaoTests` | 4 | importação do USGS sem duplicar (atualiza o que já existe), conversão de coordenadas e de tempo, `POST /api/coletas/`, USGS fora do ar (502, coleta registrada com erro) |
| `ImportacaoPorRegiaoTests` | 3 | importação de uma região pela API (consulta só as caixas dela, com a magnitude de completude), USGS fora do ar (502, coleta registrada com erro) e região inexistente (404) |
| `UploadCsvTests` | 8 | CSV com as colunas do USGS, `time` em data ISO, reenvio que atualiza sem duplicar, descarte de magnitude baixa e de outros tipos de evento, magnitude mínima configurável, colunas ausentes (400), extensão inválida (400), envio sem arquivo (400) |
| `MlTests` | 9 | validação dos hiperparâmetros, painel sem vazamento do futuro, treino dos 6 algoritmos, ativação de modelo, previsão geral e por ponto, ponto fora da região (400), previsão sem modelo (404), magnitude-alvo sem casos (400), re-treino que atualiza os dados, exclusão do modelo e do arquivo |

**Os testes automatizados não alteram nada do projeto:**

- o Django cria um **banco temporário** só para os testes e o apaga no fim; o `db.sqlite3` não é tocado;
- o USGS é **simulado** com `unittest.mock`: nenhum teste acessa a internet, e o resultado é igual em qualquer computador;
- os modelos treinados nos testes são salvos numa **pasta temporária**, não em `media/modelos/`;
- os testes de ML usam uma base sintética, com três focos de atividade, para o modelo ter um padrão conhecido a aprender.

### Testes manuais do upload

A pasta `backend/data/testes_upload/` tem 18 arquivos para testar o `POST /api/coletas/upload/` à mão, com a API rodando. O resultado esperado de cada um está em [`data/testes_upload/LEIAME.md`](backend/data/testes_upload/LEIAME.md).

| Grupo | Arquivos | Resultado |
|---|---|---|
| Aceitos | `01` a `06` | 201: válido, `time` em data ISO, reenvio que atualiza, colunas extras ignoradas, só as colunas obrigatórias, extensão `.CSV` |
| Aceitos com linhas descartadas | `07` a `09` | 201 com aviso na `mensagem`: linhas inválidas, ids duplicados, arquivo só com cabeçalho |
| Rejeitados | `10` a `18` | 400: coluna faltando, nome de coluna errado, separador `;`, encoding Latin-1, arquivo vazio, texto qualquer, `.json`, `.txt` |

**Diferente dos automatizados, estes testes gravam no banco real** quando enviados à API em execução. Os terremotos de teste têm o id começando com `teste_`, para serem fáceis de remover:

```python
# python manage.py shell
from api.models import Terremoto
Terremoto.objects.filter(usgs_id__startswith="teste_").delete()
```

### Verificações com dados reais

Além dos testes, estas verificações foram feitas com a base real durante o desenvolvimento:

| Verificação | Resultado |
|---|---|
| Importação global do USGS (3 anos, M ≥ 2,5), antes das regiões | 83 mil terremotos gravados. Revelou e corrigiu um erro do SQLite (`too many SQL variables`): a checagem dos ids existentes passou a ser feita em lotes de 10 mil. |
| Upload do CSV de 6 a 3 anos atrás | 81.721 recebidos, 81.655 novos e 66 atualizados (os eventos da emenda): o upload não duplica |
| Continuidade da base de 6 anos | 73 meses seguidos, sem intervalo vazio na emenda entre os dois períodos |
| Montagem da tabela de ML com a base global | cerca de 10 segundos, 5.393 células e 189 mil linhas, com magnitude-alvo 4,0 |
| Os 18 arquivos de `testes_upload/` | todos com o resultado esperado, rodados numa transação desfeita no fim para não gravar no banco |
| Classificação da base em regiões (165 mil terremotos) | todos classificados em poucos minutos (o tempo é dominado pela gravação no SQLite); soma das regiões igual ao total |
| Correção da Rússia e da Guiana Francesa | a Europa caiu de 7.664 para 2.310 terremotos e a Ásia subiu de 28.686 para 34.039 |

### O que grava no banco e o que não grava

| Ação | Grava no banco? | O quê |
|---|---|---|
| `python manage.py migrate` | sim | cria as tabelas (sem dados) |
| `python manage.py carregar_regioes` | **sim** | as regiões e a coluna `zona` de todos os terremotos |
| `python manage.py importar_terremotos` | **sim** | terremotos (novos e atualizados) e uma coleta |
| `python manage.py importar_terremotos --arquivo x.csv` | **sim** | terremotos do CSV e uma coleta |
| `python manage.py baixar_csv` | não | só gera um CSV em `backend/data/` |
| `python api/coleta.py` | não | só gera um CSV em `backend/data/raw/` |
| `python manage.py test api` | não | usa um banco temporário, apagado no fim |
| Arquivos de `data/testes_upload/` enviados à API | **sim** | terremotos com id `teste_...` e uma coleta por envio |
| `GET` em qualquer endpoint | não | só leitura |
| `POST`, `PUT`, `PATCH`, `DELETE /api/terremotos/` | **sim** | cria, altera ou apaga um terremoto |
| `POST /api/coletas/` | **sim** | terremotos do USGS (mundo inteiro) e uma coleta |
| `POST /api/regioes/{codigo}/importar/` | **sim** | terremotos do USGS da região e uma coleta |
| `GET /api/regioes/` e `/api/regioes/mapa/` | não | só leitura |
| `POST /api/coletas/upload/` | **sim** | terremotos do CSV e uma coleta (também quando o CSV é rejeitado na leitura: a coleta fica com status `erro`) |
| `POST /api/modelos/` | **sim** | um modelo treinado e o arquivo em `media/modelos/`; com `atualizar_dados: true`, também baixa e grava terremotos |
| `POST /api/modelos/{id}/ativar/` | **sim** | marca o modelo como ativo |
| `DELETE /api/modelos/{id}/` | **sim** | apaga o modelo e o arquivo |
| `GET /api/previsoes/` | não | calcula as probabilidades na hora, sem salvar |

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
| Região | uma por vez: um continente ou oceano (as caixas de cada região são consultadas no USGS) |
| Coordenadas | latitude de -90 a 90, longitude de -180 a 180 |
| Magnitude | na importação por região, ≥ magnitude de completude da região (padrão 4,0); em `POST /api/coletas/` e `importar_terremotos`, ≥ 2,5; configurável |
| Período | últimos 3 anos, contados a partir da data da coleta |
| Tipo de evento | apenas terremotos (`eventtype=earthquake`) |
| Destino | banco da API (`backend/db.sqlite3`) |

### Por que magnitude mínima de 4,0

Sem filtro de magnitude, o catálogo tem cerca de **428 mil** terremotos no mundo em 3 anos. A maioria são microtremores registrados pela rede densa de sensores dos EUA, o que concentraria a base artificialmente nesse país e deixaria a importação e o treino muito mais lentos. E o catálogo não é completo para magnitudes pequenas fora de poucos países. Medindo a magnitude de completude de cada região da base (o valor em que a contagem de eventos deixa de crescer), deu cerca de **4,1 a 4,5** em todas, menos na América do Norte (2,5, por causa da rede dos EUA). Por isso a magnitude de completude padrão é 4,0, e a importação por região baixa só o que o catálogo cobre bem. O padrão de 2,5 continua em `POST /api/coletas/`, nos comandos e no upload de CSV.

### Requisição utilizada

Os dados são baixados em GeoJSON, porque é o formato que traz os campos de impacto (`tsunami`, `alert`, `sig`), ausentes no CSV da API. Exemplo de uma das requisições feitas pela coleta, para uma janela de um ano e a caixa principal da América do Sul:

```
https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=2025-10-29T00:00:00&endtime=2026-10-29T00:00:00&eventtype=earthquake&minlatitude=-57.61&maxlatitude=14.44&minlongitude=-83.41&maxlongitude=-32.73&minmagnitude=4
```

A API do USGS devolve no máximo 20.000 eventos por consulta. Regiões grandes (América do Norte, Pacífico) passam desse limite em um ano, então a coleta confere o total pelo método `count` e divide a janela ao meio até cada parte caber numa consulta.

### Colunas do arquivo

As colunas abaixo são as do USGS, usadas nos CSVs do projeto (gerados pelo `baixar_csv`) e aceitas pelo upload. Cada linha é um terremoto.

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
| `time` | data ou inteiro | horário de origem, em UTC |
| `updated` | data ou inteiro | última atualização do registro, em UTC |

A API do USGS envia `time` e `updated` em milissegundos desde 01/01/1970. O comando `baixar_csv` grava como data ISO, no formato do banco (`2024-04-29 14:11:19.731000`). O upload aceita os dois formatos.

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
| `zona` | `latitude`, `longitude` | código da região (continente ou oceano) a que o terremoto pertence, calculado na importação |

As faixas de profundidade seguem a classificação usual em sismologia.

### Por que continentes e oceanos

A pergunta do projeto é onde existe maior chance de um terremoto acima de uma magnitude. A análise de um mundo único mistura sobretudo geografia (onde ficam as bordas de placas) e a cobertura dos sensores, que varia muito entre países. Separar por continente e oceano dá regiões de tamanho comparável, cada uma com seus dados e gráficos. O mar conta: a maior parte dos terremotos fortes acontece nas fossas junto à costa, então o mar até uns 200 km pertence ao continente, e o mar aberto, ao oceano. Foram descartadas a divisão por país (o recorte retangular misturava vizinhos: a "Bolívia" listava terremotos do Chile e do Peru), por caixas de latitude e longitude (sobrepunham-se) e por placa tectônica.

---

## Limitações dos dados

- **Escalas de magnitude diferentes.** A base mistura escalas: cerca de 54% dos eventos são `mb`, 30% `ml`, 9% `md` e 5% `mww`, entre outras. As escalas não são diretamente equivalentes, e o campo `magType` deve ser considerado nas análises.
- **Completude desigual.** Tremores pequenos só são detectados perto das estações sismográficas. Na base, só a América do Norte é completa abaixo de M 4; nas demais regiões o catálogo só é completo a partir de uns M 4,1 a 4,5. Por isso a importação por região usa M ≥ 4,0, e uma base que misture a importação global antiga (M ≥ 2,5) com as novas deixa a América do Norte sobrerrepresentada. A ausência de eventos numa área pode refletir falta de cobertura, não falta de atividade.
- **Profundidade de 10 km.** Cerca de 30% dos eventos (49 mil) têm profundidade exatamente 10 km, o valor-padrão que o USGS usa quando não consegue calcular a profundidade. Esse número distorce a profundidade média e as faixas de profundidade.
- **Campos de impacto quase vazios.** `felt`, `cdi`, `mmi` e `alert` só existem quando houve relatos da população ou avaliação de impacto, o que é raro em tremores pequenos: `alert` está vazio em 97% dos eventos, `mmi` em 93% e `cdi` e `felt` em 84%.
- **`tsunami` indica uma mensagem, não um tsunami.** O valor 1 significa que o USGS emitiu um aviso, segundo um protocolo baseado principalmente em magnitude e localização. Não confirma que uma onda ocorreu.
- **Dados revisáveis.** Eventos recentes podem estar com `status=automatic` (0,6% da base) e ter localização ou magnitude ajustadas depois.
- **Qualidade da localização.** Cerca de 24% dos eventos têm lacuna azimutal acima de 180°, o que indica uma localização menos confiável.
- **Réplicas.** Os terremotos vêm em sequências (um grande seguido de réplicas). A base não é "declusterizada", então as réplicas inflam a persistência de atividade que o modelo aprende.
- **Limites das regiões.** Os polígonos do Natural Earth são de baixa resolução (110 m), e a faixa de mar de uma região é aproximada (2° de latitude, cerca de 200 km, um pouco menos em longitude nas latitudes altas). Um terremoto na divisa entre dois continentes pode trocar de região se esses limites mudarem. Os polígonos dos oceanos são blocos retos e não cobrem os mares marginais: o que sobra vai para o oceano mais próximo.
- **Células, não cidades.** O modelo trabalha com células de latitude e longitude. O nome de um lugar só aparece no campo `place` do USGS (ex.: "45 km E of Sendai, Japan"), que descreve a posição em relação à cidade mais próxima.
- **Variáveis físicas ausentes.** O catálogo não traz o mecanismo de falha nem o deslocamento do fundo do mar.

---

## Referências

- USGS FDSN Event Web Service: https://earthquake.usgs.gov/fdsnws/event/1/
- Formato GeoJSON do USGS: https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
- Documentação do ComCat: https://earthquake.usgs.gov/data/comcat/
- Natural Earth (polígonos de países e oceanos): https://www.naturalearthdata.com/
- Documentação do Django REST Framework: https://www.django-rest-framework.org/
- Shapely (geometria em Python): https://shapely.readthedocs.io/
