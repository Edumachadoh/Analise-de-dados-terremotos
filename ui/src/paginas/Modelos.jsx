// Treinar modelos de previsão, ver a localidade mais provável da região em análise, comparar com o
// baseline e escolher o modelo ativo (GET /api/modelos/algoritmos/, GET/POST /api/modelos/,
// POST /api/modelos/{id}/ativar/, DELETE /api/modelos/{id}/, GET /api/previsoes/)

import { useEffect, useState } from 'react'
import { Rectangle, Tooltip } from 'react-leaflet'
import { api } from '../api/index.js'
import { Aviso, Cabecalho, Carregando, Cartao, Metrica, Seletor } from '../componentes/comuns.jsx'
import { BarrasHorizontais } from '../componentes/graficos.jsx'
import { MapaBase } from '../componentes/MapaBase.jsx'
import { formatarData, formatarInteiro, formatarNumero, formatarPorcentagem } from '../lib/formato.js'
import { rotulo } from '../lib/rotulos.js'
import { useCarregar } from '../lib/useCarregar.js'

// Folga em volta da localidade no mapa, em graus: só o quadrado, sem contexto, não diz onde ele fica
const FOLGA_MAPA = 6

const padroes = (algoritmo) =>
  Object.fromEntries(Object.entries(algoritmo?.parametros ?? {}).map(([nome, p]) => [nome, p.padrao ?? '']))

