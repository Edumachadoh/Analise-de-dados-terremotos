// Parte "modelos" da API local. Reproduz o contrato de backend/api/services/ml.py:
//   - o mesmo painel célula × período de 30 dias, com as mesmas 7 features e a mesma divisão temporal;
//   - a mesma lista de algoritmos e a mesma validação de parâmetros;
//   - as mesmas métricas (ROC AUC, precisão média, F1...) e o mesmo baseline (frequência histórica da célula).
// A diferença: TODOS os algoritmos treinam uma regressão logística simples, escrita aqui em JavaScript.
// As métricas são reais desse modelo de demonstração, não do algoritmo escolhido.

import { ErroApi } from '../erro.js'
import { carregarTerremotos, esperar, importarDoUsgs } from './dados.js'

const DIAS_PERIODO = 30
const PERIODOS_MINIMOS_TREINO = 6
const REGIAO_CHILE = [-56, -17, -76, -66] // lat_min, lat_max, lon_min, lon_max
const ANOS_RETREINO = 6
const TAMANHOS_CELULA = ['0.5', '1.0', '2.0']
const DIA_MS = 86400000

const FEATURES = [
  'cel_lat', 'cel_lon', 'eventos_periodo_anterior', 'eventos_3_periodos',
  'eventos_12_periodos', 'taxa_historica', 'atividade_geral_3_periodos',
]

// ------------------------------------------------------------------ algoritmos (iguais aos do back)
const ALGORITMOS = {
  regressao_logistica: {
    nome: 'Regressão logística',
    descricao: 'Modelo linear e interpretável. Serve de referência simples.',
    importancia: 'coeficientes',
    parametros: {
      C: { tipo: 'float', padrao: 1.0, min: 0.001, max: 1000, descricao: 'Inverso da regularização: menor = modelo mais simples' },
    },
  },
  arvore_decisao: {
    nome: 'Árvore de decisão',
    descricao: "Aprende regras do tipo 'se... então'. Fácil de interpretar.",
    importancia: 'permutacao',
    parametros: {
      max_depth: { tipo: 'int', padrao: 5, min: 1, max: 30, descricao: 'Profundidade máxima da árvore' },
      min_samples_leaf: { tipo: 'int', padrao: 5, min: 1, max: 500, descricao: 'Mínimo de amostras em cada folha' },
    },
  },
  knn: {
    nome: 'K vizinhos mais próximos (KNN)',
    descricao: 'Classifica pela maioria dos casos mais parecidos.',
    importancia: null,
    parametros: {
      n_neighbors: { tipo: 'int', padrao: 15, min: 1, max: 200, descricao: 'Número de vizinhos considerados' },
      weights: { tipo: 'escolha', padrao: 'uniform', opcoes: ['uniform', 'distance'], descricao: 'uniform: votos iguais; distance: vizinhos próximos pesam mais' },
    },
  },
  random_forest: {
    nome: 'Random Forest',
    descricao: 'Conjunto de árvores (ensemble). Robusto e mostra a importância das features.',
    importancia: 'permutacao',
    parametros: {
      n_estimators: { tipo: 'int', padrao: 300, min: 10, max: 1000, descricao: 'Número de árvores' },
      max_depth: { tipo: 'int', padrao: null, min: 1, max: 50, nulo: true, descricao: 'Profundidade máxima (vazio = sem limite)' },
      min_samples_leaf: { tipo: 'int', padrao: 5, min: 1, max: 500, descricao: 'Mínimo de amostras em cada folha' },
    },
  },
  gradient_boosting: {
    nome: 'Gradient Boosting',
    descricao: 'Árvores treinadas em sequência, cada uma corrigindo a anterior.',
    importancia: 'permutacao',
    parametros: {
      n_estimators: { tipo: 'int', padrao: 100, min: 10, max: 1000, descricao: 'Número de etapas (árvores)' },
      learning_rate: { tipo: 'float', padrao: 0.1, min: 0.001, max: 1, descricao: 'Taxa de aprendizado: menor = passos mais cuidadosos' },
      max_depth: { tipo: 'int', padrao: 3, min: 1, max: 10, descricao: 'Profundidade de cada árvore' },
    },
  },
  rede_neural: {
    nome: 'Rede neural (MLP)',
    descricao: 'Perceptron multicamadas. Captura relações não lineares.',
    importancia: null,
    parametros: {
      camadas: { tipo: 'texto', padrao: '32,16', descricao: 'Neurônios por camada oculta, separados por vírgula' },
      alpha: { tipo: 'float', padrao: 0.0001, min: 0.000001, max: 1, descricao: 'Regularização L2' },
      max_iter: { tipo: 'int', padrao: 500, min: 50, max: 3000, descricao: 'Máximo de épocas de treino' },
    },
  },
}

