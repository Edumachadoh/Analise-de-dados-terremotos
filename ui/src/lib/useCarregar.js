import { useCallback, useEffect, useState } from 'react'

// Chama a API quando as dependências mudam e guarda dados, erro e estado de carregamento.
// Respostas que chegam fora de ordem (filtro trocado no meio da requisição) são descartadas.
export function useCarregar(buscar, dependencias) {
  const [estado, setEstado] = useState({ dados: null, erro: null, carregando: true })
  const [versao, setVersao] = useState(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const buscarMemo = useCallback(buscar, dependencias)

  useEffect(() => {
    let atual = true
    setEstado((e) => ({ ...e, carregando: true, erro: null }))
    buscarMemo()
      .then((dados) => atual && setEstado({ dados, erro: null, carregando: false }))
      .catch((erro) => atual && setEstado({ dados: null, erro: erro.message, carregando: false }))
    return () => {
      atual = false
    }
  }, [buscarMemo, versao])

  return { ...estado, recarregar: () => setVersao((v) => v + 1) }
}
