// Tela 1: visão geral. Os totais e as séries por mês vêm das estatísticas do back
// (GET /api/estatisticas/...); a comparação entre países é calculada aqui, a partir
// de todos os terremotos filtrados. Todos os números respeitam os filtros da barra lateral.

import { useMemo } from 'react'
import { api } from '../api/index.js'
import { Aviso, Cabecalho, Carregando, Cartao, Metrica } from '../componentes/comuns.jsx'
import { quantosFiltros } from '../componentes/Filtros.jsx'
import { Barras, BarrasDuplasHorizontais, BarrasHorizontais, DispersaoPorGrupo, Linha, MatrizCorrelacao, Rosca } from '../componentes/graficos.jsx'
import { matrizCorrelacao } from '../lib/correlacao.js'
import { amostrar, formatarData, formatarInteiro, formatarMes, formatarNumero, formatarPorcentagem } from '../lib/formato.js'
import { estatisticasPorPais, paisDe, tsunamiPorMagnitude } from '../lib/regioes.js'
import { rotulo } from '../lib/rotulos.js'
import { useCarregar } from '../lib/useCarregar.js'
import { useTodosTerremotos } from '../lib/useTodosTerremotos.js'

const MAX_PONTOS = 3000
const TOP_PAISES = 10 // países mostrados nos gráficos de barras
const PAISES_DISPERSAO = 6 // os demais viram "Outros" na dispersão
const OUTROS = 'Outros'
const CAMPOS_CORRELACAO = ['magnitude', 'profundidade_km', 'significancia', 'estacoes', 'lacuna_azimutal', 'rms']

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
        Terremotos registrados pelo USGS{n > 0 && ` · ${n} filtro${n > 1 ? 's' : ''} aplicado${n > 1 ? 's' : ''}`}
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
            <AnalisePorPais filtros={filtros} versaoBase={versaoBase} />

            <Cartao largo titulo="Terremotos por mês" subtitulo="Quantidade de eventos registrados em cada mês">
              {porMes.dados ? (
                <Linha dados={porMes.dados} chaveX="mes" chaveY="total" rotuloY="Terremotos" formatarX={formatarMes} />
              ) : <Carregando />}
            </Cartao>

            <Cartao titulo="Terremotos por faixa de magnitude" subtitulo="Quantos eventos há em cada faixa">
              {porMagnitude.dados ? (
                <Barras dados={porMagnitude.dados.map((d) => ({ nome: d.faixa, valor: d.total }))} />
              ) : <Carregando />}
            </Cartao>

            <Cartao titulo="Terremotos por faixa de profundidade" subtitulo="Raso: até 70 km · intermediário: 70 a 300 km · profundo: mais de 300 km">
              {porProfundidade.dados ? (
                <Rosca dados={porProfundidade.dados.map((d) => ({ nome: d.faixa, valor: d.total }))} />
              ) : <Carregando />}
            </Cartao>
          </div>
        </>
      )}

      {!r && !resumo.erro && <Carregando />}
    </>
  )
}

