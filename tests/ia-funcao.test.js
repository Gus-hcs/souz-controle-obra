/**
 * A função `ia` (supabase/functions/ia) com a API da Anthropic, o banco e o
 * Storage simulados: o pedido que vai à IA, a resposta validada, a cota
 * reservada e concluída, e cada falha virando mensagem para a pessoa —
 * sem gastar cota quando a leitura não saiu.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ErroIa,
  ESQUEMA_NOTA,
  custoUsd,
  lerPedido,
  montarPedidoNota,
  normalizarLeitura,
  processarNota,
  tipoDoArquivo,
} from '../supabase/functions/ia/leitura.js';

const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const LEITURA = {
  legivel: true,
  motivo: null,
  tipoDocumento: 'nfe',
  fornecedor: 'Depósito Central',
  cnpj: '11.222.333/0001-81',
  numero: '1201',
  dataEmissao: '2026-09-20',
  totalNota: 380,
  desconto: null,
  frete: null,
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
      etapa: null,
      materialId: null,
    },
  ],
  incertos: [],
};
const PEDIDO = {
  tarefa: 'nota',
  obraId: 'o1',
  arquivo: 'storage:o1/lancamentos/lan-1-nf.jpg',
  contexto: {
    etapas: ['Fundação', 'Alvenaria'],
    materiais: [{ id: 'mat-1', nome: 'Cimento CP II' }],
    formasPagamento: ['PIX', 'Boleto'],
  },
};

function simular({ reservar, baixar, resposta, lancar } = {}) {
  const registro = { concluidos: [], pedidos: [] };
  let t = 1000;
  const dep = {
    agora: () => (t += 500),
    reservar: reservar || (async () => 'uso-1'),
    baixar: baixar || (async () => JPG),
    anthropic: {
      messages: {
        create: async (p) => {
          registro.pedidos.push(p);
          if (lancar) throw lancar;
          return (
            resposta || {
              stop_reason: 'end_turn',
              content: [{ type: 'text', text: JSON.stringify(LEITURA) }],
              usage: { input_tokens: 5900, output_tokens: 700 },
            }
          );
        },
      },
    },
    concluir: async (...args) => registro.concluidos.push(args),
  };
  return { dep, registro };
}
const falha = async (promessa) => {
  try {
    await promessa;
  } catch (e) {
    return e;
  }
  throw new Error('devia ter falhado');
};

describe('pedido do app', () => {
  it('aceita a nota da própria obra e limpa o contexto', () => {
    const p = lerPedido({
      ...PEDIDO,
      contexto: {
        etapas: ['  Fundação  ', '', 'x'.repeat(200)],
        materiais: [
          { id: 'a b', nome: 'x' },
          { id: 'm1', nome: ' Aço ' },
        ],
      },
    });
    expect(p).toMatchObject({ obraId: 'o1', caminho: 'o1/lancamentos/lan-1-nf.jpg' });
    expect(p.contexto.etapas[0]).toBe('Fundação');
    expect(p.contexto.etapas[1]).toHaveLength(80);
    expect(p.contexto.materiais).toEqual([{ id: 'm1', nome: 'Aço' }]);
  });
  it('recusa nota de outra obra, fora da pasta lancamentos e tarefa estranha', () => {
    expect(lerPedido({ ...PEDIDO, arquivo: 'storage:o2/lancamentos/a.jpg' }).erro).toBeTruthy();
    expect(lerPedido({ ...PEDIDO, arquivo: 'storage:o1/contratos/a.pdf' }).erro).toBeTruthy();
    expect(lerPedido({ ...PEDIDO, arquivo: 'storage:o1/lancamentos/../x' }).erro).toBeTruthy();
    expect(lerPedido({ ...PEDIDO, tarefa: 'diario' }).erro).toBeTruthy();
    expect(lerPedido(null).erro).toBeTruthy();
  });
  it('tipo do arquivo pelos primeiros bytes, não pelo nome', () => {
    expect(tipoDoArquivo(JPG, 'x.pdf')).toBe('image/jpeg');
    expect(tipoDoArquivo(PDF, 'x.jpg')).toBe('application/pdf');
    expect(tipoDoArquivo(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe('image/png');
    expect(tipoDoArquivo(new Uint8Array([1, 2, 3]), 'nota.exe')).toBe('');
  });
});

describe('o que vai para a IA', () => {
  it('Sonnet 5, saída estruturada no esquema, instruções fixas e o contexto depois da imagem', () => {
    const p = montarPedidoNota(JPG, 'image/jpeg', lerPedido(PEDIDO).contexto);
    expect(p.model).toBe('claude-sonnet-5');
    expect(p.output_config.format).toEqual({ type: 'json_schema', schema: ESQUEMA_NOTA });
    expect(p.system[0].text).toMatch(/Nunca devolva nome, CPF/);
    const [anexo, texto] = p.messages[0].content;
    expect(anexo).toMatchObject({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg' },
    });
    expect(texto.text).toContain('mat-1: Cimento CP II');
    expect(texto.text).toContain('Fundação | Alvenaria');
    const pdf = montarPedidoNota(PDF, 'application/pdf', lerPedido(PEDIDO).contexto);
    expect(pdf.messages[0].content[0].type).toBe('document');
  });
  it('esquema aceito pela saída estruturada: todo objeto fechado e com tudo obrigatório', () => {
    const conferir = (s, onde) => {
      if (s.anyOf) return s.anyOf.forEach((x, i) => conferir(x, `${onde}.anyOf${i}`));
      for (const proibido of [
        'minimum',
        'maximum',
        'minLength',
        'maxLength',
        'pattern',
        'minItems',
        'maxItems',
      ]) {
        expect(s[proibido], `${onde}.${proibido}`).toBeUndefined();
      }
      if (s.type === 'object') {
        expect(s.additionalProperties, onde).toBe(false);
        expect([...s.required].sort(), onde).toEqual(Object.keys(s.properties).sort());
        Object.entries(s.properties).forEach(([k, v]) => conferir(v, `${onde}.${k}`));
      }
      if (s.type === 'array') conferir(s.items, `${onde}[]`);
    };
    conferir(ESQUEMA_NOTA, 'nota');
    /* nenhum campo para dado de pessoa física */
    expect(JSON.stringify(ESQUEMA_NOTA)).not.toMatch(/cpf|destinat|telefone|endereco/i);
  });
  it('no máximo 16 campos com união (limite da saída estruturada: acima disso a API recusa com 400)', () => {
    const uniao = (s) =>
      (s.anyOf || Array.isArray(s.type) ? 1 : 0) +
      Object.values(s.properties || {}).reduce((n, v) => n + uniao(v), 0) +
      (s.items ? uniao(s.items) : 0);
    expect(uniao(ESQUEMA_NOTA)).toBeLessThanOrEqual(16);
  });
  it('texto vazio da IA vira null antes da validação, na nota e nos itens', () => {
    const l = normalizarLeitura({
      ...LEITURA,
      motivo: '',
      numero: ' ',
      formaPagamento: '',
      cnpj: '',
      dataEmissao: '',
      itens: [{ ...LEITURA.itens[0], etapa: '', materialId: '', unidade: '' }],
    });
    expect([l.motivo, l.numero, l.formaPagamento, l.cnpj, l.dataEmissao]).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(l.itens[0]).toMatchObject({ etapa: null, materialId: null, unidade: null });
    expect(l.incertos).toEqual([]);
  });
  it('custo pela tabela oficial (Sonnet 5: US$ 2 e US$ 10 por milhão)', () => {
    expect(custoUsd('claude-sonnet-5', { input_tokens: 5900, output_tokens: 700 })).toBeCloseTo(
      0.0188,
      4,
    );
    expect(custoUsd('claude-haiku-4-5', { input_tokens: 1000000, output_tokens: 0 })).toBe(1);
  });
});

