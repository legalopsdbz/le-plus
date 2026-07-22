/* Legale+ , Meta 4: Modo Noturno (controle).
 * Liga/desliga o tema escuro (classe lp-dark-on no <html>), persiste a escolha em
 * chrome.storage.local (espelhada no localStorage para aplicar sem piscar) e injeta
 * o botão flutuante Ligar/Desligar. Inclui uma "rede de segurança" que escurece
 * superfícies claras remanescentes (branco/cinza sem cor) de telas que usam classes
 * fora do previsto, sem alterar cores de status nem ícones/imagens. */
(function () {
  const KEY = 'lp-dark';
  const CLS = 'lp-dark-on';

  function ligado() { return document.documentElement.classList.contains(CLS); }

  function aplicar(on) {
    document.documentElement.classList.toggle(CLS, on);
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (_) {}
    try { if (chrome.storage) chrome.storage.local.set({ [KEY]: on }); } catch (_) {}
    atualizarBotao();
    if (on) varrer(); else limparFix();
  }

  function atualizarBotao() {
    const b = document.getElementById('lp-darkmode-btn');
    if (!b) return;
    b.textContent = ligado() ? '☀' : '☾'; // sol quando ligado, lua quando desligado
    b.title = ligado() ? 'Desligar modo noturno' : 'Ligar modo noturno';
  }

  function criarBotao() {
    if (document.getElementById('lp-darkmode-btn')) return;
    const b = document.createElement('button');
    b.id = 'lp-darkmode-btn';
    b.type = 'button';
    b.setAttribute('aria-label', 'Alternar modo noturno');
    b.addEventListener('click', () => aplicar(!ligado()));
    (document.body || document.documentElement).appendChild(b);
    atualizarBotao();
  }

  // --- Rede de segurança ---
  function corRGB(str) { const m = (str || '').match(/\d+(\.\d+)?/g); return m ? m.slice(0, 3).map(Number) : null; }
  function lum(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
  function sat(r, g, b) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; }
  // Claro e sem cor forte (branco/cinza/tinta bem clara). Limiar generoso para
  // pegar também cinzas médios, preservando badges e botões coloridos (saturados).
  function claroSemCor(rgb) { if (!rgb) return false; const [r, g, b] = rgb; return lum(r, g, b) > 168 && sat(r, g, b) < 0.18; }
  function escuroTexto(rgb) { if (!rgb) return false; const [r, g, b] = rgb; return lum(r, g, b) < 120; }
  // Gradiente/imagem de fundo com alguma parada near-branca (faixas de corte
  // "ler mais", cabeçalhos claros). Detecta a presença de uma cor clara sem
  // saturação entre as paradas, cobrindo linear-gradient e -webkit-gradient.
  function gradienteClaro(bi) {
    if (!bi || bi === 'none' || !/gradient/i.test(bi)) return false;
    const rgbs = bi.match(/\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}/g);
    if (!rgbs) return false;
    return rgbs.some((t) => { const p = t.split(',').map((n) => +n); return lum(p[0], p[1], p[2]) > 232 && sat(p[0], p[1], p[2]) < 0.2; });
  }

  // Alfa de uma cor rgba()/hsla() (1 quando opaca ou indefinida).
  function alphaDe(str) {
    const m = (str || '').match(/rgba?\([^)]*\)|hsla?\([^)]*\)/i);
    if (!m) return 1;
    const nums = m[0].match(/\d*\.?\d+/g);
    return (nums && nums.length >= 4) ? parseFloat(nums[3]) : 1;
  }
  // Overlay/backdrop conhecido (Bootstrap, jconfirm, Mobiscroll, modal do Legale e o
  // nosso). NÃO pode virar bloco opaco no escuro (tampa a página atrás).
  function ehOverlayPorClasse(el) {
    const cls = (el.className && el.className.baseVal != null) ? el.className.baseVal : String(el.className || '');
    return /backdrop|overlay|modal-bg|jconfirm-bg|mbsc-fr-overlay|fundoModal|lp-modal-bg/i.test(cls);
  }

  const PULAR = new Set(['IMG', 'SVG', 'PATH', 'I', 'CANVAS', 'VIDEO', 'BUTTON']);
  function fixEl(el) {
    if (!el || el.nodeType !== 1) return;
    if (PULAR.has(el.tagName)) return;
    if (el.classList.contains('material-icons') || el.id === 'lp-darkmode-btn' || el.id === 'lp-launcher') return;
    const cs = getComputedStyle(el);
    const bgStr = cs.backgroundColor;
    const bgTransp = !bgStr || bgStr.indexOf('rgba(0, 0, 0, 0') === 0;
    const claroBg = !bgTransp && claroSemCor(corRGB(bgStr));
    const claroImg = bgTransp && gradienteClaro(cs.backgroundImage);
    // Correção do "bloco sólido": uma superfície clara TRANSLÚCIDA (backdrop/véu de
    // modal) não pode ser opacada, senão cobre o calendário. Recebe um véu escuro
    // translúcido, preservando a visão do fundo. Vale para overlays conhecidos e
    // para qualquer fundo claro com transparência.
    const overlayClaro = (claroBg && alphaDe(bgStr) < 0.9) || (ehOverlayPorClasse(el) && !bgTransp);
    if (overlayClaro) {
      if (!el.classList.contains('lp-dark-fix-overlay')) el.classList.add('lp-dark-fix-overlay');
    } else if ((claroBg || claroImg) && !el.classList.contains('lp-dark-fix')) {
      el.classList.add('lp-dark-fix');
    }
    const fg = corRGB(cs.color);
    if (escuroTexto(fg) && !el.classList.contains('lp-dark-fix-text')) el.classList.add('lp-dark-fix-text');
    // Bordas claras remanescentes: sinaliza o elemento com a classe lp-dark-fix-bd;
    // o RECOLORIR fica por conta do CSS (uma regra só), evitando escrever estilo
    // inline elemento a elemento (o que causava flicker ao montar pop-ups). Só
    // marca se houver alguma borda visível clara e sem cor forte (preserva bordas
    // coloridas de status/tipo).
    if (!el.classList.contains('lp-dark-fix-bd')) {
      for (const L of ['Top', 'Right', 'Bottom', 'Left']) {
        const w = parseFloat(cs['border' + L + 'Width']);
        if (!w) continue;
        const st = cs['border' + L + 'Style'];
        if (!st || st === 'none' || st === 'hidden') continue;
        if (claroSemCor(corRGB(cs['border' + L + 'Color']))) {
          el.classList.add('lp-dark-fix-bd');
          // Reforço: quando a borda clara vem por ESTILO INLINE (o CSS por classe não
          // vence style="border-color:#fff" inline), recolore direto no elemento.
          if (el.style && /border/i.test(el.getAttribute('style') || '')) {
            try { el.style.setProperty('border-color', 'var(--lp-border)', 'important'); } catch (_) {}
          }
          break;
        }
      }
    }
  }
  let varrendo = false;
  function varrer() {
    if (!ligado() || varrendo) return;
    varrendo = true;
    requestAnimationFrame(() => {
      try {
        const els = document.querySelectorAll('body *');
        for (let i = 0; i < els.length; i++) fixEl(els[i]);
      } catch (_) {}
      varrendo = false;
    });
  }
  function limparFix() {
    document.querySelectorAll('.lp-dark-fix').forEach((e) => e.classList.remove('lp-dark-fix'));
    document.querySelectorAll('.lp-dark-fix-overlay').forEach((e) => e.classList.remove('lp-dark-fix-overlay'));
    document.querySelectorAll('.lp-dark-fix-text').forEach((e) => e.classList.remove('lp-dark-fix-text'));
    document.querySelectorAll('.lp-dark-fix-bd').forEach((e) => e.classList.remove('lp-dark-fix-bd'));
  }

  // Reaplica em conteúdo carregado dinamicamente (modais, listas via AJAX,
  // calendários de data, listas de seleção, etc.). DEBOUNCE: pop-ups disparam muitas
  // mutações em rajada; coalescê-las numa só varredura evita o "flicker" de montagem.
  let obsTimer = null;
  const obs = new MutationObserver(() => {
    if (!ligado()) return;
    clearTimeout(obsTimer);
    obsTimer = setTimeout(varrer, 80);
  });

  function iniciar() {
    criarBotao();
    // Reconciliação com a fonte de verdade (chrome.storage); fallback ao localStorage.
    let inicial = false;
    try { inicial = localStorage.getItem(KEY) === '1'; } catch (_) {}
    try {
      if (chrome.storage) chrome.storage.local.get(KEY, (o) => aplicar(!!(o && o[KEY])));
      else aplicar(inicial);
    } catch (_) { aplicar(inicial); }
    obs.observe(document.documentElement, { childList: true, subtree: true });
    // Varreduras adicionais para telas que terminam de montar depois do load
    // (widgets do dashboard, tabelas footable, popups), sem depender só do observer.
    [300, 1000, 2500].forEach((t) => setTimeout(() => { if (ligado()) varrer(); }, t));
    // Varredura ao ROLAR (debounce): a agenda cheia é mais alta que a tela; ao rolar,
    // dias/áreas antes fora da viewport entram claras se não forem varridos. Captura em
    // qualquer contêiner rolável (a agenda tem scroll próprio), por isso useCapture.
    let scrollTimer = null;
    window.addEventListener('scroll', () => {
      if (!ligado()) return;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(varrer, 90);
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
