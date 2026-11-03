// Análises que preparam o terreno para o ML. Cada função responde a uma pergunta cuja resposta
// justifica uma escolha do modelo (backend/api/services/ml.py): células de 1° × 1°, períodos de
// 30 dias contados para trás a partir do último terremoto e alvo "houve terremoto forte na região".

const DIA_MS = 24 * 60 * 60 * 1000
const PERIODO_DIAS = 30

const celulaDe = (t) => `${Math.floor(t.latitude)},${Math.floor(t.longitude)}`
const comPosicao = (terremotos) => terremotos.filter((t) => t.magnitude != null && t.latitude != null && t.longitude != null)

// Lei de Gutenberg-Richter: quantos terremotos têm magnitude maior ou igual a cada valor
export function raridadePorMagnitude(terremotos) {
  const magnitudes = terremotos.map((t) => t.magnitude).filter((m) => m != null)
  if (!magnitudes.length) return []
  const minima = Math.floor(magnitudes.reduce((a, m) => Math.min(a, m), Infinity) * 2) / 2
  const limites = []
  for (let m = minima; m <= 8; m += 0.5) {
    const total = magnitudes.reduce((n, v) => n + (v >= m ? 1 : 0), 0)
    if (total > 0) limites.push({ limite: m, total })
  }
  return limites
}

// Uma região onde houve terremoto no mês anterior tem mais chance de ter um forte no mês seguinte?
// Para cada limite de magnitude, compara a chance (a) depois de um mês ativo e (b) depois de um mês sem nada.
export function persistenciaMensal(terremotos, limites = [4.5, 5, 6]) {
  const lista = comPosicao(terremotos)
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

  const regioes = celulas.size
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
      regioes,
      periodos,
      depoisDeAtiva,
      depoisDeInativa,
      vezes: depoisDeAtiva != null && depoisDeInativa ? depoisDeAtiva / depoisDeInativa : null,
      casosAtiva: ativa.casos,
      fortesAtiva: ativa.fortes,
      casosInativa: inativa.casos,
      fortesInativa: inativa.fortes,
    }
  })
}
