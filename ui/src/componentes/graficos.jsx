// Gráficos (Recharts) com o mesmo visual em todas as telas.
// Cores vêm das variáveis CSS, então seguem o tema claro/escuro.

import { Fragment } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts'
import { formatarInteiro, formatarNumero } from '../lib/formato.js'
import { Dica } from './comuns.jsx'

const CORES_SERIE = Array.from({ length: 7 }, (_, i) => `var(--serie-${i + 1})`)
const EIXO = { stroke: 'var(--eixo)', tick: { fill: 'var(--texto-mudo)', fontSize: 12 }, tickLine: false }
const CURSOR = { fill: 'var(--superficie-2)' }

function DicaRecharts({ active, payload, montar }) {
  if (!active || !payload?.length) return null
  return <Dica {...montar(payload[0].payload)} />
}

// dados: [{ nome, valor }]
export function Barras({ dados, rotuloValor = 'Terremotos', formatar = formatarInteiro, altura = 280 }) {
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--grade)" vertical={false} />
        <XAxis dataKey="nome" {...EIXO} interval={0} />
        <YAxis {...EIXO} axisLine={false} width={48} tickFormatter={formatar} />
        <Tooltip cursor={CURSOR} content={<DicaRecharts montar={(d) => ({ titulo: d.nome, linhas: [[rotuloValor, formatar(d.valor)]] })} />} />
        <Bar dataKey="valor" fill="var(--serie-1)" radius={[4, 4, 0, 0]} maxBarSize={64} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// `extras(d)` (opcional) acrescenta linhas à dica: [[rótulo, valor], ...]
export function BarrasHorizontais({ dados, rotuloValor, formatar = formatarNumero, larguraRotulo = 220, extras, dominio }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, dados.length * 32 + 30)}>
      <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--grade)" horizontal={false} />
        <XAxis type="number" {...EIXO} tickFormatter={formatar} domain={dominio ?? [0, 'auto']} />
        <YAxis type="category" dataKey="nome" {...EIXO} axisLine={false} width={larguraRotulo} />
        <Tooltip cursor={CURSOR} content={<DicaRecharts montar={(d) => ({
          titulo: d.nome, linhas: [[rotuloValor, formatar(d.valor)], ...(extras ? extras(d) : [])],
        })} />} />
        <Bar dataKey="valor" fill="var(--serie-1)" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// Duas barras por categoria (ex.: magnitude média e máxima de cada país).
