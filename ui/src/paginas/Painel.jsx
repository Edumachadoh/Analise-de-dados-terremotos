// Painel: análise exploratória da região escolhida. Totais e séries por mês vêm do back
// (GET /api/estatisticas/...); o resto é calculado aqui com todos os terremotos filtrados.
// Só entram terremotos acima da magnitude de completude da região.

import { useMemo, useState } from 'react'
import { api } from '../api/index.js'
import { Aviso, Cabecalho, Carregando, Cartao, Etapa, Metrica, Seletor } from '../componentes/comuns.jsx'
import CartaoMapa from '../componentes/CartaoMapa.jsx'
import { quantosFiltros } from '../componentes/Filtros.jsx'
import { Barras, BarrasDuplasHorizontais, BarrasHorizontais, DispersaoPorGrupo, Linha, MatrizCorrelacao, Rosca } from '../componentes/graficos.jsx'
import { mesesCompletos, persistenciaMensal, raridadePorMagnitude } from '../lib/analise.js'
import { matrizCorrelacao } from '../lib/correlacao.js'
import { amostrar, formatarData, formatarInteiro, formatarMes, formatarNumero, formatarPorcentagem } from '../lib/formato.js'
import { estatisticasPorPais, tsunamiPorMagnitude } from '../lib/regioes.js'
import { estatisticasPorRegiao, OUTRAS_AREAS, regiaoSismica } from '../lib/regioesSismicas.js'
import { rotulo } from '../lib/rotulos.js'
import { useCarregar } from '../lib/useCarregar.js'
import { useTodosTerremotos } from '../lib/useTodosTerremotos.js'

const MAX_PONTOS = 3000
const TOP_PAISES = 10 // países mostrados nos gráficos de barras
const REGIOES_DISPERSAO = 7 // as demais regiões viram "Outras regiões" na dispersão
const OUTROS = 'Outras regiões'
// Sem a significância: o USGS a calcula a partir da magnitude
const CAMPOS_CORRELACAO = ['magnitude', 'profundidade_km', 'estacoes', 'lacuna_azimutal', 'rms']
const ESCALAS = [['log', 'Logarítmica'], ['linear', 'Quantidade']]
const ATUAL = { tamanho: 1, alvo: 4.5 } // configuração padrão do modelo

const pct = (v) => formatarPorcentagem(v, v < 0.01 ? 2 : 1)
const vezes = (v) => (v ? `${formatarNumero(v, 1)}×` : '—')

