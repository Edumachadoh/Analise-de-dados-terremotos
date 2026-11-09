// Peças pequenas reaproveitadas em todas as telas

import { useEffect, useRef } from 'react'

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

// Título de uma etapa da análise
export function Etapa({ numero, titulo, pergunta }) {
  return (
    <div className="etapa">
      <span className="numero">{numero}</span>
      <div>
        <h2>{titulo}</h2>
        {pergunta && <p>{pergunta}</p>}
      </div>
    </div>
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

// Janela de confirmação com "Sim" e "Não". O foco começa no "Não" e Esc também responde "Não",
// para uma ação destrutiva não ser confirmada sem querer.
export function Confirmacao({ titulo, children, aoConfirmar, aoCancelar, ocupado = false }) {
  const botaoNao = useRef(null)

  useEffect(() => {
    botaoNao.current?.focus()
    const tecla = (e) => e.key === 'Escape' && !ocupado && aoCancelar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aoCancelar, ocupado])

  return (
    <div className="sobreposicao" onClick={() => !ocupado && aoCancelar()}>
      <div className="janela" role="alertdialog" aria-modal="true" aria-labelledby="janela-titulo"
        onClick={(e) => e.stopPropagation()}>
        <h2 id="janela-titulo">{titulo}</h2>
        <div className="janela-texto">{children}</div>
        <div className="janela-botoes">
          <button ref={botaoNao} className="botao" disabled={ocupado} onClick={aoCancelar}>Não</button>
          <button className="botao perigo" disabled={ocupado} onClick={aoConfirmar}>{ocupado ? 'Apagando…' : 'Sim'}</button>
        </div>
      </div>
    </div>
  )
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
  previsoes: 'M3 17l6-6 4 4 8-8m0 0h-5m5 0v5',
  upload: 'M12 16V4m0 0-5 5m5-5 5 5M4 20h16',
  globo: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z',
}

export function Icone({ nome, tamanho = 18 }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={CAMINHOS[nome]} />
    </svg>
  )
}
