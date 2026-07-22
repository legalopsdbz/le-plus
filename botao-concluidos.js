/* Legale+ , botão "Ocultar compromissos concluídos" (Meta 3).
 * Fica ANCORADO ao lado dos botões RÁPIDO / COMPLETO (criação de compromisso), abaixo do
 * mini calendário à esquerda, no fluxo da página. Usa as classes de botão do próprio Legale
 * (btn btn-raised btn-xs) nas cores DBZ (verde #144D2E, dourado #B4892A). O modo daltônico
 * recolore automaticamente (o verde vira azul junto com o resto). A escolha é salva em
 * chrome.storage (metasAtivas.meta3); content.js/page-render aplicam pela classe lp-meta3-on. */
(function () {
  'use strict';
  const ID = 'lp-btn-concluidos';
  let ligado = false;

  async function lerEstado() {
    try {
      const o = await chrome.storage.local.get('metasAtivas');
      ligado = !!(o.metasAtivas && o.metasAtivas.meta3);
    } catch (_) { ligado = false; }
  }
  async function gravarEstado(on) {
    ligado = on;
    try {
      const o = await chrome.storage.local.get('metasAtivas');
      const m = Object.assign({ meta1: true, meta2: true, meta3: false }, o.metasAtivas || {});
      m.meta3 = on;
      await chrome.storage.local.set({ metasAtivas: m });
    } catch (_) {}
    document.documentElement.classList.toggle('lp-meta3-on', on);
    pintar();
  }

  // Âncora: contêiner dos botões RÁPIDO / COMPLETO de criação (btn-raised), abaixo do mini
  // calendário. Evita as abas do topo (que não são .btn-raised).
  function acharAncora() {
    const btns = [...document.querySelectorAll('a.btn-raised, button.btn-raised')];
    let rap = null, comp = null;
    for (const el of btns) {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (/compl[eé]to/.test(t) && t.length <= 16) comp = comp || el;
      if (/r[áa]pido/.test(t) && t.length <= 16) rap = rap || el;
    }
    const alvo = comp || rap;
    return alvo ? alvo.parentElement : null;
  }

  function criarBotao() {
    const b = document.createElement('button');
    b.id = ID;
    b.type = 'button';
    b.className = 'btn btn-raised ease btn-xs marginLeft10';
    b.style.cssText = 'background:#144D2E;color:#fff;border:1px solid #B4892A;display:inline-flex;align-items:center;gap:5px;vertical-align:middle;';
    const ic = document.createElement('i'); ic.className = 'material-icons lp-ic'; ic.style.fontSize = '15px'; ic.textContent = 'visibility';
    const tx = document.createElement('span'); tx.className = 'marginLef5 lp-tx'; tx.textContent = 'Ocultar Concluídos';
    b.appendChild(ic); b.appendChild(tx);
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); gravarEstado(!ligado); });
    return b;
  }

  function pintar() {
    const b = document.getElementById(ID);
    if (!b) return;
    const ic = b.querySelector('.lp-ic');
    if (ligado) {
      b.style.setProperty('background', '#B4892A');
      b.style.setProperty('color', '#14140f');
      if (ic) ic.textContent = 'visibility_off';
      b.title = 'Compromissos concluídos ocultos. Clique para mostrar.';
    } else {
      b.style.setProperty('background', '#144D2E');
      b.style.setProperty('color', '#fff');
      if (ic) ic.textContent = 'visibility';
      b.title = 'Mostrando todos. Clique para ocultar os concluídos.';
    }
  }

  function injetar() {
    const anc = acharAncora();
    const existente = document.getElementById(ID);
    if (!anc) { if (existente) existente.remove(); return; } // sem a barra, aguarda o próximo ciclo
    if (existente && existente.parentElement !== anc) existente.remove();
    if (!document.getElementById(ID)) anc.appendChild(criarBotao());
    pintar();
  }

  try {
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === 'local' && ch.metasAtivas) {
        ligado = !!(ch.metasAtivas.newValue && ch.metasAtivas.newValue.meta3);
        pintar();
      }
    });
  } catch (_) {}

  lerEstado().then(() => {
    injetar();
    // a agenda re-renderiza (troca de mês/SPA): garante o botão de tempos em tempos.
    setInterval(injetar, 1500);
  });
})();
