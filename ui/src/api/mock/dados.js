// Parte "dados" da API simulada: terremotos, estatísticas e importações.
// Reproduz o que o back Django devolve (backend/api/views.py, filters.py, services/estatisticas.py),
// com os mesmos nomes de campo e a mesma paginação de 50 em 50.

import Papa from 'papaparse'
import { ErroApi } from '../erro.js'

export const TAMANHO_PAGINA = 50
const LIMITE_RASO = 70
const LIMITE_INTERMEDIARIO = 300
const ALERTAS = ['green', 'yellow', 'orange', 'red']
const COLUNAS_OBRIGATORIAS = ['id', 'mag', 'time', 'latitude', 'longitude', 'depth']

const FAIXAS_MAGNITUDE = [
  ['menor que 3', (m) => m < 3],
  ['3 a 3,9', (m) => m >= 3 && m < 4],
  ['4 a 4,9', (m) => m >= 4 && m < 5],
  ['5 a 5,9', (m) => m >= 5 && m < 6],
  ['6 ou mais', (m) => m >= 6],
]

// ------------------------------------------------------------------ estado (em memória)
let terremotos = null // lista completa, na ordem de importação
let coletas = []
let proximoId = 1

export const esperar = (ms = 200) => new Promise((r) => setTimeout(r, ms))
const agora = () => new Date().toISOString()
const arredondar = (v, casas = 2) => (v == null ? null : Math.round(v * 10 ** casas) / 10 ** casas)

