// Ponto único de acesso à API. As telas importam daqui e não sabem se falam com o back de verdade
// ou com a API simulada.
//
//   VITE_USAR_MOCK=true  (padrão)  → API simulada no navegador, o back não precisa estar rodando
//   VITE_USAR_MOCK=false           → API REST real (Django), em VITE_API_URL
//
// Configure em ui/.env (veja .env.example).

import { apiReal, consulta } from './cliente.js'
import { apiMock } from './mock/index.js'

export const api = import.meta.env.VITE_USAR_MOCK === 'false' ? apiReal : apiMock
export { consulta }
export { ErroApi } from './erro.js'