// ------------------------------------------------------------------ estado (em memória)
let modelos = []
const pesos = new Map() // id do modelo → parâmetros do modelo de demonstração
let proximoId = 1

const erro = (mensagem, status = 400) => new ErroApi(mensagem, status)
const arredondar = (v, casas = 4) => (v == null ? null : Math.round(v * 10 ** casas) / 10 ** casas)

export async function listarAlgoritmos() {
  await esperar(100)
  return Object.entries(ALGORITMOS).map(([id, a]) => ({ id, nome: a.nome, descricao: a.descricao, parametros: a.parametros }))
}

export async function listarModelos() {
  await esperar(100)
  const results = [...modelos].sort((a, b) => (a.treinado_em < b.treinado_em ? 1 : -1))
  return { count: results.length, next: null, previous: null, results }
}

export async function ativarModelo(id) {
  await esperar(100)
  const modelo = modelos.find((m) => m.id === Number(id))
  if (!modelo) throw erro('Não encontrado.', 404)
  for (const m of modelos) m.ativo = m.id === modelo.id
  return modelo
}

export async function excluirModelo(id) {
  await esperar(100)
  if (!modelos.some((m) => m.id === Number(id))) throw erro('Não encontrado.', 404)
  modelos = modelos.filter((m) => m.id !== Number(id))
  pesos.delete(Number(id))
  return null
}

// ------------------------------------------------------------------ validação (igual a TreinoSerializer e validar_parametros)
function validarParametros(algoritmo, recebidos) {
  const especificacao = ALGORITMOS[algoritmo].parametros
  const parametros = recebidos ?? {}
  const desconhecidos = Object.keys(parametros).filter((k) => !(k in especificacao))
  if (desconhecidos.length) {
    throw erro(`parametros: Parâmetros desconhecidos para ${algoritmo}: ${desconhecidos.sort().join(', ')}. Aceitos: ${Object.keys(especificacao).join(', ')}.`)
  }
  const validados = {}
  for (const [nome, spec] of Object.entries(especificacao)) {
    let valor = nome in parametros ? parametros[nome] : spec.padrao
    if (valor == null || valor === '') {
      if (spec.nulo || spec.padrao == null) { validados[nome] = null; continue }
      valor = spec.padrao
    }
    if (spec.tipo === 'int') {
      if (!Number.isInteger(Number(valor))) throw erro(`parametros: '${nome}' deve ser do tipo int.`)
      valor = Number(valor)
    } else if (spec.tipo === 'float') {
      if (Number.isNaN(Number(valor))) throw erro(`parametros: '${nome}' deve ser do tipo float.`)
      valor = Number(valor)
    } else if (spec.tipo === 'texto') {
      valor = String(valor)
    }
    if ((spec.tipo === 'int' || spec.tipo === 'float') && !(spec.min <= valor && valor <= spec.max)) {
      throw erro(`parametros: '${nome}' deve estar entre ${spec.min} e ${spec.max}.`)
    }
    if (spec.tipo === 'escolha' && !spec.opcoes.includes(valor)) {
      throw erro(`parametros: '${nome}' deve ser uma destas opções: ${JSON.stringify(spec.opcoes)}.`)
    }
    validados[nome] = valor
  }
  if (algoritmo === 'rede_neural') {
    const camadas = validados.camadas.split(',').filter((n) => n.trim())
    if (camadas.some((n) => !Number.isInteger(Number(n)))) throw erro("parametros: 'camadas' deve ser uma lista de inteiros, ex.: 32,16")
    if (!camadas.length || camadas.length > 5 || camadas.some((n) => Number(n) < 1 || Number(n) > 512)) {
      throw erro("parametros: 'camadas' deve ter de 1 a 5 camadas, cada uma com 1 a 512 neurônios.")
    }
  }
  return validados
}

