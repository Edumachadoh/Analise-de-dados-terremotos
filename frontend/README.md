# Front-end (React)

Interface web do projeto. Ela conversa com o back-end (`backend/`, Django REST Framework)
**somente pela API REST**: nenhuma tela lê arquivo ou banco de dados direto.

## Como rodar

São dois programas, cada um num terminal. Pré-requisitos: Python 3.10+ e [Node.js](https://nodejs.org) 20+.

**1. Back-end** (na primeira vez, prepare o ambiente):

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Crie o arquivo `backend/.env` com uma chave qualquer:

```
SECRET_KEY=troque-por-uma-chave-longa-e-aleatoria
DEBUG=True
```

Crie o banco e carregue os terremotos (o CSV já vem no repositório):

```bash
python manage.py migrate
python manage.py shell -c "from api.services import importacao; importacao.importar_csv('../ui/data/raw/terremotos_chile_mtodas_3anos.csv', anos=3)"
```

Suba a API (fica em `http://127.0.0.1:8000/api/`):

```bash
python manage.py runserver
```

**2. Front-end:**

```bash
cd frontend
npm install
npm run dev
```

O navegador abre em `http://localhost:5173`. Em desenvolvimento, o Vite repassa tudo que começa com `/api`
para `http://127.0.0.1:8000`, então não precisa configurar CORS. Se o back estiver em outro endereço,
copie `.env.example` para `.env` e ajuste `VITE_API_URL`.

## Telas

| Tela | O que mostra | Rotas da API usadas |
|---|---|---|
| **Painel** | totais, terremotos por mês, por faixa de magnitude e de profundidade, magnitude máxima por mês e dispersão profundidade × magnitude | `/estatisticas/…`, `/terremotos/` |
| **Mapa** | epicentros no mapa, com cor e tamanho pela coluna escolhida (padrão: magnitude) | `/terremotos/` |
| **Dados** | tabela paginada e ordenável, histórico de importações, busca de dados novos no USGS e envio de arquivo | `/terremotos/`, `/coletas/` |
| **Modelos** | treinar um algoritmo escolhendo os parâmetros, ver as métricas contra o baseline e a importância das informações, ativar ou excluir modelos | `/modelos/…` |
| **Previsões** | probabilidade de terremoto por região nos próximos 30 dias, em mapa e em tabela | `/previsoes/` |

Os **filtros** da barra lateral (magnitude, profundidade, período, escala, tsunami, alerta e local) valem para
Painel, Mapa e Dados ao mesmo tempo. Eles são enviados como parâmetros da API (`?magnitude_min=5&data_inicio=…`).

Os nomes dos campos do back (`profundidade_km`, `tipo_magnitude`…) e os códigos dos valores (`mb`, `green`…)
são traduzidos para a tela em [`src/lib/rotulos.js`](src/lib/rotulos.js). Para renomear algo na interface, é lá.

## O que o back ainda não tem

- **Envio de arquivo.** A tela Dados tem o campo, mas a rota `POST /api/coletas/arquivo/` não existe. Hoje o back só
  importa o CSV por linha de comando (`importacao.importar_csv`). Enquanto isso, a tela mostra uma mensagem explicando.
- **Tamanho de página configurável.** O back entrega 50 terremotos por página. O mapa e a dispersão precisam de todos,
  então o front baixa as 51 páginas (cerca de 3 a 5 segundos) e guarda o resultado em memória para as outras telas.
  Se o back aceitasse `?page_size=` (`page_size_query_param` na classe de paginação), isso cairia para uma requisição.
- **Previsões lentas.** `GET /api/previsoes/` leva uns 3 segundos com limite e uns 5 sem, porque o back remonta o painel
  de células a cada chamada. Por isso a tela abre com as 50 regiões mais prováveis.
- **Tamanho da região no treino.** `tamanho_celula` só aceita os **textos** `"0.5"`, `"1.0"` e `"2.0"`. Enviar o número `1`
  dá erro 400. O front já manda no formato certo.

## Estrutura

```
frontend/src/
├── api/cliente.js            # todas as chamadas HTTP à API
├── componentes/              # cartões, filtros, gráficos (Recharts), mapa base (Leaflet)
├── lib/
│   ├── rotulos.js            # tradução de campos e valores
│   ├── formato.js            # números e datas em português
│   ├── useCarregar.js        # busca na API com estado de carregamento e erro
│   └── useTodosTerremotos.js # junta as páginas de terremotos, com progresso e cache
├── paginas/                  # Painel, Mapa, Dados, Modelos, Previsoes
└── App.jsx                   # navegação e filtros compartilhados
```

Bibliotecas: [React](https://react.dev) + [Vite](https://vite.dev), [Recharts](https://recharts.org) (gráficos),
[React Leaflet](https://react-leaflet.js.org) (mapa, com fundo do OpenStreetMap).
