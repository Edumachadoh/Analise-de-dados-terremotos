// Painel: análise exploratória da região escolhida. Totais e séries por mês vêm do back
// (GET /api/estatisticas/...); o resto é calculado aqui com todos os terremotos filtrados.
// Só entram terremotos acima da magnitude de completude da região.

import { useMemo, useState } from 'react'
import { api } from '../api/index.js'
import { Aviso, Cabecalho, Carregando, Cartao, Etapa, Metrica, Seletor } from '../componentes/comuns.jsx'
import CartaoMapa from '../componentes/CartaoMapa.jsx'
import { comCorte, quantosFiltros } from '../componentes/Filtros.jsx'
import { Barras, BarrasHorizontais, Linha, Rosca } from '../componentes/graficos.jsx'
import { mesesCompletos, raridadePorMagnitude } from '../lib/analise.js'
import { formatarData, formatarInteiro, formatarMes, formatarNumero, formatarPorcentagem } from '../lib/formato.js'
import { estatisticasPorPais, tsunamiPorMagnitude } from '../lib/regioes.js'
import { rotulo } from '../lib/rotulos.js'
import { useCarregar } from '../lib/useCarregar.js'
import { useTodosTerremotos } from '../lib/useTodosTerremotos.js'

const TOP_PAISES = 10 // países mostrados no gráfico de barras
const ESCALAS = [['log', 'Logarítmica'], ['linear', 'Quantidade']]
const ALVO = 4.5 // magnitude-alvo padrão do modelo

export default function Painel({ filtros, regiao, versaoBase }) {
  const corte = regiao.magnitude_completude
  const filtrosAnalise = useMemo(() => comCorte(filtros, corte), [filtros, corte])
  const resumo = useCarregar(() => api.resumo(filtrosAnalise), [filtrosAnalise, versaoBase])
  const semCorte = useCarregar(() => api.resumo(filtros), [filtros, versaoBase]) // para contar os que ficaram de fora

  const n = quantosFiltros(filtros)
  const r = resumo.dados
  const deFora = r && semCorte.dados ? semCorte.dados.total - r.total : 0

  return (
    <>
      <Cabecalho titulo="Painel">
        Análise exploratória · fonte: USGS{n > 0 && ` · ${n} filtro${n > 1 ? 's' : ''} aplicado${n > 1 ? 's' : ''}`}
      </Cabecalho>

      {resumo.erro && <Aviso tipo="erro">{resumo.erro}</Aviso>}
      {r && (
        <Aviso>
          Filtragem de terremotos com magnitude maior ou igual a {formatarNumero(filtrosAnalise.magnitude_min)}.
          {deFora > 0 && <><br /><b>{formatarInteiro(deFora)} terremotos desconsiderados.</b></>}
        </Aviso>
      )}
      {r && r.total === 0 && <Aviso>Nenhum terremoto atende aos filtros.</Aviso>}

      {r && r.total > 0 && (
        <>
          <div className="metricas">
            <Metrica rotulo="Terremotos" valor={formatarInteiro(r.total)}
              detalhe={`${formatarData(r.periodo.inicio)} a ${formatarData(r.periodo.fim)}`} />
            <Metrica rotulo="Magnitude média" valor={formatarNumero(r.magnitude_media)} />
            <Metrica rotulo="Maior magnitude" valor={formatarNumero(r.magnitude_maxima)}
              detalhe={r.mais_forte && `${r.mais_forte.local} · ${formatarData(r.mais_forte.data_hora)}`} />
            <Metrica rotulo="Profundidade média" valor={`${formatarNumero(r.profundidade_media_km)} km`} />
            <Metrica rotulo="Com mensagem de tsunami" valor={formatarInteiro(r.com_alerta_tsunami)} />
          </div>

          <Analise filtros={filtrosAnalise} periodo={r.periodo} versaoBase={versaoBase} />
        </>
      )}

      {!r && !resumo.erro && <Carregando />}
    </>
  )
}

