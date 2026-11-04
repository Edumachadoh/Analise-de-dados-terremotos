// Tela inicial: escolher o continente ou oceano a analisar. Todas as outras telas analisam uma região por vez.
// A lista vem de GET /api/regioes/; a importação, de POST /api/regioes/{codigo}/importar/.

import { useEffect, useRef, useState } from 'react'
import { api } from '../api/index.js'
import { Aviso, Cabecalho, Carregando, Cartao } from '../componentes/comuns.jsx'
import { MapaRegioes } from '../componentes/MapaRegioes.jsx'
import { formatarInteiro, formatarNumero } from '../lib/formato.js'
import { useCarregar } from '../lib/useCarregar.js'

// "Mundo inteiro" não é uma região da API: as consultas vão sem ?regiao= (veja App.jsx).
// É a escolha inicial do app, e funciona mesmo sem nenhuma região cadastrada no banco.
export const MUNDO = 'mundo'
export const REGIAO_MUNDO = {
  codigo: MUNDO,
  nome: 'Mundo inteiro',
  tipo: 'mundo',
  total_terremotos: null,
  magnitude_completude: 4, // o mesmo padrão de Regiao.magnitude_completude no back
}

function regiaoMundo(lista) {
  if (!lista.length) return REGIAO_MUNDO
  return {
    ...REGIAO_MUNDO,
    total_terremotos: lista.reduce((s, r) => s + r.total_terremotos, 0),
    // o corte mais exigente entre as regiões, para valer em todas
    magnitude_completude: Math.max(...lista.map((r) => r.magnitude_completude)),
  }
}

