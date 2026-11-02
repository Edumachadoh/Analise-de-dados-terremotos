// Tela 1: análise exploratória, a etapa que vem antes do ML. Os totais e as séries por mês vêm das
// estatísticas do back (GET /api/estatisticas/...); o resto é calculado aqui, a partir de todos os
// terremotos filtrados. Cada gráfico responde a uma pergunta e termina com a conclusão que justifica
// uma escolha do modelo (backend/api/services/ml.py). Todos os números respeitam os filtros da barra lateral.

import { useMemo } from 'react'
import { api } from '../api/index.js'
import { Aviso, Cabecalho, Carregando, Conclusao, Cartao, Etapa, Metrica } from '../componentes/comuns.jsx'
import { quantosFiltros } from '../componentes/Filtros.jsx'
import { Barras, BarrasDuplasHorizontais, BarrasHorizontais, DispersaoPorGrupo, Linha, MatrizCorrelacao, Rosca } from '../componentes/graficos.jsx'
import { concentracaoPorRegiao, MAG_COMPLETA, persistenciaMensal, raridadePorMagnitude, resumoMensal, soCompletos } from '../lib/analise.js'
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
const MAG = formatarNumero(MAG_COMPLETA)

const lista = (nomes) => (nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : nomes[0])
const pct = (v) => formatarPorcentagem(v, v < 0.01 ? 2 : 1)

