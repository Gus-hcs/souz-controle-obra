/**
 * fixtures.js — Os três estados de dados que a suíte percorre.
 *
 * Reaproveita a obra de demonstração dos testes existentes; não inventa
 * outro modelo de dado. O que muda é a quantidade:
 *
 *   vazio     — sistema recém-instalado, nada cadastrado
 *   normal    — uma obra completa, como na demonstração
 *   volumoso  — 200 linhas em cada lista, para achar o que só quebra cheio
 */
import { estadoDemo } from '../fixture.js';
import { estadoInicial, migrar } from '../../src/nucleo/base.js';

function vazio() {
  return migrar(estadoInicial());
}

function normal() {
  return estadoDemo();
}

/* Repete um registro N vezes, variando o que aparece na tela (descrição,
   data, valor), para que a lista pareça real e não uma parede igual. */
function repetir(modelo, n, mexer) {
  const fora = [];
  for (let i = 0; i < n; i++) {
    const c = JSON.parse(JSON.stringify(modelo));
    c.id = `${modelo.id || 'r'}-${i}`;
    mexer(c, i);
    fora.push(c);
  }
  return fora;
}

const dia = (i) => {
  const d = new Date(2026, 0, 1 + (i % 330));
  return d.toISOString().slice(0, 10);
};

function volumoso(n = 200) {
  const e = estadoDemo();
  const o = e.obras[0];
  /* O molde das outras obras é tirado ANTES de inflar a primeira. Clonar
     depois fazia 60 obras com 1.200 registros cada — passava da cota de
     ~5 MB do localStorage, o navegador recusava gravar e o sistema abria
     vazio. A suíte passou uma rodada inteira testando "200 linhas" num
     sistema sem nenhuma obra. */
  const molde = JSON.parse(JSON.stringify(o));

  if (o.medicoes.length) {
    o.medicoes = repetir(o.medicoes[0], n, (m, i) => {
      m.numero = i + 1;
      m.descricao = `Medição ${i + 1} — ${['Fundação', 'Alvenaria', 'Cobertura', 'Instalações', 'Acabamento'][i % 5]}`;
      m.dataMedicao = dia(i);
      m.valorMedido = 3000 + ((i * 137) % 22000);
      m.status = ['Pago', 'Em aberto', 'Pago', 'Parcial'][i % 4];
    });
  }
  if (o.lancamentos.length) {
    o.lancamentos = repetir(o.lancamentos[0], n, (l, i) => {
      l.descricao = `Compra ${i + 1} — ${['cimento', 'areia lavada', 'vergalhão CA-50', 'tijolo cerâmico', 'telha'][i % 5]}`;
      l.data = dia(i);
      l.valorTotal = 200 + ((i * 91) % 9000);
    });
  }
  if (o.materiais.length) {
    o.materiais = repetir(o.materiais[0], n, (m, i) => {
      m.material = `Material ${i + 1} — ${['bloco estrutural', 'argamassa AC-III', 'porcelanato 60×60', 'tinta acrílica', 'fio 2,5mm'][i % 5]}`;
      m.dataPrevista = dia(i);
      m.quantidade = 10 + (i % 400);
    });
  }
  if (o.recebimentos.length) {
    o.recebimentos = repetir(o.recebimentos[0], n, (r, i) => {
      r.descricao = `Parcela ${i + 1}`;
      r.dataPrevista = dia(i);
      r.valorPrevisto = 5000 + ((i * 313) % 30000);
    });
  }
  if (o.cronograma.length) {
    o.cronograma = repetir(o.cronograma[0], n, (et, i) => {
      et.etapa = `Etapa ${i + 1} — ${['Serviços preliminares', 'Fundação', 'Estrutura', 'Vedação', 'Cobertura'][i % 5]}`;
      et.inicioPrevisto = dia(i);
      et.fimPrevisto = dia(i + 20);
      et.progresso = ((i * 7) % 101) / 100;
      et.peso = 1;
    });
  }
  if (o.diario.length) {
    o.diario = repetir(o.diario[0], n, (d, i) => {
      d.data = dia(i);
      d.atividades = `Frente ${i + 1}: ${['concretagem da laje', 'elevação de alvenaria', 'assentamento de piso', 'chapisco externo', 'instalação de esquadrias'][i % 5]}.`;
      d.efetivo = 3 + (i % 12);
    });
  }

  /* Uma carteira grande também: a lista de obras é uma das telas. */
  for (let i = 1; i < 60; i++) {
    const c = JSON.parse(JSON.stringify(molde));
    c.id = `obra-v-${i}`;
    c.nome = `Obra ${String(i + 1).padStart(3, '0')} — ${['Residencial Aurora', 'Jardim Bela Vista', 'Parque das Flores', 'Morada do Sol'][i % 4]}`;
    c.cidade = ['Goiânia', 'Aparecida de Goiânia', 'Anápolis', 'Senador Canedo'][i % 4];
    c.status = ['Em andamento', 'Planejada', 'Concluída'][i % 3];
    e.obras.push(c);
  }

  return migrar(e);
}

const ESTADOS_DADOS = { vazio, normal, volumoso };

export { ESTADOS_DADOS, normal, vazio, volumoso };
