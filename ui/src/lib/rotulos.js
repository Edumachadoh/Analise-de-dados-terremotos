// Nomes em português para exibir os campos (colunas) que vêm da API. Os valores não são traduzidos.
// A API continua usando os nomes dela (profundidade_km, tipo_magnitude...); a tradução é só na tela.

const CAMPOS = {
  usgs_id: 'ID no USGS',
  local: 'Local',
  latitude: 'Latitude',
  longitude: 'Longitude',
  profundidade_km: 'Profundidade (km)',
  faixa_profundidade: 'Faixa de profundidade',
  magnitude: 'Magnitude',
  tipo_magnitude: 'Escala de magnitude',
  data_hora: 'Data e hora',
  atualizado_em: 'Atualizado em',
  tsunami: 'Alerta de tsunami',
  alerta: 'Nível de alerta',
  significancia: 'Significância',
  relatos: 'Relatos de quem sentiu',
  intensidade_relatada: 'Intensidade relatada',
  intensidade_estimada: 'Intensidade estimada',
  estacoes: 'Nº de estações',
  lacuna_azimutal: 'Lacuna entre estações (°)',
  distancia_estacao: 'Distância à estação (°)',
  rms: 'Erro do ajuste (s)',
  status: 'Situação',
  rede: 'Rede sismográfica',

  // features do modelo de previsão (backend/api/services/ml.py)
  cel_lat: 'Latitude da região',
  cel_lon: 'Longitude da região',
  eventos_periodo_anterior: 'Eventos nos últimos 30 dias',
  eventos_3_periodos: 'Eventos nos últimos 3 meses',
  eventos_12_periodos: 'Eventos nos últimos 12 meses',
  taxa_historica: 'Frequência histórica',
  atividade_geral_3_periodos: 'Atividade geral nos últimos 3 meses',

  // parâmetros dos algoritmos
  C: 'Regularização (C)',
  max_depth: 'Profundidade máxima',
  min_samples_leaf: 'Mínimo de amostras por folha',
  n_neighbors: 'Vizinhos considerados',
  weights: 'Peso dos vizinhos',
  n_estimators: 'Número de árvores',
  learning_rate: 'Taxa de aprendizado',
  camadas: 'Neurônios por camada',
  alpha: 'Regularização (alpha)',
  max_iter: 'Máximo de épocas',
}

export const rotulo = (campo) => CAMPOS[campo] ?? campo

// Para usar no meio de uma frase: "Distribuição de magnitude" (mantém siglas como "ID")
export function rotuloMinusculo(campo) {
  const texto = rotulo(campo)
  return /^[A-ZÀ-Ý][a-zà-ÿ]/.test(texto) ? texto[0].toLowerCase() + texto.slice(1) : texto
}

