# Dados de Terremotos — USGS ComCat

Este documento descreve os dados utilizados no projeto: de onde vêm, como são obtidos, quais campos possuem e quais cuidados exigem.

## Fonte

Os dados vêm do **ANSS Comprehensive Earthquake Catalog (ComCat)**, mantido pelo **Serviço Geológico dos Estados Unidos (USGS)**. O catálogo reúne eventos sísmicos registrados por redes sismográficas do mundo inteiro e é atualizado continuamente.

- **Serviço:** FDSN Event Web Service
- **Documentação:** https://earthquake.usgs.gov/fdsnws/event/1/
- **Acesso:** público e gratuito, sem cadastro ou chave de API
- **Licença:** dados do governo dos EUA, em domínio público

## Escopo

| Critério | Valor |
|---|---|
| Período | últimos 10 anos |
| Magnitude mínima | 5.0 |
| Tipo de evento | apenas terremotos (`eventtype=earthquake`) |
| Abrangência | global, com recortes por região |

A magnitude mínima de 5.0 mantém apenas eventos relevantes e deixa de fora os microtremores, que são numerosos e registrados com densidade muito desigual entre as regiões.

## Como os dados são obtidos

As consultas são requisições `GET` ao endpoint de consulta:

```
https://earthquake.usgs.gov/fdsnws/event/1/query
```

Exemplo, com terremotos de magnitude 5 ou mais em um ano:

```
https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=2025-10-18&endtime=2026-10-18&eventtype=earthquake&minmagnitude=5
```

Antes de baixar, o total de eventos pode ser conferido trocando `query` por `count`:

```
https://earthquake.usgs.gov/fdsnws/event/1/count?starttime=2025-10-18&endtime=2026-10-18&eventtype=earthquake&minmagnitude=5
```

### Parâmetros utilizados

| Parâmetro | Função |
|---|---|
| `format` | formato da resposta (`geojson` ou `csv`) |
| `starttime` / `endtime` | período, no formato ISO 8601 (UTC) |
| `minmagnitude` | magnitude mínima |
| `eventtype` | tipo de evento |
| `minlatitude`, `maxlatitude`, `minlongitude`, `maxlongitude` | recorte retangular por região |

### Limite de 20.000 eventos

O serviço retorna no máximo 20.000 eventos por consulta. Acima disso, a resposta é `400 Bad Request`. Por isso, períodos longos são baixados em janelas de tempo (por exemplo, um ano por vez), e os resultados são unidos depois, removendo duplicatas pelo identificador `id`.

### Recortes regionais

Além da base global, são gerados arquivos por região, todos com as mesmas colunas:

| Região | Latitude | Longitude |
|---|---|---|
| Chile | -56 a -17 | -76 a -66 |
| Japão | 24 a 46 | 122 a 146 |
| Indonésia | -11 a 6 | 95 a 141 |
| Califórnia | 32 a 42 | -125 a -114 |

## Formatos

Os dados são obtidos em dois formatos, com uma diferença importante entre eles:

- **GeoJSON:** formato principal, porque é o único que traz os campos de impacto, como `tsunami`, `alert` e `sig`.
- **CSV:** mais simples de abrir, mas **não contém** esses campos de impacto.

## Campos

### GeoJSON

Cada evento é um item da lista `features`, com a localização em `geometry` e os demais atributos em `properties`.

**Localização (`geometry.coordinates`)**

| Posição | Campo | Descrição |
|---|---|---|
| 0 | longitude | graus decimais, de -180 a 180 |
| 1 | latitude | graus decimais, de -90 a 90 |
| 2 | profundidade | km abaixo da superfície |

A ordem é **longitude, latitude, profundidade**, e não latitude primeiro.

**Atributos (`properties`)**

