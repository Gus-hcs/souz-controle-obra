// @vitest-environment jsdom
/**
 * "Lançar pela nota" na tela (IA, 0027): quem vê o botão, o caminho da
 * foto até a conferência, a correção na conferência e os lançamentos
 * criados — com a nota anexada e a contagem de correções enviada. O
 * envio do anexo e a função `ia` são simulados; o resto é o app de verdade.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/ui/anexos.js', async (original) => ({
  ...(await original()),
  prepararAnexo: vi.fn(async (_f, d) => `storage:${d.obraId}/lancamentos/${d.id}-1.jpg`),
}));

const { Store } = await import('../src/dados/store.js');
const { SUPA } = await import('../src/dados/supabase.js');
const { App } = await import('../src/ui/shell.js');
const { ACOES } = await import('../src/ui/acoes.js');
const { botaoNotaIa, Ia } = await import('../src/ui/telas/nota-ia.js');
const { prepararAnexo } = await import('../src/ui/anexos.js');
const { estadoDemo } = await import('./fixture.js');

const LEITURA = {
  legivel: true,
  motivo: null,
  tipoDocumento: 'nfe',
  fornecedor: 'Depósito Central',
  cnpj: '11222333000181',
  numero: '4455',
  dataEmissao: '2026-09-20',
  totalNota: 1480,
  desconto: 20,
  frete: 150,
  formaPagamento: 'PIX',
  itens: [
    {
      descricao: 'Cimento CP II',
      quantidade: 10,
      unidade: 'SC',
      valorUnitario: 38,
      valorTotal: 380,
      servico: false,
      valorServico: null,
      categoria: 'Cimento',
      etapa: 'Fundação',
      materialId: null,
    },
    {
      descricao: 'Bloco cerâmico',
      quantidade: 1,
      unidade: 'MIL',
      valorUnitario: 970,
      valorTotal: 970,
      servico: false,
      valorServico: null,
      categoria: 'Bloco',
      etapa: 'Fechamento/alvenaria',
      materialId: null,
    },
  ],
  incertos: ['numero'],
};

let salvo;
beforeAll(() => {
  salvo = {
    backend: Store.backend,
    estado: Store.estado,
    marcarSujo: Store.marcarSujo,
    render: App.render,
    usuario: SUPA.usuario,
    construtora: SUPA.construtora,
    papeis: SUPA.papeis,
    lerNotaComIa: SUPA.lerNotaComIa,
    marcarCorrecoesIa: SUPA.marcarCorrecoesIa,
    situacaoIa: SUPA.situacaoIa,
  };
  Store.marcarSujo = () => {};
  App.render = () => {};
});
afterAll(
  () =>
    Object.assign(Store, {
      backend: salvo.backend,
      estado: salvo.estado,
      marcarSujo: salvo.marcarSujo,
    }) &&
    Object.assign(App, { render: salvo.render }) &&
    Object.assign(SUPA, {
      usuario: salvo.usuario,
      construtora: salvo.construtora,
      papeis: salvo.papeis,
      lerNotaComIa: salvo.lerNotaComIa,
      marcarCorrecoesIa: salvo.marcarCorrecoesIa,
      situacaoIa: salvo.situacaoIa,
    }),
);

let obra;
beforeEach(() => {
  document.body.innerHTML = '<div id="modal-camada"></div><div id="toasts"></div>';
  Store.backend = 'supabase';
  Store.estado = estadoDemo();
  obra = Store.estado.obras[0];
  App.rota = { view: 'lancamentos', obraId: obra.id };
  SUPA.usuario = { id: 'u1', email: 'eng@exemplo.com' };
  SUPA.construtora = { id: 'e1', nome: 'Construtora', papel: 'engenheiro' };
  SUPA.papeis = {};
  Ia.situacao = {};
  Ia.conf = null;
  Ia.foraDoArAte = 0;
  Ia.pendente = null;
});

const esperar = () => new Promise((r) => setTimeout(r, 0));
/* o erro como SUPA.lerNotaComIa entrega: a frase para a pessoa e o motivo */
const falha = (mensagem, extra) => Object.assign(new Error(mensagem), extra);
async function escolherFoto() {
  ACOES['nota-ia']();
  const inp = document.querySelector('#modal-camada [data-nota-arquivo]');
  Object.defineProperty(inp, 'files', {
    value: [new File(['x'], 'nota.jpg', { type: 'image/jpeg' })],
  });
  inp.dispatchEvent(new Event('change'));
  for (let i = 0; i < 5; i++) await esperar();
}