function validarEntrada(e) {
  if (e.algoritmo == null) throw erro('algoritmo: Este campo é obrigatório.')
  if (!(e.algoritmo in ALGORITMOS)) throw erro(`algoritmo: "${e.algoritmo}" não é uma escolha válida.`)

  const limites = (campo, valor, padrao, minimo, maximo, inteiro) => {
    if (valor == null) return padrao
    const n = Number(valor)
    if (Number.isNaN(n) || (inteiro && !Number.isInteger(n))) throw erro(`${campo}: ${inteiro ? 'Um número inteiro válido é necessário.' : 'Um número válido é necessário.'}`)
    if (n < minimo) throw erro(`${campo}: Certifique-se de que este valor seja maior ou igual a ${minimo}.`)
    if (n > maximo) throw erro(`${campo}: Certifique-se de que este valor seja menor ou igual a ${maximo}.`)
    return n
  }
  const magnitudeAlvo = limites('magnitude_alvo', e.magnitude_alvo, 4.5, 2.5, 8, false)
  const mesesTeste = limites('meses_teste', e.meses_teste, 6, 1, 24, true)
  // O back compara o texto: o número 1 vira "1" e não é uma das opções ("0.5", "1.0", "2.0")
  const celula = e.tamanho_celula == null ? '1.0' : String(e.tamanho_celula)
  if (!TAMANHOS_CELULA.includes(celula)) throw erro(`tamanho_celula: "${celula}" não é uma escolha válida.`)
  const atualizarDados = e.atualizar_dados === true
  let anos = e.anos == null ? undefined : limites('anos', e.anos, undefined, 1, 20, true)
  if (atualizarDados && anos == null) anos = ANOS_RETREINO

  return { algoritmo: e.algoritmo, parametros: validarParametros(e.algoritmo, e.parametros), magnitudeAlvo, mesesTeste, tamanhoCelula: Number(celula), anos, atualizarDados }
}

// ------------------------------------------------------------------ painel célula × período (igual a montar_painel)
function montarPainel(eventos, magnitudeAlvo, tamanho, incluirProximo = false) {
  const [latMin, latMax, lonMin, lonMax] = REGIAO_CHILE
  const duracao = DIAS_PERIODO * DIA_MS
  const tempos = eventos.map((e) => Date.parse(e.data_hora))
  const referencia = tempos.reduce((m, t) => Math.max(m, t), -Infinity)
  const mais_antigo = tempos.reduce((m, t) => Math.min(m, t), Infinity)
  const nPeriodos = Math.floor((referencia - mais_antigo) / duracao) // descarta o mais antigo, incompleto
  if (nPeriodos < PERIODOS_MINIMOS_TREINO) {
    throw erro(`São necessários ao menos ${PERIODOS_MINIMOS_TREINO} períodos de ${DIAS_PERIODO} dias; a base cobre ${nPeriodos}.`)
  }

  const nLat = Math.ceil((latMax - latMin) / tamanho - 1e-9)
  const nLon = Math.ceil((lonMax - lonMin) / tamanho - 1e-9)
  const nCelulas = nLat * nLon
  const total = new Int32Array(nCelulas * nPeriodos)
  const alvo = new Int32Array(nCelulas * nPeriodos)

  eventos.forEach((e, k) => {
    const periodo = nPeriodos - 1 - Math.floor((referencia - tempos[k]) / duracao)
    const i = Math.floor((e.latitude - latMin) / tamanho)
    const j = Math.floor((e.longitude - lonMin) / tamanho)
    if (periodo < 0 || i < 0 || i >= nLat || j < 0 || j >= nLon) return // fora do recorte do Chile
    const posicao = (i * nLon + j) * nPeriodos + periodo
    total[posicao]++
    if (e.magnitude >= magnitudeAlvo) alvo[posicao]++
  })

  // Features: só o passado. O período p enxerga até p-1 e nunca o próprio resultado.
  const ultimo = nPeriodos + (incluirProximo ? 1 : 0)
  const soma = (vetor, base, de, ate) => {
    let s = 0
    for (let q = Math.max(0, de); q <= ate; q++) s += vetor[base + q]
    return s
  }
  const linhas = []
  for (let i = 0; i < nLat; i++) {
    for (let j = 0; j < nLon; j++) {
      const base = (i * nLon + j) * nPeriodos
      const celLat = arredondar(latMin + i * tamanho)
      const celLon = arredondar(lonMin + j * tamanho)
      for (let p = 1; p < ultimo; p++) {
        let ocorreram = 0
        for (let q = 0; q < p; q++) if (alvo[base + q] > 0) ocorreram++
        const x = [
          celLat, celLon,
          alvo[base + p - 1],
          soma(alvo, base, p - 3, p - 1),
          soma(alvo, base, p - 12, p - 1),
          ocorreram / p,
          soma(total, base, p - 3, p - 1),
        ]
        linhas.push({ periodo: p, alvo: p < nPeriodos ? (alvo[base + p] > 0 ? 1 : 0) : null, x })
      }
    }
  }
  return { linhas, nPeriodos, referencia }
}

