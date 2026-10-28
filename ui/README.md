# Front-end (React) — pasta ui/

Interface web do projeto. Ela conversa com o back-end (`backend/`, Django REST Framework)
**somente pela API REST**: nenhuma tela lê arquivo ou banco de dados direto.

O front **não depende do back para funcionar**: por padrão ele usa uma API simulada que roda no próprio
navegador, com os mesmos endpoints e os mesmos formatos de resposta do back de verdade.

## Como rodar

### Só o front (não precisa do back)

Pré-requisito: [Node.js](https://nodejs.org) 20 ou mais recente.

```bash
cd ui
npm install
npm run dev
```

O navegador abre em `http://localhost:5173`, já com dados de exemplo. O que você fizer (importar arquivo,
treinar modelo) fica na memória e **some ao recarregar a página**.

### Com o back-end de verdade

1. Suba o back (passo a passo abaixo).
2. Copie `ui/.env.example` para `ui/.env` e troque para `VITE_USAR_MOCK=false`.
3. Reinicie o `npm run dev`.

Para voltar à API simulada, é só pôr `VITE_USAR_MOCK=true` (ou apagar o `.env`).

<details>
<summary>Como subir o back-end</summary>

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

Crie o banco, carregue os terremotos (o CSV já vem no repositório) e suba a API em `http://127.0.0.1:8000/api/`:

```bash
python manage.py migrate
python manage.py shell -c "from api.services import importacao; importacao.importar_csv('data/raw/terremotos_chile_mtodas_3anos.csv', anos=3)"
python manage.py runserver
```

Em desenvolvimento, o Vite repassa tudo que começa com `/api` para `http://127.0.0.1:8000`, então não
precisa configurar CORS. Se o back estiver em outro endereço, ajuste `VITE_API_URL` no `ui/.env`.

</details>

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

## A API simulada

Fica em [`src/api/mock/`](src/api/mock). Ela implementa as mesmas rotas do back (listagem com filtros, ordenação e
paginação de 50 em 50, estatísticas, coletas, modelos e previsões) e usa a mesma validação, inclusive as mensagens de erro.
Os dados vêm de [`public/mock/terremotos.csv`](public/mock/terremotos.csv), uma **cópia** de
`backend/data/raw/terremotos_chile_mtodas_3anos.csv` (o front não pode ler a pasta do back).

Duas diferenças em relação ao back de verdade:

- **Modelos.** Todos os algoritmos treinam o mesmo modelo simples, uma regressão logística escrita em JavaScript, que usa o mesmo
  painel de células e períodos do back e o mesmo baseline. As métricas são reais desse modelo, não do algoritmo escolhido.
  A tela Modelos avisa isso.
- **Busca no USGS.** Não há rede: a "busca" só confere os parâmetros e conta o que já está na amostra.

Se o back mudar uma rota ou um formato, atualize também `src/api/mock/` para as duas continuarem iguais.

## O que o back ainda não tem

- **Envio de arquivo.** A tela Dados já tem o campo e a API simulada já aceita CSV, JSON (inclusive GeoJSON) e XML, mas a
  rota **não existe no back**. Contrato que o front espera:
  `POST /api/coletas/arquivo/`, corpo `multipart/form-data` com o campo `arquivo`, resposta `201` com a coleta
  (`id`, `origem`, `status`, `recebidos`, `novos`, `atualizados`…) e, em arquivo inválido, `400` com `{"detail": "mensagem"}`.
  Colunas obrigatórias: `id`, `mag`, `time`, `latitude`, `longitude`, `depth`. Hoje, com o back real, a tela mostra uma
  mensagem explicando que a rota falta. O código para ler os três formatos está em `backend/scripts/preparo.py`.
- **Tamanho de página configurável.** O back entrega 50 terremotos por página. O mapa e a dispersão precisam de todos,
  então o front baixa as 51 páginas (cerca de 3 a 5 segundos) e guarda o resultado em memória para as outras telas.
  Se o back aceitasse `?page_size=` (`page_size_query_param` na classe de paginação), isso cairia para uma requisição.
- **Previsões lentas.** `GET /api/previsoes/` leva uns 3 segundos com limite e uns 5 sem, porque o back remonta o painel
  de células a cada chamada. Por isso a tela abre com as 50 regiões mais prováveis.
- **Tamanho da região no treino.** `tamanho_celula` só aceita os **textos** `"0.5"`, `"1.0"` e `"2.0"`. Enviar o número `1`
  dá erro 400. O front já manda no formato certo.

## Estrutura

```
ui/src/
├── api/
│   ├── index.js              # escolhe entre a API real e a simulada (VITE_USAR_MOCK)
│   ├── cliente.js            # chamadas HTTP à API real
│   ├── erro.js               # ErroApi, usado pelas duas
│   └── mock/                 # API simulada: dados.js (terremotos, estatísticas, coletas) e ml.js (modelos, previsões)
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
[React Leaflet](https://react-leaflet.js.org) (mapa, com fundo do OpenStreetMap) e
[Papa Parse](https://www.papaparse.com) (leitura de CSV na API simulada).
