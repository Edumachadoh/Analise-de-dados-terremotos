// Agrupamento dos terremotos por país, para os gráficos de comparação entre regiões.
// O USGS não traz o país em um campo próprio: ele vem no fim do texto do local
// ("74 km W of Ollagüe, Chile"). Nos EUA vem o estado ("10 km N of Ridgecrest, CA"),
// que juntamos em "United States". Locais sem vírgula ("Mid-Atlantic Ridge") são oceânicos.

const ESTADOS_EUA = new Set([
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
  'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky',
  'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi',
  'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico',
  'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania',
  'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
  'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming', 'Puerto Rico',
])

export const SEM_PAIS = 'Oceano / sem país'

export function paisDe(local) {
  if (!local || !local.includes(',')) return SEM_PAIS
  const fim = local.slice(local.lastIndexOf(',') + 1).trim()
  if (/^[A-Z]{2}$/.test(fim) || ESTADOS_EUA.has(fim)) return 'United States'
  return fim
}

// Uma linha por país: total, magnitude média e máxima, profundidade média e eventos com tsunami.
// Países com menos de `minimo` eventos ficam de fora (uma média de 2 eventos não diz nada).
export function estatisticasPorPais(terremotos, minimo = 5) {
  const grupos = new Map()
  for (const t of terremotos) {
    const pais = paisDe(t.local)
    let g = grupos.get(pais)
    if (!g) grupos.set(pais, (g = { pais, total: 0, somaMag: 0, maxMag: -Infinity, somaProf: 0, tsunami: 0 }))
    g.total += 1
    g.somaMag += t.magnitude
    g.maxMag = Math.max(g.maxMag, t.magnitude)
    g.somaProf += t.profundidade_km
    if (t.tsunami) g.tsunami += 1
  }
  return [...grupos.values()]
    .filter((g) => g.total >= minimo)
    .map((g) => ({
      pais: g.pais,
      total: g.total,
      magnitude_media: g.somaMag / g.total,
      magnitude_maxima: g.maxMag,
      profundidade_media: g.somaProf / g.total,
      tsunami: g.tsunami,
    }))
}

// Faixas de magnitude para cruzar com o alerta de tsunami
const FAIXAS = [[-Infinity, 4, 'menor que 4'], [4, 5, '4–4,9'], [5, 6, '5–5,9'], [6, 7, '6–6,9'], [7, Infinity, '7+']]

export function tsunamiPorMagnitude(terremotos) {
  return FAIXAS.map(([min, max, nome]) => {
    const faixa = terremotos.filter((t) => t.magnitude >= min && t.magnitude < max)
    const comAlerta = faixa.filter((t) => t.tsunami).length
    return { nome, total: faixa.length, comAlerta, valor: faixa.length ? comAlerta / faixa.length : 0 }
  }).filter((f) => f.total > 0)
}