// series: [{ chave, rotulo }]; a primeira usa a cor 1 e a segunda a cor 2.
export function BarrasDuplasHorizontais({ dados, series, formatar = formatarNumero, larguraRotulo = 160, extras }) {
  return (
    <>
      <ResponsiveContainer width="100%" height={Math.max(140, dados.length * 44 + 30)}>
        <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid stroke="var(--grade)" horizontal={false} />
          <XAxis type="number" {...EIXO} tickFormatter={formatar} domain={[0, 'auto']} />
          <YAxis type="category" dataKey="nome" {...EIXO} axisLine={false} width={larguraRotulo} />
          <Tooltip cursor={CURSOR} content={<DicaRecharts montar={(d) => ({
            titulo: d.nome,
            linhas: [...series.map((s) => [s.rotulo, formatar(d[s.chave])]), ...(extras ? extras(d) : [])],
          })} />} />
          {series.map((s, i) => (
            <Bar key={s.chave} dataKey={s.chave} fill={CORES_SERIE[i]} radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="legenda">
        {series.map((s, i) => (
          <span className="item" key={s.chave}>
            <span className="amostra" style={{ background: CORES_SERIE[i] }} />
            {s.rotulo}
          </span>
        ))}
      </div>
    </>
  )
}

// Rosca com cor fixa por posição (as fatias vêm sempre na mesma ordem da API)
export function Rosca({ dados, altura = 230 }) {
  const total = dados.reduce((s, d) => s + d.valor, 0) || 1
  const pct = (v) => `${formatarNumero((v / total) * 100, 1)}%`
  return (
    <>
      <ResponsiveContainer width="100%" height={altura}>
        <PieChart>
          <Pie data={dados} dataKey="valor" nameKey="nome" innerRadius="55%" outerRadius="90%"
            stroke="var(--superficie)" strokeWidth={2} isAnimationActive={false}>
            {dados.map((d, i) => <Cell key={d.nome} fill={CORES_SERIE[i]} />)}
          </Pie>
          <Tooltip content={<DicaRecharts montar={(d) => ({
            titulo: d.nome, linhas: [['Terremotos', formatarInteiro(d.valor)], ['Proporção', pct(d.valor)]],
          })} />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="legenda">
        {dados.map((d, i) => (
          <span className="item" key={d.nome}>
            <span className="amostra" style={{ background: CORES_SERIE[i] }} />
            {d.nome} · {pct(d.valor)}
          </span>
        ))}
      </div>
    </>
  )
}

export function Dispersao({ dados, x, y, rotuloX, rotuloY, inverterY = false, altura = 300 }) {
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--grade)" />
        <XAxis type="number" dataKey={x} {...EIXO} domain={['dataMin', 'dataMax']} tickFormatter={(v) => formatarNumero(v)} />
        <YAxis type="number" dataKey={y} {...EIXO} axisLine={false} width={48} reversed={inverterY}
          domain={[0, 'dataMax']} tickFormatter={(v) => formatarNumero(v)} />
        <Tooltip cursor={{ stroke: 'var(--eixo)' }} content={<DicaRecharts montar={(d) => ({
          titulo: d.local || null, linhas: [[rotuloX, formatarNumero(d[x], 3)], [rotuloY, formatarNumero(d[y], 3)]],
        })} />} />
        <Scatter data={dados} fill="var(--serie-1)" fillOpacity={0.45} isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  )
}

// Dispersão com uma cor por grupo (ex.: país). grupos: [{ nome, dados }]; o último pode ser "Outros", em cinza.
export function DispersaoPorGrupo({ grupos, x, y, rotuloX, rotuloY, inverterY = false, altura = 340, outros }) {
  const cor = (g, i) => (g.nome === outros ? 'var(--serie-outros)' : CORES_SERIE[i % CORES_SERIE.length])
  return (
    <>
      <ResponsiveContainer width="100%" height={altura}>
        <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--grade)" />
          <XAxis type="number" dataKey={x} {...EIXO} domain={['dataMin', 'dataMax']} tickFormatter={(v) => formatarNumero(v)} />
          <YAxis type="number" dataKey={y} {...EIXO} axisLine={false} width={48} reversed={inverterY}
            domain={[0, 'dataMax']} tickFormatter={(v) => formatarNumero(v)} />
          <Tooltip cursor={{ stroke: 'var(--eixo)' }} content={<DicaRecharts montar={(d) => ({
            titulo: d.local || null, linhas: [[rotuloX, formatarNumero(d[x], 3)], [rotuloY, formatarNumero(d[y], 3)]],
          })} />} />
          {grupos.map((g, i) => (
            <Scatter key={g.nome} name={g.nome} data={g.dados} fill={cor(g, i)} fillOpacity={0.55} isAnimationActive={false} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
      <div className="legenda">
        {grupos.map((g, i) => (
          <span className="item" key={g.nome}>
            <span className="amostra" style={{ background: cor(g, i) }} />
            {g.nome} · {formatarInteiro(g.dados.length)}
          </span>
        ))}
      </div>
    </>
  )
}

// Matriz de correlação (Pearson). colunas: [{ chave, rotulo }]; valores: matriz n×n com null onde não há dado.
// Azul = os dois sobem juntos; laranja = um sobe e o outro desce. Quanto mais forte a cor, maior a relação.
export function MatrizCorrelacao({ colunas, valores }) {
  const fundo = (r) => {
    if (r == null) return 'var(--superficie-2)'
    const base = r >= 0 ? '42, 120, 214' : '242, 106, 33'
    return `rgba(${base}, ${(0.12 + Math.abs(r) * 0.78).toFixed(2)})`
  }
  return (
    <>
      <div className="matriz-correlacao" style={{ gridTemplateColumns: `minmax(120px, 160px) repeat(${colunas.length}, minmax(64px, 1fr))` }}>
        <div />
        {colunas.map((c) => <div key={c.chave} className="cabeca coluna">{c.rotulo}</div>)}
        {colunas.map((linha, i) => (
          <Fragment key={linha.chave}>
            <div className="cabeca">{linha.rotulo}</div>
            {colunas.map((coluna, j) => (
              <div key={coluna.chave} className="celula" style={{ background: fundo(valores[i][j]) }}
                title={`${linha.rotulo} × ${coluna.rotulo}`}>
                {valores[i][j] == null ? '—' : formatarNumero(valores[i][j], 2)}
              </div>
            ))}
          </Fragment>
        ))}
      </div>
      <div className="legenda">
        <span className="item"><span className="amostra" style={{ background: fundo(0.8) }} />positiva: sobem juntas</span>
        <span className="item"><span className="amostra" style={{ background: fundo(-0.8) }} />negativa: uma sobe, a outra desce</span>
        <span>· próximo de 0: sem relação · de ±0,3 a ±0,7: moderada · acima de ±0,7: forte</span>
      </div>
    </>
  )
}

export function Linha({ dados, chaveX, chaveY, rotuloY, formatarX = (v) => v, formatar = formatarInteiro, altura = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <LineChart data={dados} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--grade)" vertical={false} />
        <XAxis dataKey={chaveX} {...EIXO} minTickGap={32} tickFormatter={formatarX} />
        <YAxis {...EIXO} axisLine={false} width={48} tickFormatter={formatar} domain={['auto', 'auto']} />
        <Tooltip cursor={{ stroke: 'var(--eixo)' }} content={<DicaRecharts montar={(d) => ({
          titulo: formatarX(d[chaveX]), linhas: [[rotuloY, formatar(d[chaveY])]],
        })} />} />
        <Line dataKey={chaveY} stroke="var(--serie-1)" strokeWidth={2} dot={false} connectNulls
          activeDot={{ r: 5, stroke: 'var(--superficie)', strokeWidth: 2 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