describe('quem vê o botão', () => {
  it('IA ligada: quem edita a obra vê "Lançar pela nota"', () => {
    Ia.situacao[obra.id] = { ligada: true, cota_notas: 60, usado_notas: 3 };
    expect(botaoNotaIa(obra)).toContain('data-acao="nota-ia"');
  });
  it('IA desligada: o gestor vê o convite com cadeado; o engenheiro, nada', () => {
    Ia.situacao[obra.id] = { ligada: false };
    expect(botaoNotaIa(obra)).toBe('');
    SUPA.construtora.papel = 'gestor';
    expect(botaoNotaIa(obra)).toContain('data-acao="nota-ia-plano"');
  });
  it('sem banco (modo local) ou cliente final: nada', () => {
    Ia.situacao[obra.id] = { ligada: true, cota_notas: 60, usado_notas: 0 };
    Store.backend = 'local';
    expect(botaoNotaIa(obra)).toBe('');
    Store.backend = 'supabase';
    SUPA.papeis = { [obra.id]: 'cliente' };
    expect(botaoNotaIa(obra)).toBe('');
  });
  it('a situação é carregada do banco uma vez e o botão aparece depois', async () => {
    let chamadas = 0;
    SUPA.situacaoIa = async () => {
      chamadas++;
      return { ligada: true, cota_notas: 60, usado_notas: 0 };
    };
    expect(botaoNotaIa(obra)).toBe('');
    botaoNotaIa(obra);
    await esperar();
    expect(chamadas).toBe(1);
    expect(botaoNotaIa(obra)).toContain('nota-ia');
  });
});