// ------------------------------------------------------------------ modelo de demonstração e métricas
const sigmoide = (z) => 1 / (1 + Math.exp(-z))

function padronizador(X) {
  const d = X[0].length
  const medias = Array(d).fill(0)
  for (const x of X) x.forEach((v, j) => { medias[j] += v / X.length })
  const desvios = Array(d).fill(0)
  for (const x of X) x.forEach((v, j) => { desvios[j] += (v - medias[j]) ** 2 / X.length })
  return { medias, desvios: desvios.map((v) => Math.sqrt(v) || 1) }
}

const padronizar = (x, { medias, desvios }) => x.map((v, j) => (v - medias[j]) / desvios[j])

function ajustar(X, y, C) {
  const escala = padronizador(X)
  const Z = X.map((x) => padronizar(x, escala))
  const n = Z.length
  const d = Z[0].length
  const positivos = y.reduce((s, v) => s + v, 0)
  const pesoClasse = [n / (2 * (n - positivos || 1)), n / (2 * (positivos || 1))] // class_weight="balanced"
  const lambda = 1 / (C * n)
  const w = Array(d).fill(0)
  let b = 0
  for (let it = 0; it < 400; it++) {
    const gw = Array(d).fill(0)
    let gb = 0
    for (let k = 0; k < n; k++) {
      let z = b
      for (let j = 0; j < d; j++) z += w[j] * Z[k][j]
      const erroK = (sigmoide(z) - y[k]) * pesoClasse[y[k]] / n
      for (let j = 0; j < d; j++) gw[j] += erroK * Z[k][j]
      gb += erroK
    }
    for (let j = 0; j < d; j++) w[j] -= 0.5 * (gw[j] + lambda * w[j])
    b -= 0.5 * gb
  }
  return { w, b, ...escala }
}

const probabilidade = (modelo, x) => {
  const z = padronizar(x, modelo)
  return sigmoide(z.reduce((s, v, j) => s + v * modelo.w[j], modelo.b))
}

function aucRoc(y, s) {
  const positivos = y.reduce((a, v) => a + v, 0)
  const negativos = y.length - positivos
  if (!positivos || !negativos) return null
  const ordem = s.map((_, i) => i).sort((a, b) => s[a] - s[b])
  let somaPostos = 0
  for (let i = 0; i < ordem.length;) {
    let j = i
    while (j < ordem.length && s[ordem[j]] === s[ordem[i]]) j++
    const postoMedio = (i + 1 + j) / 2 // empates dividem o posto
    for (let k = i; k < j; k++) if (y[ordem[k]] === 1) somaPostos += postoMedio
    i = j
  }
  return (somaPostos - (positivos * (positivos + 1)) / 2) / (positivos * negativos)
}

function precisaoMedia(y, s) {
  const positivos = y.reduce((a, v) => a + v, 0)
  if (!positivos || positivos === y.length) return null
  const ordem = s.map((_, i) => i).sort((a, b) => s[b] - s[a])
  let tp = 0
  let fp = 0
  let recallAnterior = 0
  let ap = 0
  for (let i = 0; i < ordem.length;) {
    let j = i
    while (j < ordem.length && s[ordem[j]] === s[ordem[i]]) j++
    for (let k = i; k < j; k++) { tp += y[ordem[k]]; fp += 1 - y[ordem[k]] }
    const recall = tp / positivos
    ap += (recall - recallAnterior) * (tp / (tp + fp))
    recallAnterior = recall
    i = j
  }
  return ap
}

