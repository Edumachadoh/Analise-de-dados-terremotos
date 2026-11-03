// Ponto único de acesso à API. As telas importam daqui e não sabem como a requisição é feita.
// O endereço da API vem de VITE_API_URL (veja .env.example); o padrão /api passa pelo proxy do Vite.

import { apiTerremoto, consulta } from './cliente.js'

export const api = apiTerremoto
export { consulta }
export { ErroApi } from './erro.js'
