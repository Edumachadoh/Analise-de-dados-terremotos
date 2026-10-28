// Mapa base (Leaflet + OpenStreetMap) usado nas telas Mapa e Previsões

import { useEffect } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'

// Rampa sequencial de um só tom (azul), do valor mais baixo para o mais alto
export const RAMPA = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#0d366b']

export function corDaRampa(valor, min, max) {
  if (valor == null || max <= min) return RAMPA[2]
  return RAMPA[Math.min(RAMPA.length - 1, Math.floor(((valor - min) / (max - min)) * RAMPA.length))]
}

// limites: [[latMin, lonMin], [latMax, lonMax]]; o mapa se ajusta a eles quando `chave` muda
export function MapaBase({ limites, chave, children }) {
  return (
    <div className="mapa">
      <MapContainer center={[-36, -71]} zoom={4} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Enquadrar limites={limites} chave={chave} />
        {children}
      </MapContainer>
    </div>
  )
}

function Enquadrar({ limites, chave }) {
  const mapa = useMap()

  useEffect(() => {
    if (!limites) return
    // espera o contêiner ter o tamanho final; sem animação para não sobrar zoom pendente ao trocar de tela
    const espera = setTimeout(() => {
      mapa.invalidateSize()
      mapa.fitBounds(limites, { padding: [20, 20], animate: false })
    }, 50)
    return () => clearTimeout(espera)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapa, chave])

  // o Leaflet não percebe sozinho quando o contêiner muda de tamanho
  useEffect(() => {
    const observador = new ResizeObserver(() => mapa.invalidateSize())
    observador.observe(mapa.getContainer())
    return () => observador.disconnect()
  }, [mapa])

  return null
}

export function limitesDe(pontos) {
  if (!pontos.length) return null
  const lats = pontos.map((p) => p.latitude)
  const lons = pontos.map((p) => p.longitude)
  return [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]]
}
