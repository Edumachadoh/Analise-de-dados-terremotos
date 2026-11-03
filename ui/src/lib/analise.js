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

// O primeiro e o último mês costumam estar só em parte na base (ela começa e termina no meio deles),
// e no gráfico por mês pareceriam uma queda de atividade. Ficam de fora os meses que não estão inteiros.
// inicio e fim: onde a base (ou o filtro de datas) começa e termina.
export function mesesCompletos(meses, inicio, fim) {
  if (!inicio || !fim) return meses
  const comeco = new Date(inicio)
  const final = new Date(fim)
  const chave = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const ultimoDia = new Date(Date.UTC(final.getUTCFullYear(), final.getUTCMonth() + 1, 0)).getUTCDate()
  return meses.filter((m) => !(m.mes === chave(comeco) && comeco.getUTCDate() > 1)
    && !(m.mes === chave(final) && final.getUTCDate() < ultimoDia))
}

// Uma região onde houve terremoto no mês anterior tem mais chance de ter um forte no mês seguinte?
// Juntar os casos de todos os quadrados engana: um quadrado ativo quase sempre é um lugar que treme
// sempre (Japão, Chile), e a "chance depois de um mês ativo" acaba medindo o lugar, não o mês anterior.
// Por isso cada quadrado é comparado com ele mesmo (a chance dele depois de um mês ativo e depois de um
// mês quieto), e o resultado é a média entre os quadrados que passaram pelas duas situações.
// A comparação ingênua, com todos os casos juntos, também é devolvida, para mostrar a diferença.
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
  // Como no ML, o período mais antigo, incompleto, fica de fora
  const periodos = Math.floor((fim - inicio) / (PERIODO_DIAS * DIA_MS))
  if (periodos < 2) return []

  // célula → período → maior magnitude registrada
  const celulas = new Map()
  for (const t of lista) {
    const p = Math.floor((fim - new Date(t.data_hora).getTime()) / (PERIODO_DIAS * DIA_MS))
    if (p >= periodos) continue
    const chave = celulaDe(t)
    if (!celulas.has(chave)) celulas.set(chave, new Map())
    const porPeriodo = celulas.get(chave)
    porPeriodo.set(p, Math.max(porPeriodo.get(p) ?? -Infinity, t.magnitude))
  }

  const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null)
  const razao = (a, b) => (a != null && b ? a / b : null)

  return limites.map((limite) => {
    const juntos = { ativa: { casos: 0, fortes: 0 }, quieta: { casos: 0, fortes: 0 } }
    const chances = { ativa: [], quieta: [] }
    for (const porPeriodo of celulas.values()) {
      const c = { ativa: { casos: 0, fortes: 0 }, quieta: { casos: 0, fortes: 0 } }
      // período p é o "mês seguinte"; p + 1 é o mês anterior (mais antigo)
      for (let p = 0; p < periodos - 1; p++) {
        const grupo = c[porPeriodo.has(p + 1) ? 'ativa' : 'quieta']
        grupo.casos++
        if ((porPeriodo.get(p) ?? 0) >= limite) grupo.fortes++
      }
      for (const k of ['ativa', 'quieta']) {
        juntos[k].casos += c[k].casos
        juntos[k].fortes += c[k].fortes
      }
      if (c.ativa.casos && c.quieta.casos) {
        chances.ativa.push(c.ativa.fortes / c.ativa.casos)
        chances.quieta.push(c.quieta.fortes / c.quieta.casos)
      }
    }
    const chance = (g) => (g.casos ? g.fortes / g.casos : null)
    const depoisDeAtiva = media(chances.ativa)
    const depoisDeInativa = media(chances.quieta)
    const ingenuaAtiva = chance(juntos.ativa)
    const ingenuaInativa = chance(juntos.quieta)
    return {
      limite,
      regioes: celulas.size,
      comparadas: chances.ativa.length, // quadrados com meses ativos e quietos
      periodos,
      // cada quadrado comparado com ele mesmo
      depoisDeAtiva,
      depoisDeInativa,
      vezes: razao(depoisDeAtiva, depoisDeInativa),
      // todos os casos juntos (comparação ingênua)
      ingenuaAtiva,
      ingenuaInativa,
      vezesIngenua: razao(ingenuaAtiva, ingenuaInativa),
      casosAtiva: juntos.ativa.casos,
      fortesAtiva: juntos.ativa.fortes,
      casosInativa: juntos.quieta.casos,
      fortesInativa: juntos.quieta.fortes,
    }
  })
}
