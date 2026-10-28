// Gráficos (Recharts) com o mesmo visual em todas as telas.
// Cores vêm das variáveis CSS, então seguem o tema claro/escuro.

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

export function BarrasHorizontais({ dados, rotuloValor, formatar = formatarNumero, larguraRotulo = 220 }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, dados.length * 32 + 30)}>
      <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--grade)" horizontal={false} />
        <XAxis type="number" {...EIXO} tickFormatter={formatar} />
        <YAxis type="category" dataKey="nome" {...EIXO} axisLine={false} width={larguraRotulo} />
        <Tooltip cursor={CURSOR} content={<DicaRecharts montar={(d) => ({ titulo: d.nome, linhas: [[rotuloValor, formatar(d.valor)]] })} />} />
        <Bar dataKey="valor" fill="var(--serie-1)" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
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