function forca(r) {
  const a = Math.abs(r)
  return a < 0.1 ? 'praticamente nenhuma' : a < 0.3 ? 'fraca' : a < 0.7 ? 'moderada' : 'forte'
}

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

  const a = useMemo(() => {
    if (!eventos.completo) return null
    const itens = eventos.itens
    // Países comparados só com terremotos de 4,5 ou mais: abaixo disso o USGS registra muito mais em uns países que em outros
    const paises = estatisticasPorPais(soCompletos(itens))
    const top = (campo) => [...paises].sort((x, y) => y[campo] - x[campo]).slice(0, TOP_PAISES)

    // Dispersão: os países com mais eventos ganham cor própria, o resto vira "Outros"
    const principais = top('total').slice(0, PAISES_DISPERSAO).map((p) => p.pais)
    const grupos = new Map([...principais, OUTROS].map((nome) => [nome, []]))
    for (const t of amostrar(itens, MAX_PONTOS)) {
      const pais = paisDe(t.local)
      grupos.get(grupos.has(pais) ? pais : OUTROS).push(t)
    }

    return {
      total: itens.length,
      completos: soCompletos(itens).length,
      magnitude: top('magnitude_media').map((p) => ({ nome: p.pais, ...p })),
      porPais: top('total').map((p) => ({ nome: p.pais, valor: p.total, ...p })),
      profundidade: top('profundidade_media').map((p) => ({ nome: p.pais, valor: p.profundidade_media, ...p })),
      grupos: [...grupos].map(([nome, dados]) => ({ nome, dados })).filter((g) => g.dados.length),
      tsunami: tsunamiPorMagnitude(itens),
      correlacao: matrizCorrelacao(itens, CAMPOS_CORRELACAO),
      raridade: raridadePorMagnitude(itens),
      concentracao: concentracaoPorRegiao(itens),
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

  const totalEMaxima = (d) => [['Terremotos', formatarInteiro(d.total)], ['Magnitude máxima', formatarNumero(d.magnitude_maxima)]]
  const mensal = resumoMensal(porMes.dados)
  const raso = porProfundidade.dados?.find((d) => d.faixa.toLowerCase().startsWith('raso'))
  const totalProf = porProfundidade.dados?.reduce((s, d) => s + d.total, 0)

  const c5 = a.concentracao.pontos.find((p) => p.fracao === 0.05)
  const c1 = a.concentracao.pontos.find((p) => p.fracao === 0.01)
  const topPaises = a.porPais.slice(0, 3)
  const parcelaTop = topPaises.reduce((s, p) => s + p.total, 0) / (a.completos || 1)

  const fortes = a.raridade.find((x) => x.limite === 6)
  const base = a.raridade[0]
  const passo = a.raridade.length > 1 ? a.raridade[0].total / a.raridade[1].total : null

  const pers = a.persistencia
  const p45 = pers.find((x) => x.limite === 4.5)
  const p6 = pers.find((x) => x.limite === 6)

  const corMag = a.correlacao[0].slice(1).filter((v) => v != null)
  const maiorCorMag = corMag.length ? Math.max(...corMag.map(Math.abs)) : null
  const rProf = a.correlacao[0][1]
  const alto = a.tsunami.at(-1)

  return (
    <div className="grade-cartoes">
      <div style={{ gridColumn: '1 / -1' }}><Aviso>
        Antes de treinar qualquer modelo, fazemos quatro perguntas aos dados. A resposta de cada uma justifica uma
        escolha do ML (veja o resumo no fim da página). As comparações entre regiões usam só terremotos de
        magnitude {MAG} ou mais, porque abaixo disso o USGS registra muito mais em uns países do que em outros.
      </Aviso></div>

      <Etapa numero="1" titulo="Onde os terremotos acontecem?" pergunta="Se forem espalhados por igual, não há o que prever. Se forem concentrados, a localização já é uma pista." />

      <Cartao titulo="Concentração por região" subtitulo={`O mundo foi dividido em ${formatarInteiro(a.concentracao.regioes)} regiões de 1° × 1° (uns 110 km) com terremotos de ${MAG}+. Quanto dos terremotos cabe nas regiões mais ativas?`}>
        <Barras dados={a.concentracao.pontos.map((p) => ({ nome: `${formatarPorcentagem(p.fracao, 0)} mais ativas`, valor: p.parcela }))}
          rotuloValor="Parcela dos terremotos" formatar={(v) => formatarPorcentagem(v, 0)} />
        {c1 && c5 && (
          <Conclusao>
            {formatarPorcentagem(c1.fracao, 0)} das regiões ({formatarInteiro(c1.regioes)}) concentram {formatarPorcentagem(c1.parcela, 0)} dos
            terremotos, e {formatarPorcentagem(c5.fracao, 0)} concentram {formatarPorcentagem(c5.parcela, 0)}. Os terremotos não se espalham por
            igual: acontecem nas mesmas zonas, ano após ano. Por isso o modelo usa a posição da região e o histórico dela.
          </Conclusao>
        )}
      </Cartao>

      <Cartao titulo="Terremotos por país" subtitulo={`Os países com mais registros de magnitude ${MAG}+`}>
        <BarrasHorizontais dados={a.porPais} rotuloValor="Terremotos" formatar={formatarInteiro} larguraRotulo={140}
          extras={(d) => [['Magnitude média', formatarNumero(d.magnitude_media)]]} />
        {topPaises.length >= 3 && (
          <Conclusao>
            {lista(topPaises.map((p) => p.pais))} somam {formatarPorcentagem(parcelaTop, 0)} dos terremotos {MAG}+. Países
            são só um jeito de ler a mesma concentração: o ML trabalha com regiões menores, que separam melhor o risco.
          </Conclusao>
        )}
      </Cartao>

      <Etapa numero="2" titulo="Quão fortes e quão raros são?" pergunta="Terremoto forte é exceção. Isso decide como medimos se o modelo acerta." />

      <Cartao titulo="Quantos terremotos passam de cada magnitude" subtitulo="Escala logarítmica: cada marca do eixo vertical vale 10 vezes a anterior">
        <Barras dados={a.raridade.map((x) => ({ nome: `≥ ${formatarNumero(x.limite)}`, valor: x.total }))} log />
        {passo && (
          <Conclusao>
            A cada 0,5 de magnitude a mais, há cerca de {formatarNumero(passo, 1)} vezes menos terremotos
            {fortes && base && <> (só {pct(fortes.total / base.total)} dos terremotos {MAG}+ chegam a 6)</>}. Terremoto forte é raro, então o alvo do ML
            é muito desbalanceado: um modelo que sempre responde “não vai ter” acertaria quase tudo e não serviria para nada. Por isso
            avaliamos com ROC AUC e precisão média e comparamos com uma referência simples, e não com a acurácia.
          </Conclusao>
        )}
      </Cartao>

      <Cartao titulo="Alerta de tsunami por magnitude" subtitulo="Porcentagem dos terremotos de cada faixa que tiveram alerta de tsunami">
        <Barras dados={a.tsunami} rotuloValor="Com alerta" formatar={(v) => formatarPorcentagem(v)} />
        {alto && (
          <Conclusao>
            Entre os terremotos da faixa {alto.nome}, {formatarPorcentagem(alto.valor, 0)} geraram alerta de tsunami; nas faixas menores o alerta é
            raro. Prever os fortes é o que mais importa na prática: são eles que causam danos.
          </Conclusao>
        )}
      </Cartao>

      <Cartao largo titulo="Magnitude por país"
        subtitulo={`Os ${a.magnitude.length} países com maior magnitude média (mínimo de 5 eventos de ${MAG}+)`}>
        <BarrasDuplasHorizontais dados={a.magnitude}
          series={[{ chave: 'magnitude_media', rotulo: 'Magnitude média' }, { chave: 'magnitude_maxima', rotulo: 'Magnitude máxima' }]}
          extras={(d) => [['Terremotos', formatarInteiro(d.total)]]} />
        {a.magnitude.length > 0 && (
          <Conclusao>
            A magnitude média quase não muda entre os países (de {formatarNumero(Math.min(...a.magnitude.map((p) => p.magnitude_media)))} a {formatarNumero(a.magnitude[0].magnitude_media)}),
            enquanto a máxima varia bastante, de acordo com o maior evento de cada região no período. O que diferencia as regiões é a
            frequência dos terremotos, não o tamanho típico deles. Por isso o ML prevê a chance de haver um terremoto forte, não a magnitude.
          </Conclusao>
        )}
      </Cartao>

      <Cartao titulo="Terremotos por faixa de profundidade" subtitulo="Raso: até 70 km · intermediário: 70 a 300 km · profundo: mais de 300 km">
        {porProfundidade.dados ? (
          <>
            <Rosca dados={porProfundidade.dados.map((d) => ({ nome: d.faixa, valor: d.total }))} />
            {raso && totalProf > 0 && (
              <Conclusao>
                {formatarPorcentagem(raso.total / totalProf, 0)} dos terremotos são rasos. Os rasos são os que mais atingem a superfície, e a
                profundidade depende do tipo de falha, por isso ela varia de uma região para outra.
              </Conclusao>
            )}
          </>
        ) : <Carregando />}
      </Cartao>

      <Cartao titulo="Profundidade média por país" subtitulo={`Onde os terremotos acontecem mais fundo (km) · ${MAG}+`}>
        <BarrasHorizontais dados={a.profundidade} rotuloValor="Profundidade média (km)" larguraRotulo={140} extras={totalEMaxima} />
        {a.profundidade.length > 0 && (
          <Conclusao>
            A profundidade muda muito entre países (de {formatarNumero(Math.min(...a.profundidade.map((p) => p.valor)))} a {formatarNumero(a.profundidade[0].valor)} km
            de média): é uma característica da região, ligada ao tipo de falha geológica dela, e não do momento.
          </Conclusao>
        )}
      </Cartao>

      <Etapa numero="3" titulo="Como isso muda no tempo?" pergunta="Se o que aconteceu no mês passado ajuda a prever o próximo, o modelo pode aprender com o histórico." />

      <Cartao largo titulo="Terremotos por mês" subtitulo="Quantidade de eventos registrados em cada mês">
        {porMes.dados ? (
          <>
            <Linha dados={porMes.dados} chaveX="mes" chaveY="total" rotuloY="Terremotos" formatarX={formatarMes} />
            {mensal && mensal.meses > 1 && (
              <Conclusao>
                Em média há {formatarInteiro(Math.round(mensal.media))} terremotos por mês, mas o mês mais ativo ({formatarMes(mensal.pico.mes)}) teve {formatarInteiro(mensal.pico.total)},
                {' '}{formatarNumero(mensal.vezes, 1)} vezes a média. Picos assim costumam vir de um terremoto muito forte seguido de réplicas: a atividade
                se agrupa no tempo. Por isso o ML divide o tempo em períodos de 30 dias e treina no passado para testar no futuro,
                sem embaralhar os dados.
              </Conclusao>
            )}
          </>
        ) : <Carregando />}
      </Cartao>

      {pers.length > 0 && (
        <Cartao largo titulo="Região ativa no mês anterior: o mês seguinte é mais perigoso?"
          subtitulo={`Chance de haver um terremoto forte em uma região (célula de 1° × 1°) no mês seguinte, conforme ela teve ou não um terremoto de ${MAG}+ no mês anterior`}>
          <BarrasDuplasHorizontais larguraRotulo={150}
            dados={pers.map((x) => ({ nome: `Forte: M ≥ ${formatarNumero(x.limite)}`, ...x }))}
            series={[
              { chave: 'depoisDeAtiva', rotulo: 'Região com terremoto no mês anterior' },
              { chave: 'depoisDeInativa', rotulo: 'Região sem terremoto no mês anterior' },
            ]}
            formatar={pct}
            extras={(d) => [['Chance multiplicada por', d.vezes ? `${formatarNumero(d.vezes, 1)}×` : '—']]} />
          {p45 && p45.vezes && (
            <Conclusao>
              Em regiões que tiveram terremoto no mês anterior, a chance de um de magnitude {MAG}+ no mês seguinte é de {pct(p45.depoisDeAtiva)}, contra {pct(p45.depoisDeInativa)} nas
              que ficaram quietas: {formatarNumero(p45.vezes, 1)} vezes mais{p6 && p6.vezes ? `. Para os de magnitude 6+ a diferença é parecida (${formatarNumero(p6.vezes, 1)}×), mas a chance é pequena em ambos os casos` : ''}.
              É o sinal mais importante da análise: <strong>o passado recente da região ajuda a prever o futuro</strong>, e é por isso que o ML recebe as contagens
              do período anterior, dos últimos 3 e dos últimos 12 períodos.
            </Conclusao>
          )}
        </Cartao>
      )}

      <Etapa numero="4" titulo="Alguma medida ajuda a prever a magnitude?" pergunta="Só serve para prever uma medida que já se conhece antes do terremoto. As que só existem depois dele não ajudam." />

      <Cartao largo titulo="Profundidade × magnitude por país"
        subtitulo={`Cada ponto é um terremoto${a.grupos.reduce((s, g) => s + g.dados.length, 0) >= MAX_PONTOS ? ` (amostra de ${formatarInteiro(MAX_PONTOS)})` : ''} · a profundidade cresce para baixo`}>
        <DispersaoPorGrupo grupos={a.grupos} x="magnitude" y="profundidade_km" outros={OUTROS}
          rotuloX={rotulo('magnitude')} rotuloY={rotulo('profundidade_km')} inverterY />
        {rProf != null && (
          <Conclusao>
            Os pontos formam uma nuvem, sem linha nem curva: a relação entre profundidade e magnitude é {forca(rProf)} (correlação de {formatarNumero(rProf, 2)}).
            Saber a profundidade de um terremoto não diz o tamanho dele.
          </Conclusao>
        )}
      </Cartao>

      <Cartao largo titulo="Relação entre as variáveis"
        subtitulo="Correlação de Pearson, de -1 a 1: mostra o quanto duas medidas variam juntas (não prova que uma causa a outra)">
        <MatrizCorrelacao colunas={CAMPOS_CORRELACAO.map((chave) => ({ chave, rotulo: rotulo(chave) }))} valores={a.correlacao} />
        {maiorCorMag != null && (
          <Conclusao>
            A maior correlação da magnitude com outra medida é {formatarNumero(maiorCorMag, 2)} ({forca(maiorCorMag)}). As medidas que se relacionam com ela, como a
            significância (que é calculada a partir da magnitude), as estações que registraram o evento e o erro do ajuste, só existem depois que o terremoto
            aconteceu, então não servem para prever o próximo. Por isso o modelo não usa essas medidas: usa posição e histórico da região, que
            já se conhecem antes do terremoto.
          </Conclusao>
        )}
      </Cartao>

      <Cartao largo titulo="O que levamos para o modelo de ML">
        <ol className="ponte-ml">
          <li><strong>Posição e taxa histórica da região</strong>, porque os terremotos se concentram nas mesmas zonas{c5 && ` (${formatarPorcentagem(c5.fracao, 0)} das regiões têm ${formatarPorcentagem(c5.parcela, 0)} dos terremotos)`}.</li>
          <li><strong>Contagens dos últimos 1, 3 e 12 períodos de 30 dias</strong>, porque{p45?.vezes ? ` uma região ativa tem ${formatarNumero(p45.vezes, 1)}× mais chance de um novo terremoto` : ' o passado recente aponta o futuro'}.</li>
          <li><strong>Alvo “vai haver terremoto forte na região nos próximos 30 dias”</strong>, e não a magnitude, porque as medidas que se relacionam com a magnitude só existem depois do terremoto.</li>
          <li><strong>Métricas que ignoram o desbalanceamento</strong> (ROC AUC, precisão média) e uma <strong>referência simples</strong> (repetir a taxa histórica), porque o evento forte é raro.</li>
          <li><strong>Treino no passado e teste nos últimos períodos</strong>, porque a atividade se agrupa no tempo e embaralhar os dados vazaria informação do futuro.</li>
        </ol>
      </Cartao>
    </div>
  )
}
