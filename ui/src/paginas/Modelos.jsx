// Tela 4: treinar modelos de previsão, comparar com o baseline e escolher o modelo ativo
// (GET /api/modelos/algoritmos/, GET/POST /api/modelos/, POST /api/modelos/{id}/ativar/, DELETE /api/modelos/{id}/)

import { useEffect, useState } from 'react'
import { api } from '../api/index.js'
import { Aviso, Cabecalho, Carregando, Cartao, Metrica, Seletor } from '../componentes/comuns.jsx'
import { BarrasHorizontais } from '../componentes/graficos.jsx'
import { formatarData, formatarInteiro, formatarNumero, formatarPorcentagem } from '../lib/formato.js'
import { rotulo, rotuloValor } from '../lib/rotulos.js'
import { useCarregar } from '../lib/useCarregar.js'

// O back só aceita estes três textos exatos (ChoiceField com 0.5, 1.0 e 2.0)
const TAMANHOS_CELULA = [['0.5', '0,5° (≈ 55 km)'], ['1.0', '1° (≈ 110 km)'], ['2.0', '2° (≈ 220 km)']]

const padroes = (algoritmo) =>
  Object.fromEntries(Object.entries(algoritmo?.parametros ?? {}).map(([nome, p]) => [nome, p.padrao ?? '']))

export default function Modelos({ aoMudarBase }) {
  const algoritmos = useCarregar(() => api.listarAlgoritmos(), [])
  const modelos = useCarregar(() => api.listarModelos(), [])

  const [algoritmoId, setAlgoritmoId] = useState('random_forest')
  const [parametros, setParametros] = useState({})
  const [magnitudeAlvo, setMagnitudeAlvo] = useState(4.5)
  const [mesesTeste, setMesesTeste] = useState(6)
  const [tamanhoCelula, setTamanhoCelula] = useState('1.0')
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
      const modelo = await api.treinar({
        algoritmo: algoritmo.id,
        parametros: montarParametros(algoritmo, parametros),
        magnitude_alvo: Number(magnitudeAlvo),
        meses_teste: Number(mesesTeste),
        tamanho_celula: tamanhoCelula,
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
        Prevê <strong>quais regiões do Chile têm mais chance de um terremoto forte nos próximos 30 dias</strong>. O Chile é dividido
        em células e o modelo aprende com o histórico de cada uma.
      </Cabecalho>

      {api.simulada && (
        <Aviso>
          <strong>Modo demonstração:</strong> todos os algoritmos treinam o mesmo modelo simples (uma regressão logística rodando no navegador).
          As métricas são reais desse modelo, não do algoritmo escolhido. Os números de cada algoritmo virão do back-end.
        </Aviso>
      )}
      {algoritmos.erro && <Aviso tipo="erro">{algoritmos.erro}</Aviso>}

      <div className="modelos">
        <Cartao titulo="Treinar um modelo" subtitulo="Escolha o algoritmo e o que ele deve prever">
          {!algoritmos.dados && !algoritmos.erro && <Carregando />}
          {algoritmos.dados && (
            <>
              <div className="lista-modelos">
                {algoritmos.dados.map((a) => (
                  <button key={a.id} className={`opcao-modelo${a.id === algoritmo?.id ? ' ativo' : ''}`} onClick={() => setAlgoritmoId(a.id)}>
                    <strong>{a.nome}</strong>
                    <span>{a.descricao}</span>
                  </button>
                ))}
              </div>

              <div className="formulario">
                <div className="linha">
                  {Object.entries(algoritmo.parametros).map(([nome, p]) => (
                    <Parametro key={nome} nome={nome} definicao={p} valor={parametros[nome] ?? ''}
                      aoMudar={(v) => setParametros({ ...parametros, [nome]: v })} />
                  ))}
                </div>

                <div className="linha">
                  <label className="campo">
                    Magnitude mínima a prever
                    <input type="number" step="0.1" min="2.5" max="8" value={magnitudeAlvo} onChange={(e) => setMagnitudeAlvo(e.target.value)} />
                    <span className="dica-campo">Prevê terremotos com esta magnitude ou mais</span>
                  </label>
                  <label className="campo">
                    Meses de teste
                    <input type="number" min="1" max="24" value={mesesTeste} onChange={(e) => setMesesTeste(e.target.value)} />
                    <span className="dica-campo">Últimos meses guardados para avaliar o modelo</span>
                  </label>
                </div>

                <Seletor rotulo="Tamanho de cada região" valor={tamanhoCelula} opcoes={TAMANHOS_CELULA} aoMudar={setTamanhoCelula} inline={false} />

                <label className="check">
                  <input type="checkbox" checked={atualizarDados} onChange={(e) => setAtualizarDados(e.target.checked)} />
                  <span>Buscar dados novos no USGS antes de treinar (re-treino com os últimos 6 anos; pode levar alguns minutos)</span>
                </label>

                <button className="botao primario" disabled={treinando} onClick={treinar}>
                  {treinando ? (atualizarDados ? 'Buscando dados e treinando…' : 'Treinando…') : 'Treinar modelo'}
                </button>
              </div>
            </>
          )}
        </Cartao>

        <div className="coluna">
          {mensagem && <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>}

          <Cartao titulo="Modelos treinados" subtitulo="O modelo ativo é o usado na tela Previsões">
            {modelos.erro && <Aviso tipo="erro">{modelos.erro}</Aviso>}
            {modelos.dados && lista.length === 0 && <div className="vazio">Nenhum modelo treinado ainda. Configure ao lado e clique em “Treinar modelo”.</div>}
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
                        <td className="num">≥ {formatarNumero(m.magnitude_alvo)}</td>
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

          {detalhe && <Detalhe modelo={detalhe} />}
        </div>
      </div>
    </>
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
    return <Seletor rotulo={rotulo(nome)} valor={valor} opcoes={p.opcoes.map((o) => [o, rotuloValor(nome, o)])} aoMudar={aoMudar} inline={false} />
  }
  const numerico = p.tipo === 'int' || p.tipo === 'float'
  return (
    <label className="campo">
      {rotulo(nome)}
      <input type={numerico ? 'number' : 'text'} min={p.min} max={p.max} step={p.tipo === 'int' ? 1 : 'any'} value={valor}
        placeholder={p.nulo ? 'sem limite' : undefined} onChange={(e) => aoMudar(e.target.value)} />
      <span className="dica-campo">{p.descricao}</span>
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
      subtitulo={`Prevê terremotos de magnitude ≥ ${formatarNumero(modelo.magnitude_alvo)} em regiões de ${formatarNumero(modelo.tamanho_celula)}° · ${formatarInteiro(modelo.total_terremotos)} terremotos de ${formatarData(modelo.dados_inicio)} a ${formatarData(modelo.dados_fim)}`}>
      <Aviso tipo={m.supera_baseline ? 'ok' : ''}>
        {m.supera_baseline
          ? 'Este modelo supera o baseline: acerta mais que simplesmente repetir a frequência histórica de cada região.'
          : 'Este modelo não supera o baseline: não é melhor que simplesmente repetir a frequência histórica de cada região. Tente outro algoritmo, outros parâmetros ou mais dados.'}
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
        histórica de cada região. “Precisão” e “recall” usam o corte de 50% de probabilidade.
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
