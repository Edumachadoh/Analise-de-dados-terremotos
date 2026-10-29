// Filtros da barra lateral. Os nomes dos campos são os parâmetros do back
// (GET /api/terremotos/?magnitude_min=5...), então o objeto vai direto na query string.
// Os filtros só são enviados ao clicar em "Aplicar", para não disparar uma consulta por tecla.

import { useState } from 'react'

// Valores que a API aceita em cada filtro, exatamente como vêm nos dados
const VALORES = {
  faixa_profundidade: ['raso', 'intermediario', 'profundo'],
  tipo_magnitude: ['mb', 'ml', 'md', 'ms', 'mw', 'mww', 'mwr', 'mwc', 'mwb', 'mh'],
  alerta: ['green', 'yellow', 'orange', 'red'],
}

export const FILTROS_VAZIOS = {
  magnitude_min: '',
  magnitude_max: '',
  profundidade_min: '',
  profundidade_max: '',
  data_inicio: '',
  data_fim: '',
  faixa_profundidade: '',
  tipo_magnitude: '',
  tsunami: '',
  alerta: '',
  local: '',
}

export const quantosFiltros = (filtros) => Object.values(filtros).filter((v) => v !== '').length

export function Filtros({ filtros, aoAplicar }) {
  const [rascunho, setRascunho] = useState(filtros)
  const mudar = (campo) => (e) => setRascunho({ ...rascunho, [campo]: e.target.value })

  const numero = (campo, rotulo, passo) => (
    <input type="number" step={passo} placeholder={rotulo} aria-label={rotulo} value={rascunho[campo]} onChange={mudar(campo)} />
  )
  const opcoes = (campo, todos) => (
    <select value={rascunho[campo]} onChange={mudar(campo)}>
      <option value="">{todos}</option>
      {VALORES[campo].map((valor) => <option key={valor} value={valor}>{valor}</option>)}
    </select>
  )

  return (
    <form className="filtros" onSubmit={(e) => {
      e.preventDefault()
      aoAplicar(rascunho)
    }}>
      <h3>Filtros</h3>

      <label className="campo">
        Magnitude
        <div className="par">{numero('magnitude_min', 'mín.', 0.1)}{numero('magnitude_max', 'máx.', 0.1)}</div>
      </label>

      <label className="campo">
        Profundidade (km)
        <div className="par">{numero('profundidade_min', 'mín.', 1)}{numero('profundidade_max', 'máx.', 1)}</div>
      </label>

      <label className="campo">
        Faixa de profundidade
        {opcoes('faixa_profundidade', 'Todas')}
      </label>

      <label className="campo">
        Período
        <div className="par">
          <input type="date" aria-label="início" value={rascunho.data_inicio} onChange={mudar('data_inicio')} />
          <input type="date" aria-label="fim" value={rascunho.data_fim} onChange={mudar('data_fim')} />
        </div>
      </label>

      <label className="campo">
        Escala de magnitude
        {opcoes('tipo_magnitude', 'Todas')}
      </label>

      <div className="par">
        <label className="campo">
          Tsunami
          <select value={rascunho.tsunami} onChange={mudar('tsunami')}>
            <option value="">Todos</option>
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </select>
        </label>
        <label className="campo">
          Alerta
          {opcoes('alerta', 'Todos')}
        </label>
      </div>

      <label className="campo">
        Local contém
        <input type="text" placeholder="ex.: Valparaíso" value={rascunho.local} onChange={mudar('local')} />
      </label>

      <div className="par">
        <button className="botao primario" type="submit">Aplicar</button>
        <button className="botao" type="button" onClick={() => {
          setRascunho(FILTROS_VAZIOS)
          aoAplicar(FILTROS_VAZIOS)
        }}>Limpar</button>
      </div>
    </form>
  )
}
