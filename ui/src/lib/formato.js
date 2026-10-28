// Formatação de números e datas no padrão brasileiro

export const ehNumero = (v) => typeof v === 'number' && Number.isFinite(v)

export function formatarNumero(v, casas = 2) {
  if (v == null) return '—'
  if (!ehNumero(v)) return String(v)
  const abs = Math.abs(v)
  const digitos = Number.isInteger(v) ? 0 : abs >= 100 ? 0 : abs >= 10 ? 1 : casas
  return v.toLocaleString('pt-BR', { maximumFractionDigits: digitos })
}

export const formatarInteiro = (v) => (v == null ? '—' : v.toLocaleString('pt-BR'))

export const formatarPorcentagem = (v, casas = 1) =>
  v == null ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: casas })}%`

export function formatarData(iso, comHora = false) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return comHora ? d.toLocaleString('pt-BR') : d.toLocaleDateString('pt-BR')
}

// "2024-07" → "jul/2024"
export function formatarMes(texto) {
  const [ano, mes] = texto.split('-').map(Number)
  return new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace(' de ', '/').replace('.', '')
}

// Amostra determinística: a mesma lista sempre gera os mesmos pontos
export function amostrar(lista, n) {
  if (lista.length <= n) return lista
  const passo = lista.length / n
  return Array.from({ length: n }, (_, i) => lista[Math.floor(i * passo)])
}
