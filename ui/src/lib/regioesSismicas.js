// Agrupa os terremotos em regiões sísmicas, isto é, zonas onde duas placas tectônicas se encontram.
// A classificação é aproximada: usa caixas de latitude e longitude, testadas na ordem da lista, e a
// primeira que contém o ponto vence. O que não cai em nenhuma vira "Dorsais oceânicas e outras áreas".

export const OUTRAS_AREAS = 'Dorsais oceânicas e outras áreas'

const entre = (v, min, max) => v >= min && v <= max

// Cada região tem uma lista de caixas [latMin, latMax, lonMin, lonMax]
const REGIOES = [
  ['Alasca e Aleutas', [[50, 75, -180, -130], [50, 75, 170, 180]]],
  ['América Central, México e Caribe', [[5, 24, -120, -58], [14, 32, -118, -97]]],
  ['América do Norte', [[24, 75, -135, -50]]],
  ['Andes (América do Sul)', [[-60, 12, -82, -60]]],
  ['Japão, Kurilas e Kamchatka', [[24, 66, 122, 170]]],
  ['Sudeste Asiático e Pacífico Ocidental', [[-12, 26, 92, 141], [10, 24, 141, 150]]],
  ['Pacífico Sul e Oceania', [[-60, 10, 141, 180], [-60, 25, -180, -140], [-45, -10, 112, 141]]],
  ['Himalaia e Ásia Central', [[20, 56, 65, 122]]],
  ['Mediterrâneo e Oriente Médio', [[12, 50, -12, 65]]],
  ['África', [[-35, 12, -20, 55]]],
]

export const NOMES_REGIOES = [...REGIOES.map(([nome]) => nome), OUTRAS_AREAS]

export function regiaoSismica({ latitude, longitude }) {
  if (latitude == null || longitude == null) return OUTRAS_AREAS
  for (const [nome, caixas] of REGIOES) {
    if (caixas.some(([latMin, latMax, lonMin, lonMax]) => entre(latitude, latMin, latMax) && entre(longitude, lonMin, lonMax))) return nome
  }
  return OUTRAS_AREAS
}

// Uma linha por região, da mais para a menos ativa
export function estatisticasPorRegiao(terremotos) {
  const grupos = new Map()
  for (const t of terremotos) {
    const nome = regiaoSismica(t)
    let g = grupos.get(nome)
    if (!g) grupos.set(nome, (g = { nome, total: 0, somaMag: 0, maxMag: -Infinity }))
    g.total += 1
    g.somaMag += t.magnitude
    g.maxMag = Math.max(g.maxMag, t.magnitude)
  }
  return [...grupos.values()]
    .map((g) => ({ nome: g.nome, total: g.total, parcela: g.total / terremotos.length, magnitude_media: g.somaMag / g.total, magnitude_maxima: g.maxMag }))
    .sort((a, b) => b.total - a.total)
}