export default function Modelos({ regiao, codigoRegiao, versaoBase, aoMudarBase }) {
  const algoritmos = useCarregar(() => api.listarAlgoritmos(), [])
  const modelos = useCarregar(() => api.listarModelos(), [])

  const [algoritmoId, setAlgoritmoId] = useState('random_forest')
  const [parametros, setParametros] = useState({})
  const [mesesTeste, setMesesTeste] = useState(6)
  const [atualizarDados, setAtualizarDados] = useState(false)
  const [treinando, setTreinando] = useState(false)
  const [mensagem, setMensagem] = useState(null)
  const [selecionado, setSelecionado] = useState(null)

  const algoritmo = algoritmos.dados?.find((a) => a.id === algoritmoId) ?? algoritmos.dados?.[0]
  const lista = modelos.dados?.results ?? []
  const detalhe = lista.find((m) => m.id === selecionado) ?? lista.find((m) => m.ativo) ?? lista[0]

  // Quando a lista de algoritmos chega, ou o algoritmo muda, os campos voltam aos valores padrão
  useEffect(() => {
    if (algoritmo) setParametros(padroes(algoritmo))
  }, [algoritmo?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function treinar() {
    setTreinando(true)
    setMensagem(null)
    try {
      // Magnitude (> 4) e tamanho da localidade (1°, cerca de 110 km) fazem parte da pergunta: ficam nos padrões do back
      const modelo = await api.treinar({
        algoritmo: algoritmo.id,
        parametros: montarParametros(algoritmo, parametros),
        meses_teste: Number(mesesTeste),
        atualizar_dados: atualizarDados,
      })
      setSelecionado(modelo.id)
      setMensagem({ tipo: 'ok', texto: `Modelo ${modelo.algoritmo_nome} treinado e definido como ativo.` })
      if (atualizarDados) aoMudarBase()
      modelos.recarregar()
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e.message })
    } finally {
      setTreinando(false)
    }
  }

  async function ativar(modelo) {
    try {
      await api.ativarModelo(modelo.id)
      modelos.recarregar()
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e.message })
    }
  }

  async function excluir(modelo) {
    if (!window.confirm(`Excluir o modelo ${modelo.algoritmo_nome} (nº ${modelo.id})? Isso não pode ser desfeito.`)) return
    try {
      await api.excluirModelo(modelo.id)
      setSelecionado(null)
      modelos.recarregar()
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e.message })
    }
  }

  return (
    <>
      <Cabecalho titulo="Modelos">
        <strong>Nos próximos 30 dias, qual localidade tem a maior probabilidade de ter um terremoto de magnitude maior que 4?</strong><br />
        Analisando: <strong>{regiao.nome}</strong>. <br />Cada localidade é uma área de cerca de 110 × 110 km, em terra ou no mar.
      </Cabecalho>

      {api.local && (
        <Aviso>
          <strong>Sem o back-end:</strong> todos os algoritmos treinam o mesmo modelo simples (uma regressão logística rodando no navegador).
          As métricas são reais desse modelo, não do algoritmo escolhido. Os números de cada algoritmo virão do back-end.
        </Aviso>
      )}
      {algoritmos.erro && <Aviso tipo="erro">{algoritmos.erro}</Aviso>}

      <div className="modelos">
        <Cartao titulo="Treinar um modelo" subtitulo="Escolha o algoritmo">
          {!algoritmos.dados && !algoritmos.erro && <Carregando />}
          {algoritmos.dados && (
            <div className="lista-modelos">
              {algoritmos.dados.map((a) => (
                <button key={a.id} className={`opcao-modelo${a.id === algoritmo?.id ? ' ativo' : ''}`} onClick={() => setAlgoritmoId(a.id)}>
                  <strong>{a.nome}</strong>
                  <span>{a.descricao}</span>
                </button>
              ))}
            </div>
          )}
        </Cartao>

        <Cartao titulo="Parâmetros" subtitulo={algoritmo ? `Ajustes do ${algoritmo.nome}` : undefined}>
          {!algoritmos.dados && !algoritmos.erro && <Carregando />}
          {algoritmo && (
            <div className="formulario">
              <div className="linha">
                {Object.entries(algoritmo.parametros).map(([nome, p]) => (
                  <Parametro key={nome} nome={nome} definicao={p} valor={parametros[nome] ?? ''}
                    aoMudar={(v) => setParametros({ ...parametros, [nome]: v })} />
                ))}
                <label className="campo">
                  Meses de teste
                  <span className="dica-campo">
                    Quantos meses mais recentes ficam fora do treino para medir o acerto em dados que o modelo não viu.
                    Depois da avaliação, o modelo final aprende com todos os meses.
                  </span>
                  <input type="number" min="1" max="24" value={mesesTeste} onChange={(e) => setMesesTeste(e.target.value)} />
                </label>
              </div>

              <label className="check">
                <input type="checkbox" checked={atualizarDados} onChange={(e) => setAtualizarDados(e.target.checked)} />
                <span>Buscar dados novos no USGS antes de treinar (re-treino com os últimos 6 anos; pode levar alguns minutos)</span>
              </label>

              <button className="botao primario" disabled={treinando} onClick={treinar}>
                {treinando ? (atualizarDados ? 'Buscando dados e treinando…' : 'Treinando…') : 'Treinar modelo'}
              </button>
            </div>
          )}
        </Cartao>
      </div>

      <div className="coluna">
        {mensagem && <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>}

        {detalhe && <LocalidadeProvavel modelo={detalhe} regiao={regiao} codigoRegiao={codigoRegiao} versaoBase={versaoBase} />}
        {detalhe && <Detalhe modelo={detalhe} />}

        <Cartao titulo="Modelos treinados" subtitulo="O modelo ativo é o usado na aba Mapa de probabilidade">
          {modelos.erro && <Aviso tipo="erro">{modelos.erro}</Aviso>}
          {modelos.dados && lista.length === 0 && <div className="vazio">Nenhum modelo treinado ainda. Configure acima e clique em “Treinar modelo”.</div>}
          {lista.length > 0 && (
            <div className="tabela-rolagem">
              <table>
                <thead>
                  <tr><th>Nº</th><th>Algoritmo</th><th>Magnitude</th><th>Treinado em</th><th>Precisão média</th><th>vs baseline</th><th /></tr>
                </thead>
                <tbody>
                  {lista.map((m) => (
                    <tr key={m.id} style={m.id === detalhe?.id ? { background: 'var(--superficie-2)' } : undefined}>
                      <td>{m.id}</td>
                      <td>{m.algoritmo_nome} {m.ativo && <span className="etiqueta ok">ativo</span>}</td>
                      <td className="num">&gt; {formatarNumero(m.magnitude_alvo)}</td>
                      <td>{formatarData(m.treinado_em)}</td>
                      <td className="num">{formatarPorcentagem(m.metricas.precisao_media)}</td>
                      <td>{m.metricas.supera_baseline ? <span className="etiqueta ok">supera</span> : <span className="etiqueta">não supera</span>}</td>
                      <td style={{ whiteSpace: 'normal' }}>
                        <span className="controles" style={{ flexWrap: 'wrap', minWidth: 150 }}>
                          <button className="botao pequeno" onClick={() => setSelecionado(m.id)}>Detalhes</button>
                          {!m.ativo && <button className="botao pequeno" onClick={() => ativar(m)}>Ativar</button>}
                          <button className="botao pequeno" onClick={() => excluir(m)}>Excluir</button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Cartao>
      </div>
    </>
  )
}

// A resposta da pergunta para o modelo mostrado: a localidade mais provável da região em análise
function LocalidadeProvavel({ modelo, regiao, codigoRegiao, versaoBase }) {
  const { dados, erro, carregando } = useCarregar(
    () => api.previsoes({ modelo: modelo.id, regiao: codigoRegiao, limite: 1 }),
    [modelo.id, codigoRegiao, versaoBase],
  )
  const c = dados?.celulas[0]

  return (
    <Cartao titulo={`Localidade com maior probabilidade · ${regiao.nome}`}
      subtitulo={`Segundo o ${modelo.algoritmo_nome} (nº ${modelo.id})`}>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {carregando && <Carregando texto="Calculando a previsão…" />}
      {!carregando && c && (
        <>
          <MapaBase chave={`${modelo.id}-${codigoRegiao}-${c.latitude_min}-${c.longitude_min}`}
            limites={[[c.latitude_min - FOLGA_MAPA, c.longitude_min - FOLGA_MAPA], [c.latitude_max + FOLGA_MAPA, c.longitude_max + FOLGA_MAPA]]}>
            <Rectangle bounds={[[c.latitude_min, c.longitude_min], [c.latitude_max, c.longitude_max]]}
              pathOptions={{ color: '#d9480f', weight: 2, fillColor: '#d9480f', fillOpacity: 0.35 }}>
              <Tooltip sticky>
                <strong>Probabilidade: {formatarPorcentagem(c.probabilidade)}</strong><br />
                Centro: {formatarNumero(c.centro.latitude, 2)}°, {formatarNumero(c.centro.longitude, 2)}°
              </Tooltip>
            </Rectangle>
          </MapaBase>

          <div className="metricas" style={{ marginTop: 14 }}>
            <Metrica rotulo="Probabilidade" valor={formatarPorcentagem(c.probabilidade)}
              detalhe={`de magnitude > ${formatarNumero(dados.magnitude_alvo)} em 30 dias`} />
            <Metrica rotulo="Centro da localidade" valor={`${formatarNumero(c.centro.latitude, 2)}°, ${formatarNumero(c.centro.longitude, 2)}°`}
              detalhe="latitude, longitude" />
            <Metrica rotulo="Eventos em 12 meses" valor={formatarInteiro(c.eventos_ultimos_12_periodos)}
              detalhe="nesta localidade, acima da magnitude prevista" />
            <Metrica rotulo="Frequência histórica" valor={formatarPorcentagem(c.taxa_historica)}
              detalhe="dos períodos de 30 dias tiveram um evento" />
            <Metrica rotulo="Período previsto" valor={formatarData(dados.periodo_previsto.inicio)}
              detalhe={`até ${formatarData(dados.periodo_previsto.fim)}`} />
          </div>
        </>
      )}
    </Cartao>
  )
}

// Os campos de texto do formulário viram o tipo certo para a API (número, vazio = null, texto)
function montarParametros(algoritmo, valores) {
  const saida = {}
  for (const [nome, p] of Object.entries(algoritmo.parametros)) {
    const v = valores[nome]
    if (v === '' || v == null) {
      if (p.nulo) saida[nome] = null
      continue // sem valor: o back usa o padrão
    }
    saida[nome] = p.tipo === 'int' || p.tipo === 'float' ? Number(v) : v
  }
  return saida
}

function Parametro({ nome, definicao: p, valor, aoMudar }) {
  if (p.tipo === 'escolha') {
    return <Seletor rotulo={rotulo(nome)} valor={valor} opcoes={p.opcoes} aoMudar={aoMudar} inline={false} />
  }
  const numerico = p.tipo === 'int' || p.tipo === 'float'
  return (
    <label className="campo">
      {rotulo(nome)}
      <span className="dica-campo">{p.descricao}</span>
      <input type={numerico ? 'number' : 'text'} min={p.min} max={p.max} step={p.tipo === 'int' ? 1 : 'any'} value={valor}
        placeholder={p.nulo ? 'sem limite' : undefined} onChange={(e) => aoMudar(e.target.value)} />
    </label>
  )
}

function Detalhe({ modelo }) {
  const m = modelo.metricas
  const importancias = m.importancia_features
    ? Object.entries(m.importancia_features).map(([campo, valor]) => ({ nome: rotulo(campo), valor }))
    : null

  return (
    <Cartao titulo={`Resultado · ${modelo.algoritmo_nome} (nº ${modelo.id})`}
      subtitulo={`Prevê terremotos de magnitude > ${formatarNumero(modelo.magnitude_alvo)} em localidades de ${formatarNumero(modelo.tamanho_celula)}° · ${formatarInteiro(modelo.total_terremotos)} terremotos de ${formatarData(modelo.dados_inicio)} a ${formatarData(modelo.dados_fim)}`}>
      <Aviso tipo={m.supera_baseline ? 'ok' : ''}>
        {m.supera_baseline
          ? 'Este modelo supera o baseline: acerta mais que simplesmente repetir a frequência histórica de cada localidade.'
          : 'Este modelo não supera o baseline: não é melhor que simplesmente repetir a frequência histórica de cada localidade. Tente outro algoritmo, outros parâmetros ou mais dados.'}
      </Aviso>

      <div className="metricas">
        <Metrica rotulo="Precisão média" valor={formatarPorcentagem(m.precisao_media)}
          detalhe={`baseline: ${formatarPorcentagem(m.baseline_precisao_media)}`} />
        <Metrica rotulo="ROC AUC" valor={m.roc_auc == null ? '—' : formatarNumero(m.roc_auc, 3)}
          detalhe={`baseline: ${m.baseline_roc_auc == null ? '—' : formatarNumero(m.baseline_roc_auc, 3)}`} />
        <Metrica rotulo="F1" valor={formatarPorcentagem(m.f1)} />
        <Metrica rotulo="Precisão" valor={formatarPorcentagem(m.precisao)} detalhe="dos alertas, quantos acertaram" />
        <Metrica rotulo="Recall" valor={formatarPorcentagem(m.recall)} detalhe="dos terremotos, quantos foram previstos" />
      </div>

      <p className="texto-explicacao">
        Avaliado em {formatarInteiro(m.amostras_teste)} casos de teste (os meses mais recentes, que o modelo não viu no treino);
        em {formatarPorcentagem(m.taxa_positivos_teste)} deles houve um terremoto do tamanho previsto. O baseline usa só a frequência
        histórica de cada localidade. “Precisão” e “recall” usam o corte de 50% de probabilidade.
      </p>

      {importancias && (
        <>
          <h2 style={{ fontSize: 15, margin: '18px 0 4px' }}>Importância das informações</h2>
          <p className="subtitulo" style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--texto-mudo)' }}>Quanto cada informação pesa nas decisões do modelo</p>
          <BarrasHorizontais dados={importancias} rotuloValor="Importância" formatar={(v) => formatarNumero(v, 3)} />
        </>
      )}
    </Cartao>
  )
}