function metricas(y, prob, baseline) {
  const previsto = prob.map((p) => (p >= 0.5 ? 1 : 0))
  const tp = previsto.reduce((s, p, i) => s + (p === 1 && y[i] === 1 ? 1 : 0), 0)
  const fp = previsto.reduce((s, p, i) => s + (p === 1 && y[i] === 0 ? 1 : 0), 0)
  const fn = previsto.reduce((s, p, i) => s + (p === 0 && y[i] === 1 ? 1 : 0), 0)
  const precisao = tp + fp ? tp / (tp + fp) : 0
  const recall = tp + fn ? tp / (tp + fn) : 0
  return {
    roc_auc: arredondar(aucRoc(y, prob)),
    precisao_media: arredondar(precisaoMedia(y, prob)),
    f1: arredondar(precisao + recall ? (2 * precisao * recall) / (precisao + recall) : 0),
    precisao: arredondar(precisao),
    recall: arredondar(recall),
    baseline_roc_auc: arredondar(aucRoc(y, baseline)),
    baseline_precisao_media: arredondar(precisaoMedia(y, baseline)),
  }
}

// Quanto o ROC AUC cai ao embaralhar cada feature (normalizado para somar 1), como as árvores do back
function importanciaPorPermutacao(modelo, X, y, base) {
  const queda = FEATURES.map((_, j) => {
    const embaralhado = X.map((x, i) => { const c = [...x]; c[j] = X[(i * 7 + 3) % X.length][j]; return c })
    const auc = aucRoc(y, embaralhado.map((x) => probabilidade(modelo, x)))
    return Math.max(0, (base ?? 0) - (auc ?? 0))
  })
  const soma = queda.reduce((s, v) => s + v, 0) || 1
  return queda.map((v) => v / soma)
}

function importancias(algoritmo, modelo, Xteste, yteste, aucTeste) {
  const tipo = ALGORITMOS[algoritmo].importancia
  if (!tipo) return null
  const valores = tipo === 'coeficientes' ? modelo.w.map(Math.abs) : importanciaPorPermutacao(modelo, Xteste, yteste, aucTeste)
  return Object.fromEntries(FEATURES.map((f, j) => [f, arredondar(valores[j])]).sort((a, b) => b[1] - a[1]))
}

// ------------------------------------------------------------------ treino (POST /api/modelos/)
export async function treinar(entrada) {
  const e = validarEntrada(entrada ?? {})
  // Com atualizar_dados, busca no USGS os últimos anos antes de treinar (re-treino com dados novos)
  if (e.atualizarDados) await importarDoUsgs(e.anos, null)
  else await esperar(300)
  const base = await carregarTerremotos()

  let eventos = base
  if (e.anos) {
    const maisRecente = Math.max(...base.map((t) => Date.parse(t.data_hora)))
    eventos = base.filter((t) => Date.parse(t.data_hora) >= maisRecente - e.anos * 365 * DIA_MS)
  }
  if (!eventos.length) throw erro('Não há terremotos no banco. Importe os dados primeiro.')

  const { linhas, nPeriodos } = montarPainel(eventos, e.magnitudeAlvo, e.tamanhoCelula)
  const corte = nPeriodos - 1 - e.mesesTeste // divisão temporal: os últimos meses são o teste
  const treino = linhas.filter((l) => l.periodo <= corte)
  const teste = linhas.filter((l) => l.periodo > corte)
  if (new Set(treino.map((l) => l.periodo)).size < PERIODOS_MINIMOS_TREINO) {
    throw erro('Poucos períodos para treino. Reduza meses_teste ou importe mais anos.')
  }
  if (new Set(treino.map((l) => l.alvo)).size < 2) {
    throw erro(`Nenhum terremoto de magnitude >= ${e.magnitudeAlvo} no período de treino. Reduza a magnitude-alvo ou importe mais anos.`)
  }

  const C = e.algoritmo === 'regressao_logistica' ? e.parametros.C : 1
  const avaliado = ajustar(treino.map((l) => l.x), treino.map((l) => l.alvo), C)
  const Xteste = teste.map((l) => l.x)
  const yteste = teste.map((l) => l.alvo)
  const probTeste = Xteste.map((x) => probabilidade(avaliado, x))
  const baseline = Xteste.map((x) => x[5]) // taxa_historica
  const resultado = metricas(yteste, probTeste, baseline)
  Object.assign(resultado, {
    supera_baseline: resultado.precisao_media != null && resultado.precisao_media > resultado.baseline_precisao_media,
    amostras_treino: treino.length,
    amostras_teste: teste.length,
    taxa_positivos_teste: arredondar(yteste.reduce((s, v) => s + v, 0) / yteste.length),
    importancia_features: importancias(e.algoritmo, avaliado, Xteste, yteste, aucRoc(yteste, probTeste)),
  })

  // Avaliado o modelo, ele é re-treinado com todos os períodos para prever o futuro
  const final = ajustar(linhas.map((l) => l.x), linhas.map((l) => l.alvo), C)
  const datas = eventos.map((t) => t.data_hora).sort()
  const modelo = {
    id: proximoId++,
    algoritmo: e.algoritmo,
    algoritmo_nome: ALGORITMOS[e.algoritmo].nome,
    parametros: e.parametros,
    magnitude_alvo: e.magnitudeAlvo,
    tamanho_celula: e.tamanhoCelula,
    meses_teste: e.mesesTeste,
    dados_inicio: datas[0],
    dados_fim: datas.at(-1),
    total_terremotos: eventos.length,
    metricas: resultado,
    ativo: true,
    treinado_em: new Date().toISOString(),
  }
  for (const m of modelos) m.ativo = false
  modelos.push(modelo)
  pesos.set(modelo.id, final)
  return modelo
}

