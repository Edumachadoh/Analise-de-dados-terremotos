// Tela 3: tabela paginada de terremotos (GET /api/terremotos/), histórico de coletas
// e importação de dados novos (POST /api/coletas/ busca no USGS; envio de arquivo aguarda o back)

import { useRef, useState } from 'react'
import { api } from '../api/index.js'
import { Aviso, Cabecalho, Carregando, Cartao, Icone } from '../componentes/comuns.jsx'
import { formatarData, formatarInteiro, formatarNumero } from '../lib/formato.js'
import { rotulo } from '../lib/rotulos.js'
import { useCarregar } from '../lib/useCarregar.js'

const TAMANHO_PAGINA = 50 // o mesmo PAGE_SIZE do back

// Colunas da tabela. `ordena` é o campo aceito em ?ordering= (o back só ordena por estes três).
const COLUNAS = [
  { campo: 'data_hora', ordena: 'data_hora', formato: (v) => formatarData(v, true) },
  { campo: 'local' },
  { campo: 'magnitude', ordena: 'magnitude', numerico: true, formato: (v) => formatarNumero(v) },
  { campo: 'tipo_magnitude' },
  { campo: 'profundidade_km', ordena: 'profundidade_km', numerico: true, formato: (v) => formatarNumero(v) },
  { campo: 'faixa_profundidade' },
  { campo: 'latitude', numerico: true, formato: (v) => formatarNumero(v, 3) },
  { campo: 'longitude', numerico: true, formato: (v) => formatarNumero(v, 3) },
  { campo: 'tsunami', formato: (v) => String(v) },
  { campo: 'alerta' },
  { campo: 'significancia', numerico: true, formato: (v) => formatarInteiro(v) },
  { campo: 'relatos', numerico: true, formato: (v) => formatarInteiro(v) },
  { campo: 'estacoes', numerico: true, formato: (v) => formatarInteiro(v) },
  { campo: 'status' },
  { campo: 'usgs_id' },
]

