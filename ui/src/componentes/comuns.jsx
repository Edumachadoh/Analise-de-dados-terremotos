// Peças pequenas reaproveitadas em todas as telas

export function Cabecalho({ titulo, children }) {
  return (
    <header className="cabecalho">
      <h1>{titulo}</h1>
      {children && <p>{children}</p>}
    </header>
  )
}

export function Cartao({ titulo, subtitulo, controles, largo = false, children }) {
  return (
    <section className={`cartao${largo ? ' largo' : ''}`}>
      <div className="cartao-topo">
        <div>
          <h2>{titulo}</h2>
          {subtitulo && <p className="subtitulo">{subtitulo}</p>}
        </div>
        {controles && <div className="controles">{controles}</div>}
      </div>
      {children}
    </section>
  )
}

export function Metrica({ rotulo, valor, detalhe }) {
  return (
    <div className="metrica">
      <div className="rotulo">{rotulo}</div>
      <div className="valor">{valor}</div>
      {detalhe && <div className="detalhe">{detalhe}</div>}
    </div>
  )
}

// opcoes: lista de valores ou de pares [valor, texto]
export function Seletor({ rotulo, valor, opcoes, aoMudar, inline = true }) {
  return (
    <label className={`campo${inline ? ' inline' : ''}`}>
      {rotulo}
      <select value={valor ?? ''} onChange={(e) => aoMudar(e.target.value)}>
        {opcoes.map((o) => {
          const [v, texto] = Array.isArray(o) ? o : [o, o]
          return (
            <option key={v} value={v}>
              {texto}
            </option>
          )
        })}
      </select>
    </label>
  )
}

export function Aviso({ tipo = '', children }) {
  return <div className={`aviso ${tipo}`}>{children}</div>
}

export function Carregando({ texto = 'Carregando…' }) {
  return <div className="vazio">{texto}</div>
}

export function Dica({ titulo, linhas }) {
  return (
    <div className="dica">
      {titulo && <div className="titulo">{titulo}</div>}
      {linhas.map(([rotulo, valor]) => (
        <div key={rotulo}>
          {rotulo}: <strong>{valor}</strong>
        </div>
      ))}
    </div>
  )
}

const CAMINHOS = {
  painel: 'M5 20V10m7 10V4m7 16v-7',
  mapa: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zm0 0v14m6-12v14',
  dados: 'M4 6h16M4 12h16M4 18h10',
  modelos: 'M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2M6 18l2-2m8-8 2-2M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  previsoes: 'M3 12h4l3-8 4 16 3-8h4',
  upload: 'M12 16V4m0 0-5 5m5-5 5 5M4 20h16',
}

export function Icone({ nome, tamanho = 18 }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={CAMINHOS[nome]} />
    </svg>
  )
}
