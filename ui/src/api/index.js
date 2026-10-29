// Ponto único de acesso à API. As telas importam daqui e não sabem de onde os dados vêm.
//
//   VITE_FONTE=usgs  (padrão)  → direto da API do USGS; o back não precisa estar rodando
//   VITE_FONTE=back            → API REST do back (Django), em VITE_API_URL
//
// Configure em ui/.env (veja .env.example).

import { apiReal, consulta } from './cliente.js'
import { apiUsgs } from './usgs/index.js'

export const api = import.meta.env.VITE_FONTE === 'back' ? apiReal : apiUsgs
export { consulta }
export { ErroApi } from './erro.js'
