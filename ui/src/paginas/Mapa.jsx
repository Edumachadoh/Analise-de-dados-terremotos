// Tela 2: mapa dos epicentros (GET /api/terremotos/ com os filtros da barra lateral)

import { useMemo, useState } from 'react'
import { CircleMarker, Tooltip } from 'react-leaflet'
import { Aviso, Cabecalho, Carregando, Cartao, Metrica, Seletor } from '../componentes/comuns.jsx'
import { corDaRampa, limitesDe, MapaBase, RAMPA } from '../componentes/MapaBase.jsx'
import { amostrar, formatarData, formatarInteiro, formatarNumero } from '../lib/formato.js'
import { rotulo, rotuloValor } from '../lib/rotulos.js'
import { useTodosTerremotos } from '../lib/useTodosTerremotos.js'

const MAX_PONTOS = 3000
const NENHUM = ''
const COLUNAS_NUMERICAS = ['magnitude', 'profundidade_km', 'significancia', 'estacoes']

export default function Mapa({ filtros, versaoBase }) {
  const { itens: dados, total, completo, erro } = useTodosTerremotos(filtros, versaoBase)
  const [colCor, setColCor] = useState('magnitude')
  const [colTamanho, setColTamanho] = useState('magnitude')

  const opcoes = [[NENHUM, '(nenhum)'], ...COLUNAS_NUMERICAS.map((c) => [c, rotulo(c)])]

  const { pontos, faixaCor, faixaTamanho } = useMemo(() => {
    let lista = amostrar(dados ?? [], MAX_PONTOS)
    // os maiores por último, para ficarem por cima
    if (colTamanho) lista = [...lista].sort((a, b) => (a[colTamanho] ?? -Infinity) - (b[colTamanho] ?? -Infinity))
    const faixa = (col) => {
      if (!col) return null
      const valores = lista.map((p) => p[col]).filter((v) => v != null)
      return valores.length ? [Math.min(...valores), Math.max(...valores)] : null
    }
    return { pontos: lista, faixaCor: faixa(colCor), faixaTamanho: faixa(colTamanho) }
  }, [dados, colCor, colTamanho])

  const raio = (p) => {
    if (!faixaTamanho || p[colTamanho] == null) return 5
    const [min, max] = faixaTamanho
    return 3 + (max > min ? (p[colTamanho] - min) / (max - min) : 0.5) * 11
  }
  const passo = faixaCor ? (faixaCor[1] - faixaCor[0]) / RAMPA.length : 0

  return (
    <>
      <Cabecalho titulo="Mapa dos epicentros">Onde os terremotos aconteceram · passe o mouse sobre um ponto para ver os detalhes</Cabecalho>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {!completo && !erro && <Carregando texto={`Buscando os terremotos… ${formatarInteiro(dados.length)} de ${formatarInteiro(total ?? 0)}`} />}
      {completo && dados.length === 0 && <Aviso>Nenhum terremoto atende aos filtros.</Aviso>}

      {completo && dados.length > 0 && (
        <>
          <div className="metricas">
            <Metrica rotulo="Terremotos no mapa" valor={formatarInteiro(pontos.length)}
              detalhe={dados.length > MAX_PONTOS ? `amostra de ${formatarInteiro(dados.length)} para manter o mapa fluido` : 'com os filtros aplicados'} />
          </div>

          <Cartao largo titulo="Mapa"
            controles={<>
              <Seletor rotulo="Cor por" valor={colCor} opcoes={opcoes} aoMudar={setColCor} />
              <Seletor rotulo="Tamanho por" valor={colTamanho} opcoes={opcoes} aoMudar={setColTamanho} />
            </>}>
            <MapaBase limites={limitesDe(pontos)} chave={`${completo}-${total}`}>
              {pontos.map((p) => (
                <CircleMarker key={p.id} center={[p.latitude, p.longitude]} radius={raio(p)}
                  pathOptions={{ color: '#fff', weight: 1, fillColor: faixaCor ? corDaRampa(p[colCor], ...faixaCor) : 'var(--serie-1)', fillOpacity: 0.8 }}>
                  <Tooltip>
                    <strong>{p.local || 'Sem descrição do local'}</strong><br />
                    Magnitude: {formatarNumero(p.magnitude)} ({rotuloValor('tipo_magnitude', p.tipo_magnitude)})<br />
                    Profundidade: {formatarNumero(p.profundidade_km)} km<br />
                    {formatarData(p.data_hora, true)}
                  </Tooltip>
                </CircleMarker>
              ))}
            </MapaBase>

            {faixaCor && (
              <div className="legenda">
                <span>{rotulo(colCor)}:</span>
                {RAMPA.map((cor, i) => (
                  <span className="item" key={cor}>
                    <span className="amostra" style={{ background: cor }} />
                    {formatarNumero(faixaCor[0] + i * passo)}–{formatarNumero(faixaCor[0] + (i + 1) * passo)}
                  </span>
                ))}
                {colTamanho && <span>· tamanho do círculo = {rotulo(colTamanho).toLowerCase()}</span>}
              </div>
            )}
          </Cartao>
        </>
      )}
    </>
  )
}
