# Front-end (React) — pasta ui/

Interface web do projeto. Ela conversa **somente com a API REST do back** (`backend/`, Django REST Framework), então o
back precisa estar rodando. A interface analisa **uma região por vez** (o machine learning não foi alterado; as telas Modelos e Previsões continuam desligadas no menu, como estavam): um dos 7 continentes ou dos 5 oceanos (veja
[Regiões](../readme.md#regiões-continentes-e-oceanos) no README principal).

## Como rodar

Pré-requisitos: [Node.js](https://nodejs.org) 20.19 ou mais recente e o back-end rodando.

```bash
cd ui
npm install
npm run dev
```

O navegador abre em `http://localhost:5173`. Em desenvolvimento, o Vite repassa tudo que começa com `/api` para
`http://127.0.0.1:8000`, então não precisa configurar CORS. Se o back estiver em outro endereço, copie
`ui/.env.example` para `ui/.env` e ajuste `VITE_API_URL`, depois reinicie o `npm run dev`.

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

Crie o banco, cadastre as regiões, importe os terremotos e suba a API em `http://127.0.0.1:8000/api/`:

```bash
python manage.py migrate
python manage.py carregar_regioes
python manage.py importar_terremotos
python manage.py runserver
```

Também dá para importar pela própria interface: na tela **Regiões**, escolha uma região sem dados e clique em
"Buscar no USGS".

</details>

## Telas

Ao abrir, a tela é **Regiões**. Escolhida uma região, as demais telas aparecem no menu e passam a mostrar só ela. Modelos e Previsões continuam comentadas em `App.jsx`, como estavam, e não usam as regiões.

| Tela | O que mostra |
|---|---|
| **Regiões** | um mapa com os continentes (e a faixa de mar junto à costa) e os oceanos, e, ao lado dele, o painel da região escolhida (botão **Analisar**, importação do USGS) e a lista de todas as regiões com a quantidade de terremotos. Clicar numa região no mapa ou na lista a escolhe, sem precisar rolar a página |
| **Painel** | totais, terremotos por mês, por faixa de magnitude e de profundidade, magnitude máxima por mês, correlações e a análise que prepara o ML. Na etapa 1 há dois mapas: o dos quadrados de 1° (as "regiões" do modelo, coloridos pela quantidade de terremotos) e o dos epicentros, com cor e tamanho pela coluna escolhida (padrão: magnitude). O dos epicentros mostra uma amostra de até 3.000 pontos (o cartão avisa quando é amostra); regiões que cruzam a linha de data, como o Pacífico, são desenhadas contínuas, e o enquadramento ignora os pontos mais isolados |
| **Dados** | tabela paginada e ordenável, histórico de importações, busca de dados novos no USGS e envio de CSV |

Os **filtros** da barra lateral (magnitude, profundidade, período, escala, tsunami, alerta e local) valem para
Painel e Dados ao mesmo tempo. Trocar de região limpa os filtros. A região escolhida vai em todas as consultas
como `?regiao=<codigo>`.

Só o **nome das colunas** é traduzido para a tela, em [`src/lib/rotulos.js`](src/lib/rotulos.js); os valores aparecem
como vêm da API (`mb`, `raso`, `reviewed`…).

### O mapa da tela Regiões

O mapa ([`MapaRegioes.jsx`](src/componentes/MapaRegioes.jsx)) desenha, sobre o OpenStreetMap, três camadas vindas de
`GET /api/regioes/mapa/`: os oceanos (preenchimento leve, sem contorno), a faixa de mar em volta de cada continente e os
continentes (com cor e nome). São os mesmos polígonos que o back usa para decidir a região de cada terremoto. O mundo
aparece uma vez só e o zoom mínimo é o que o mostra inteiro (de 72°S a 80°N, o que mostra a borda da Antártida; o mapa cabe inteiro na janela).

## De onde vêm os dados

Tudo vem da API do back, por [`src/api/cliente.js`](src/api/cliente.js). As telas importam `api` de
[`src/api/index.js`](src/api/index.js) e não sabem como a requisição é feita. Não há mais uma fonte "USGS direto"
no navegador: o USGS é consultado pelo back, que grava os terremotos no banco.

Pontos da API que a interface usa e vale conhecer:

- **Regiões.** `GET /api/regioes/` (lista com a contagem de terremotos), `GET /api/regioes/mapa/` (polígonos) e
  `POST /api/regioes/{codigo}/importar/` (busca no USGS; pode levar alguns minutos).
- **Tamanho de página.** `?page_size=` é aceito (até 5.000); o mapa e a dispersão baixam todos os terremotos da região
  em poucas requisições.
- **Envio de arquivo.** `POST /api/coletas/upload/` (multipart, campo `arquivo`; só CSV, até 50 MB), com as colunas do
  USGS (`id`, `mag`, `time`, `latitude`, `longitude`, `depth`). Arquivo inválido volta `400` com o registro da coleta
  (o front mostra o campo `mensagem`).

## Estrutura

```
ui/src/
├── api/
│   ├── index.js              # ponto único de acesso à API
│   ├── cliente.js            # chamadas HTTP ao back (regiões, terremotos, estatísticas, coletas, modelos, previsões)
│   └── erro.js               # ErroApi
├── componentes/              # cartões, filtros, gráficos (Recharts), mapa dos epicentros e mapa das regiões (Leaflet)
├── lib/
│   ├── rotulos.js            # tradução dos nomes das colunas
│   ├── formato.js            # números e datas em português
│   ├── useCarregar.js        # busca na API com estado de carregamento e erro
│   ├── useTodosTerremotos.js # junta as páginas de terremotos da região, com progresso e cache
│   ├── analise.js            # análises do Painel que justificam as escolhas do ML
│   └── regioesSismicas.js    # agrupamento do Painel por região sísmica (caixas próprias, independentes das regiões da API)
├── paginas/                  # Regioes, Painel, Dados (Modelos e Previsoes existem, mas estão desligadas)
└── App.jsx                   # navegação, região escolhida e filtros compartilhados
```

Bibliotecas: [React](https://react.dev) + [Vite](https://vite.dev), [Recharts](https://recharts.org) (gráficos) e
[React Leaflet](https://react-leaflet.js.org) (mapas, com fundo do OpenStreetMap).