// Comparação entre países. Fica separada do resto do Painel: precisa de todos os terremotos,
// e enquanto as páginas chegam só estes cartões são redesenhados.
function AnalisePorPais({ filtros, versaoBase }) {
  const eventos = useTodosTerremotos(filtros, versaoBase)

  const analise = useMemo(() => {
    if (!eventos.completo) return null
    const paises = estatisticasPorPais(eventos.itens)
    const top = (campo) => [...paises].sort((a, b) => b[campo] - a[campo]).slice(0, TOP_PAISES)

    // Dispersão: os países com mais eventos ganham cor própria, o resto vira "Outros"
    const principais = top('total').slice(0, PAISES_DISPERSAO).map((p) => p.pais)
    const grupos = new Map([...principais, OUTROS].map((nome) => [nome, []]))
    for (const t of amostrar(eventos.itens, MAX_PONTOS)) {
      const pais = paisDe(t.local)
      grupos.get(grupos.has(pais) ? pais : OUTROS).push(t)
    }

    return {
      quantos: paises.length,
      magnitude: top('magnitude_media').map((p) => ({ nome: p.pais, ...p })),
      total: top('total').map((p) => ({ nome: p.pais, valor: p.total, ...p })),
      profundidade: top('profundidade_media').map((p) => ({ nome: p.pais, valor: p.profundidade_media, ...p })),
      grupos: [...grupos].map(([nome, dados]) => ({ nome, dados })).filter((g) => g.dados.length),
      tsunami: tsunamiPorMagnitude(eventos.itens),
      correlacao: matrizCorrelacao(eventos.itens, CAMPOS_CORRELACAO),
    }
  }, [eventos.completo, eventos.itens])

  if (!analise) {
    return (
      <Cartao largo titulo="Comparação entre países">
        {eventos.erro ? <Aviso tipo="erro">{eventos.erro}</Aviso>
          : <Carregando texto={`Buscando os terremotos… ${formatarInteiro(eventos.itens.length)} de ${formatarInteiro(eventos.total ?? 0)}`} />}
      </Cartao>
    )
  }

  const totalEMaxima = (d) => [['Terremotos', formatarInteiro(d.total)], ['Magnitude máxima', formatarNumero(d.magnitude_maxima)]]

  return (
    <>
      <Cartao largo titulo="Magnitude por país"
        subtitulo={`Onde os terremotos são mais fortes · os ${analise.magnitude.length} países com maior magnitude média (mínimo de 5 eventos)`}>
        <BarrasDuplasHorizontais dados={analise.magnitude}
          series={[{ chave: 'magnitude_media', rotulo: 'Magnitude média' }, { chave: 'magnitude_maxima', rotulo: 'Magnitude máxima' }]}
          extras={(d) => [['Terremotos', formatarInteiro(d.total)]]} />
      </Cartao>

      <Cartao titulo="Terremotos por país" subtitulo="Os países com mais eventos registrados">
        <BarrasHorizontais dados={analise.total} rotuloValor="Terremotos" formatar={formatarInteiro} larguraRotulo={140}
          extras={(d) => [['Magnitude média', formatarNumero(d.magnitude_media)]]} />
      </Cartao>

      <Cartao titulo="Profundidade média por país" subtitulo="Onde os terremotos acontecem mais fundo (km)">
        <BarrasHorizontais dados={analise.profundidade} rotuloValor="Profundidade média (km)" larguraRotulo={140}
          extras={totalEMaxima} />
      </Cartao>

      <Cartao largo titulo="Profundidade × magnitude por país"
        subtitulo={`Cada ponto é um terremoto${analise.grupos.reduce((s, g) => s + g.dados.length, 0) >= MAX_PONTOS ? ` (amostra de ${formatarInteiro(MAX_PONTOS)})` : ''} · a profundidade cresce para baixo`}>
        <DispersaoPorGrupo grupos={analise.grupos} x="magnitude" y="profundidade_km" outros={OUTROS}
          rotuloX={rotulo('magnitude')} rotuloY={rotulo('profundidade_km')} inverterY />
      </Cartao>

      <Cartao largo titulo="Relação entre as variáveis"
        subtitulo="Correlação de Pearson, de -1 a 1: mostra o quanto duas medidas variam juntas (não prova que uma causa a outra)">
        <MatrizCorrelacao colunas={CAMPOS_CORRELACAO.map((chave) => ({ chave, rotulo: rotulo(chave) }))} valores={analise.correlacao} />
      </Cartao>

      <Cartao titulo="Alerta de tsunami por magnitude" subtitulo="Porcentagem dos terremotos de cada faixa que tiveram alerta de tsunami">
        <Barras dados={analise.tsunami} rotuloValor="Com alerta" formatar={(v) => formatarPorcentagem(v)} />
      </Cartao>
    </>
  )
}