// ------------------------------------------------------------------ conversão (igual a importacao.py)
const numero = (v, inteiro = false) => {
  if (v == null || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return inteiro ? Math.trunc(n) : n
}

function dataIso(v) {
  if (v == null || v === '') return null
  const d = new Date(typeof v === 'number' || /^\d+$/.test(String(v)) ? Number(v) : v) // o USGS manda milissegundos
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export const faixaDeProfundidade = (km) => (km < LIMITE_RASO ? 'raso' : km <= LIMITE_INTERMEDIARIO ? 'intermediario' : 'profundo')

// Registro com os nomes do USGS (id, mag, time, place, depth...) → terremoto da API
function terremotoDeRegistro(r) {
  const profundidade = Number(r.depth)
  const alerta = r.alert ? String(r.alert) : null
  return {
    id: 0,
    faixa_profundidade: faixaDeProfundidade(profundidade),
    usgs_id: String(r.id),
    local: r.place ? String(r.place).slice(0, 255) : '',
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    profundidade_km: profundidade,
    magnitude: Number(r.mag),
    tipo_magnitude: r.magType ? String(r.magType) : '',
    data_hora: dataIso(r.time),
    atualizado_em: dataIso(r.updated),
    tsunami: Boolean(numero(r.tsunami, true)),
    alerta: ALERTAS.includes(alerta) ? alerta : null,
    significancia: numero(r.sig, true),
    relatos: numero(r.felt, true),
    intensidade_relatada: numero(r.cdi),
    intensidade_estimada: numero(r.mmi),
    estacoes: numero(r.nst, true),
    lacuna_azimutal: numero(r.gap),
    distancia_estacao: numero(r.dmin),
    rms: numero(r.rms),
    status: r.status ? String(r.status) : '',
    rede: r.net ? String(r.net) : '',
  }
}

// ------------------------------------------------------------------ carga inicial
export async function carregarTerremotos() {
  if (terremotos) return terremotos
  const resposta = await fetch(`${import.meta.env.BASE_URL}mock/terremotos.csv`)
  const { data } = Papa.parse(await resposta.text(), { header: true, dynamicTyping: true, skipEmptyLines: true })
  terremotos = data.map(terremotoDeRegistro).map((t) => ({ ...t, id: proximoId++ }))
  if (!coletas.length) {
    const inicio = agora()
    coletas.push({
      id: 1, iniciada_em: inicio, finalizada_em: inicio, anos: 3, magnitude_minima: null,
      origem: 'terremotos.csv', status: 'concluida', recebidos: terremotos.length,
      novos: terremotos.length, atualizados: 0, mensagem: 'Dados de demonstração carregados do CSV do projeto.',
    })
  }
  return terremotos
}

// ------------------------------------------------------------------ filtros (iguais a filters.py)
const vazio = (v) => v === '' || v == null

function num(filtros, campo) {
  if (vazio(filtros[campo])) return null
  const n = Number(filtros[campo])
  if (Number.isNaN(n)) throw new ErroApi(`${campo}: Informe um número.`, 400)
  return n
}

function dia(filtros, campo) {
  if (vazio(filtros[campo])) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(filtros[campo])) throw new ErroApi(`${campo}: Formato de data inválido. Use AAAA-MM-DD.`, 400)
  return filtros[campo]
}

export function filtrar(lista, filtros = {}) {
  const f = {
    magMin: num(filtros, 'magnitude_min'), magMax: num(filtros, 'magnitude_max'),
    profMin: num(filtros, 'profundidade_min'), profMax: num(filtros, 'profundidade_max'),
    latMin: num(filtros, 'latitude_min'), latMax: num(filtros, 'latitude_max'),
    lonMin: num(filtros, 'longitude_min'), lonMax: num(filtros, 'longitude_max'),
    inicio: dia(filtros, 'data_inicio'), fim: dia(filtros, 'data_fim'),
  }
  const local = vazio(filtros.local) ? null : String(filtros.local).toLowerCase()
  const faixa = vazio(filtros.faixa_profundidade) ? null : filtros.faixa_profundidade
  const tsunami = vazio(filtros.tsunami) ? null : ['true', '1'].includes(String(filtros.tsunami).toLowerCase())
  const alerta = vazio(filtros.alerta) ? null : filtros.alerta
  const escala = vazio(filtros.tipo_magnitude) ? null : filtros.tipo_magnitude

  return lista.filter((t) => {
    if (f.magMin != null && t.magnitude < f.magMin) return false
    if (f.magMax != null && t.magnitude > f.magMax) return false
    if (f.profMin != null && t.profundidade_km < f.profMin) return false
    if (f.profMax != null && t.profundidade_km > f.profMax) return false
    if (f.latMin != null && t.latitude < f.latMin) return false
    if (f.latMax != null && t.latitude > f.latMax) return false
    if (f.lonMin != null && t.longitude < f.lonMin) return false
    if (f.lonMax != null && t.longitude > f.lonMax) return false
    if (f.inicio && t.data_hora.slice(0, 10) < f.inicio) return false
    if (f.fim && t.data_hora.slice(0, 10) > f.fim) return false
    if (local && !t.local.toLowerCase().includes(local)) return false
    if (faixa && t.faixa_profundidade !== faixa) return false
    if (tsunami != null && t.tsunami !== tsunami) return false
    if (alerta && t.alerta !== alerta) return false
    if (escala && t.tipo_magnitude !== escala) return false
    return true
  })
}

// Os mesmos campos de ordenação do back; qualquer outro valor cai na ordem padrão
function ordenar(lista, ordenacao = '-data_hora') {
  const campo = String(ordenacao).replace(/^-/, '')
  const valido = ['data_hora', 'magnitude', 'profundidade_km'].includes(campo)
  const chave = valido ? campo : 'data_hora'
  const sentido = valido ? (String(ordenacao).startsWith('-') ? -1 : 1) : -1
  return [...lista].sort((a, b) => (a[chave] < b[chave] ? -sentido : a[chave] > b[chave] ? sentido : 0))
}

// ------------------------------------------------------------------ rotas de terremotos
export async function listarTerremotos(filtros, pagina = 1, ordenacao) {
  await esperar(120)
  const base = filtrar(await carregarTerremotos(), filtros)
  const ordenada = ordenar(base, ordenacao)
  const paginas = Math.max(1, Math.ceil(ordenada.length / TAMANHO_PAGINA))
  const n = Number(pagina)
  if (!Number.isInteger(n) || n < 1 || n > paginas) throw new ErroApi('Página inválida.', 404)
  const url = (p) => `/api/terremotos/?page=${p}`
  return {
    count: ordenada.length,
    next: n < paginas ? url(n + 1) : null,
    previous: n > 1 ? url(n - 1) : null,
    results: ordenada.slice((n - 1) * TAMANHO_PAGINA, n * TAMANHO_PAGINA),
  }
}

// ------------------------------------------------------------------ estatísticas (iguais a estatisticas.py)
async function selecionados(filtros) {
  await esperar(150)
  return filtrar(await carregarTerremotos(), filtros)
}

const media = (valores) => (valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null)

export async function resumo(filtros) {
  const lista = await selecionados(filtros)
  const maisForte = lista.reduce((m, t) => (m == null || t.magnitude > m.magnitude ? t : m), null)
  const datas = lista.map((t) => t.data_hora).sort()
  return {
    total: lista.length,
    magnitude_media: arredondar(media(lista.map((t) => t.magnitude))),
    magnitude_maxima: maisForte ? maisForte.magnitude : null,
    profundidade_media_km: arredondar(media(lista.map((t) => t.profundidade_km)), 1),
    periodo: { inicio: datas[0] ?? null, fim: datas.at(-1) ?? null },
    com_alerta_tsunami: lista.filter((t) => t.tsunami).length,
    mais_forte: maisForte && { id: maisForte.id, magnitude: maisForte.magnitude, local: maisForte.local, data_hora: maisForte.data_hora },
  }
}

export async function porMes(filtros) {
  const grupos = new Map()
  for (const t of await selecionados(filtros)) {
    const mes = t.data_hora.slice(0, 7)
    if (!grupos.has(mes)) grupos.set(mes, [])
    grupos.get(mes).push(t.magnitude)
  }
  return [...grupos.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([mes, mags]) => ({
    mes, total: mags.length, magnitude_media: arredondar(media(mags)), magnitude_maxima: Math.max(...mags),
  }))
}

export async function porMagnitude(filtros) {
  const lista = await selecionados(filtros)
  return FAIXAS_MAGNITUDE.map(([faixa, dentro]) => ({ faixa, total: lista.filter((t) => dentro(t.magnitude)).length }))
}

export async function porProfundidade(filtros) {
  const lista = await selecionados(filtros)
  return ['raso', 'intermediario', 'profundo'].map((faixa) => {
    const mags = lista.filter((t) => t.faixa_profundidade === faixa).map((t) => t.magnitude)
    return { faixa, total: mags.length, magnitude_media: arredondar(media(mags)) }
  })
}

// ------------------------------------------------------------------ importações
function coletaNova(dados) {
  const inicio = agora()
  const coleta = {
    id: coletas.length + 1, iniciada_em: inicio, finalizada_em: agora(), anos: 1, magnitude_minima: null,
    origem: 'usgs', status: 'concluida', recebidos: 0, novos: 0, atualizados: 0, mensagem: '', ...dados,
  }
  coletas.push(coleta)
  return coleta
}

export async function listarColetas() {
  await esperar(100)
  await carregarTerremotos()
  const results = [...coletas].sort((a, b) => (a.iniciada_em < b.iniciada_em ? 1 : -1))
  return { count: results.length, next: null, previous: null, results }
}

// Não há rede aqui: a "busca no USGS" só confere os parâmetros e conta o que já está na amostra
export async function importarDoUsgs(anos, magnitudeMinima) {
  const base = await carregarTerremotos()
  if (!Number.isInteger(anos) || anos < 1 || anos > 20) throw new ErroApi('anos: Informe um número inteiro entre 1 e 20.', 400)
  if (magnitudeMinima != null && !(magnitudeMinima >= -2 && magnitudeMinima <= 10)) {
    throw new ErroApi('magnitude_minima: Deve estar entre -2 e 10.', 400)
  }
  await esperar(1500)
  const maisRecente = Math.max(...base.map((t) => Date.parse(t.data_hora)))
  const recebidos = base.filter((t) => Date.parse(t.data_hora) >= maisRecente - anos * 365 * 86400000
    && (magnitudeMinima == null || t.magnitude >= magnitudeMinima)).length
  return coletaNova({
    anos, magnitude_minima: magnitudeMinima, recebidos, atualizados: recebidos,
    mensagem: 'Simulação: nada foi baixado do USGS. Os dados são os da amostra do projeto.',
  })
}

// ------------------------------------------------------------------ envio de arquivo
// A rota POST /api/coletas/arquivo/ ainda não existe no back; este é o contrato proposto (veja ui/README.md).
function registrosDoArquivo(nome, texto) {
  const extensao = nome.split('.').pop().toLowerCase()
  try {
    if (extensao === 'csv') return Papa.parse(texto, { header: true, dynamicTyping: true, skipEmptyLines: true }).data
    if (extensao === 'json') return registrosDeJson(JSON.parse(texto))
    if (extensao === 'xml') return registrosDeXml(texto)
  } catch (erro) {
    if (erro instanceof ErroApi) throw erro
    throw new ErroApi(`Não foi possível ler ${nome}: ${erro.message}`, 400)
  }
  throw new ErroApi(`Formato .${extensao} não suportado. Use CSV, XML ou JSON.`, 400)
}

function registrosDeJson(dados) {
  if (dados && !Array.isArray(dados) && Array.isArray(dados.features)) { // GeoJSON do USGS
    return dados.features.map((f) => {
      const [longitude, latitude, depth] = f.geometry?.coordinates ?? []
      return { id: f.id, ...f.properties, longitude, latitude, depth }
    })
  }
  if (Array.isArray(dados)) return dados
  const lista = Object.values(dados ?? {}).find(Array.isArray)
  if (!lista) throw new ErroApi('O JSON não contém uma lista de registros.', 400)
  return lista
}

function registrosDeXml(texto) {
  const doc = new DOMParser().parseFromString(texto, 'application/xml')
  if (doc.querySelector('parsererror')) throw new ErroApi('XML mal formado.', 400)
  return [...doc.documentElement.children].map((el) => {
    const r = {}
    for (const filho of el.children) r[filho.tagName] = filho.textContent === '' ? null : (Number.isNaN(Number(filho.textContent)) ? filho.textContent : Number(filho.textContent))
    for (const a of el.attributes) r[a.name] = a.value
    return r
  })
}

export async function enviarArquivo(arquivo) {
  const base = await carregarTerremotos()
  const registros = registrosDoArquivo(arquivo.name, await arquivo.text())
  if (!registros.length) throw new ErroApi('O arquivo não tem nenhuma linha de dados.', 400)
  const colunas = new Set(registros.flatMap((r) => Object.keys(r)))
  const faltando = COLUNAS_OBRIGATORIAS.filter((c) => !colunas.has(c))
  if (faltando.length) throw new ErroApi(`Colunas ausentes no arquivo: ${faltando.join(', ')}.`, 400)
  await esperar(500)

  const existentes = new Map(base.map((t, i) => [t.usgs_id, i]))
  let novos = 0
  let atualizados = 0
  for (const r of registros) {
    const t = terremotoDeRegistro(r)
    if (!t.data_hora || [t.latitude, t.longitude, t.profundidade_km, t.magnitude].some(Number.isNaN)) {
      throw new ErroApi(`O evento ${t.usgs_id} tem valores inválidos (data, coordenadas, profundidade ou magnitude).`, 400)
    }
    if (existentes.has(t.usgs_id)) {
      const i = existentes.get(t.usgs_id)
      base[i] = { ...t, id: base[i].id }
      atualizados++
    } else {
      base.push({ ...t, id: proximoId++ })
      existentes.set(t.usgs_id, base.length - 1)
      novos++
    }
  }
  return coletaNova({ origem: arquivo.name.slice(0, 20), recebidos: registros.length, novos, atualizados })
}