// Separada do resto do Painel: precisa de todos os terremotos, que chegam aos poucos
function Analise({ filtros, periodo, versaoBase }) {
  const eventos = useTodosTerremotos(filtros, versaoBase)
  const porMes = useCarregar(() => api.porMes(filtros), [filtros, versaoBase])
  const porProfundidade = useCarregar(() => api.porProfundidade(filtros), [filtros, versaoBase])
  const janelas = useCarregar(() => api.janelas(filtros), [filtros, versaoBase])
  const [escala, setEscala] = useState('log')

  const a = useMemo(() => {
    if (!eventos.completo) return null
    const itens = eventos.itens
    const porPais = [...estatisticasPorPais(itens)].sort((x, y) => y.total - x.total).slice(0, TOP_PAISES)
    return {
      porPais: porPais.map((p) => ({ nome: p.pais, valor: p.total, ...p })),
      tsunami: tsunamiPorMagnitude(itens),
      raridade: raridadePorMagnitude(itens),
      // 10 km é o valor que o USGS usa quando não consegue calcular a profundidade
      profundidade10: itens.length ? itens.filter((t) => t.profundidade_km === 10).length / itens.length : 0,
    }
  }, [eventos.completo, eventos.itens])

  if (!a) {
    return (
      <Cartao largo titulo="Análise dos dados">
        {eventos.erro ? <Aviso tipo="erro">{eventos.erro}</Aviso>
          : <Carregando texto={`Buscando os terremotos… ${formatarInteiro(eventos.itens.length)} de ${formatarInteiro(eventos.total ?? 0)}`} />}
      </Cartao>
    )
  }

  // Com filtro de datas, os meses inteiros são contados a partir dele
  const meses = porMes.dados && mesesCompletos(porMes.dados, filtros.data_inicio || periodo.inicio, filtros.data_fim ? `${filtros.data_fim}T23:59:59Z` : periodo.fim)
  const semTsunami = filtros.tsunami === 'false' // sem mensagem nenhuma, o gráfico de tsunami ficaria zerado
  const log = escala === 'log'

  return (
    <div className="grade-cartoes">
      <Etapa numero="1" titulo="Localização" />

      <CartaoMapa dados={eventos.itens} chave={`${filtros.regiao}-${eventos.total}`} />

      <Cartao largo titulo="Terremotos por país" subtitulo={`Os ${TOP_PAISES} com mais terremotos`}>
        <BarrasHorizontais dados={a.porPais} rotuloValor="Terremotos" formatar={formatarInteiro} larguraRotulo={140}
          extras={(d) => [['Magnitude média', formatarNumero(d.magnitude_media)]]} />
      </Cartao>

      <Etapa numero="2" titulo="Magnitude" />

      <Cartao largo titulo="Terremotos por magnitude mínima"
        controles={<Seletor rotulo="Escala" valor={escala} opcoes={ESCALAS} aoMudar={setEscala} />}>
        <Barras dados={a.raridade.map((x) => ({ nome: `≥ ${formatarNumero(x.limite)}`, valor: x.total }))} log={log} />
      </Cartao>

      {!semTsunami && (
        <Cartao titulo="Mensagem de tsunami por magnitude" subtitulo="% de terremotos com mensagem de tsunami do USGS">
          <Barras dados={a.tsunami} rotuloValor="Com mensagem" formatar={(v) => formatarPorcentagem(v)} />
        </Cartao>
      )}

      <Cartao largo={semTsunami} titulo="Terremotos por faixa de profundidade"
        subtitulo={`Raso: até 70 km · intermediário: 70 a 300 km · profundo: mais de 300 km · ${formatarPorcentagem(a.profundidade10, 0)} com profundidade de exatamente 10 km`}>
        {porProfundidade.dados ? (
          <Rosca dados={porProfundidade.dados.map((d) => ({ nome: d.faixa, valor: d.total }))} />
        ) : <Carregando />}
      </Cartao>

      <Etapa numero="3" titulo="Tempo" />

      <Cartao largo titulo="Terremotos por mês">
        {meses ? (
          <Linha dados={meses} chaveX="mes" chaveY="total" rotuloY="Terremotos" formatarX={formatarMes} />
        ) : <Carregando />}
      </Cartao>

      {/* <Cartao largo titulo="Poder de previsão por janela de histórico"
        subtitulo={`AUC de cada feature sozinha para prever M ≥ ${formatarNumero(ALVO)} no período seguinte · 0,5 = chute, 1 = perfeito`}>
        {janelas.erro && <Aviso tipo="erro">{janelas.erro}</Aviso>}
        {janelas.dados?.length === 0 && <Aviso>Dados insuficientes para montar a tabela do modelo.</Aviso>}
        {janelas.dados?.length > 0 && (
          <BarrasHorizontais dados={janelas.dados.map((j) => ({ nome: rotulo(j.feature), valor: j.auc }))}
            rotuloValor="AUC" formatar={(v) => formatarNumero(v, 2)} larguraRotulo={240} dominio={[0.5, 1]} />
        )}
        {!janelas.dados && !janelas.erro && <Carregando />}
      </Cartao> */}
    </div>
  )
}

