// Erro devolvido pela API (do back ou do USGS), com a mensagem pronta para mostrar ao usuário
export class ErroApi extends Error {
  constructor(mensagem, status) {
    super(mensagem)
    this.status = status
  }
}
