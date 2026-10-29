# Front-end (React) — pasta ui/

Interface web do projeto. Por enquanto ela **busca os terremotos direto na API do USGS**, a mesma que o back
(`backend/`, Django REST Framework) consome, então funciona **sem o back rodando**. Quando o back estiver pronto,
é só trocar a fonte (veja abaixo): as telas não mudam.

## Como rodar

### Direto do USGS (não precisa do back)

Pré-requisitos: [Node.js](https://nodejs.org) 20 ou mais recente e conexão com a internet.

```bash
cd ui
npm install
npm run dev
```

O navegador abre em `http://localhost:5173`. Na primeira abertura, o front baixa os últimos 3 anos de terremotos do
Chile no USGS (uns 4 segundos). O que você fizer (importar arquivo, treinar modelo) fica na memória e **some ao
recarregar a página**, quando os dados são baixados de novo.

### Com o back-end

1. Suba o back (passo a passo abaixo).
2. Copie `ui/.env.example` para `ui/.env` e troque para `VITE_FONTE=back`.
3. Reinicie o `npm run dev`.

Para voltar ao USGS direto, ponha `VITE_FONTE=usgs` (ou apague o `.env`).

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

| Tela | O que mostra |
|---|---|
| **Painel** | totais, terremotos por mês, por faixa de magnitude e de profundidade, magnitude máxima por mês e dispersão profundidade × magnitude |
| **Mapa** | epicentros no mapa, com cor e tamanho pela coluna escolhida (padrão: magnitude) |
| **Dados** | tabela paginada e ordenável, histórico de importações, busca de dados novos no USGS e envio de arquivo |
| **Modelos** | treinar um algoritmo escolhendo os parâmetros, ver as métricas contra o baseline e a importância das informações, ativar ou excluir modelos |
| **Previsões** | probabilidade de terremoto por região nos próximos 30 dias, em mapa e em tabela |

Os **filtros** da barra lateral (magnitude, profundidade, período, escala, tsunami, alerta e local) valem para
Painel, Mapa e Dados ao mesmo tempo.

Só o **nome das colunas** é traduzido para a tela, em [`src/lib/rotulos.js`](src/lib/rotulos.js); os valores aparecem
como vêm da API (`mb`, `raso`, `reviewed`…).

## De onde vêm os dados

A escolha da fonte fica em [`src/api/index.js`](src/api/index.js); as telas só chamam `api.…` e não sabem qual está ativa.

| `VITE_FONTE` | De onde vêm os dados | Onde está o código |
|---|---|---|
| `usgs` (padrão) | API do USGS, chamada direto do navegador | `src/api/usgs/` |
| `back` | API REST do back (Django) | `src/api/cliente.js` |

Na fonte `usgs`, só os **terremotos** vêm do USGS (`src/api/usgs/servico.js`, com a mesma consulta do back: recorte do
Chile, janelas de 1 ano, contagem antes de baixar e novas tentativas). Todo o resto é calculado no navegador, com os mesmos
nomes de campo, formatos de resposta, validações e mensagens de erro do back: filtros, ordenação, paginação de 50 em 50,
estatísticas, histórico de importações, modelos e previsões. O botão **Buscar no USGS** da tela Dados também é de verdade:
baixa os anos pedidos e soma à base, sem duplicar.

Diferenças em relação ao back:

- **Modelos.** Todos os algoritmos treinam o mesmo modelo simples, uma regressão logística escrita em JavaScript, que usa o
  mesmo painel de células e períodos do back e o mesmo baseline. As métricas são reais desse modelo, não do algoritmo escolhido.
  A tela Modelos avisa isso. Os números de cada algoritmo só virão com o back.
- **Sem internet ou USGS fora do ar:** as telas mostram a mensagem de erro e tentam de novo ao trocar de tela.
- **Nada é salvo:** modelos e importações vivem na memória da página.

Se o back mudar uma rota ou um formato, atualize também `src/api/usgs/` para as duas fontes continuarem iguais.

## O que o back ainda não tem

- **Envio de arquivo.** A tela Dados já tem o campo e a fonte `usgs` já aceita CSV, JSON (inclusive GeoJSON) e XML, mas a
  rota **não existe no back**. Contrato que o front espera:
  `POST /api/coletas/arquivo/`, corpo `multipart/form-data` com o campo `arquivo`, resposta `201` com a coleta
  (`id`, `origem`, `status`, `recebidos`, `novos`, `atualizados`…) e, em arquivo inválido, `400` com `{"detail": "mensagem"}`.
  Colunas obrigatórias: `id`, `mag`, `time`, `latitude`, `longitude`, `depth`. Com `VITE_FONTE=back`, a tela mostra uma
  mensagem explicando que a rota falta. O código para ler os três formatos está em `backend/scripts/preparo.py`.
- **Tamanho de página configurável.** O back entrega 50 terremotos por página. O mapa e a dispersão precisam de todos,
  então, com `VITE_FONTE=back`, o front baixa as 51 páginas (cerca de 3 a 5 segundos) e guarda o resultado em memória.
  Se o back aceitasse `?page_size=` (`page_size_query_param` na classe de paginação), isso cairia para uma requisição.
- **Previsões lentas.** `GET /api/previsoes/` leva uns 3 segundos com limite e uns 5 sem, porque o back remonta o painel
  de células a cada chamada. Por isso a tela abre com as 50 regiões mais prováveis.
- **Tamanho da região no treino.** `tamanho_celula` só aceita os **textos** `"0.5"`, `"1.0"` e `"2.0"`. Enviar o número `1`
  dá erro 400. O front já manda no formato certo.

## Estrutura

```
ui/src/
├── api/
│   ├── index.js              # escolhe a fonte dos dados (VITE_FONTE)
│   ├── cliente.js            # chamadas HTTP ao back
│   ├── erro.js               # ErroApi, usado pelas duas fontes
│   └── usgs/                 # fonte USGS: servico.js (API do USGS), dados.js (terremotos, estatísticas, coletas), ml.js (modelos, previsões)
├── componentes/              # cartões, filtros, gráficos (Recharts), mapa base (Leaflet)
├── lib/
│   ├── rotulos.js            # tradução dos nomes das colunas
│   ├── formato.js            # números e datas em português
│   ├── useCarregar.js        # busca na API com estado de carregamento e erro
│   └── useTodosTerremotos.js # junta as páginas de terremotos, com progresso e cache
├── paginas/                  # Painel, Mapa, Dados, Modelos, Previsoes
└── App.jsx                   # navegação e filtros compartilhados
```

Bibliotecas: [React](https://react.dev) + [Vite](https://vite.dev), [Recharts](https://recharts.org) (gráficos),
[React Leaflet](https://react-leaflet.js.org) (mapa, com fundo do OpenStreetMap) e
[Papa Parse](https://www.papaparse.com) (leitura de CSV no envio de arquivo).