describe('fluxo da leitura', () => {
  it('lê, valida, normaliza o CNPJ e conclui como ok com tokens e custo', async () => {
    const { dep, registro } = simular();
    const r = await processarNota(PEDIDO, dep);
    expect(r.id).toBe('uso-1');
    expect(r.leitura.cnpj).toBe('11222333000181');
    expect(r.leitura.itens).toHaveLength(1);
    expect(registro.concluidos).toHaveLength(1);
    const [id, status, modelo, entrada, saida, custo, ms, erro] = registro.concluidos[0];
    expect([id, status, modelo, entrada, saida, erro]).toEqual([
      'uso-1',
      'ok',
      'claude-sonnet-5',
      5900,
      700,
      null,
    ]);
    expect(custo).toBeGreaterThan(0);
    expect(ms).toBeGreaterThan(0);
  });
  it('cota, IA desligada e sem acesso viram mensagem, sem chamar a IA', async () => {
    for (const [msg, status] of [
      ['ia: cota esgotada', 429],
      ['ia: desligada', 403],
      ['ia: prazo encerrado', 403],
      ['ia: limite por hora', 429],
      ['ia: sem acesso à obra', 403],
    ]) {
      const { dep, registro } = simular({
        reservar: async () => {
          throw new Error(msg);
        },
      });
      const e = await falha(processarNota(PEDIDO, dep));
      expect(e).toBeInstanceOf(ErroIa);
      expect(e.status).toBe(status);
      expect(registro.pedidos).toHaveLength(0);
      expect(registro.concluidos).toHaveLength(0);
    }
  });
  it('pedido inválido: 400, sem reservar', async () => {
    let reservou = false;
    const { dep } = simular({
      reservar: async () => {
        reservou = true;
        return 'x';
      },
    });
    const e = await falha(
      processarNota({ ...PEDIDO, arquivo: 'storage:o2/lancamentos/a.jpg' }, dep),
    );
    expect(e.status).toBe(400);
    expect(reservou).toBe(false);
  });
  it('cada falha depois da reserva conclui como erro (não conta na cota)', async () => {
    const casos = [
      [
        {
          baixar: async () => {
            throw new Error('Object not found');
          },
        },
        404,
      ],
      [{ baixar: async () => new Uint8Array([1, 2, 3]) }, 415],
      [{ baixar: async () => new Uint8Array(11 * 1024 * 1024) }, 413],
      [{ lancar: Object.assign(new Error('overloaded'), { status: 529 }) }, 502],
      [
        {
          resposta: {
            stop_reason: 'refusal',
            content: [],
            usage: { input_tokens: 10, output_tokens: 0 },
          },
        },
        422,
      ],
      [
        {
          resposta: {
            stop_reason: 'max_tokens',
            content: [{ type: 'text', text: '{"legivel":' }],
            usage: {},
          },
        },
        422,
      ],
      [
        {
          resposta: {
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: 'não é json' }],
            usage: {},
          },
        },
        422,
      ],
      [
        {
          resposta: {
            stop_reason: 'end_turn',
            content: [
              { type: 'text', text: JSON.stringify({ ...LEITURA, tipoDocumento: 'boleto' }) },
            ],
            usage: {},
          },
        },
        422,
      ],
    ];
    for (const [cfg, status] of casos) {
      const { dep, registro } = simular(cfg);
      const e = await falha(processarNota(PEDIDO, dep));
      expect(e.status, e.interno).toBe(status);
      expect(e.message).not.toMatch(/sk-ant|Bearer/);
      expect(registro.concluidos).toHaveLength(1);
      expect(registro.concluidos[0][1]).toBe('erro');
    }
  });
  it('a casca Deno não loga a chave, o token nem a nota', () => {
    const fonte = fs.readFileSync('supabase/functions/ia/index.ts', 'utf8');
    const logs = fonte.split('\n').filter((l) => /console\.(log|warn|error|info)/.test(l));
    expect(logs.length).toBeGreaterThan(0);
    for (const l of logs) expect(l).not.toMatch(/chaveIa|autorizacao|corpo|bytes|leitura/);
    expect(fonte).not.toMatch(/sk-ant-/);
    expect(fonte).toContain("Deno.env.get('ANTHROPIC_API_KEY')");
  });
});
