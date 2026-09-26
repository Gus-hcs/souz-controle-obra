/**
 * checagens.js — As verificações que rodam DENTRO da página.
 *
 * Cada função é enviada ao navegador pelo Playwright, então precisa ser
 * autossuficiente: nada de fechar sobre variável do Node, nada de import.
 * Todas devolvem uma lista de falhas no mesmo formato:
 *
 *   { checagem, gravidade, seletor, medido, meta, detalhe }
 *
 * `gravidade` é 'falha' (quebra o teste) ou 'aviso' (entra no relatório e
 * não reprova) — a diferença existe para que um caso legítimo mas incomum
 * não obrigue a desligar a checagem inteira.
 */

/* Roda no navegador. `ctx` traz a faixa esperada e o nome do viewport. */
function checarLayout(ctx) {
  const falhas = [];
  const TOL = 1.5; // subpixel: o navegador arredonda, e 0,5px não é defeito

  /* ---------------------------------------------------- utilidades */
  const seletor = (el) => {
    if (!el || el === document.body) return 'body';
    const partes = [];
    let n = el;
    while (n && n !== document.body && partes.length < 4) {
      let p = n.tagName.toLowerCase();
      if (n.id) {
        partes.unshift('#' + n.id);
        break;
      }
      const cls = (n.className || '')
        .toString()
        .split(/\s+/)
        .filter((c) => c && !/^(ng-|is-)/.test(c))
        .slice(0, 2);
      if (cls.length) p += '.' + cls.join('.');
      if (n.dataset && n.dataset.acao) p += `[data-acao="${n.dataset.acao}"]`;
      partes.unshift(p);
      n = n.parentElement;
    }
    return partes.join(' > ');
  };

  const visivel = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    /* texto só para leitor de tela (.sr: 1×1px com clip) é invisível de
       propósito — não é texto cortado nem fonte pequena */
    if (r.width <= 1 && r.height <= 1) return false;
    return r.width > 0 && r.height > 0;
  };

  /* Elemento deliberadamente fora de tela (gaveta fechada, por exemplo) não
     é defeito: é o estado normal dele. Reconhecemos pelo translate negativo. */
  const foraDePropósito = (el) => {
    let n = el;
    while (n && n !== document.body) {
      const cs = getComputedStyle(n);
      if (cs.transform && cs.transform !== 'none') {
        const m = cs.transform.match(/matrix\(([^)]+)\)/);
        if (m) {
          const v = m[1].split(',').map(Number);
          if (v[4] <= -10 || v[5] <= -10) return true;
        }
      }
      if (n.hasAttribute('hidden') || n.getAttribute('aria-hidden') === 'true') return true;
      n = n.parentElement;
    }
    return false;
  };

  const todos = [...document.querySelectorAll('body *')].filter(visivel);

  /* Um elemento mais largo que a tela só é defeito se ninguém o contém.
     Dentro de um contêiner que rola de lado — o gantt, uma tabela densa —
     ele é o comportamento desejado: quem rola é a caixa, não a página. */
  const contidoPorRolagem = (el) => {
    let n = el.parentElement;
    while (n && n !== document.body) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowX)) {
        const r = n.getBoundingClientRect();
        if (r.right <= window.innerWidth + TOL && r.left >= -TOL) return true;
      }
      n = n.parentElement;
    }
    return false;
  };

  /* Camada que cobre a tela de propósito: sheet aberto, diálogo, cortina.
     Atrás dela tudo fica inacessível — e deve ficar. */
  const ehCamadaModal = (el) => {
    let n = el;
    while (n && n !== document.body) {
      if (n.id === 'modal-camada') return true;
      if (n.tagName === 'DIALOG' && n.hasAttribute('open')) return true;
      if (n.getAttribute && n.getAttribute('role') === 'dialog') return true;
      n = n.parentElement;
    }
    return false;
  };

  /* ------------------------------------ 1. rolagem horizontal na página */
  const larguraDoc = document.documentElement.scrollWidth;
  if (larguraDoc > window.innerWidth + TOL) {
    falhas.push({
      checagem: 'rolagem-horizontal',
      gravidade: 'falha',
      seletor: 'html',
      medido: `${larguraDoc}px`,
      meta: `≤ ${window.innerWidth}px`,
      detalhe: 'a página inteira rola de lado',
    });
  }

  /* ---------------------------- 2. elemento ultrapassando a viewport
     Só o culpado mais externo entra: se um contêiner estoura, os filhos
     dele estouram junto e listar todos vira ruído. */
  const estourados = [];
  for (const el of todos) {
    if (foraDePropósito(el) || contidoPorRolagem(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth + TOL || r.left < -TOL) {
      if (!estourados.some((p) => p.contains(el))) estourados.push(el);
    }
  }
  for (const el of estourados) {
    const r = el.getBoundingClientRect();
    falhas.push({
      checagem: 'elemento-fora-da-viewport',
      gravidade: 'falha',
      seletor: seletor(el),
      medido: `esquerda ${Math.round(r.left)}px, direita ${Math.round(r.right)}px`,
      meta: `entre 0 e ${window.innerWidth}px`,
      detalhe: (el.innerText || '').trim().slice(0, 60),
    });
  }

  /* ------------------------------------------- 3. texto cortado sem aviso */
  for (const el of todos) {
    if (!el.childNodes.length || foraDePropósito(el)) continue;
    const soTexto = [...el.childNodes].every((n) => n.nodeType === 3);
    if (!soTexto || !el.textContent.trim()) continue;
    const cs = getComputedStyle(el);
    if (cs.overflow === 'visible' && cs.overflowX === 'visible') continue;
    if (cs.textOverflow === 'ellipsis') continue; // corte intencional
    if (el.scrollWidth > el.clientWidth + TOL) {
      falhas.push({
        checagem: 'texto-cortado',
        gravidade: 'falha',
        seletor: seletor(el),
        medido: `conteúdo ${el.scrollWidth}px em caixa de ${el.clientWidth}px`,
        meta: 'cabe, quebra linha ou usa reticências',
        detalhe: el.textContent.trim().slice(0, 60),
      });
    }
  }

  /* -------------------------- 4. elemento interativo coberto por outro */
  const interativos = [...document.querySelectorAll('button, a[href], input, select, textarea, [data-acao], [role="button"]')].filter(visivel);
  for (const el of interativos) {
    if (foraDePropósito(el)) continue;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
    const topo = document.elementFromPoint(x, y);
    if (!topo) continue;
    if (topo === el || el.contains(topo) || topo.contains(el)) continue;
    /* Sheet aberto cobrindo o que está atrás é o trabalho dele. */
    if (ehCamadaModal(topo) && !ehCamadaModal(el)) continue;
    /* Quem não recebe clique não bloqueia ninguém. */
    if (getComputedStyle(topo).pointerEvents === 'none') continue;
    falhas.push({
      checagem: 'interativo-coberto',
      gravidade: 'falha',
      seletor: seletor(el),
      medido: `coberto por ${seletor(topo)}`,
      meta: 'clicável no próprio centro',
      detalhe: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 40),
    });
  }

  /* --------------------------------------------- 5. alvo de toque no dedo */
  if (ctx.alvoMin > 24) {
    const vistos = new Set();
    for (const el of interativos) {
      if (foraDePropósito(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      /* Link dentro de texto corrido não é alvo de toque isolado. */
      if (el.tagName === 'A' && el.parentElement && el.parentElement.textContent.trim() !== el.textContent.trim()) continue;
      const chave = seletor(el);
      if (vistos.has(chave)) continue;
      if (r.width + TOL < ctx.alvoMin || r.height + TOL < ctx.alvoMin) {
        vistos.add(chave);
        falhas.push({
          checagem: 'alvo-de-toque',
          gravidade: 'falha',
          seletor: chave,
          medido: `${Math.round(r.width)}×${Math.round(r.height)}px`,
          meta: `≥ ${ctx.alvoMin}×${ctx.alvoMin}px`,
          detalhe: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 40),
        });
      }
    }
  }

  /* --------------------------------------------------- 6. tamanho de fonte */
  const vistosFonte = new Set();
  for (const el of todos) {
    if (foraDePropósito(el)) continue; // gaveta fechada não está na tela
    const temTextoProprio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!temTextoProprio) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs && fs < 12) {
      const chave = seletor(el);
      if (vistosFonte.has(chave)) continue;
      vistosFonte.add(chave);
      falhas.push({
        checagem: 'fonte-minima',
        gravidade: 'falha',
        seletor: chave,
        medido: `${fs}px`,
        meta: '≥ 12px',
        detalhe: el.textContent.trim().slice(0, 40),
      });
    }
  }

  /* No iOS, campo com fonte menor que 16px faz a página dar zoom sozinha
     quando recebe o foco — e o usuário perde o enquadramento da tela. */
  if (ctx.fonteInput >= 16) {
    const vistosCampo = new Set();
    for (const el of document.querySelectorAll('input, select, textarea')) {
      if (!visivel(el) || foraDePropósito(el)) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      const chave = seletor(el);
      if (vistosCampo.has(chave) || fs >= 16) continue;
      vistosCampo.add(chave);
      falhas.push({
        checagem: 'zoom-no-ios',
        gravidade: 'falha',
        seletor: chave,
        medido: `${fs}px`,
        meta: '≥ 16px em telas de toque',
        detalhe: 'o iOS dá zoom no campo ao focar',
      });
    }
  }

  /* ----------------------------------- 7. imagem ou gráfico fora da caixa */
  for (const el of document.querySelectorAll('img, svg, canvas')) {
    if (!visivel(el) || foraDePropósito(el)) continue;
    const pai = el.parentElement;
    if (!pai) continue;
    const r = el.getBoundingClientRect();
    const rp = pai.getBoundingClientRect();
    if (contidoPorRolagem(el)) continue; // caixa rola de lado: é o padrão certo
    if (r.width > rp.width + TOL + 2) {
      falhas.push({
        checagem: 'grafico-fora-do-container',
        gravidade: 'falha',
        seletor: seletor(el),
        medido: `${Math.round(r.width)}px dentro de ${Math.round(rp.width)}px`,
        meta: 'cabe no contêiner',
        detalhe: el.tagName.toLowerCase(),
      });
    }
  }

  /* --------------------------- 8. largura de leitura em tela muito larga */
  if (window.innerWidth >= 2000) {
    const conteudo = document.getElementById('conteudo');
    if (conteudo) {
      /* Procura o bloco de texto corrido mais largo: é ele que fica
         ilegível quando o conteúdo estica sem limite. */
      let pior = null;
      for (const el of conteudo.querySelectorAll('p, .resumo-nota, .pend-txt span, .vazio p')) {
        if (!visivel(el)) continue;
        const r = el.getBoundingClientRect();
        if (!pior || r.width > pior.w) pior = { el, w: r.width };
      }
      if (pior && pior.w > 900) {
        falhas.push({
          checagem: 'largura-de-leitura',
          gravidade: 'falha',
          seletor: seletor(pior.el),
          medido: `${Math.round(pior.w)}px`,
          meta: '≤ 900px de linha de texto',
          detalhe: 'linha longa demais para ler com conforto',
        });
      }
    }
  }

  /* ------------------------------ 9. faixa de KPIs com cards desiguais
     Padrão de tela (padrao.css): na mesma linha, todos da mesma largura;
     na faixa inteira, todos da mesma altura. Tolerância de 1px. */
  for (const faixa of document.querySelectorAll('.kpis')) {
    if (!visivel(faixa) || foraDePropósito(faixa)) continue;
    const cards = [...faixa.querySelectorAll(':scope > .kpi-item')].filter(visivel);
    if (cards.length < 2) continue;
    const rs = cards.map((c) => c.getBoundingClientRect());
    const linhas = new Map();
    rs.forEach((r) => {
      const k = Math.round(r.top);
      if (!linhas.has(k)) linhas.set(k, []);
      linhas.get(k).push(r.width);
    });
    for (const larguras of linhas.values()) {
      const dif = Math.max(...larguras) - Math.min(...larguras);
      if (dif > 1) {
        falhas.push({
          checagem: 'kpi-largura-desigual',
          gravidade: 'falha',
          seletor: seletor(faixa),
          medido: `${larguras.map((w) => Math.round(w)).join(' / ')}px`,
          meta: 'mesma largura na linha (±1px)',
          detalhe: `${cards.length} cards`,
        });
        break;
      }
    }
    const alturas = rs.map((r) => r.height);
    if (Math.max(...alturas) - Math.min(...alturas) > 1) {
      falhas.push({
        checagem: 'kpi-altura-desigual',
        gravidade: 'falha',
        seletor: seletor(faixa),
        medido: `${alturas.map((h) => Math.round(h)).join(' / ')}px`,
        meta: 'mesma altura (±1px)',
        detalhe: `${cards.length} cards`,
      });
    }
  }

  /* ---------------------- 10. área vazia à direita em tela larga
     A partir de 1440px, o que está mais à direita (tabela, faixa de KPIs,
     bloco de análise, formulário) chega perto da borda útil — ou do
     inspetor aberto. Sobra maior que 10% da largura útil é a tela que
     "quebra no meio". */
  if (window.innerWidth >= 1440) {
    const c = document.getElementById('conteudo');
    const vazia = c && !c.querySelector('table, .kpis, form, .analise-bloco, .rel-previa') && c.querySelector('.vazio');
    if (c && !vazia) {
      const cs = getComputedStyle(c);
      const rc = c.getBoundingClientRect();
      const inspetor = [...c.querySelectorAll('.inspetor')].find((x) => visivel(x));
      const principal = c.querySelector('.tela-principal') || c;
      const esq = principal.getBoundingClientRect().left + parseFloat(getComputedStyle(principal).paddingLeft || 0);
      const borda = inspetor
        ? inspetor.getBoundingClientRect().left
        : rc.right - parseFloat(cs.paddingRight || 0);
      const pecas = [...c.querySelectorAll('table, .kpis, .analise-bloco, .rel-previa, form, .caixa, .cartao, .filtro-barra + .lista-cx')]
        .filter((e) => visivel(e) && (!inspetor || !inspetor.contains(e)) && !e.closest('#modal-camada'))
        .map((e) => e.getBoundingClientRect().right);
      if (pecas.length) {
        const sobra = borda - Math.max(...pecas);
        const util = borda - esq;
        if (util > 0 && sobra > util * 0.1) {
          falhas.push({
            checagem: 'area-vazia-a-direita',
            gravidade: 'falha',
            seletor: '#conteudo',
            medido: `${Math.round(sobra)}px vazios (${Math.round((sobra / util) * 100)}%)`,
            meta: '≤ 10% da largura útil',
            detalhe: 'a tela não usa a largura disponível',
          });
        }
      }
    }
  }

  /* -------------- 11. gráfico ou painel lateral com rolagem de lado
     Painel de análise, coluna de gráficos, painel do cronograma e prévia
     do relatório cabem na própria largura (o Gantt rola por dentro, na
     .tab-rolagem dele — isso não conta). */
  for (const el of document.querySelectorAll('.painel-analise, .analise-bloco, .crono-painel, .fluxo-graficos, .fluxo-topo, .rel-previa')) {
    if (!visivel(el) || foraDePropósito(el)) continue;
    const cs = getComputedStyle(el);
    const rola = /(auto|scroll)/.test(cs.overflowX);
    const r = el.getBoundingClientRect();
    if ((!rola && el.scrollWidth > el.clientWidth + 2) || (rola && el.scrollWidth > el.clientWidth + 2 && !el.querySelector('.tab-rolagem'))) {
      falhas.push({
        checagem: 'painel-rolagem-horizontal',
        gravidade: 'falha',
        seletor: seletor(el),
        medido: `conteúdo ${el.scrollWidth}px em ${el.clientWidth}px`,
        meta: 'cabe na largura do painel',
        detalhe: `${Math.round(r.width)}px de painel`,
      });
    }
  }

  return falhas;
}