export default function Regioes({ regiaoAtual, versaoBase, aoAnalisar, aoMudarBase }) {
  const regioes = useCarregar(() => api.listarRegioes(), [versaoBase])
  const poligonos = useCarregar(() => api.mapaRegioes(), []) // só muda se as regiões forem recarregadas
  const [escolhida, setEscolhida] = useState(regiaoAtual?.codigo ?? null)

  const lista = regioes.dados ?? []
  const mundo = regiaoMundo(lista)
  const regiao = escolhida === MUNDO ? mundo : lista.find((r) => r.codigo === escolhida)

  // Em tela estreita o painel da região fica abaixo do mapa: ao escolher, leva a tela até ele
  const painel = useRef(null)
  useEffect(() => {
    if (escolhida) painel.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [escolhida])

  return (
    <>
      <Cabecalho titulo="Escolha uma região">Continentes e oceanos são analisados separadamente · o mar até uns 200 km da costa conta como parte do continente</Cabecalho>

      {regioes.erro && <Aviso tipo="erro">{regioes.erro}</Aviso>}
      {regioes.carregando && !regioes.dados && <Carregando texto="Carregando as regiões…" />}
      {regioes.dados?.length === 0 && (
        <Aviso>
          Nenhuma região cadastrada. Rode <code>python manage.py carregar_regioes</code> no back para criar os continentes e oceanos.
          Até lá, use "Mundo inteiro": a importação e o envio de CSV ficam na tela Dados.
        </Aviso>
      )}

      {regioes.dados && (
        <div className="regioes-layout">
          <Cartao largo titulo="Mapa das regiões"
            subtitulo="Clique numa região, aqui ou na lista ao lado · a faixa clara em volta de cada continente é o mar que conta como dele">
            {poligonos.erro && <Aviso tipo="erro">{poligonos.erro}</Aviso>}
            {poligonos.dados && <MapaRegioes poligonos={poligonos.dados} regioes={lista} escolhida={escolhida} aoEscolher={setEscolhida} />}
            {!poligonos.dados && !poligonos.erro && <Carregando texto="Desenhando o mapa…" />}
          </Cartao>

          {/* Ao lado do mapa e sempre à vista: a região escolhida (com o botão Analisar) e a lista de todas as regiões */}
          <div className="regioes-lateral" ref={painel}>
            <Detalhe regiao={regiao} aoAnalisar={aoAnalisar} aoImportar={aoMudarBase} />
            <Cartao titulo="Todas as regiões">
              <Opcoes lista={[mundo]} escolhida={escolhida} aoEscolher={setEscolhida} />
              <p className="grupo-regioes">Continentes</p>
              <Opcoes lista={lista.filter((r) => r.tipo === 'continente')} escolhida={escolhida} aoEscolher={setEscolhida} />
              <p className="grupo-regioes">Oceanos</p>
              <Opcoes lista={lista.filter((r) => r.tipo === 'oceano')} escolhida={escolhida} aoEscolher={setEscolhida} />
            </Cartao>
          </div>
        </div>
      )}
    </>
  )
}

function Opcoes({ lista, escolhida, aoEscolher }) {
  return (
    <div className="opcoes-regiao">
      {lista.map((r) => (
        <button key={r.codigo} className={`opcao-regiao${r.codigo === escolhida ? ' ativo' : ''}`} onClick={() => aoEscolher(r.codigo)}>
          <strong>{r.nome}</strong>
          <span>{r.total_terremotos ? formatarInteiro(r.total_terremotos) : 'sem dados'}</span>
        </button>
      ))}
    </div>
  )
}

function Detalhe({ regiao, aoAnalisar, aoImportar }) {
  const [anos, setAnos] = useState(3)
  const [magMinima, setMagMinima] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [mensagem, setMensagem] = useState(null)

  if (!regiao) {
    return (
      <Cartao titulo="Nenhuma região escolhida">
        <p className="texto-explicacao">Escolha o mundo inteiro, um continente ou um oceano para ver quantos terremotos há na base, analisá-lo ou importar dados.</p>
      </Cartao>
    )
  }

  async function importar() {
    setOcupado(true)
    setMensagem(null)
    try {
      const coleta = await api.importarRegiao(regiao.codigo, Number(anos), magMinima === '' ? null : Number(magMinima))
      setMensagem({ tipo: 'ok', texto: `Importação concluída: ${formatarInteiro(coleta.recebidos)} recebidos, ${formatarInteiro(coleta.novos)} novos e ${formatarInteiro(coleta.atualizados)} atualizados.` })
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e.message })
    } finally {
      setOcupado(false)
      aoImportar()
    }
  }

  const temDados = regiao.total_terremotos > 0

  return (
    <Cartao titulo={regiao.nome}
      subtitulo={temDados ? `${formatarInteiro(regiao.total_terremotos)} terremotos na base` : 'Ainda não há terremotos desta região na base'}>
      {temDados && (
        <button className="botao primario" onClick={() => aoAnalisar(regiao)}>Analisar {regiao.nome}</button>
      )}

      {/* a importação do USGS é feita por região */}
      {regiao.codigo !== MUNDO && <details className="importacao-regiao" key={regiao.codigo} open>
        <summary>{temDados ? 'Buscar mais dados no USGS' : 'Importar dados do USGS'}</summary>
      <p className="texto-explicacao">Baixa os terremotos da região (padrão M ≥ {formatarNumero(regiao.magnitude_completude)}; abaixo disso o catálogo é incompleto). Os já existentes são atualizados.</p>
      <div className="formulario-linha">
        <label className="campo">
          Últimos (anos)
          <input type="number" min="1" max="20" value={anos} onChange={(e) => setAnos(e.target.value)} />
        </label>
        <label className="campo">
          Magnitude mínima
          <input type="number" step="0.1" min="-2" max="10" placeholder={formatarNumero(regiao.magnitude_completude)}
            value={magMinima} onChange={(e) => setMagMinima(e.target.value)} />
        </label>
        <button className={`botao${temDados ? '' : ' primario'}`} disabled={ocupado} onClick={importar}>
          {ocupado ? 'Buscando…' : 'Buscar no USGS'}
        </button>
      </div>
      </details>}
      {ocupado && <p className="texto-explicacao">Buscando no USGS… pode levar alguns minutos.</p>}
      {mensagem && <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>}
    </Cartao>
  )
}
