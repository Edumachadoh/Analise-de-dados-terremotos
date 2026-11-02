// Correlação de Pearson entre colunas numéricas dos terremotos.
// Cada par usa só os terremotos que têm as duas colunas preenchidas (o USGS nem sempre informa tudo).

function pearson(itens, a, b) {
  let n = 0, somaA = 0, somaB = 0, somaAA = 0, somaBB = 0, somaAB = 0
  for (const t of itens) {
    const x = t[a], y = t[b]
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) continue
    n++
    somaA += x; somaB += y
    somaAA += x * x; somaBB += y * y; somaAB += x * y
  }
  if (n < 3) return null
  const covariancia = somaAB - (somaA * somaB) / n
  const varA = somaAA - (somaA * somaA) / n
  const varB = somaBB - (somaB * somaB) / n
  if (varA <= 0 || varB <= 0) return null // coluna constante: não há o que correlacionar
  return covariancia / Math.sqrt(varA * varB)
}

// Matriz n×n na ordem de `campos`
export function matrizCorrelacao(itens, campos) {
  return campos.map((a) => campos.map((b) => (a === b ? 1 : pearson(itens, a, b))))
}
