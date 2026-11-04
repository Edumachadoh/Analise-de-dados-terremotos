// Mapa dos epicentros, com cor e tamanho pela coluna escolhida. Os pontos próximos viram um grupo
// (leaflet.markercluster), que se separa conforme o zoom.

import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import { useEffect, useMemo, useState } from 'react'
import { useMap } from 'react-leaflet'
import { formatarData, formatarInteiro, formatarNumero } from '../lib/formato.js'
import { rotulo } from '../lib/rotulos.js'
import { Cartao, Seletor } from './comuns.jsx'
import { ajusteDeLongitude, corDaRampa, limitesDe, MapaBase, RAMPA } from './MapaBase.jsx'

const NENHUM = ''
const ZOOM_SEM_GRUPOS = 6 // a partir deste zoom (escala de um país) os terremotos aparecem um a um
const COLUNAS_NUMERICAS = ['magnitude', 'profundidade_km', 'significancia', 'estacoes']

export default function CartaoMapa({ dados, chave }) {
  const [colCor, setColCor] = useState('magnitude')
  const [colTamanho, setColTamanho] = useState('magnitude')

  const opcoes = [[NENHUM, '(nenhum)'], ...COLUNAS_NUMERICAS.map((c) => [c, rotulo(c)])]

  const { pontos, faixaCor, faixaTamanho } = useMemo(() => {
    const ajustar = ajusteDeLongitude(dados.map((d) => d.longitude))
    const lista = dados.map((p) => ({ ...p, longitude: ajustar(p.longitude) }))
    const faixa = (col) => {
      if (!col) return null
      let min = Infinity
      let max = -Infinity
      for (const p of lista) {
        if (p[col] == null) continue
        if (p[col] < min) min = p[col]
        if (p[col] > max) max = p[col]
      }
      return min <= max ? [min, max] : null
    }
    return { pontos: lista, faixaCor: faixa(colCor), faixaTamanho: faixa(colTamanho) }
  }, [dados, colCor, colTamanho])

  const passo = faixaCor ? (faixaCor[1] - faixaCor[0]) / RAMPA.length : 0

  return (
    <Cartao largo titulo={`${formatarInteiro(pontos.length)} terremotos no mapa`}
      subtitulo={colCor ? `Grupos: quantidade de terremotos · cor pela maior ${rotulo(colCor).toLowerCase()} do grupo` : 'Grupos: quantidade de terremotos'}
      controles={<>
        <Seletor rotulo="Cor por" valor={colCor} opcoes={opcoes} aoMudar={setColCor} />
        <Seletor rotulo="Tamanho unitário por" valor={colTamanho} opcoes={opcoes} aoMudar={setColTamanho} />
      </>}>
      <MapaBase ocupaTela limites={limitesDe(pontos)} chave={chave}>
        <Agrupamento pontos={pontos} colCor={colCor} colTamanho={colTamanho} faixaCor={faixaCor} faixaTamanho={faixaTamanho} />
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
          {colTamanho && <span>· tamanho do círculo sem agrupamento = {rotulo(colTamanho).toLowerCase()}</span>}
        </div>
      )}
    </Cartao>
  )
}

// O markercluster não tem componente do react-leaflet: a camada é criada aqui e trocada quando os dados mudam
function Agrupamento({ pontos, colCor, colTamanho, faixaCor, faixaTamanho }) {
  const mapa = useMap()

  useEffect(() => {
    const cor = (valor) => (faixaCor ? corDaRampa(valor, ...faixaCor) : 'var(--serie-1)')
    const raio = (valor) => {
      if (!faixaTamanho || valor == null) return 5
      const [min, max] = faixaTamanho
      return 3 + (max > min ? (valor - min) / (max - min) : 0.5) * 11
    }

    const grupos = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      maxClusterRadius: 35,
      disableClusteringAtZoom: ZOOM_SEM_GRUPOS,
      // a bolha do grupo mostra a quantidade e tem a cor do maior valor entre os terremotos dela
      iconCreateFunction: (grupo) => {
        const filhos = grupo.getAllChildMarkers()
        const maior = colCor ? filhos.reduce((m, f) => Math.max(m, f.options.valorCor ?? -Infinity), -Infinity) : null
        const lado = Math.round(26 + Math.min(24, Math.log10(filhos.length) * 9))
        return L.divIcon({
          html: `<span style="background:${cor(maior)};width:${lado}px;height:${lado}px">${formatarInteiro(filhos.length)}</span>`,
          className: 'grupo-mapa',
          iconSize: [lado, lado],
        })
      },
    })

    grupos.addLayers(pontos.map((p) => L.circleMarker([p.latitude, p.longitude], {
      radius: raio(colTamanho ? p[colTamanho] : null),
      color: '#fff',
      weight: 1,
      fillColor: cor(colCor ? p[colCor] : null),
      fillOpacity: 0.8,
      valorCor: colCor ? p[colCor] : null,
      magnitude: p.magnitude,
    }).bindTooltip(dica(p))))

    // dica do grupo, montada só quando o mouse passa por cima
    grupos.on('clustermouseover', ({ layer }) => {
      layer.bindTooltip(dicaDoGrupo(layer.getAllChildMarkers(), colCor), { direction: 'top' }).openTooltip()
    })
    grupos.on('clustermouseout', ({ layer }) => layer.unbindTooltip())

    mapa.addLayer(grupos)
    return () => {
      mapa.removeLayer(grupos)
    }
  }, [mapa, pontos, colCor, colTamanho, faixaCor, faixaTamanho])

  return null
}

// Montada com elementos (e não com HTML em texto) para o nome do local não ser interpretado como HTML
function montarDica(titulo, linhas) {
  const div = document.createElement('div')
  const forte = document.createElement('strong')
  forte.textContent = titulo
  div.append(forte)
  for (const linha of linhas) div.append(document.createElement('br'), linha)
  return div
}

function dica(p) {
  return montarDica(p.local || 'Sem descrição do local', [
    `Magnitude: ${formatarNumero(p.magnitude)} (${p.tipo_magnitude})`,
    `Profundidade: ${formatarNumero(p.profundidade_km)} km`,
    formatarData(p.data_hora, true),
  ])
}

function dicaDoGrupo(filhos, colCor) {
  let soma = 0
  let maior = -Infinity
  let maiorCor = -Infinity
  for (const f of filhos) {
    soma += f.options.magnitude
    maior = Math.max(maior, f.options.magnitude)
    maiorCor = Math.max(maiorCor, f.options.valorCor ?? -Infinity)
  }
  const linhas = [`Maior magnitude: ${formatarNumero(maior)}`, `Magnitude média: ${formatarNumero(soma / filhos.length)}`]
  if (colCor && colCor !== 'magnitude') linhas.push(`Maior ${rotulo(colCor).toLowerCase()}: ${formatarNumero(maiorCor)}`)
  linhas.push(colCor ? `Cor: maior ${rotulo(colCor).toLowerCase()} do grupo` : '', 'Clique para aproximar')
  return montarDica(`${formatarInteiro(filhos.length)} terremotos`, linhas.filter(Boolean))
}
