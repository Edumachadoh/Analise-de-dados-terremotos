// Erro devolvido pela API (real ou simulada), com a mensagem pronta para mostrar ao usuário
export class ErroApi extends Error {
  constructor(mensagem, status) {
    super(mensagem)
    this.status = status
  }
}