export default function Dados({ filtros, versaoBase, aoMudarBase }) {
  const [pagina, setPagina] = useState(1)
  const [ordenacao, setOrdenacao] = useState('-data_hora')
  const [filtrosVistos, setFiltrosVistos] = useState(filtros)

  // Filtro novo volta para a primeira página (ajuste durante a renderização, sem efeito extra)
  if (filtrosVistos !== filtros) {
    setFiltrosVistos(filtros)
    setPagina(1)
  }

  const lista = useCarregar(() => api.listarTerremotos(filtros, pagina, ordenacao), [filtros, pagina, ordenacao, versaoBase])
  const coletas = useCarregar(() => api.listarColetas(), [versaoBase])

  const total = lista.dados?.count ?? 0
  const paginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA))

  function ordenar(campo) {
    setPagina(1)
    setOrdenacao(ordenacao === campo ? `-${campo}` : campo)
  }

  return (
    <>
      <Cabecalho titulo="Dados">Tabela completa dos terremotos, com os filtros da barra lateral, e importação de dados novos</Cabecalho>

      <Importacao aoImportar={aoMudarBase} />

      <div className="grade-cartoes">
        <Cartao largo titulo="Terremotos" subtitulo={`${formatarInteiro(total)} registros · clique no título de uma coluna com seta para ordenar`}>
          {lista.erro && <Aviso tipo="erro">{lista.erro}</Aviso>}
          {lista.dados && (
            <>
              <div className="tabela-rolagem">
                <table>
                  <thead>
                    <tr>
                      {COLUNAS.map((c) => {
                        const ativa = c.ordena && ordenacao.replace('-', '') === c.ordena
                        return (
                          <th key={c.campo} className={c.ordena ? 'ordenavel' : ''} onClick={c.ordena ? () => ordenar(c.ordena) : undefined}>
                            {rotulo(c.campo)}{c.ordena && (ativa ? (ordenacao.startsWith('-') ? ' ↓' : ' ↑') : ' ↕')}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {lista.dados.results.map((r) => (
                      <tr key={r.id}>
                        {COLUNAS.map((c) => (
                          <td key={c.campo} className={c.numerico ? 'num' : ''}>
                            {r[c.campo] == null ? '' : (c.formato ? c.formato(r[c.campo]) : r[c.campo])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="paginacao">
                <span>Página {formatarInteiro(pagina)} de {formatarInteiro(paginas)}</span>
                <span className="controles">
                  <button className="botao pequeno" disabled={pagina <= 1} onClick={() => setPagina(1)}>« Primeira</button>
                  <button className="botao pequeno" disabled={!lista.dados.previous} onClick={() => setPagina(pagina - 1)}>‹ Anterior</button>
                  <button className="botao pequeno" disabled={!lista.dados.next} onClick={() => setPagina(pagina + 1)}>Próxima ›</button>
                </span>
              </div>
            </>
          )}
          {lista.carregando && !lista.dados && <Carregando />}
        </Cartao>

        <Cartao largo titulo="Histórico de importações" subtitulo="Cada vez que os dados são buscados no USGS, a importação fica registrada aqui">
          {coletas.erro && <Aviso tipo="erro">{coletas.erro}</Aviso>}
          {coletas.dados && (
            <div className="tabela-rolagem">
              <table>
                <thead>
                  <tr><th>Início</th><th>Origem</th><th>Período</th><th>Situação</th><th>Recebidos</th><th>Novos</th><th>Atualizados</th><th>Mensagem</th></tr>
                </thead>
                <tbody>
                  {coletas.dados.results.map((c) => (
                    <tr key={c.id}>
                      <td>{formatarData(c.iniciada_em, true)}</td>
                      <td>{c.origem === 'usgs' ? 'API do USGS' : c.origem}</td>
                      <td>{c.anos} {c.anos === 1 ? 'ano' : 'anos'}{c.magnitude_minima != null && ` · M ≥ ${formatarNumero(c.magnitude_minima)}`}</td>
                      <td><span className={`etiqueta ${c.status === 'concluida' ? 'ok' : c.status === 'erro' ? 'erro' : ''}`}>{c.status}</span></td>
                      <td className="num">{formatarInteiro(c.recebidos)}</td>
                      <td className="num">{formatarInteiro(c.novos)}</td>
                      <td className="num">{formatarInteiro(c.atualizados)}</td>
                      <td>{c.mensagem}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Cartao>
      </div>
    </>
  )
}

function Importacao({ aoImportar }) {
  const entrada = useRef(null)
  const [arrastando, setArrastando] = useState(false)
  const [anos, setAnos] = useState(3)
  const [magMinima, setMagMinima] = useState('')
  const [ocupado, setOcupado] = useState(null)
  const [mensagem, setMensagem] = useState(null)

  async function executar(texto, acao) {
    setOcupado(texto)
    setMensagem(null)
    try {
      const coleta = await acao()
      setMensagem({ tipo: 'ok', texto: `Importação concluída: ${formatarInteiro(coleta.recebidos)} recebidos, ${formatarInteiro(coleta.novos)} novos e ${formatarInteiro(coleta.atualizados)} atualizados.` })
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e.message })
    } finally {
      setOcupado(null)
      aoImportar()
    }
  }

  const enviar = (arquivo) => arquivo && executar(`Enviando ${arquivo.name}…`, () => api.enviarArquivo(arquivo))

  return (
    <div className="grade-cartoes">
      <Cartao titulo="Buscar dados no USGS" subtitulo="Baixa os terremotos do Chile dos últimos anos; os que já existem são atualizados, não duplicados">
        <div className="formulario-linha">
          <label className="campo">
            Últimos (anos)
            <input type="number" min="1" max="20" value={anos} onChange={(e) => setAnos(e.target.value)} />
          </label>
          <label className="campo">
            Magnitude mínima
            <input type="number" step="0.1" min="-2" max="10" placeholder="todas" value={magMinima} onChange={(e) => setMagMinima(e.target.value)} />
          </label>
          <button className="botao primario" disabled={!!ocupado}
            onClick={() => executar('Buscando no USGS… pode levar alguns minutos', () => api.importarDoUsgs(Number(anos), magMinima === '' ? null : Number(magMinima)))}>
            Buscar no USGS
          </button>
        </div>
        {ocupado?.startsWith('Buscando') && <p className="texto-explicacao">{ocupado}</p>}
      </Cartao>

      <Cartao titulo="Enviar um arquivo" subtitulo="CSV, JSON (inclusive GeoJSON) ou XML com as colunas do USGS: id, mag, time, latitude, longitude e depth">
        <div
          className={`upload${arrastando ? ' arrastando' : ''}`}
          onClick={() => entrada.current.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setArrastando(true)
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault()
            setArrastando(false)
            enviar(e.dataTransfer.files[0])
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && entrada.current.click()}
        >
          <Icone nome="upload" tamanho={26} />
          <strong>{ocupado?.startsWith('Enviando') ? ocupado : 'Arraste um arquivo aqui ou clique para escolher'}</strong>
          <span>Os terremotos do arquivo são somados à base</span>
          <input ref={entrada} type="file" accept=".csv,.json,.xml" hidden
            onChange={(e) => {
              enviar(e.target.files[0])
              e.target.value = ''
            }} />
        </div>
      </Cartao>

      {mensagem && <div style={{ gridColumn: '1 / -1' }}><Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso></div>}
    </div>
  )
}
