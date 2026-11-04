// Análises do Painel calculadas no navegador, a partir dos terremotos filtrados

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

