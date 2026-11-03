// Mapa para escolher a região: os continentes (e a faixa de mar junto à costa, mais clara) e os
// oceanos, desenhados sobre o mapa-múndi. Clicar em uma região a escolhe.
// Os polígonos vêm de GET /api/regioes/mapa/, os mesmos que o back usa para decidir a região
// de cada terremoto.

import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet'
import { formatarInteiro } from '../lib/formato.js'

// Uma cor por continente; os oceanos ficam em tons de azul
const COR_CONTINENTE = ['#e0583f', '#7a8793', '#e8a020', '#3f9bd1', '#3da86b', '#b457b5', '#d86a9b']
export function corDaRegiao(regiao) {
  return regiao.tipo === 'oceano'
    ? `hsl(${205 + regiao.ordem * 6} 65% ${45 + (regiao.ordem % 3) * 6}%)`
    : COR_CONTINENTE[regiao.ordem % COR_CONTINENTE.length]
}

// O mundo aparece uma vez só: o mapa se ajusta ao tamanho da tela e não deixa afastar além disso
const MUNDO = [[-72, -180], [80, 180]]

function MundoInteiro() {
  const mapa = useMap()
  useEffect(() => {
    const ajustar = () => {
      mapa.invalidateSize()
      mapa.setMinZoom(0)
      mapa.fitBounds(MUNDO, { animate: false })
      mapa.setMinZoom(mapa.getZoom())
    }
    ajustar()
    // a página ainda está assentando o layout (barra de rolagem, painel ao lado): reajusta logo depois também
    const tardios = [150, 600].map((ms) => setTimeout(ajustar, ms))
    const observador = new ResizeObserver(ajustar)
    observador.observe(mapa.getContainer())
    return () => {
      tardios.forEach(clearTimeout)
      observador.disconnect()
    }
  }, [mapa])
  return null
}

const comoFeature = (r, geometria) => ({ type: 'Feature', properties: { codigo: r.codigo, centro: r.centro }, geometry: geometria })
const colecao = (features) => ({ type: 'FeatureCollection', features })

export function MapaRegioes({ poligonos, regioes, escolhida, aoEscolher }) {
  const [sobre, setSobre] = useState(null)
  const porCodigo = useMemo(() => new Map(regioes.map((r) => [r.codigo, r])), [regioes])

  // Três camadas, de baixo para cima: oceanos, faixa de costa e continentes. Assim, na terra, o
  // clique é do continente; no mar, do continente se for perto da costa, senão do oceano.
  const camadas = useMemo(() => ({
    oceanos: colecao(poligonos.filter((p) => p.tipo === 'oceano').map((p) => comoFeature(p, p.geometria))),
    costas: colecao(poligonos.filter((p) => p.costa?.type).map((p) => comoFeature(p, p.costa))),
    continentes: colecao(poligonos.filter((p) => p.tipo === 'continente').map((p) => comoFeature(p, p.geometria))),
  }), [poligonos])

  // Os oceanos não têm contorno (os polígonos deles são blocos retos) e a costa é só uma mancha leve
  const estilo = (preenchimento, contorno) => (f) => {
    const regiao = porCodigo.get(f.properties.codigo)
    const ativa = f.properties.codigo === escolhida
    const destaque = ativa || f.properties.codigo === sobre
    const cor = regiao ? corDaRegiao(regiao) : '#888'
    return {
      color: cor,
      fillColor: cor,
      fillOpacity: destaque ? preenchimento * 1.8 : preenchimento,
      weight: ativa ? Math.max(contorno * 3, 2) : contorno,
      opacity: contorno || ativa ? 1 : 0,
      className: 'regiao-mapa',
    }
  }

  const aoCriar = (rotulo) => (f, camada) => {
    const regiao = porCodigo.get(f.properties.codigo)
    if (!regiao) return
    // O nome fica escrito sobre a região (uma vez só); a faixa de costa mostra nome e contagem ao passar o mouse
    if (rotulo) {
      camada.bindTooltip(regiao.nome, { permanent: true, direction: 'center', className: 'rotulo-regiao' })
      // no meio da maior parte, não da caixa que cobre tudo; e dentro do que o mapa mostra (a Antártida fica além dos -72°)
      const [lat, lon] = f.properties.centro
      camada.getCenter = () => L.latLng(Math.min(Math.max(lat, -67), 76), lon)
    }
    else camada.bindTooltip(`${regiao.nome} · ${regiao.total_terremotos ? `${formatarInteiro(regiao.total_terremotos)} terremotos` : 'sem dados'}`, { sticky: true })
    camada.on({ click: () => aoEscolher(regiao.codigo), mouseover: () => setSobre(regiao.codigo), mouseout: () => setSobre(null) })
  }

  // As camadas só releem estilo e eventos quando a chave muda: outra região escolhida, sob o mouse ou contagens novas
  const chave = `${escolhida}-${sobre}-${regioes.reduce((s, r) => s + r.total_terremotos, 0)}`

  return (
    <div className="mapa mapa-regioes">
      <MapContainer center={[15, 10]} zoom={1} zoomSnap={0} zoomDelta={0.5} maxZoom={6}
        maxBounds={[[-90, -180], [90, 180]]} maxBoundsViscosity={1} style={{ height: '100%', width: '100%' }}>
        <MundoInteiro />
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" noWrap />
        <GeoJSON key={`o-${chave}`} data={camadas.oceanos} style={estilo(0.1, 0)} onEachFeature={aoCriar(true)} />
        <GeoJSON key={`c-${chave}`} data={camadas.costas} style={estilo(0.14, 0)} onEachFeature={aoCriar(false)} />
        <GeoJSON key={`t-${chave}`} data={camadas.continentes} style={estilo(0.4, 1.5)} onEachFeature={aoCriar(true)} />
      </MapContainer>
    </div>
  )
}
