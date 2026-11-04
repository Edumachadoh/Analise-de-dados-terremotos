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
export function MapaBase({ limites, chave, ocupaTela = false, children }) {
  return (
    <div className={ocupaTela ? 'mapa ocupa-tela' : 'mapa'}>
      <MapContainer center={[-36, -71]} zoom={4} style={{ height: '100%', width: '100%' }}
        maxBounds={[[-85, -720], [85, 720]]} maxBoundsViscosity={1}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Enquadrar limites={limites} chave={chave} />
        {children}
      </MapContainer>
    </div>
  )
}

// Não deixa afastar além do ponto em que o mapa mostra o mundo de ponta a ponta na vertical: acima de
// 85° de latitude não há imagem, e apareceria uma faixa cinza. Na horizontal o mundo se repete.
function limitarAfastamento(mapa) {
  mapa.setMinZoom(Math.max(0, Math.log2(mapa.getSize().y / 256)))
}

function Enquadrar({ limites, chave }) {
  const mapa = useMap()

  useEffect(() => {
    if (!limites) return
    // espera o contêiner ter o tamanho final; sem animação para não sobrar zoom pendente ao trocar de tela
    const espera = setTimeout(() => {
      mapa.invalidateSize()
      limitarAfastamento(mapa)
      mapa.fitBounds(limites, { padding: [20, 20], animate: false })
    }, 50)
    return () => clearTimeout(espera)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapa, chave])

  // o Leaflet não percebe sozinho quando o contêiner muda de tamanho
  useEffect(() => {
    const observador = new ResizeObserver(() => {
      mapa.invalidateSize()
      limitarAfastamento(mapa)
    })
    observador.observe(mapa.getContainer())
    return () => observador.disconnect()
  }, [mapa])

  return null
}

// Faixa que o mapa deve mostrar. Com muitos pontos, ignora os 1% mais isolados de cada lado: um único evento
// distante não deve afastar o mapa a ponto de o grosso dos terremotos virar um aglomerado pequeno.
export function limitesDe(pontos) {
  if (!pontos.length) return null
  const faixa = (valores) => {
    const ordenados = [...valores].sort((a, b) => a - b)
    const corte = ordenados.length >= 100 ? Math.floor(ordenados.length * 0.01) : 0
    return [ordenados[corte], ordenados[ordenados.length - 1 - corte]]
  }
  const [latMin, latMax] = faixa(pontos.map((p) => p.latitude))
  const [lonMin, lonMax] = faixa(pontos.map((p) => p.longitude))
  return [[latMin, lonMin], [latMax, lonMax]]
}

// Regiões como o Oceano Pacífico cruzam a linha de data (180°): os pontos caem nas duas pontas do mapa, e o
// enquadramento tentaria mostrar o mundo inteiro. Devolve a função que soma 360° às longitudes do lado
// "de trás" do corte, que fica no meio do maior vazio entre os pontos; assim a região fica contínua
// (o Leaflet aceita longitudes acima de 180°). Sem cruzamento, devolve a longitude como está.
export function ajusteDeLongitude(longitudes) {
  const inteiras = [...new Set(longitudes.map((lon) => Math.round(lon)))].sort((a, b) => a - b)
  if (inteiras.length < 2) return (lon) => lon
  let maiorVazio = inteiras[0] + 360 - inteiras[inteiras.length - 1] // o vazio que passa pelos 180°
  let corte = null
  for (let i = 1; i < inteiras.length; i++) {
    const vazio = inteiras[i] - inteiras[i - 1]
    if (vazio > maiorVazio) {
      maiorVazio = vazio
      corte = (inteiras[i] + inteiras[i - 1]) / 2
    }
  }
  return corte === null ? (lon) => lon : (lon) => (lon < corte ? lon + 360 : lon)
}
