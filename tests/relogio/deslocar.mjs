/**
 * Adianta o relógio do processo em SOUZ_DIAS dias — simula a suíte rodando
 * daqui a um mês, um trimestre, um ano. Carregado antes de tudo pelo
 * executar.mjs (NODE_OPTIONS=--import). Só para os testes.
 */
const dias = Number(process.env.SOUZ_DIAS || 0);
if (dias) {
  const Real = Date;
  const delta = dias * 86400000;
  class Adiantada extends Real {
    constructor(...a) {
      if (a.length) super(...a);
      else super(Real.now() + delta);
    }
    static now() {
      return Real.now() + delta;
    }
  }
  globalThis.Date = Adiantada;
}