/* Checagens do código, não do layout: rodam uma vez só, sem viewport. */
function checarFolhasDeEstilo() {
  const falhas = [];
  /* Propriedades que o navegador não consegue animar na placa de vídeo:
     cada quadro obriga a recalcular layout ou repintar a tela. */
  const caras = ['width', 'height', 'top', 'left', 'right', 'bottom', 'margin', 'padding', 'box-shadow'];

  for (const folha of document.styleSheets) {
    let regras;
    try {
      regras = folha.cssRules;
    } catch (e) {
      continue; // folha de outra origem
    }
    const percorrer = (lista) => {
      for (let i = 0; i < lista.length; i++) {
        const r = lista.item ? lista.item(i) : lista[i];
        /* Primeiro as declarações, depois os filhos: com aninhamento nativo,
           uma regra comum também tem cssRules, e descer antes de ler faria
           pular tudo que ela declara. */
        if (r.cssRules && r.cssRules.length) percorrer(r.cssRules);
        if (!r.style) continue;

        const trans = r.style.transition || r.style.transitionProperty;
        if (trans) {
          for (const prop of caras) {
            const re = new RegExp(`(^|[\\s,])${prop}([\\s,]|$)`);
            if (re.test(trans)) {
              falhas.push({
                checagem: 'anima-propriedade-cara',
                gravidade: 'aviso',
                seletor: r.selectorText || '(regra)',
                medido: trans.trim().slice(0, 70),
                meta: 'animar só transform e opacity',
                detalhe: `"${prop}" força recálculo de layout a cada quadro`,
              });
              break;
            }
          }
        }

        /* 100vh no celular inclui a barra do navegador: o conteúdo fica
           mais alto que a tela e o rodapé some atrás da barra. */
        for (const p of ['height', 'min-height', 'max-height']) {
          const v = r.style.getPropertyValue(p);
          if (v && /\b100vh\b/.test(v)) {
            falhas.push({
              checagem: 'usa-100vh',
              gravidade: 'aviso',
              seletor: r.selectorText || '(regra)',
              medido: `${p}: ${v}`,
              meta: '100dvh',
              detalhe: 'no celular, 100vh conta a barra do navegador',
            });
          }
        }
      }
    };
    percorrer(regras);
  }
  return falhas;
}

export { checarLayout, checarFolhasDeEstilo };
