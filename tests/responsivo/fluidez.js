/**
 * fluidez.js — Medição de fluidez, com a CPU 4× mais lenta.
 *
 * "Está fluido" não é opinião aqui: é deslocamento de layout, tempo até o
 * pixel mudar, tarefa longa travando a thread e quadros por segundo durante
 * a rolagem. Tudo com throttle de CPU, porque num i7 tudo parece fluido.
 */

const METAS = {
  cls: 0.1, // deslocamento acumulado de layout
  resposta: 100, // ms entre o clique e a tela mudar
  tarefaLonga: 50, // ms de bloqueio da thread principal
  fps: 55, // quadros por segundo durante rolagem
  movimentoReduzido: 0.01, // s — com reduced-motion, nada acima disso
};

/* Observadores instalados ANTES do carregamento: deslocamento de layout e
   tarefa longa só são capturáveis desde o primeiro quadro. */
const OBSERVADORES = () => {
  window.__fluidez = { cls: 0, deslocamentos: [], tarefas: [] };
  try {
    new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) {
        /* Deslocamento logo depois de um clique é resposta à ação, não
           instabilidade: o padrão do CLS ignora os 500ms seguintes. */
        if (e.hadRecentInput) continue;
        window.__fluidez.cls += e.value;
        if (e.value > 0.01) {
          window.__fluidez.deslocamentos.push({
            valor: +e.value.toFixed(4),
            alvos: (e.sources || [])
              .map((s) => (s.node && s.node.nodeName ? s.node.nodeName.toLowerCase() : '?'))
              .slice(0, 3),
          });
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (err) {
    /* navegador sem suporte — a medida fica ausente, não falsa */
  }
  try {
    new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) {
        window.__fluidez.tarefas.push({ dur: Math.round(e.duration), inicio: Math.round(e.startTime) });
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch (err) {
    /* idem */
  }
};

async function lerCls(pagina) {
  return pagina.evaluate(() => ({
    cls: +(window.__fluidez?.cls ?? 0).toFixed(4),
    deslocamentos: window.__fluidez?.deslocamentos ?? [],
  }));
}

async function zerarTarefas(pagina) {
  await pagina.evaluate(() => {
    if (window.__fluidez) window.__fluidez.tarefas = [];
  });
}

async function lerTarefas(pagina) {
  return pagina.evaluate(() => window.__fluidez?.tarefas ?? []);
}

/**
 * Tempo entre acionar algo e a tela realmente mudar.
 * Dois requestAnimationFrame: o primeiro entra na fila do quadro atual, o
 * segundo só roda depois que o navegador pintou.
 */
async function medirResposta(pagina, seletor) {
  return pagina.evaluate(async (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const t0 = performance.now();
    el.click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return Math.round(performance.now() - t0);
  }, seletor);
}

/** Quadros por segundo durante uma rolagem programática do painel. */
async function medirRolagem(pagina) {
  return pagina.evaluate(async () => {
    const alvo =
      document.querySelector('.tela-principal') ||
      document.getElementById('conteudo') ||
      document.scrollingElement;
    const rolavel = alvo.scrollHeight - alvo.clientHeight;
    if (rolavel < 200) return null; // lista curta: nada a medir

    let quadros = 0;
    let parar = false;
    const conta = () => {
      quadros++;
      if (!parar) requestAnimationFrame(conta);
    };
    requestAnimationFrame(conta);

    const t0 = performance.now();
    const duracao = 1200;
    await new Promise((pronto) => {
      const passo = () => {
        const t = (performance.now() - t0) / duracao;
        alvo.scrollTop = Math.min(1, t) * rolavel;
        if (t < 1) requestAnimationFrame(passo);
        else pronto();
      };
      requestAnimationFrame(passo);
    });
    parar = true;
    const decorrido = performance.now() - t0;
    alvo.scrollTop = 0;
    return { fps: +((quadros / decorrido) * 1000).toFixed(1), quadros, ms: Math.round(decorrido) };
  });
}

/** Com movimento reduzido, nada pode animar além de um piscar. */
async function checarMovimentoReduzido(pagina) {
  return pagina.evaluate((limite) => {
    const fora = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      const tempos = [cs.transitionDuration, cs.animationDuration]
        .join(',')
        .split(',')
        .map((t) => {
          t = t.trim();
          if (!t) return 0;
          return t.endsWith('ms') ? parseFloat(t) / 1000 : parseFloat(t) || 0;
        });
      const maior = Math.max(...tempos, 0);
      if (maior > limite) {
        fora.push({
          seletor:
            el.tagName.toLowerCase() +
            (el.id ? '#' + el.id : '') +
            (el.className && typeof el.className === 'string'
              ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
              : ''),
          segundos: maior,
        });
      }
    }
    /* Um mesmo seletor repetido em 200 linhas é um defeito, não duzentos. */
    const unicos = new Map();
    for (const f of fora) if (!unicos.has(f.seletor)) unicos.set(f.seletor, f);
    return [...unicos.values()].slice(0, 20);
  }, METAS.movimentoReduzido);
}

export {
  METAS,
  OBSERVADORES,
  lerCls,
  zerarTarefas,
  lerTarefas,
  medirResposta,
  medirRolagem,
  checarMovimentoReduzido,
};