| Campo | Tipo | Descrição |
|---|---|---|
| `mag` | decimal | magnitude do evento |
| `magType` | texto | escala usada para a magnitude (`mww`, `mb`, `ml` etc.) |
| `time` | inteiro | horário de origem, em milissegundos desde 01/01/1970 (UTC) |
| `updated` | inteiro | última atualização do registro, em milissegundos |
| `place` | texto | descrição do local (ex.: "100 km SW of Lima, Peru") |
| `tsunami` | 0 ou 1 | 1 quando o USGS emitiu uma mensagem de tsunami para o evento |
| `alert` | texto | nível de alerta PAGER de impacto: `green`, `yellow`, `orange`, `red` |
| `sig` | inteiro | índice de significância, de 0 a 1000+, calculado pelo USGS |
| `felt` | inteiro | número de relatos de pessoas que sentiram o tremor |
| `cdi` | decimal | intensidade máxima relatada pela população (0 a 12) |
| `mmi` | decimal | intensidade máxima estimada na escala Mercalli Modificada (0 a 12) |
| `nst` | inteiro | número de estações usadas para localizar o evento |
| `gap` | decimal | maior lacuna azimutal entre estações, em graus |
| `dmin` | decimal | distância até a estação mais próxima, em graus |
| `rms` | decimal | erro quadrático médio do ajuste, em segundos |
| `status` | texto | `automatic` ou `reviewed` (revisado por um analista) |
| `net` | texto | rede sismográfica responsável pelo registro |
| `type` | texto | tipo do evento |

### CSV

| Campo | Descrição |
|---|---|
| `time` | horário de origem, ISO 8601 (UTC) |
| `latitude`, `longitude` | localização do epicentro |
| `depth` | profundidade, em km |
| `mag`, `magType` | magnitude e escala |
| `nst`, `gap`, `dmin`, `rms` | qualidade da localização |
| `net`, `id` | rede e identificador do evento |
| `updated` | última atualização |
| `place` | descrição do local |
| `type` | tipo do evento |
| `horizontalError`, `depthError`, `magError` | incertezas de localização e magnitude |
| `magNst` | número de estações usadas na magnitude |
| `status` | `automatic` ou `reviewed` |
| `locationSource`, `magSource` | rede de origem da localização e da magnitude |

O campo `place` contém vírgulas e vem entre aspas no CSV. Ele deve ser lido com um leitor de CSV que respeite aspas.

## Campos derivados

A partir dos campos originais, são criados:

| Campo | Origem | Descrição |
|---|---|---|
| `data_hora` | `time` | data e hora convertidas para datetime UTC |
| `ano`, `mes` | `time` | componentes de data para análises temporais |
| `regiao` | `place` | texto após a última vírgula (ex.: "Peru") |
| `faixa_profundidade` | profundidade | raso (< 70 km), intermediário (70–300 km) ou profundo (> 300 km) |

As faixas de profundidade seguem a classificação usual em sismologia.

## Tratamento aplicado

- Remoção de duplicatas pelo `id`.
- Remoção de eventos que não sejam terremotos (`type`).
- Conversão do tempo de milissegundos para datetime.
- Tratamento de valores ausentes em `nst`, `gap`, `dmin`, `felt`, `cdi`, `mmi` e `alert`, que são comuns.
- Revisão de profundidades negativas, que ocorrem quando o evento é registrado acima do nível do mar de referência.

## Limitações dos dados

- **`tsunami` indica uma mensagem, não um tsunami.** O valor 1 significa que o USGS emitiu um aviso, o que segue um protocolo baseado principalmente em magnitude e localização. Não confirma que uma onda ocorreu.
- **Escalas de magnitude diferentes.** O campo `magType` mostra que nem todas as magnitudes foram medidas da mesma forma; para eventos grandes, predomina a magnitude de momento (`mww`).
- **Cobertura desigual.** Regiões com redes sismográficas densas, como os EUA e o Japão, têm registros mais completos e precisos.
- **Dados revisáveis.** Eventos recentes podem estar com `status=automatic` e ter localização ou magnitude ajustadas depois.
- **Campos de impacto incompletos.** `felt`, `cdi`, `mmi` e `alert` só existem quando houve relatos da população ou avaliação de impacto, o que é raro em eventos no meio do oceano.
- **Variáveis físicas ausentes.** O catálogo não traz o mecanismo de falha nem o deslocamento do fundo do mar, fatores determinantes para tsunamis.

## Referências

- USGS FDSN Event Web Service: https://earthquake.usgs.gov/fdsnws/event/1/
- Formato GeoJSON do USGS: https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
- Formato CSV do USGS: https://earthquake.usgs.gov/earthquakes/feed/v1.0/csv.php
- Glossário dos campos do ComCat: https://earthquake.usgs.gov/data/comcat/