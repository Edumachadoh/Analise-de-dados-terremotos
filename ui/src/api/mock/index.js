// API simulada: tem os mesmos métodos do cliente real (api/cliente.js) e devolve os mesmos formatos,
// mas roda toda no navegador, com os dados de public/mock/terremotos.csv.
// Serve para o front funcionar antes de o back existir ou sem ele rodando.

import * as dados from './dados.js'
import * as ml from './ml.js'

export const apiMock = {
  simulada: true,

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
