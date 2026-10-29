// API local: tem os mesmos métodos do cliente real (api/cliente.js) e devolve os mesmos formatos,
// mas os terremotos vêm direto da API do USGS e todo o resto (filtros, estatísticas, modelos, previsões)
// é calculado no navegador. Serve para o front funcionar enquanto o back não está conectado.

import * as dados from './dados.js'
import * as ml from './ml.js'

export const apiUsgs = {
  local: true, // o treino de modelos roda no navegador, não no back

  listarTerremotos: dados.listarTerremotos,
  resumo: dados.resumo,
  porMes: dados.porMes,
  porMagnitude: dados.porMagnitude,
  porProfundidade: dados.porProfundidade,

  listarColetas: dados.listarColetas,
  importarDoUsgs: dados.importarDoUsgs,
  enviarArquivo: dados.enviarArquivo,

  listarAlgoritmos: ml.listarAlgoritmos,
  listarModelos: ml.listarModelos,
  treinar: ml.treinar,
  ativarModelo: ml.ativarModelo,
  excluirModelo: ml.excluirModelo,

  previsoes: ml.previsoes,
}