describe('da foto aos lançamentos', () => {
  beforeEach(() => {
    Ia.situacao[obra.id] = { ligada: true, cota_notas: 60, usado_notas: 10 };
  });

  it('lê, mostra a conferência com alertas e o campo incerto marcado', async () => {
    let pedido;
    SUPA.lerNotaComIa = async (obraId, arquivo, contexto) => {
      pedido = { obraId, arquivo, contexto };
      return { id: 'uso-9', leitura: JSON.parse(JSON.stringify(LEITURA)) };
    };
    await escolherFoto();
    expect(prepararAnexo).toHaveBeenCalled();
    expect(pedido.obraId).toBe(obra.id);
    expect(pedido.arquivo).toMatch(new RegExp(`^storage:${obra.id}/lancamentos/`));
    /* só nomes vão para a IA: etapas, itens do plano e formas de pagamento */
    expect(Object.keys(pedido.contexto).sort()).toEqual(['etapas', 'formasPagamento', 'materiais']);
    expect(JSON.stringify(pedido.contexto)).not.toMatch(/cliente|endereco|valor/i);
    const conf = document.querySelector('[data-testid="nota-ia-conferencia"]');
    expect(conf).toBeTruthy();
    expect(conf.querySelector('#nia_numero').closest('.campo').classList.contains('incerto')).toBe(
      true,
    );
    expect(document.querySelector('[data-testid="nota-ia-alertas"]').textContent).toMatch(
      /não teve certeza/,
    );
    expect(document.querySelector('[data-testid="nota-ia-criar"]').textContent).toBe(
      'Criar 2 lançamentos',
    );
    expect(Ia.situacao[obra.id].usado_notas).toBe(11);
  });

  it('corrige na conferência, tira um item e cria os lançamentos com a nota anexada', async () => {
    const marcados = [];
    SUPA.marcarCorrecoesIa = async (id, n) => marcados.push([id, n]);
    SUPA.lerNotaComIa = async () => ({ id: 'uso-9', leitura: JSON.parse(JSON.stringify(LEITURA)) });
    await escolherFoto();
    const num = document.querySelector('#nia_numero');
    num.value = '4456';
    num.dispatchEvent(new Event('input', { bubbles: true }));
    const incluirBloco = document.querySelector('[data-nota-incluir="1"]');
    incluirBloco.checked = false;
    incluirBloco.dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.querySelector('[data-testid="nota-ia-criar"]').textContent).toBe(
      'Criar 1 lançamento',
    );
    /* soma ≠ total depois de tirar o bloco: alerta, não bloqueio */
    expect(document.querySelector('[data-testid="nota-ia-alertas"]').textContent).toMatch(
      /soma dos itens/,
    );

    const antes = obra.lancamentos.length;
    ACOES['nota-ia-criar']();
    expect(obra.lancamentos.length).toBe(antes + 1);
    const novo = obra.lancamentos[obra.lancamentos.length - 1];
    expect(novo).toMatchObject({
      descricao: 'Cimento CP II',
      documento: 'NF 4456',
      fornecedor: 'Depósito Central',
      etapa: 'Fundação',
      unidade: 'saco',
    });
    expect(novo.anexoNf).toMatch(/^storage:/);
    expect(marcados).toEqual([['uso-9', 2]]);
    expect(document.querySelector('#modal-camada').innerHTML).toBe('');
  });

  it('um só, com o total da nota', async () => {
    SUPA.marcarCorrecoesIa = async () => {};
    SUPA.lerNotaComIa = async () => ({ id: 'uso-9', leitura: JSON.parse(JSON.stringify(LEITURA)) });
    await escolherFoto();
    const radio = document.querySelector('input[name="nia_modo"][value="total"]');
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    const antes = obra.lancamentos.length;
    ACOES['nota-ia-criar']();
    expect(obra.lancamentos.length).toBe(antes + 1);
    const l = obra.lancamentos[obra.lancamentos.length - 1];
    expect(l.quantidade * l.precoUnitario - l.desconto + l.frete).toBeCloseTo(1480, 2);
  });

  it('nota ilegível: explica e oferece lançar à mão; nada é criado', async () => {
    SUPA.lerNotaComIa = async () => ({
      id: 'uso-9',
      leitura: { ...LEITURA, legivel: false, motivo: 'A foto mostra uma parede.', itens: [] },
    });
    const antes = obra.lancamentos.length;
    await escolherFoto();
    expect(document.querySelector('#modal-camada').textContent).toMatch(/parede/);
    expect(document.querySelector('#modal-camada [data-acao="novo-lancamento"]')).toBeTruthy();
    expect(obra.lancamentos.length).toBe(antes);
  });

  it('erro da função (cota) troca a espera pela explicação, com "Lançar à mão"', async () => {
    SUPA.lerNotaComIa = async () => {
      throw falha('As leituras de nota deste mês acabaram. Lance à mão ou fale com o gestor.', {
        motivo: 'limite',
      });
    };
    await escolherFoto();
    expect(document.querySelector('[data-testid="nota-ia-lendo"]')).toBeNull();
    expect(document.querySelector('[data-testid="nota-ia-falha"]').textContent).toMatch(/acabaram/);
    expect(document.querySelector('#modal-camada [data-acao="nota-ia-a-mao"]')).toBeTruthy();
  });

  it('cota esgotada ou sem rede: nem abre a escolha da foto', () => {
    Ia.situacao[obra.id] = { ligada: true, cota_notas: 60, usado_notas: 60 };
    ACOES['nota-ia']();
    expect(document.querySelector('#modal-camada').innerHTML).toBe('');
    expect(document.querySelector('#toasts').textContent).toMatch(/acabaram/);
  });

  it('cancelar durante a leitura descarta o resultado', async () => {
    let soltar;
    SUPA.lerNotaComIa = () =>
      new Promise((r) => {
        soltar = () => r({ id: 'uso-9', leitura: JSON.parse(JSON.stringify(LEITURA)) });
      });
    ACOES['nota-ia']();
    const inp = document.querySelector('#modal-camada [data-nota-arquivo]');
    Object.defineProperty(inp, 'files', {
      value: [new File(['x'], 'n.jpg', { type: 'image/jpeg' })],
    });
    inp.dispatchEvent(new Event('change'));
    await esperar();
    await esperar();
    ACOES['nota-ia-cancelar']();
    soltar();
    for (let i = 0; i < 5; i++) await esperar();
    expect(document.querySelector('[data-testid="nota-ia-conferencia"]')).toBeNull();
  });
});

