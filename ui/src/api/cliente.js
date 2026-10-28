// Cliente da API REST do back-end (Django REST Framework, pasta backend/).
// Todas as telas buscam os dados por aqui; nenhuma lê arquivo ou banco direto.

const BASE_URL = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')

export class ErroApi extends Error {
  constructor(mensagem, status) {
    super(mensagem)
    this.status = status
  }
}

async function requisitar(caminho, opcoes = {}) {
  let resposta
  try {
    resposta = await fetch(BASE_URL + caminho, { ...opcoes, headers: { Accept: 'application/json', ...opcoes.headers } })
  } catch {
    throw new ErroApi('Não foi possível conectar à API. O back-end está rodando (python manage.py runserver)?', 0)
  }
  if (resposta.status === 204) return null
  const corpo = await resposta.json().catch(() => null)
  if (!resposta.ok) throw new ErroApi(mensagemDeErro(corpo, resposta.status), resposta.status)
  return corpo
}

// O DRF devolve {"detail": "..."} ou {"campo": ["erro", ...]}; vira um texto só
function mensagemDeErro(corpo, status) {
  if (status === 502 && corpo?.mensagem) return `O USGS não respondeu: ${corpo.mensagem}`
  if (!corpo) return status === 0 ? 'Sem resposta da API.' : `A API respondeu com erro ${status}.`
  if (typeof corpo.detail === 'string') return corpo.detail
  if (Array.isArray(corpo)) return corpo.join(' ')
  return Object.entries(corpo)
    .map(([campo, erros]) => {
      const texto = Array.isArray(erros) ? erros.join(' ') : typeof erros === 'object' ? JSON.stringify(erros) : erros
      return campo === 'non_field_errors' || campo === 'detail' ? texto : `${campo}: ${texto}`
    })
    .join(' · ')
}

const postJson = (corpo) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(corpo),
})

// Filtros da tela → query string do back (?magnitude_min=5&data_inicio=2025-01-01...)
export function consulta(filtros = {}, extras = {}) {
  const params = new URLSearchParams()
  for (const [chave, valor] of Object.entries({ ...filtros, ...extras })) {
    if (valor !== '' && valor != null) params.set(chave, valor)
  }
  const texto = params.toString()
  return texto ? `?${texto}` : ''
}

export const api = {
  // ---------------------------------------------------------------- terremotos
  listarTerremotos: (filtros, pagina = 1, ordenacao = '-data_hora') =>
    requisitar(`/terremotos/${consulta(filtros, { page: pagina, ordering: ordenacao })}`),

  // ---------------------------------------------------------------- estatísticas
  resumo: (filtros) => requisitar(`/estatisticas/${consulta(filtros)}`),
  porMes: (filtros) => requisitar(`/estatisticas/por-mes/${consulta(filtros)}`),
  porMagnitude: (filtros) => requisitar(`/estatisticas/por-magnitude/${consulta(filtros)}`),
  porProfundidade: (filtros) => requisitar(`/estatisticas/por-profundidade/${consulta(filtros)}`),

  // ---------------------------------------------------------------- coletas
  listarColetas: () => requisitar('/coletas/'),
  importarDoUsgs: (anos, magnitudeMinima) =>
    requisitar('/coletas/', postJson({ anos, magnitude_minima: magnitudeMinima })),

  // Rota ainda não existe no back (ver frontend/README.md)
  enviarArquivo(arquivo) {
    const formulario = new FormData()
    formulario.append('arquivo', arquivo)
    return requisitar('/coletas/arquivo/', { method: 'POST', body: formulario }).catch((erro) => {
      if (erro.status === 404 || erro.status === 405) {
        throw new ErroApi('O back-end ainda não tem a rota de envio de arquivo (POST /api/coletas/arquivo/).', erro.status)
      }
      throw erro
    })
  },

  // ---------------------------------------------------------------- modelos
  listarAlgoritmos: () => requisitar('/modelos/algoritmos/'),
  listarModelos: () => requisitar('/modelos/'),
  treinar: (pedido) => requisitar('/modelos/', postJson(pedido)),
  ativarModelo: (id) => requisitar(`/modelos/${id}/ativar/`, { method: 'POST' }),
  excluirModelo: (id) => requisitar(`/modelos/${id}/`, { method: 'DELETE' }),

  // ---------------------------------------------------------------- previsões
  previsoes: (parametros) => requisitar(`/previsoes/${consulta(parametros)}`),
}
