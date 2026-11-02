// Análises que preparam o terreno para o ML. Cada função responde a uma pergunta cuja resposta
// justifica uma escolha do modelo (backend/api/services/ml.py): células de 1° × 1°, períodos de
// 30 dias contados para trás a partir do último terremoto e alvo "houve terremoto forte na região".

// Abaixo desta magnitude o catálogo do USGS só é completo em alguns países, então as contagens
// comparam apenas terremotos de 4,5 ou mais.
export const MAG_COMPLETA = 4.5

const DIA_MS = 24 * 60 * 60 * 1000
const PERIODO_DIAS = 30

const celulaDe = (t) => `${Math.floor(t.latitude)},${Math.floor(t.longitude)}`

export function soCompletos(terremotos) {
  return terremotos.filter((t) => t.magnitude != null && t.magnitude >= MAG_COMPLETA && t.latitude != null && t.longitude != null)
}

// Lei de Gutenberg-Richter: quantos terremotos têm magnitude maior ou igual a cada valor
export function raridadePorMagnitude(terremotos) {
  const lista = soCompletos(terremotos)
  const limites = []
  for (let m = MAG_COMPLETA; m <= 8; m += 0.5) {
    const total = lista.filter((t) => t.magnitude >= m).length
    if (total > 0) limites.push({ limite: m, total })
  }
  return limites
}

// Quanto dos terremotos cabe nas regiões (células) mais ativas
export function concentracaoPorRegiao(terremotos, fracoes = [0.01, 0.05, 0.1, 0.25, 0.5]) {
  const lista = soCompletos(terremotos)
  const porCelula = new Map()
  for (const t of lista) porCelula.set(celulaDe(t), (porCelula.get(celulaDe(t)) ?? 0) + 1)
  const contagens = [...porCelula.values()].sort((a, b) => b - a)
  const regioes = contagens.length
  if (!regioes) return { regioes: 0, total: 0, pontos: [] }

  const pontos = fracoes.map((f) => {
    const n = Math.max(1, Math.round(regioes * f))
    const eventos = contagens.slice(0, n).reduce((s, v) => s + v, 0)
    return { fracao: f, regioes: n, parcela: eventos / lista.length }
  })
  return { regioes, total: lista.length, pontos }
}

// Uma região onde houve terremoto no mês anterior tem mais chance de ter um forte no mês seguinte?
// Para cada limite de magnitude, compara a chance (a) depois de um mês ativo e (b) depois de um mês sem nada.
export function persistenciaMensal(terremotos, limites = [4.5, 5, 6]) {
  const lista = soCompletos(terremotos)
  if (!lista.length) return []

  let fim = -Infinity
  let inicio = Infinity
  for (const t of lista) {
    const ms = new Date(t.data_hora).getTime()
    if (ms > fim) fim = ms
    if (ms < inicio) inicio = ms
  }
  const periodos = Math.floor((fim - inicio) / (PERIODO_DIAS * DIA_MS)) + 1
  if (periodos < 2) return []

  // célula → período → maior magnitude registrada
  const celulas = new Map()
  for (const t of lista) {
    const p = Math.floor((fim - new Date(t.data_hora).getTime()) / (PERIODO_DIAS * DIA_MS))
    const chave = celulaDe(t)
    if (!celulas.has(chave)) celulas.set(chave, new Map())
    const porPeriodo = celulas.get(chave)
    porPeriodo.set(p, Math.max(porPeriodo.get(p) ?? -Infinity, t.magnitude))
  }

  return limites.map((limite) => {
    const ativa = { casos: 0, fortes: 0 }
    const inativa = { casos: 0, fortes: 0 }
    for (const porPeriodo of celulas.values()) {
      // período p é o "mês seguinte"; p + 1 é o mês anterior (mais antigo)
      for (let p = 0; p < periodos - 1; p++) {
        const grupo = porPeriodo.has(p + 1) ? ativa : inativa
        grupo.casos++
        if ((porPeriodo.get(p) ?? 0) >= limite) grupo.fortes++
      }
    }
    const chance = (g) => (g.casos ? g.fortes / g.casos : null)
    const depoisDeAtiva = chance(ativa)
    const depoisDeInativa = chance(inativa)
    return {
      limite,
      depoisDeAtiva,
      depoisDeInativa,
      vezes: depoisDeAtiva != null && depoisDeInativa ? depoisDeAtiva / depoisDeInativa : null,
      casosAtiva: ativa.casos,
      casosInativa: inativa.casos,
    }
  })
}

// Sobre a série mensal: média, mês mais ativo e quantas vezes ele supera a média
export function resumoMensal(meses) {
  if (!meses?.length) return null
  const total = meses.reduce((s, m) => s + m.total, 0)
  const media = total / meses.length
  const pico = meses.reduce((a, m) => (m.total > a.total ? m : a), meses[0])
  return { media, pico, vezes: media ? pico.total / media : null, meses: meses.length }
}
