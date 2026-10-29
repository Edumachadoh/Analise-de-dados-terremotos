// Tela 1: visão geral com as estatísticas calculadas pelo back (GET /api/estatisticas/...).
// Todos os números respeitam os filtros da barra lateral.

import { api } from '../api/index.js'
import { Aviso, Cabecalho, Carregando, Cartao, Metrica } from '../componentes/comuns.jsx'
import { quantosFiltros } from '../componentes/Filtros.jsx'
import { Barras, Dispersao, Linha, Rosca } from '../componentes/graficos.jsx'
import { amostrar, formatarData, formatarInteiro, formatarMes, formatarNumero } from '../lib/formato.js'
import { rotulo } from '../lib/rotulos.js'
import { useCarregar } from '../lib/useCarregar.js'
import { useTodosTerremotos } from '../lib/useTodosTerremotos.js'

const MAX_PONTOS = 3000

export default function Painel({ filtros, versaoBase }) {
  const resumo = useCarregar(() => api.resumo(filtros), [filtros, versaoBase])
  const porMes = useCarregar(() => api.porMes(filtros), [filtros, versaoBase])
  const porMagnitude = useCarregar(() => api.porMagnitude(filtros), [filtros, versaoBase])
  const porProfundidade = useCarregar(() => api.porProfundidade(filtros), [filtros, versaoBase])

  const n = quantosFiltros(filtros)
  const r = resumo.dados

  return (
    <>
      <Cabecalho titulo="Painel">
        Terremotos registrados pelo USGS na região do Chile{n > 0 && ` · ${n} filtro${n > 1 ? 's' : ''} aplicado${n > 1 ? 's' : ''}`}
      </Cabecalho>

      {resumo.erro && <Aviso tipo="erro">{resumo.erro}</Aviso>}
      {r && r.total === 0 && <Aviso>Nenhum terremoto atende aos filtros. Ajuste ou limpe os filtros na barra lateral.</Aviso>}

      {r && r.total > 0 && (
        <>
          <div className="metricas">
            <Metrica rotulo="Terremotos" valor={formatarInteiro(r.total)}
              detalhe={`${formatarData(r.periodo.inicio)} a ${formatarData(r.periodo.fim)}`} />
            <Metrica rotulo="Magnitude média" valor={formatarNumero(r.magnitude_media)} />
            <Metrica rotulo="Maior magnitude" valor={formatarNumero(r.magnitude_maxima)}
              detalhe={r.mais_forte && `${r.mais_forte.local} · ${formatarData(r.mais_forte.data_hora)}`} />
            <Metrica rotulo="Profundidade média" valor={`${formatarNumero(r.profundidade_media_km)} km`} />
            <Metrica rotulo="Com alerta de tsunami" valor={formatarInteiro(r.com_alerta_tsunami)} />
          </div>

          <div className="grade-cartoes">
            <Cartao largo titulo="Terremotos por mês" subtitulo="Quantidade de eventos registrados em cada mês">
              {porMes.dados ? (
                <Linha dados={porMes.dados} chaveX="mes" chaveY="total" rotuloY="Terremotos" formatarX={formatarMes} />
              ) : <Carregando />}
            </Cartao>

            <Cartao titulo="Terremotos por faixa de magnitude" subtitulo="A maioria fica entre 4 e 4,9">
              {porMagnitude.dados ? (
                <Barras dados={porMagnitude.dados.map((d) => ({ nome: d.faixa, valor: d.total }))} />
              ) : <Carregando />}
            </Cartao>

            <Cartao titulo="Terremotos por faixa de profundidade" subtitulo="Raso: até 70 km · intermediário: 70 a 300 km · profundo: mais de 300 km">
              {porProfundidade.dados ? (
                <Rosca dados={porProfundidade.dados.map((d) => ({ nome: d.faixa, valor: d.total }))} />
              ) : <Carregando />}
            </Cartao>

            <Cartao titulo="Magnitude máxima por mês" subtitulo="O maior terremoto registrado em cada mês">
              {porMes.dados ? (
                <Linha dados={porMes.dados} chaveX="mes" chaveY="magnitude_maxima" rotuloY="Magnitude máxima"
                  formatarX={formatarMes} formatar={(v) => formatarNumero(v)} />
              ) : <Carregando />}
            </Cartao>

            <DispersaoEventos filtros={filtros} versaoBase={versaoBase} />
          </div>
        </>
      )}

      {!r && !resumo.erro && <Carregando />}
    </>
  )
}

// Fica separado do resto do Painel: enquanto as páginas de terremotos chegam, só este cartão é redesenhado
function DispersaoEventos({ filtros, versaoBase }) {
  const eventos = useTodosTerremotos(filtros, versaoBase)

  return (
    <Cartao titulo="Profundidade × magnitude"
      subtitulo={`Cada ponto é um terremoto${eventos.itens.length > MAX_PONTOS ? ` (amostra de ${formatarInteiro(MAX_PONTOS)})` : ''} · a profundidade cresce para baixo`}>
      {eventos.erro && <Aviso tipo="erro">{eventos.erro}</Aviso>}
      {eventos.completo ? (
        <Dispersao dados={amostrar(eventos.itens, MAX_PONTOS)} x="magnitude" y="profundidade_km"
          rotuloX={rotulo('magnitude')} rotuloY={rotulo('profundidade_km')} inverterY />
      ) : !eventos.erro && <Carregando texto={`Buscando os terremotos… ${formatarInteiro(eventos.itens.length)} de ${formatarInteiro(eventos.total ?? 0)}`} />}
    </Cartao>
  )
}
