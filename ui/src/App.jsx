import { useState } from 'react'
import { Icone } from './componentes/comuns.jsx'
import { esquecerTerremotos } from './lib/useTodosTerremotos.js'
import { Filtros, FILTROS_VAZIOS } from './componentes/Filtros.jsx'
import Dados from './paginas/Dados.jsx'
import Mapa from './paginas/Mapa.jsx'
import Modelos from './paginas/Modelos.jsx'
import Painel from './paginas/Painel.jsx'
import Previsoes from './paginas/Previsoes.jsx'

const PAGINAS = [
  { id: 'painel', nome: 'Painel', icone: 'painel', filtros: true },
  { id: 'mapa', nome: 'Mapa', icone: 'mapa', filtros: true },
  { id: 'dados', nome: 'Dados', icone: 'dados', filtros: true },
  { id: 'modelos', nome: 'Modelos', icone: 'modelos' },
  { id: 'previsoes', nome: 'Previsões', icone: 'previsoes' },
]

export default function App() {
  const [pagina, setPagina] = useState('painel')
  // Os filtros valem para Painel, Mapa e Dados ao mesmo tempo
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS)
  // Muda quando a base muda (importação), para as telas buscarem os dados de novo
  const [versaoBase, setVersaoBase] = useState(0)

  const atual = PAGINAS.find((p) => p.id === pagina)

  // A base mudou (importação ou re-treino com dados novos): descarta o que estava em memória
  const aoMudarBase = () => {
    esquecerTerremotos()
    setVersaoBase((v) => v + 1)
  }

  return (
    <div className="app">
      <aside className="lateral">
        <div className="marca">
          <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M2 16h6l3-8 5 16 4-12 3 4h7" fill="none" stroke="currentColor" strokeWidth="3"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Terremotos no Chile
        </div>

        <nav className="nav">
          {PAGINAS.map((p) => (
            <button key={p.id} className={pagina === p.id ? 'ativo' : ''} onClick={() => setPagina(p.id)}>
              <Icone nome={p.icone} />
              {p.nome}
            </button>
          ))}
        </nav>

        {atual.filtros && <Filtros filtros={filtros} aoAplicar={setFiltros} />}
      </aside>

      <main className="conteudo">
        {pagina === 'painel' && <Painel filtros={filtros} versaoBase={versaoBase} />}
        {pagina === 'mapa' && <Mapa filtros={filtros} versaoBase={versaoBase} />}
        {pagina === 'dados' && <Dados filtros={filtros} versaoBase={versaoBase} aoMudarBase={aoMudarBase} />}
        {pagina === 'modelos' && <Modelos aoMudarBase={aoMudarBase} />}
        {pagina === 'previsoes' && <Previsoes versaoBase={versaoBase} />}
      </main>
    </div>
  )
}
