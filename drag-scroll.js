/* Legale+ , rolagem automática durante o arraste (aditivo, world isolado).
 *
 * OBJETIVO: ao arrastar um compromisso/prazo para reagendar, a tela acompanha o
 * ponteiro, subindo ou descendo sozinha quando ele chega perto das bordas
 * superior/inferior da janela; e a roda do mouse rola a agenda mesmo durante o
 * arraste. Assim dá para alcançar dias fora da tela sem soltar o item.
 *
 * Por que um módulo à parte: o arraste dos CARTÕES da própria extensão
 * (page-render.js) já tem esse auto-scroll. Este módulo cobre, SEM alterar nada
 * do que existe, o arraste NATIVO do Legale (Mobiscroll) e qualquer arraste em
 * que o overlay da extensão não esteja em cena. É puramente ADITIVO: só rola a
 * página; não cria, move nem salva nada. Quando o arraste da extensão está ativo
 * (existe .lp-drag-overlay), este módulo se cala e deixa o page-render conduzir,
 * para não rolar em dobro. */
(function () {
  'use strict';

  const CFG = window.LEGALE_PLUS_CONFIG || {};
  const ROTA = CFG.rotaCompromissos || /\/Compromisso(\/|$|\?)/i;
  function naAgenda() { return ROTA.test(location.pathname + location.search); }

  const EDGE = 80;   // faixa (px) junto à borda que dispara a rolagem
  const MAX = 22;    // velocidade máxima (px por quadro)

  const LIMIAR = 6;  // px de movimento com botão pressionado que caracteriza arraste

  let arrastando = false;
  let lastY = 0, lastX = 0;
  let startX = 0, startY = 0;
  let raf = null, speed = 0;
  let scroller = null;

  // O arraste da PRÓPRIA extensão já é tratado pelo page-render; aqui só agimos
  // quando NÃO há o overlay dele (para não rolar duas vezes).
  function overlayDaExtensao() { return !!document.querySelector('.lp-drag-overlay'); }

  // Há um arraste NATIVO em andamento? O Mobiscroll, ao arrastar um evento,
  // insere um clone/estado com classe contendo "drag"; cobrimos as variações
  // conhecidas e o draggable nativo do HTML5.
  function arrasteNativoAtivo() {
    return !!document.querySelector(
      '.mbsc-calendar-dragging, .mbsc-drag-clone, .mbsc-event-drag, ' +
      '.mbsc-calendar-drag, .mbsc-drag, [aria-grabbed="true"]'
    );
  }

  // Contêiner rolável na vertical mais próximo do calendário; se não houver ou
  // já estiver no limite, cai para a rolagem da janela.
  function acharScroller(alvo) {
    let el = alvo && alvo.nodeType === 1 ? alvo : document.body;
    while (el && el !== document.body && el.nodeType === 1) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 2) return el;
      el = el.parentElement;
    }
    // fallback: a agenda grande da Meta 1 costuma ser um .mbsc-cal-scroll-c rolável
    const cand = document.querySelector('.mbsc-cal-scroll-c, .mbsc-cal-scroll, .mbsc-calendar-scroll');
    if (cand && cand.scrollHeight > cand.clientHeight + 2) return cand;
    return null;
  }

  function rolar(dy) {
    const el = scroller;
    if (el && document.contains(el)) {
      const antes = el.scrollTop;
      el.scrollTop += dy;
      if (el.scrollTop !== antes) return;
    }
    window.scrollBy(0, dy);
  }

  function passo() {
    if (!arrastando || !speed) { raf = null; return; }
    rolar(speed);
    raf = requestAnimationFrame(passo);
  }

  function avaliar(y) {
    const h = window.innerHeight;
    let v = 0;
    if (y < EDGE) v = -MAX * (EDGE - y) / EDGE;
    else if (y > h - EDGE) v = MAX * (y - (h - EDGE)) / EDGE;
    speed = v;
    if (v && !raf) raf = requestAnimationFrame(passo);
  }

  function iniciarArraste(alvo, y) {
    if (arrastando) return;
    arrastando = true;
    scroller = acharScroller(alvo);
    avaliar(y);
  }

  function pararArraste() {
    arrastando = false;
    speed = 0;
    scroller = null;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
  }

  // Um botão do mouse pressionado + movimento pode ser o começo de um arraste
  // nativo. Só ligamos o auto-scroll quando confirmamos, num quadro seguinte,
  // que existe de fato um arraste nativo em cena (evita rolar em cliques/seleções).
  let mouseBaixo = false;

  document.addEventListener('mousedown', (e) => {
    if (!naAgenda() || e.button !== 0) return;
    mouseBaixo = true;
    startX = lastX = e.clientX; startY = lastY = e.clientY;
  }, true);

  document.addEventListener('mousemove', (e) => {
    if (!naAgenda()) return;
    lastX = e.clientX; lastY = e.clientY;
    if (overlayDaExtensao()) { pararArraste(); return; } // page-render conduz o próprio arraste
    if (!arrastando) {
      // Liga o auto-scroll quando o usuário SEGURA e ARRASTA na agenda (botão
      // pressionado + deslocamento além do limiar), sem depender de reconhecer a
      // classe interna do Mobiscroll. Um clique parado (sem mover) não dispara.
      if (mouseBaixo && (e.buttons & 1)) {
        const dist = Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY);
        const arrasteReal = dist > LIMIAR || arrasteNativoAtivo();
        if (arrasteReal) iniciarArraste(e.target, e.clientY);
        else return;
      } else return;
    }
    avaliar(e.clientY);
  }, true);

  function encerrar() { mouseBaixo = false; pararArraste(); }
  document.addEventListener('mouseup', encerrar, true);
  document.addEventListener('dragend', encerrar, true);
  window.addEventListener('blur', encerrar, true);

  // Arraste nativo do HTML5 (dragstart/dragover/drop): também acompanha a borda.
  document.addEventListener('dragstart', (e) => {
    if (!naAgenda() || overlayDaExtensao()) return;
    iniciarArraste(e.target, e.clientY);
  }, true);
  document.addEventListener('dragover', (e) => {
    if (!arrastando) return;
    if (e.clientY) { lastY = e.clientY; avaliar(e.clientY); }
  }, true);
  document.addEventListener('drop', encerrar, true);

  // Roda do mouse durante o arraste: rola a agenda em vez de ficar bloqueada.
  // Só interfere quando há arraste ativo (e sem o overlay da extensão, que já
  // trata a própria roda); fora disso, a rolagem segue normal.
  document.addEventListener('wheel', (e) => {
    if (!arrastando || overlayDaExtensao()) return;
    if (!scroller) scroller = acharScroller(e.target);
    e.preventDefault();
    rolar(e.deltaY);
  }, { capture: true, passive: false });
})();
