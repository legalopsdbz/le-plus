/* Legale+ , Modo Daltônico (protanopia e deuteranopia , daltonismo VERMELHO-VERDE).
 * Botão próprio (olho) no canto inferior ESQUERDO, acima do modo noturno. Persiste em
 * chrome.storage.local (espelhado no localStorage).
 *
 * Base fundamental (v4): o usuário tem daltonismo vermelho-verde (protan + deutan). Para
 * esse tipo, o eixo que continua distinguível é o AZUL<->AMARELO, e a LUMINOSIDADE. Então
 * recolorimos por faixa de matiz jogando tudo nesse eixo, com brilhos separados:
 *   quentes (viram lado AMARELO): vermelho -> laranja-escuro/vermelhão; laranja -> laranja;
 *                                 dourado/tan -> amarelo (claro).
 *   frios   (viram lado AZUL):    verde -> azul (escuro); teal -> ciano (claro);
 *                                 roxo -> índigo; azul nativo mantido.
 * Assim vermelho x verde (que a pessoa confunde) viram quente x frio, sempre distinguíveis.
 *
 * Cuidados desta versão:
 *  - Texto PRETO/cinza é preservado (não recolore); só texto colorido de categoria muda.
 *  - Onde um fundo é recolorido, a cor do texto DAQUELE elemento é ajustada (branco/preto)
 *    para garantir contraste e visibilidade (home e demais telas).
 *  - Ícones (relógio, +, material-icons), botões e nossos botões flutuantes ficam com a cor
 *    padrão (não são tocados).
 *  - Reversível (desligar restaura exatamente) e convive com o modo noturno sem deixar
 *    resíduo (guarda o valor original por elemento e propriedade). */