// ------------------------------------------------------------------ previsões (GET /api/previsoes/)
export async function previsoes(parametros = {}) {
  const vazio = (v) => v === '' || v == null
  const lat = vazio(parametros.latitude) ? null : Number(parametros.latitude)
  const lon = vazio(parametros.longitude) ? null : Number(parametros.longitude)
  const limite = vazio(parametros.limite) ? null : Number(parametros.limite)
  if ((lat == null) !== (lon == null)) throw erro('Informe latitude e longitude juntas.')
  if (limite != null && !(Number.isInteger(limite) && limite >= 1 && limite <= 1000)) throw erro('limite: Informe um número inteiro entre 1 e 1000.')

  let modelo
  if (!vazio(parametros.modelo)) {
    modelo = modelos.find((m) => m.id === Number(parametros.modelo))
    if (!modelo) throw erro('Não encontrado.', 404)
  } else {
    modelo = modelos.find((m) => m.ativo)
    if (!modelo) throw erro('Nenhum modelo treinado. Use POST /api/modelos/.', 404)
  }
  await esperar(400)

  const [latMin, latMax, lonMin, lonMax] = REGIAO_CHILE
  if (lat != null && !(latMin <= lat && lat < latMax && lonMin <= lon && lon < lonMax)) {
    throw erro(`O ponto está fora da região analisada: latitude de ${latMin} a ${latMax}, longitude de ${lonMin} a ${lonMax}.`)
  }

  const base = await carregarTerremotos()
  const { linhas, nPeriodos, referencia } = montarPainel(base, modelo.magnitude_alvo, modelo.tamanho_celula, true)
  const tam = modelo.tamanho_celula
  const calculo = pesos.get(modelo.id)
  let celulas = linhas.filter((l) => l.periodo === nPeriodos)
  if (lat != null) {
    const celLat = arredondar(latMin + Math.floor((lat - latMin) / tam) * tam)
    const celLon = arredondar(lonMin + Math.floor((lon - lonMin) / tam) * tam)
    celulas = celulas.filter((l) => l.x[0] === celLat && l.x[1] === celLon)
  }
  celulas = celulas.map((l) => ({ l, p: probabilidade(calculo, l.x) })).sort((a, b) => b.p - a.p)
  if (limite) celulas = celulas.slice(0, limite)

  const lista = celulas.map(({ l, p }) => ({
    latitude_min: l.x[0],
    latitude_max: arredondar(l.x[0] + tam),
    longitude_min: l.x[1],
    longitude_max: arredondar(l.x[1] + tam),
    centro: { latitude: arredondar(l.x[0] + tam / 2), longitude: arredondar(l.x[1] + tam / 2) },
    probabilidade: arredondar(p),
    eventos_ultimos_12_periodos: l.x[4],
    taxa_historica: arredondar(l.x[5]),
  }))
  return {
    modelo: modelo.id,
    algoritmo: modelo.algoritmo,
    magnitude_alvo: modelo.magnitude_alvo,
    periodo_previsto: {
      inicio: new Date(referencia).toISOString(),
      fim: new Date(referencia + DIAS_PERIODO * DIA_MS).toISOString(),
    },
    total_celulas: lista.length,
    celulas: lista,
  }
}
