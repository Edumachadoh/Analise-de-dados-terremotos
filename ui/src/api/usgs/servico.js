// Cliente da API do USGS (FDSN Event Web Service), chamada direto do navegador.
// Faz o mesmo que backend/api/services/usgs.py: consulta o recorte do Chile em janelas de um ano,
// confere a contagem antes de baixar e divide a janela ao meio se passar do limite da API.
// O USGS libera CORS (Access-Control-Allow-Origin: *), então não precisa de servidor no meio.

import { ErroApi } from '../erro.js'

const URL_USGS = 'https://earthquake.usgs.gov/fdsnws/event/1'
const REGIAO_CHILE = [-56, -17, -76, -66] // lat_min, lat_max, lon_min, lon_max
const LIMITE_API = 20_000 // máximo de eventos que a API devolve por consulta
const TENTATIVAS = 3
const DIA_MS = 86400000

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
const formatarData = (ms) => new Date(ms).toISOString().slice(0, 19) // AAAA-MM-DDTHH:MM:SS, em UTC

// GET com novas tentativas. Erros 4xx não se repetem: o pedido está errado.
async function get(metodo, params) {
  const url = `${URL_USGS}/${metodo}?${new URLSearchParams(params)}`
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    let resposta
    try {
      resposta = await fetch(url)
    } catch {
      if (tentativa === TENTATIVAS) throw new ErroApi('USGS inacessível: sem conexão com a internet ou o serviço está fora do ar.', 502)
      await esperar(1500 * tentativa)
      continue
    }
    if (resposta.status >= 400 && resposta.status < 500) {
      throw new ErroApi(`USGS respondeu ${resposta.status}: ${(await resposta.text()).slice(0, 300)}`, 502)
    }
    if (resposta.status >= 500) {
      if (tentativa === TENTATIVAS) throw new ErroApi(`USGS respondeu ${resposta.status}`, 502)
      await esperar(1500 * tentativa)
      continue
    }
    return resposta
  }
}

function parametros(inicio, fim, magnitudeMinima) {
  const [latMin, latMax, lonMin, lonMax] = REGIAO_CHILE
  const params = {
    starttime: formatarData(inicio),
    endtime: formatarData(fim),
    eventtype: 'earthquake',
    minlatitude: latMin, maxlatitude: latMax,
    minlongitude: lonMin, maxlongitude: lonMax,
  }
  if (magnitudeMinima != null) params.minmagnitude = magnitudeMinima // sem isso, vêm todas as magnitudes
  return params
}

async function baixarJanela(inicio, fim, magnitudeMinima) {
  const total = Number(await (await get('count', parametros(inicio, fim, magnitudeMinima))).text())
  if (total === 0) return []
  if (total > LIMITE_API) {
    const meio = inicio + (fim - inicio) / 2
    return [...(await baixarJanela(inicio, meio, magnitudeMinima)), ...(await baixarJanela(meio, fim, magnitudeMinima))]
  }
  const resposta = await get('query', { ...parametros(inicio, fim, magnitudeMinima), format: 'geojson' })
  return (await resposta.json()).features
}

// Terremotos do Chile dos últimos `anos`, no formato de registro do USGS (id, mag, time, place, depth...)
export async function buscarTerremotos(anos, magnitudeMinima = null) {
  const fim = Math.floor(Date.now() / 1000) * 1000
  const inicio = fim - anos * 365 * DIA_MS

  const features = []
  for (let janela = inicio; janela < fim;) {
    const janelaFim = Math.min(janela + 365 * DIA_MS, fim)
    features.push(...(await baixarJanela(janela, janelaFim, magnitudeMinima)))
    janela = janelaFim
  }

  // um evento na borda entre duas janelas pode vir duas vezes
  const unicos = new Map(features.map((f) => [f.id, f]))
  return [...unicos.values()].map((f) => {
    const [longitude, latitude, depth] = f.geometry.coordinates
    return { id: f.id, ...f.properties, longitude, latitude, depth }
  })
}