// A magnitude mínima nunca fica abaixo do corte; se o filtro pedir mais, vale o filtro
function comCorte(filtros, corte) {
  const minimo = filtros.magnitude_min === '' ? -Infinity : Number(filtros.magnitude_min)
  return minimo >= corte ? filtros : { ...filtros, magnitude_min: corte }
}

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
  const positivos = useCarregar(() => api.casosPositivos(filtros), [filtros, versaoBase])
  const [escala, setEscala] = useState('log')

  const a = useMemo(() => {
    if (!eventos.completo) return null
    const itens = eventos.itens
    const paises = estatisticasPorPais(itens)
    const top = (campo) => [...paises].sort((x, y) => y[campo] - x[campo]).slice(0, TOP_PAISES)

    // Dispersão: as regiões com mais eventos ganham cor própria, o resto vira "Outras regiões"
    const regioes = estatisticasPorRegiao(itens)
    const principais = regioes.filter((g) => g.nome !== OUTRAS_AREAS).slice(0, REGIOES_DISPERSAO).map((g) => g.nome)
    const grupos = new Map([...principais, OUTROS].map((nome) => [nome, []]))
    for (const t of amostrar(itens, MAX_PONTOS)) {
      const regiao = regiaoSismica(t)
      grupos.get(grupos.has(regiao) ? regiao : OUTROS).push(t)
    }

    return {
      regioes,
      porPais: top('total').map((p) => ({ nome: p.pais, valor: p.total, ...p })),
      magnitude: top('magnitude_media').map((p) => ({ nome: p.pais, ...p })),
      grupos: [...grupos].map(([nome, dados]) => ({ nome, dados })).filter((g) => g.dados.length),
      tsunami: tsunamiPorMagnitude(itens),
      correlacao: matrizCorrelacao(itens, CAMPOS_CORRELACAO),
      raridade: raridadePorMagnitude(itens),
      persistencia: persistenciaMensal(itens),
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

  const pers = a.persistencia
  const p45 = pers.find((x) => x.limite === 4.5)
  // Com filtro de datas, os meses inteiros são contados a partir dele
  const meses = porMes.dados && mesesCompletos(porMes.dados, filtros.data_inicio || periodo.inicio, filtros.data_fim ? `${filtros.data_fim}T23:59:59Z` : periodo.fim)
  const semTsunami = filtros.tsunami === 'false' // sem mensagem nenhuma, o gráfico de tsunami ficaria zerado
  const log = escala === 'log'
  const amostrados = a.grupos.reduce((s, g) => s + g.dados.length, 0)

  return (
    <div className="grade-cartoes">
      <Etapa numero="1" titulo="Localização" />

      <CartaoMapa dados={eventos.itens} chave={`${filtros.regiao}-${eventos.total}`} />

      <Cartao largo titulo="Terremotos por país" subtitulo={`Top ${TOP_PAISES}`}>
        <BarrasHorizontais dados={a.porPais} rotuloValor="Terremotos" formatar={formatarInteiro} larguraRotulo={140}
          extras={(d) => [['Magnitude média', formatarNumero(d.magnitude_media)]]} />
      </Cartao>

      <Etapa numero="2" titulo="Magnitude" />

      <Cartao largo titulo="Terremotos por magnitude mínima"
        controles={<Seletor rotulo="Escala" valor={escala} opcoes={ESCALAS} aoMudar={setEscala} />}>
        <Barras dados={a.raridade.map((x) => ({ nome: `≥ ${formatarNumero(x.limite)}`, valor: x.total }))} log={log} />
      </Cartao>

      <Cartao largo titulo="Casos positivos por magnitude-alvo e tamanho do quadrado"
        subtitulo={`% de quadrados × períodos de 30 dias com terremoto ≥ alvo · em destaque: configuração atual do modelo (${formatarNumero(ATUAL.tamanho)}°, M ≥ ${formatarNumero(ATUAL.alvo)})`}>
        {positivos.erro && <Aviso tipo="erro">{positivos.erro}</Aviso>}
        {positivos.dados && <TabelaPositivos linhas={positivos.dados} />}
        {!positivos.dados && !positivos.erro && <Carregando />}
      </Cartao>

      {!semTsunami && (
        <Cartao titulo="Mensagem de tsunami por magnitude" subtitulo="% de terremotos com mensagem de tsunami do USGS">
          <Barras dados={a.tsunami} rotuloValor="Com mensagem" formatar={(v) => formatarPorcentagem(v)} />
        </Cartao>
      )}

      <Cartao largo={semTsunami} titulo="Terremotos por faixa de profundidade"
        subtitulo={`Raso: até 70 km · intermediário: 70 a 300 km · profundo: mais de 300 km · ${formatarPorcentagem(a.profundidade10, 0)} com profundidade de exatamente 10 km (valor-padrão do USGS)`}>
        {porProfundidade.dados ? (
          <Rosca dados={porProfundidade.dados.map((d) => ({ nome: d.faixa, valor: d.total }))} />
        ) : <Carregando />}
      </Cartao>

      <Etapa numero="3" titulo="Tempo" />

      <Cartao largo titulo="Terremotos por mês" subtitulo="Meses incompletos no início e no fim da base excluídos">
        {meses ? (
          <Linha dados={meses} chaveX="mes" chaveY="total" rotuloY="Terremotos" formatarX={formatarMes} />
        ) : <Carregando />}
      </Cartao>

      <Cartao largo titulo="Poder de previsão por janela de histórico"
        subtitulo={`AUC de cada feature sozinha para prever M ≥ ${formatarNumero(ATUAL.alvo)} no período seguinte · 0,5 = chute, 1 = perfeito`}>
        {janelas.erro && <Aviso tipo="erro">{janelas.erro}</Aviso>}
        {janelas.dados?.length === 0 && <Aviso>Dados insuficientes para montar a tabela do modelo.</Aviso>}
        {janelas.dados?.length > 0 && (
          <BarrasHorizontais dados={janelas.dados.map((j) => ({ nome: rotulo(j.feature), valor: j.auc }))}
            rotuloValor="AUC" formatar={(v) => formatarNumero(v, 2)} larguraRotulo={240} dominio={[0.5, 1]} />
        )}
        {!janelas.dados && !janelas.erro && <Carregando />}
      </Cartao>

      <details className="mais-graficos">
        <summary>Mais gráficos (5)</summary>
        <div className="grade-cartoes">
          <Cartao largo titulo="Correlação entre as variáveis" subtitulo="Correlação de Pearson">
            <MatrizCorrelacao colunas={CAMPOS_CORRELACAO.map((chave) => ({ chave, rotulo: rotulo(chave) }))} valores={a.correlacao} />
          </Cartao>

          <Cartao titulo="Terremotos por região sísmica">
            <BarrasHorizontais dados={a.regioes.map((g) => ({ ...g, valor: g.total }))} rotuloValor="Terremotos" formatar={formatarInteiro} larguraRotulo={250}
              extras={(d) => [['Parcela do total', formatarPorcentagem(d.parcela)], ['Magnitude média', formatarNumero(d.magnitude_media)], ['Magnitude máxima', formatarNumero(d.magnitude_maxima)]]} />
          </Cartao>

          <Cartao titulo="Magnitude por país" subtitulo={`${a.magnitude.length} maiores magnitudes médias · mínimo de 5 eventos`}>
            <BarrasDuplasHorizontais dados={a.magnitude}
              series={[{ chave: 'magnitude_media', rotulo: 'Magnitude média' }, { chave: 'magnitude_maxima', rotulo: 'Magnitude máxima' }]}
              extras={(d) => [['Terremotos', formatarInteiro(d.total)]]} />
          </Cartao>

          {pers.length > 0 && (
            <Cartao largo titulo="Chance de terremoto forte após mês ativo e após mês quieto"
              subtitulo={`${formatarInteiro(pers[0].regioes)} quadrados de 1° × 1° · ${formatarInteiro(pers[0].periodos)} períodos de 30 dias · média de ${formatarInteiro(pers[0].comparadas)} quadrados, cada um comparado com ele mesmo`}>
              <BarrasDuplasHorizontais larguraRotulo={150}
                dados={pers.map((x) => ({ nome: `Forte: M ≥ ${formatarNumero(x.limite)}`, ...x }))}
                series={[
                  { chave: 'depoisDeAtiva', rotulo: 'Após mês com terremoto' },
                  { chave: 'depoisDeInativa', rotulo: 'Após mês sem terremoto' },
                ]}
                formatar={pct}
                extras={(d) => [['Chance multiplicada por', vezes(d.vezes)]]} />

              <div className="tabela-rolagem">
                <table>
                  <thead>
                    <tr><th>Terremoto forte</th><th>Comparação</th><th>Após mês ativo</th><th>Após mês quieto</th><th>Razão</th></tr>
                  </thead>
                  <tbody>
                    {pers.flatMap((x) => [
                      <tr key={`${x.limite}-m`}>
                        <td rowSpan={2}>M ≥ {formatarNumero(x.limite)}</td>
                        <td>Mesmo quadrado</td>
                        <td className="num">{pct(x.depoisDeAtiva)}</td>
                        <td className="num">{pct(x.depoisDeInativa)}</td>
                        <td className="num">{vezes(x.vezes)}</td>
                      </tr>,
                      <tr key={`${x.limite}-j`}>
                        <td>Todos juntos</td>
                        <td className="num">{pct(x.ingenuaAtiva)} ({formatarInteiro(x.fortesAtiva)} de {formatarInteiro(x.casosAtiva)})</td>
                        <td className="num">{pct(x.ingenuaInativa)} ({formatarInteiro(x.fortesInativa)} de {formatarInteiro(x.casosInativa)})</td>
                        <td className="num">{vezes(x.vezesIngenua)}</td>
                      </tr>,
                    ])}
                  </tbody>
                </table>
              </div>

              {p45 && p45.vezes && (
                <p className="texto-explicacao">
                  M ≥ 4,5: {vezes(p45.vezes)} no mesmo quadrado, contra {vezes(p45.vezesIngenua)} com todos os quadrados juntos.
                </p>
              )}
            </Cartao>
          )}

          <Cartao largo titulo="Profundidade × magnitude por região sísmica"
            subtitulo={amostrados >= MAX_PONTOS ? `Amostra de ${formatarInteiro(MAX_PONTOS)} terremotos` : `${formatarInteiro(amostrados)} terremotos`}>
            <DispersaoPorGrupo grupos={a.grupos} x="magnitude" y="profundidade_km" outros={OUTROS}
              rotuloX={rotulo('magnitude')} rotuloY={rotulo('profundidade_km')} inverterY />
          </Cartao>
        </div>
      </details>
    </div>
  )
}

// Linhas: magnitude-alvo · colunas: tamanho do quadrado
function TabelaPositivos({ linhas }) {
  if (!linhas.length) return <Aviso>Dados insuficientes para montar a tabela do modelo.</Aviso>
  const tamanhos = [...new Set(linhas.map((l) => l.tamanho_celula))]
  const alvos = [...new Set(linhas.map((l) => l.magnitude_alvo))]
  const celula = (tamanho, alvo) => linhas.find((l) => l.tamanho_celula === tamanho && l.magnitude_alvo === alvo)
  return (
    <div className="tabela-rolagem">
      <table>
        <thead>
          <tr><th>Alvo</th>{tamanhos.map((t) => <th key={t} className="num">Quadrado de {formatarNumero(t)}°</th>)}</tr>
        </thead>
        <tbody>
          {alvos.map((alvo) => (
            <tr key={alvo}>
              <td>M ≥ {formatarNumero(alvo)}</td>
              {tamanhos.map((t) => {
                const c = celula(t, alvo)
                return (
                  <td key={t} className={`num${t === ATUAL.tamanho && alvo === ATUAL.alvo ? ' atual' : ''}`}>
                    {pct(c.taxa)} ({formatarInteiro(c.positivos)} de {formatarInteiro(c.linhas)})
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