(function () {
  const KEY = 'lp-cvd';
  const CLS = 'lp-cvd-on';

  const SAT_MIN = 0.15;   // abaixo disso é cinza/neutro/preto/branco, não mexe
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // Bordas + SVG (o fundo e o texto têm tratamento próprio abaixo).
  const BORDAS = [
    ['border-top-color', 'lpcvdBt'],
    ['border-right-color', 'lpcvdBr'],
    ['border-bottom-color', 'lpcvdBb'],
    ['border-left-color', 'lpcvdBl'],
    ['fill', 'lpcvdFi'],
    ['stroke', 'lpcvdSt']
  ];
  // Todas as chaves/propriedades que o desligar precisa restaurar.
  const TODAS = [['background-color', 'lpcvdBgc'], ['color', 'lpcvdCo']].concat(BORDAS);

  function ligado() { return document.documentElement.classList.contains(CLS); }

  // ---- cor ----
  function parse(s) {
    const m = (s || '').match(/[\d.]+/g);
    if (!m) return null;
    const r = m.slice(0, 3).map(Number);
    return [r[0], r[1], r[2], m.length >= 4 ? parseFloat(m[3]) : 1];
  }
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let h, s, l = (mx + mn) / 2;
    if (mx === mn) { h = s = 0; }
    else {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      switch (mx) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h *= 60;
    }
    return [h, s, l];
  }
  function hsl2rgb(h, s, l) {
    h /= 360; let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      const hue = (p, q, t) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue(p, q, h + 1 / 3); g = hue(p, q, h); b = hue(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }
  function lumRel(r, g, b) { return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; }

  // Remap para o eixo azul<->amarelo (protan/deutan), com brilho separado por categoria.
  // Retorna [r,g,b] ou null (cinza/preto/branco e azul nativo ficam como estão).
  function remap(r, g, b) {
    const [h, s, l] = rgb2hsl(r, g, b);
    if (s < SAT_MIN) return null;
    let H, S, L;
    if (h >= 340 || h <= 14) { H = 20; S = 0.95; L = clamp(l, 0.38, 0.46); }   // vermelho  -> quente escuro (vermelhão)
    else if (h <= 45) { H = 34; S = 0.95; L = clamp(l, 0.50, 0.58); }          // laranja   -> laranja
    else if (h <= 70) { H = 50; S = 0.98; L = clamp(l, 0.62, 0.72); }          // dourado/tan -> amarelo (claro)
    else if (h <= 163) { H = 224; S = 0.92; L = clamp(l, 0.34, 0.44); }        // verde     -> azul (escuro)
    else if (h <= 200) { H = 190; S = 0.90; L = clamp(l, 0.55, 0.65); }        // teal      -> ciano (claro)
    else if (h <= 258) { return null; }                                       // azul nativo: mantém
    else { H = 255; S = 0.70; L = clamp(l, 0.42, 0.52); }                      // roxo      -> índigo
    return hsl2rgb(H, S, L);
  }
  function str(t, a) { return a < 1 ? `rgba(${t[0]}, ${t[1]}, ${t[2]}, ${a})` : `rgb(${t[0]}, ${t[1]}, ${t[2]})`; }

  // Ícones, botões e elementos de UI que devem manter a cor padrão.
  const PULAR_TAG = new Set(['IMG', 'SVG', 'PATH', 'I', 'CANVAS', 'VIDEO', 'BUTTON']);
  function ehIconeOuBotao(el) {
    const c = (typeof el.className === 'string') ? el.className : (el.className && el.className.baseVal) || '';
    if (/material-icons|mbsc-ic\b|glyphicon|(^|[ _-])fa-|(^| )icon( |$)/i.test(c)) return true;
    if (el.tagName === 'A' && /\bbtn\b/.test(c)) return true; // botões em <a>
    return false;
  }

  function fixEl(el) {
    if (!el || el.nodeType !== 1 || PULAR_TAG.has(el.tagName)) return;
    const id = el.id;
    if (id && id.indexOf('lp-') === 0) return;      // nossos botões/painéis
    if (ehIconeOuBotao(el)) return;                 // ícones e botões: cor padrão
    const cs = getComputedStyle(el);

    // 1) FUNDO. Ao recolorir, garante texto legível NAQUELE elemento (contraste).
    let forcouTexto = false;
    if (el.dataset.lpcvdBgc === undefined) {
      const v = parse(cs.getPropertyValue('background-color'));
      if (v && v[3] !== 0) {
        const t = remap(v[0], v[1], v[2]);
        if (t) {
          el.dataset.lpcvdBgc = el.style.getPropertyValue('background-color') || '';
          el.style.setProperty('background-color', str(t, v[3]), 'important');
          if (el.dataset.lpcvdCo === undefined) {
            const tc = lumRel(t[0], t[1], t[2]) < 0.55 ? [255, 255, 255] : [17, 17, 17];
            el.dataset.lpcvdCo = el.style.getPropertyValue('color') || '';
            el.style.setProperty('color', str(tc, 1), 'important');
            forcouTexto = true;
          }
        }
      }
    }

    // 2) TEXTO colorido (só se o fundo não forçou). Preto/cinza fica como está (SAT_MIN).
    if (!forcouTexto && el.dataset.lpcvdCo === undefined) {
      const v = parse(cs.getPropertyValue('color'));
      if (v && v[3] !== 0) {
        const t = remap(v[0], v[1], v[2]);
        if (t) {
          el.dataset.lpcvdCo = el.style.getPropertyValue('color') || '';
          el.style.setProperty('color', str(t, v[3]), 'important');
        }
      }
    }

    // 3) BORDAS e SVG (fill/stroke).
    for (const [prop, ds] of BORDAS) {
      if (el.dataset[ds] !== undefined) continue;
      const v = parse(cs.getPropertyValue(prop));
      if (!v || v[3] === 0) continue;
      const t = remap(v[0], v[1], v[2]);
      if (!t) continue;
      el.dataset[ds] = el.style.getPropertyValue(prop) || '';
      el.style.setProperty(prop, str(t, v[3]), 'important');
    }
  }

  let varrendo = false;
  function varrer() {
    if (!ligado() || varrendo) return;
    varrendo = true;
    requestAnimationFrame(() => {
      try {
        const els = document.querySelectorAll('body *, body svg *');
        for (let i = 0; i < els.length; i++) fixEl(els[i]);
      } catch (_) { }
      varrendo = false;
    });
  }
  function limpar() {
    for (const [prop, ds] of TODAS) {
      const attr = '[data-' + ds.replace(/([A-Z])/g, '-$1').toLowerCase() + ']';
      document.querySelectorAll(attr).forEach((el) => {
        const orig = el.dataset[ds];
        if (orig) el.style.setProperty(prop, orig); else el.style.removeProperty(prop);
        delete el.dataset[ds];
      });
    }
  }

  function aplicar(on) {
    document.documentElement.classList.toggle(CLS, on);
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (_) { }
    try { if (chrome.storage) chrome.storage.local.set({ [KEY]: on }); } catch (_) { }
    atualizarBotao();
    if (on) varrer(); else limpar();
  }

  // ---------- botão ----------
  function svgOlho() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z');
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', '12'); c.setAttribute('cy', '12'); c.setAttribute('r', '3');
    svg.appendChild(p); svg.appendChild(c);
    return svg;
  }
  function atualizarBotao() {
    const b = document.getElementById('lp-cvd-btn');
    if (!b) return;
    b.title = ligado() ? 'Desligar modo daltônico' : 'Ligar modo daltônico (vermelho-verde)';
    b.setAttribute('aria-pressed', ligado() ? 'true' : 'false');
  }
  function criarBotao() {
    if (document.getElementById('lp-cvd-btn')) return;
    const b = document.createElement('button');
    b.id = 'lp-cvd-btn'; b.type = 'button';
    b.appendChild(svgOlho());
    b.setAttribute('aria-label', 'Alternar modo daltônico');
    b.addEventListener('click', () => aplicar(!ligado()));
    (document.body || document.documentElement).appendChild(b);
    atualizarBotao();
  }

  // Reaplica em conteúdo carregado dinamicamente (agenda via AJAX, modais, troca de mês).
  let obsTimer = null;
  const obs = new MutationObserver(() => {
    if (!ligado()) return;
    clearTimeout(obsTimer);
    obsTimer = setTimeout(varrer, 90);
  });

  function iniciar() {
    criarBotao();
    let inicial = false;
    try { inicial = localStorage.getItem(KEY) === '1'; } catch (_) { }
    try {
      if (chrome.storage) chrome.storage.local.get(KEY, (o) => aplicar(!!(o && o[KEY])));
      else aplicar(inicial);
    } catch (_) { aplicar(inicial); }
    obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    [300, 1000, 2500].forEach((t) => setTimeout(() => { if (ligado()) varrer(); }, t));
    // Rede de segurança: o calendário Mobiscroll redesenha os cartões via AJAX; um
    // sweep leve periódico garante que nenhum cartão novo fique sem recolorir.
    setInterval(() => { if (ligado()) varrer(); }, 1500);
    let scrollTimer = null;
    window.addEventListener('scroll', () => {
      if (!ligado()) return;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(varrer, 100);
    }, true);
    setInterval(criarBotao, 2000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
