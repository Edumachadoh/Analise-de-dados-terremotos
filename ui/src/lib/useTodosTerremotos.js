import { useEffect, useState } from 'react'
import { api, consulta } from '../api/cliente.js'

// O back entrega 50 terremotos por página. Para o mapa e a dispersão é preciso juntar todas as
// páginas, o que leva alguns segundos. Por isso o resultado fica em memória (compartilhado entre
// as telas) e os pontos aparecem aos poucos, enquanto as páginas chegam.
const PAGINAS_EM_PARALELO = 6
const cache = new Map() // chave dos filtros → { itens, total, completo, erro, ouvintes }

export const esquecerTerremotos = () => cache.clear()

function iniciar(filtros) {
  const entrada = { itens: [], total: null, completo: false, erro: null, ouvintes: new Set() }
  const avisar = () => entrada.ouvintes.forEach((f) => f())

  ;(async () => {
    const primeira = await api.listarTerremotos(filtros, 1)
    entrada.itens = [...primeira.results]
    entrada.total = primeira.count
    avisar()
    const paginas = Math.ceil(primeira.count / (primeira.results.length || 1))
    for (let inicio = 2; inicio <= paginas; inicio += PAGINAS_EM_PARALELO) {
      const lote = []
      for (let p = inicio; p < inicio + PAGINAS_EM_PARALELO && p <= paginas; p++) lote.push(api.listarTerremotos(filtros, p))
      for (const pagina of await Promise.all(lote)) entrada.itens = entrada.itens.concat(pagina.results)
      avisar()
    }
    entrada.completo = true
    avisar()
  })().catch((erro) => {
    entrada.erro = erro.message
    cache.delete(consulta(filtros)) // uma nova tentativa busca de novo
    avisar()
  })
  return entrada
}

// Devolve { itens, total, completo, erro }; itens cresce até `completo` ficar verdadeiro
export function useTodosTerremotos(filtros, versaoBase) {
  const [, redesenhar] = useState(0)
  const chave = consulta(filtros)

  let entrada = cache.get(chave)
  if (!entrada) {
    entrada = iniciar(filtros)
    cache.set(chave, entrada)
  }

  useEffect(() => {
    const atual = cache.get(chave)
    if (!atual) return
    const ouvinte = () => redesenhar((n) => n + 1)
    atual.ouvintes.add(ouvinte)
    ouvinte() // se a busca terminou entre a renderização e o efeito
    return () => atual.ouvintes.delete(ouvinte)
  }, [chave, versaoBase])

  return { itens: entrada.itens, total: entrada.total, completo: entrada.completo, erro: entrada.erro }
}
