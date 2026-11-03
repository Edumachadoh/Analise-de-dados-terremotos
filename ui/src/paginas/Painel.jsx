// Tela 1: análise exploratória, a etapa que vem antes do ML. Os totais e as séries por mês vêm das
// estatísticas do back (GET /api/estatisticas/...); o resto é calculado aqui, a partir de todos os
// terremotos filtrados, com todas as magnitudes. Cada gráfico responde a uma pergunta que justifica
// uma escolha do modelo (backend/api/services/ml.py). Todos os números respeitam os filtros da barra lateral.

import { useMemo, useState } from 'react'
import { api } from '../api/index.js'
import { Aviso, Cabecalho, Carregando, Cartao, Etapa, Metrica, Seletor } from '../componentes/comuns.jsx'
import { quantosFiltros } from '../componentes/Filtros.jsx'
import { Barras, BarrasDuplasHorizontais, BarrasHorizontais, DispersaoPorGrupo, Linha, MatrizCorrelacao, Rosca } from '../componentes/graficos.jsx'
import { persistenciaMensal, raridadePorMagnitude } from '../lib/analise.js'
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
const CAMPOS_CORRELACAO = ['magnitude', 'profundidade_km', 'significancia', 'estacoes', 'lacuna_azimutal', 'rms']
const ESCALAS = [['log', 'Logarítmica'], ['linear', 'Quantidade']]

const pct = (v) => formatarPorcentagem(v, v < 0.01 ? 2 : 1)

export default function Painel({ filtros, versaoBase }) {
  const resumo = useCarregar(() => api.resumo(filtros), [filtros, versaoBase])

  const n = quantosFiltros(filtros)
  const r = resumo.dados

  return (
    <>
      <Cabecalho titulo="Painel">
        Análise dos dados antes do ML · terremotos registrados pelo USGS{n > 0 && ` · ${n} filtro${n > 1 ? 's' : ''} aplicado${n > 1 ? 's' : ''}`}
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

          <Analise filtros={filtros} versaoBase={versaoBase} />
        </>
      )}

      {!r && !resumo.erro && <Carregando />}
    </>
  )
}

