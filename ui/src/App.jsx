import { useMemo, useState } from 'react'
import { Icone } from './componentes/comuns.jsx'
import { esquecerTerremotos } from './lib/useTodosTerremotos.js'
import { Filtros, FILTROS_VAZIOS } from './componentes/Filtros.jsx'
import Dados from './paginas/Dados.jsx'
import Modelos from './paginas/Modelos.jsx'
import Painel from './paginas/Painel.jsx'
import Previsoes from './paginas/Previsoes.jsx'
import Regioes from './paginas/Regioes.jsx'

const PAGINAS = [
  { id: 'regioes', nome: 'Regiões', icone: 'globo' },
  // as telas abaixo analisam a região escolhida, então só aparecem depois da escolha
  { id: 'painel', nome: 'Painel', icone: 'painel', filtros: true, precisaRegiao: true },
  { id: 'dados', nome: 'Dados', icone: 'dados', filtros: true, precisaRegiao: true },
  // { id: 'modelos', nome: 'Modelos', icone: 'modelos' },
  // { id: 'previsoes', nome: 'Previsões', icone: 'previsoes' },
]

export default function App() {
  const [pagina, setPagina] = useState('regioes')
  // O continente ou oceano em análise (objeto de /api/regioes/); todas as consultas levam o código dele
  const [regiao, setRegiao] = useState(null)
  // Os filtros valem para Painel e Dados ao mesmo tempo
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS)
  // Muda quando a base muda (importação), para as telas buscarem os dados de novo
  const [versaoBase, setVersaoBase] = useState(0)

  const atual = PAGINAS.find((p) => p.id === pagina)
  const filtrosDaApi = useMemo(() => ({ ...filtros, regiao: regiao?.codigo ?? '' }), [filtros, regiao])

  // A base mudou (importação ou re-treino com dados novos): descarta o que estava em memória
  const aoMudarBase = () => {
    esquecerTerremotos()
    setVersaoBase((v) => v + 1)
  }

  // Outra região: os filtros da anterior não valem mais
  const analisar = (nova) => {
    if (nova.codigo !== regiao?.codigo) setFiltros(FILTROS_VAZIOS)
    setRegiao(nova)
    setPagina('painel')
  }

  return (
    <div className="app">
      <aside className="lateral">
        <div className="marca">
          <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M2 16h6l3-8 5 16 4-12 3 4h7" fill="none" stroke="currentColor" strokeWidth="3"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Terremotos por região
        </div>

        <nav className="nav">
          {PAGINAS.filter((p) => !p.precisaRegiao || regiao).map((p) => (
            <button key={p.id} className={pagina === p.id ? 'ativo' : ''} onClick={() => setPagina(p.id)}>
              <Icone nome={p.icone} />
              {p.nome}
            </button>
          ))}
        </nav>

        {regiao && (
          <div className="regiao-atual">
            <span>Analisando</span>
            <strong>{regiao.nome}</strong>
          </div>
        )}

        {regiao && atual.filtros && <Filtros key={regiao.codigo} filtros={filtros} aoAplicar={setFiltros} />}
      </aside>

      <main className="conteudo">
        {pagina === 'regioes' && <Regioes regiaoAtual={regiao} versaoBase={versaoBase} aoAnalisar={analisar} aoMudarBase={aoMudarBase} />}
        {regiao && pagina === 'painel' && <Painel filtros={filtrosDaApi} regiao={regiao} versaoBase={versaoBase} />}
        {regiao && pagina === 'dados' && <Dados filtros={filtrosDaApi} regiao={regiao} versaoBase={versaoBase} aoMudarBase={aoMudarBase} />}
        {/* {pagina === 'modelos' && <Modelos aoMudarBase={aoMudarBase} />}
        {pagina === 'previsoes' && <Previsoes versaoBase={versaoBase} />} */}
      </main>
    </div>
  )
}