describe('IA indisponível: frase clara, tela inteira, caminho à mão', () => {
  const FORA = 'A leitura de nota por IA está indisponível no momento. Lance à mão.';
  beforeEach(() => {
    Ia.situacao[obra.id] = { ligada: true, cota_notas: 60, usado_notas: 10 };
  });

  it('chave ausente (503): explica e oferece lançar à mão; nada é criado sozinho', async () => {
    SUPA.lerNotaComIa = async () => {
      throw falha(FORA, { motivo: 'fora-do-ar', foraDoAr: true });
    };
    const antes = obra.lancamentos.length;
    await escolherFoto();
    const modal = document.querySelector('#modal-camada');
    expect(modal.textContent).toMatch(/indisponível no momento/);
    expect(modal.textContent).toMatch(/foto ficou guardada/);
    expect(modal.textContent).not.toMatch(/503|função|Error|undefined/);
    expect(obra.lancamentos.length).toBe(antes);
  });

  it('"Lançar à mão" abre o lançamento com a foto que já subiu anexada', async () => {
    SUPA.lerNotaComIa = async () => {
      throw falha(FORA, { motivo: 'fora-do-ar', foraDoAr: true });
    };
    await escolherFoto();
    const { lancId, ref } = Ia.pendente;
    ACOES['nota-ia-a-mao']();
    expect(Ia.pendente).toBeNull();
    expect(document.querySelector('#modal-camada').textContent).toMatch(/Novo lançamento/);
    document.querySelector('#modal-camada [data-campo="descricao"]').value = 'Cimento';
    document.querySelector('#modal-camada [data-campo="precoUnitario"]').value = '100';
    ACOES['salvar-form']();
    const novo = obra.lancamentos.find((l) => l.id === lancId);
    expect(novo).toBeTruthy();
    expect(novo.anexoNf).toBe(ref);
  });

  it('fora do ar: nos minutos seguintes o botão avisa sem pedir outra foto', async () => {
    let chamadas = 0;
    SUPA.lerNotaComIa = async () => {
      chamadas++;
      throw falha(FORA, { motivo: 'fora-do-ar', foraDoAr: true });
    };
    await escolherFoto();
    ACOES['nota-ia']();
    expect(document.querySelector('#modal-camada [data-nota-arquivo]')).toBeNull();
    expect(document.querySelector('[data-testid="nota-ia-falha"]').textContent).toMatch(
      /indisponível/,
    );
    expect(chamadas).toBe(1);
    Ia.foraDoArAte = Date.now() - 1;
    ACOES['nota-ia']();
    expect(document.querySelector('#modal-camada [data-nota-arquivo]')).toBeTruthy();
  });

  it('falha passageira não trava o botão: a próxima tentativa pede a foto', async () => {
    SUPA.lerNotaComIa = async () => {
      throw falha('A leitura da nota não respondeu agora. Tente de novo em instantes.', {
        motivo: 'temporario',
      });
    };
    await escolherFoto();
    expect(document.querySelector('[data-testid="nota-ia-falha"]').textContent).toMatch(
      /Tente de novo/,
    );
    ACOES['nota-ia']();
    expect(document.querySelector('#modal-camada [data-nota-arquivo]')).toBeTruthy();
  });

  it('erro inesperado do programa nunca chega cru à pessoa', async () => {
    SUPA.lerNotaComIa = async () => {
      throw new TypeError("Cannot read properties of undefined (reading 'leitura')");
    };
    await escolherFoto();
    const texto = document.querySelector('[data-testid="nota-ia-falha"]').textContent;
    expect(texto).not.toMatch(/Cannot|undefined|TypeError/);
    expect(texto).toMatch(/Tente de novo/);
  });

  it('cota de notas em zero: o gestor vê o cadeado; o engenheiro, nada', () => {
    Ia.situacao[obra.id] = { ligada: true, cota_notas: 0, usado_notas: 0 };
    expect(botaoNotaIa(obra)).toBe('');
    SUPA.construtora.papel = 'gestor';
    expect(botaoNotaIa(obra)).toContain('data-acao="nota-ia-plano"');
  });
});