// Fica separada do resto do Painel: precisa de todos os terremotos, e enquanto as páginas chegam
// só estes cartões são redesenhados.
function Analise({ filtros, versaoBase }) {
  const eventos = useTodosTerremotos(filtros, versaoBase)
  const porMes = useCarregar(() => api.porMes(filtros), [filtros, versaoBase])
  const porProfundidade = useCarregar(() => api.porProfundidade(filtros), [filtros, versaoBase])
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
  const semTsunami = filtros.tsunami === 'false' // sem alerta nenhum, o gráfico de tsunami ficaria zerado
  const log = escala === 'log'

  return (
    <div className="grade-cartoes">
      <Cartao largo titulo="Relação entre as variáveis"
        subtitulo="Correlação de Pearson, de -1 a 1: mostra o quanto duas medidas variam juntas">
        <MatrizCorrelacao colunas={CAMPOS_CORRELACAO.map((chave) => ({ chave, rotulo: rotulo(chave) }))} valores={a.correlacao} />
      </Cartao>

      <Etapa numero="1" titulo="Onde os terremotos acontecem?" pergunta="Se forem espalhados por igual, não há o que prever. Se forem concentrados, a localização já é uma pista." />

      <Cartao titulo="Terremotos por região sísmica"
        subtitulo="Zonas do planeta onde as placas tectônicas se encontram (todas as magnitudes)">
        <BarrasHorizontais dados={a.regioes.map((g) => ({ ...g, valor: g.total }))} rotuloValor="Terremotos" formatar={formatarInteiro} larguraRotulo={250}
          extras={(d) => [['Parcela do total', formatarPorcentagem(d.parcela)], ['Magnitude média', formatarNumero(d.magnitude_media)], ['Magnitude máxima', formatarNumero(d.magnitude_maxima)]]} />
      </Cartao>

      <Cartao titulo="Terremotos por país" subtitulo="Os países com mais registros (todas as magnitudes)">
        <BarrasHorizontais dados={a.porPais} rotuloValor="Terremotos" formatar={formatarInteiro} larguraRotulo={140}
          extras={(d) => [['Magnitude média', formatarNumero(d.magnitude_media)]]} />
      </Cartao>

      <Cartao largo titulo="Magnitude por país"
        subtitulo={`Os ${a.magnitude.length} países com maior magnitude média (mínimo de 5 eventos)`}>
        <BarrasDuplasHorizontais dados={a.magnitude}
          series={[{ chave: 'magnitude_media', rotulo: 'Magnitude média' }, { chave: 'magnitude_maxima', rotulo: 'Magnitude máxima' }]}
          extras={(d) => [['Terremotos', formatarInteiro(d.total)]]} />
      </Cartao>

      <Etapa numero="2" titulo="Quão fortes e quão raros são?" pergunta="Terremoto forte é exceção. Isso decide como medimos se o modelo acerta." />

      <Cartao largo titulo="Quantos terremotos passam de cada magnitude"
        subtitulo={log
          ? 'Escala logarítmica: cada marca do eixo vertical vale 10 vezes a anterior. Usamos porque os terremotos fortes são tão poucos que, em quantidade, as barras deles não apareceriam.'
          : 'Em quantidade: as barras dos terremotos mais fortes ficam quase invisíveis perto das dos fracos. Troque para a escala logarítmica para compará-las.'}
        controles={<Seletor rotulo="Escala" valor={escala} opcoes={ESCALAS} aoMudar={setEscala} />}>
        <Barras dados={a.raridade.map((x) => ({ nome: `≥ ${formatarNumero(x.limite)}`, valor: x.total }))} log={log} />
      </Cartao>

      {!semTsunami && (
        <Cartao titulo="Alerta de tsunami por magnitude" subtitulo="Porcentagem dos terremotos de cada faixa que tiveram alerta de tsunami">
          <Barras dados={a.tsunami} rotuloValor="Com alerta" formatar={(v) => formatarPorcentagem(v)} />
        </Cartao>
      )}

      <Cartao largo={semTsunami} titulo="Terremotos por faixa de profundidade" subtitulo="Raso: até 70 km · intermediário: 70 a 300 km · profundo: mais de 300 km">
        {porProfundidade.dados ? (
          <Rosca dados={porProfundidade.dados.map((d) => ({ nome: d.faixa, valor: d.total }))} />
        ) : <Carregando />}
      </Cartao>

      <Etapa numero="3" titulo="Como isso muda no tempo?" pergunta="Se o que aconteceu no mês passado ajuda a prever o próximo, o modelo pode aprender com o histórico." />

      <Cartao largo titulo="Terremotos por mês" subtitulo="Quantidade de eventos registrados em cada mês">
        {porMes.dados ? (
          <Linha dados={porMes.dados} chaveX="mes" chaveY="total" rotuloY="Terremotos" formatarX={formatarMes} />
        ) : <Carregando />}
      </Cartao>

      {pers.length > 0 && (
        <Cartao largo titulo="Região ativa no mês anterior: o mês seguinte é mais perigoso?"
          subtitulo="Chance de haver um terremoto forte em uma região no mês seguinte, conforme ela teve ou não algum terremoto no mês anterior">
          <BarrasDuplasHorizontais larguraRotulo={150}
            dados={pers.map((x) => ({ nome: `Forte: M ≥ ${formatarNumero(x.limite)}`, ...x }))}
            series={[
              { chave: 'depoisDeAtiva', rotulo: 'Região com terremoto no mês anterior' },
              { chave: 'depoisDeInativa', rotulo: 'Região sem terremoto no mês anterior' },
            ]}
            formatar={pct}
            extras={(d) => [['Chance multiplicada por', d.vezes ? `${formatarNumero(d.vezes, 1)}×` : '—']]} />

          <ol className="passos">
            <li><strong>Regiões:</strong> o mundo é dividido em quadrados de 1° × 1° (uns 110 km de lado). Entram os {formatarInteiro(pers[0].regioes)} quadrados que tiveram algum terremoto.</li>
            <li><strong>Meses:</strong> o tempo é dividido em {formatarInteiro(pers[0].periodos)} períodos de 30 dias.</li>
            <li><strong>Casos:</strong> cada quadrado em cada mês é um caso. Olhamos o mês anterior dele: se houve algum terremoto, o caso é de “região ativa”; se não, de “região quieta”.</li>
            <li><strong>Chance:</strong> em cada grupo, contamos em quantos casos houve um terremoto forte no mês seguinte. Chance = casos com terremoto forte ÷ total de casos do grupo.</li>
            <li><strong>Comparação:</strong> dividindo a chance da região ativa pela da região quieta, vemos quantas vezes o histórico recente aumenta o risco.</li>
          </ol>

          <div className="tabela-rolagem">
            <table>
              <thead>
                <tr><th>Terremoto forte</th><th>Grupo</th><th>Casos</th><th>Com terremoto forte</th><th>Chance</th><th>Risco da região ativa</th></tr>
              </thead>
              <tbody>
                {pers.flatMap((x) => [
                  <tr key={`${x.limite}-a`}>
                    <td rowSpan={2}>M ≥ {formatarNumero(x.limite)}</td>
                    <td>Região ativa</td>
                    <td className="num">{formatarInteiro(x.casosAtiva)}</td>
                    <td className="num">{formatarInteiro(x.fortesAtiva)}</td>
                    <td className="num">{pct(x.depoisDeAtiva)}</td>
                    <td rowSpan={2} className="num">{x.vezes ? `${formatarNumero(x.vezes, 1)}× maior` : '—'}</td>
                  </tr>,
                  <tr key={`${x.limite}-i`}>
                    <td>Região quieta</td>
                    <td className="num">{formatarInteiro(x.casosInativa)}</td>
                    <td className="num">{formatarInteiro(x.fortesInativa)}</td>
                    <td className="num">{pct(x.depoisDeInativa)}</td>
                  </tr>,
                ])}
              </tbody>
            </table>
          </div>

          {p45 && (
            <p className="texto-explicacao">
              Exemplo (M ≥ 4,5): de {formatarInteiro(p45.casosAtiva)} casos de região ativa, {formatarInteiro(p45.fortesAtiva)} tiveram um terremoto forte no mês seguinte ({pct(p45.depoisDeAtiva)}).
              Entre {formatarInteiro(p45.casosInativa)} casos de região quieta, foram {formatarInteiro(p45.fortesInativa)} ({pct(p45.depoisDeInativa)}).
            </p>
          )}
        </Cartao>
      )}

      <Etapa numero="4" titulo="A profundidade ajuda a explicar a magnitude?" pergunta="Cada região sísmica tem um padrão próprio de profundidade e magnitude?" />

      <Cartao largo titulo="Profundidade × magnitude por região sísmica"
        subtitulo={`Cada ponto é um terremoto${a.grupos.reduce((s, g) => s + g.dados.length, 0) >= MAX_PONTOS ? ` (amostra de ${formatarInteiro(MAX_PONTOS)})` : ''} · a profundidade cresce para baixo`}>
        <DispersaoPorGrupo grupos={a.grupos} x="magnitude" y="profundidade_km" outros={OUTROS}
          rotuloX={rotulo('magnitude')} rotuloY={rotulo('profundidade_km')} inverterY />
      </Cartao>
    </div>
  )
}
