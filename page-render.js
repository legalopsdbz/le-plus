/* Legale+ , Meta 1 (render) + arrastar-para-outro-dia (world: MAIN).
 *
 * Render: o Mobiscroll limita quantos compromissos desenha por dia (mostra
 * "Ver mais"); os excedentes nem ficam no HTML. A instância expõe todos os
 * eventos em inst.settings.data, então ocultamos o nativo e desenhamos um cartão
 * por compromisso. Clique abre o modal via getCompromissoRapido({event}, inst).
 *
 * Arrastar: segurar um cartão e soltar em outro dia abre a edição do
 * compromisso (AlterarCompleto) já com a NOVA data preenchida, para o usuário
 * revisar o Resumo e salvar (o save é ação humana, sem risco de corromper dado). */
(function () {
  const ROOT_ID = 'compromisso__desktop-calendar';
  const LIMIAR_ARRASTE = 6; // px para diferenciar clique de arraste
  let agendado = false;
  let interacoesLigadas = false;

  function inst() {
    return window.mobiscroll && window.mobiscroll.instances && window.mobiscroll.instances[ROOT_ID];
  }
  function ligado() { return document.documentElement.classList.contains('lp-meta1-on'); }
  function filtroConcluidosLigado() { return document.documentElement.classList.contains('lp-meta3-on'); }

  // --- Meta 3: detecção e ocultação de compromissos CONCLUÍDOS ---
  // Lê a config injetada no world isolado e espelhada no MAIN (window.LEGALE_PLUS_CFG3).
  function cfg3() {
    // O content script (world isolado) espelha CFG.ocultarConcluidos no atributo
    // data-lp-cfg3 do <html>, que atravessa para o world MAIN via DOM.
    try {
      const raw = document.documentElement.getAttribute('data-lp-cfg3');
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return {
      camposVerdadeiro: ['concluido', 'realizado'],
      camposSituacao: ['situacao', 'idsituacao', 'status'],
      valoresConcluido: ['concluido', 'concluído', 'realizado', 'C', 'R', '2', '3'],
      usarCorComoFallback: false, coresConcluido: [],
    };
  }
  function norm(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
  // Verdadeiro se o evento estiver marcado como concluído, segundo a config (TUNE ao vivo).
  function estaConcluido(ev) {
    if (!ev) return false;
    const c = cfg3();
    for (const campo of (c.camposVerdadeiro || [])) {
      const val = ev[campo];
      if (val === true || val === 1 || norm(val) === 'true' || norm(val) === 's' ||
          norm(val) === '1' || norm(val) === 'sim') return true;
    }
    const alvos = (c.valoresConcluido || []).map(norm);
    for (const campo of (c.camposSituacao || [])) {
      if (campo in ev && alvos.includes(norm(ev[campo]))) return true;
    }
    if (c.usarCorComoFallback && (c.coresConcluido || []).map(norm).includes(norm(ev.color))) return true;
    return false;
  }

  // Oculta/mostra os nós nativos (mbsc-cal-txt) e os cartões da Meta 1 (lp-card)
  // dos compromissos concluídos. Aditivo e reversível: só marca a classe.
  function aplicarFiltroConcluidos() {
    const i = inst();
    const root = i && i.element;
    if (!root) return;
    const ligar = filtroConcluidosLigado();
    const data = (i.settings && i.settings.data) || [];
    const concluido = new Set();
    data.forEach((ev) => { if (ligar && estaConcluido(ev)) concluido.add(String(ev.idagenda)); });
    // Nativos do Mobiscroll e cartões da Meta 1.
    root.querySelectorAll('.mbsc-cal-txt[data-id], .lp-card[data-idag]').forEach((el) => {
      const id = String(el.getAttribute('data-id') || el.getAttribute('data-idag') || '');
      el.classList.toggle('lp-oculto-concluido', ligar && concluido.has(id));
    });
  }
  function toFull(ds) {
    const p = (ds || '').split('/').map(Number);
    return p.length < 3 ? '' : p[2] + '-' + p[1] + '-' + p[0];
  }
  function fullParaBR(full) { // "aaaa-m-d" -> "dd/mm/aaaa"
    const p = (full || '').split('-').map(Number);
    if (p.length < 3) return '';
    const z = (n) => String(n).padStart(2, '0');
    return z(p[2]) + '/' + z(p[1]) + '/' + p[0];
  }
  function horaDoTexto(txt) {
    const m = (txt || '').match(/mbsc-event-hour-label">([^<]+)</);
    return m ? m[1].trim() : '';
  }
  // Hora exibível do compromisso: vazia quando é dia inteiro / sem horário
  // (o Legale rotula esses como "00:00", que não deve poluir o cartão).
  function horaVisivel(ev) {
    const h = horaDoTexto(ev.text);
    if (!h) return '';
    if (/^0?0[:h]0{0,2}$/.test(h.replace(/\s/g, ''))) return ''; // 00:00, 0:00, 00h00
    return h;
  }
  function eventoPorId(idag) {
    const i = inst();
    return i ? (i.settings.data || []).find((e) => String(e.idagenda) === String(idag)) : null;
  }
  function escapar(s) {
    return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function limpar(root) {
    root.classList.remove('lp-render-on');
    root.querySelectorAll('.lp-card').forEach((e) => e.remove());
    root.querySelectorAll('.mbsc-cal-day-markup[data-lp-sig]').forEach((m) => m.removeAttribute('data-lp-sig'));
  }

  function render() {
    const i = inst();
    if (!i || !i.element) return;
    const root = i.element;
    if (!ligado()) { limpar(root); aplicarFiltroConcluidos(); return; }
    root.classList.add('lp-render-on');
    ligarInteracoes(root);

    const data = (i.settings && i.settings.data) || [];
    const porDia = {};
    data.forEach((ev) => { const f = toFull(ev.start_string); if (f) (porDia[f] = porDia[f] || []).push(ev); });

    root.querySelectorAll('.mbsc-cal-day[data-full]').forEach((cell) => {
      const mk = cell.querySelector('.mbsc-cal-day-markup');
      if (!mk) return;
      const evs = porDia[cell.getAttribute('data-full')] || [];
      const sig = evs.map((e) => e.idagenda).join(',');
      if (mk.getAttribute('data-lp-sig') === sig && mk.querySelector('.lp-card')) return;
      mk.querySelectorAll('.lp-card').forEach((e) => e.remove());
      mk.setAttribute('data-lp-sig', sig);
      evs.forEach((ev) => {
        const card = document.createElement('div');
        card.className = 'lp-card';
        card.dataset.idag = ev.idagenda;
        card.style.setProperty('--c', ev.color || '#144D2E');
        const hora = horaVisivel(ev);
        card.innerHTML = '<span class="lp-card-t">' + (hora ? '<b>' + hora + '</b> ' : '') +
          escapar(ev.titulo || '') + '</span>' +
          '<button class="lp-card-ts" title="Lançar time sheet deste compromisso">🕐</button>' +
          '<button class="lp-card-add" title="Enviar ao mini player">+</button>';
        card.title = (hora ? hora + ' ' : '') + (ev.titulo || '');
        mk.appendChild(card);
      });
    });
    aplicarFiltroConcluidos();
  }

  // Acha a célula de dia cujo retângulo contém (x,y) , por geometria, para não
  // depender de elementFromPoint (que o overlay de trava bloquearia).
  function celulaEm(root, x, y) {
    let achou = null;
    root.querySelectorAll('.mbsc-cal-day[data-full]').forEach((c) => {
      if (achou) return;
      const r = c.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && r.width > 4) achou = c;
    });
    return achou;
  }

  // --- Clique, "+player" e arraste (delegação; sobrevive ao re-render) ---
  function ligarInteracoes(root) {
    if (interacoesLigadas) return;
    interacoesLigadas = true;
    let alvo = null, x0 = 0, y0 = 0, arrastando = false, ghost = null, ultimaCel = null, overlay = null;
    // Estado do auto-scroll durante o arraste (rolar segurando o compromisso).
    let lastX = 0, lastY = 0, rafScroll = null, scrollSpeed = 0, scrollerCache = null;

    // Acha o contêiner rolável na vertical mais próximo do calendário (o
    // .mbsc-cal-scroll-c que a Meta 1 libera com overflow-y:auto); se não houver
    // ou já estiver no limite, cai para a rolagem da janela.
    function scrollerVertical() {
      if (scrollerCache && document.contains(scrollerCache)) return scrollerCache;
      let el = root;
      while (el && el !== document.body && el.nodeType === 1) {
        const cs = getComputedStyle(el);
        if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 2) break;
        el = el.parentElement;
      }
      scrollerCache = (el && el !== document.body && el.scrollHeight > el.clientHeight + 2) ? el : null;
      return scrollerCache;
    }
    // Rola dy px: tenta o contêiner interno; se ele não se moveu (chegou ao fim),
    // rola a janela. Assim funciona tanto na agenda com scroll próprio quanto na
    // página inteira mais alta que a tela.
    function rolar(dy) {
      const el = scrollerVertical();
      if (el) {
        const antes = el.scrollTop;
        el.scrollTop += dy;
        if (el.scrollTop !== antes) return;
      }
      window.scrollBy(0, dy);
    }
    // Realça o dia sob o ponteiro (reavaliado a cada quadro enquanto rola).
    function marcarCelula(x, y) {
      const cel = celulaEm(root, x, y);
      if (ultimaCel && ultimaCel !== cel) ultimaCel.classList.remove('lp-alvo-dia');
      if (cel) cel.classList.add('lp-alvo-dia');
      ultimaCel = cel;
    }
    // Laço de rolagem automática por proximidade da borda da viewport.
    function passoAutoScroll() {
      if (!arrastando || !scrollSpeed) { rafScroll = null; return; }
      rolar(scrollSpeed);
      if (ghost) { ghost.style.left = lastX + 8 + 'px'; ghost.style.top = lastY + 8 + 'px'; }
      marcarCelula(lastX, lastY);
      rafScroll = requestAnimationFrame(passoAutoScroll);
    }
    // Define a velocidade conforme a distância do ponteiro às bordas superior/
    // inferior da janela; liga/desliga o laço. Só na vertical (não troca de mês).
    function avaliarAutoScroll(y) {
      const EDGE = 72, MAX = 20, h = window.innerHeight;
      let v = 0;
      if (y < EDGE) v = -MAX * (EDGE - y) / EDGE;
      else if (y > h - EDGE) v = MAX * (y - (h - EDGE)) / EDGE;
      scrollSpeed = v;
      if (v && !rafScroll) rafScroll = requestAnimationFrame(passoAutoScroll);
    }
    function pararAutoScroll() {
      scrollSpeed = 0;
      if (rafScroll) { cancelAnimationFrame(rafScroll); rafScroll = null; }
      scrollerCache = null;
    }

    // Botão "🕐" (Feature 2): abre o lançamento de time sheet deste compromisso,
    // sem concluir/arrastar/cronômetro. Avisa o mundo isolado, que chama meta2.lancarDireto.
    root.addEventListener('click', (e) => {
      const ts = e.target.closest('.lp-card-ts');
      if (!ts) return;
      e.stopPropagation(); e.preventDefault();
      const card = ts.closest('.lp-card');
      const ev = eventoPorId(card.dataset.idag);
      if (ev) {
        document.dispatchEvent(new CustomEvent('lp-legale-lancar-ts', {
          detail: { id: ev.idagenda, titulo: ev.titulo || ('Compromisso ' + ev.idagenda) },
        }));
      }
    }, true);

    // Botão "+player": envia ao mini player e não dispara clique/arraste.
    root.addEventListener('click', (e) => {
      const add = e.target.closest('.lp-card-add');
      if (!add) return;
      e.stopPropagation(); e.preventDefault();
      const card = add.closest('.lp-card');
      const ev = eventoPorId(card.dataset.idag);
      if (ev) {
        document.dispatchEvent(new CustomEvent('lp-legale-add-player', {
          detail: { id: ev.idagenda, titulo: ev.titulo || ('Compromisso ' + ev.idagenda) },
        }));
      }
    }, true);

    // mousedown em CAPTURA + stopPropagation: impede o Mobiscroll de iniciar o
    // arraste/deslize do calendário quando começamos a arrastar um cartão.
    root.addEventListener('mousedown', (e) => {
      if (e.target.closest('.lp-card-add') || e.target.closest('.lp-card-ts')) return; // botões do card
      const card = e.target.closest('.lp-card');
      if (!card) return;
      alvo = card; x0 = e.clientX; y0 = e.clientY; arrastando = false;
      e.preventDefault(); e.stopPropagation();
    }, true);

    document.addEventListener('mousemove', (e) => {
      if (!alvo) return;
      if (!arrastando && Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) > LIMIAR_ARRASTE) {
        arrastando = true;
        // Trava o calendário: overlay por cima captura os eventos, o Mobiscroll
        // não recebe e não desliza o mês durante o arraste.
        overlay = document.createElement('div');
        overlay.className = 'lp-drag-overlay';
        // A roda do mouse durante o arraste rola a agenda em vez de ser bloqueada
        // pelo overlay: permite alcançar dias fora da tela sem soltar o cartão.
        overlay.addEventListener('wheel', (ev) => {
          ev.preventDefault();
          rolar(ev.deltaY);
          if (ghost) { ghost.style.left = lastX + 8 + 'px'; ghost.style.top = lastY + 8 + 'px'; }
          marcarCelula(lastX, lastY);
        }, { passive: false });
        document.body.appendChild(overlay);
        ghost = alvo.cloneNode(true);
        ghost.classList.add('lp-card-ghost');
        document.body.appendChild(ghost);
      }
      if (arrastando) {
        e.preventDefault();
        lastX = e.clientX; lastY = e.clientY;
        if (ghost) { ghost.style.left = e.clientX + 8 + 'px'; ghost.style.top = e.clientY + 8 + 'px'; }
        marcarCelula(e.clientX, e.clientY);
        avaliarAutoScroll(e.clientY); // rola sozinho perto das bordas superior/inferior
      }
    }, true);

    document.addEventListener('mouseup', (e) => {
      if (!alvo) return;
      const card = alvo; alvo = null;
      if (!arrastando) { // clique simples: abrir o compromisso
        const ev = eventoPorId(card.dataset.idag);
        if (ev) {
          try { getCompromissoRapido({ event: ev }, inst()); } catch (_) {}
          // Avisa o mundo isolado qual compromisso (id + título reais) está aberto,
          // para o botão "⤢ player" do modal enviar o título correto ao mini player.
          document.dispatchEvent(new CustomEvent('lp-legale-compromisso-aberto', {
            detail: { id: ev.idagenda, titulo: ev.titulo || '' },
          }));
        }
        return;
      }
      arrastando = false;
      pararAutoScroll();
      const cel = celulaEm(root, e.clientX, e.clientY);
      if (ghost) { ghost.remove(); ghost = null; }
      if (overlay) { overlay.remove(); overlay = null; }
      if (ultimaCel) ultimaCel.classList.remove('lp-alvo-dia');
      ultimaCel = null;
      if (!cel) return;
      const novoFull = cel.getAttribute('data-full');
      const ev = eventoPorId(card.dataset.idag);
      if (!ev || toFull(ev.start_string) === novoFull) return; // sem alvo ou mesmo dia
      reagendar(ev, novoFull);
    }, true);
  }

  // Abre a edição do compromisso já com a nova data; usuário revisa e salva.
  function reagendar(ev, novoFull) {
    const novaBR = fullParaBR(novoFull);
    try { AlterarCompleto(ev.idagenda); } catch (_) { return; }
    let tentativas = 0;
    const timer = setInterval(() => {
      const f = document.querySelector('#formIncluirCompleto');
      if (f) {
        clearInterval(timer);
        trocarDataDoForm(f, novaBR);
        realce(f);
        // Avisa o mundo isolado: reagendou o compromisso X. Ele engancha o SALVAR
        // e, ao salvar, encadeia o lançamento do time sheet pela janela do compromisso.
        document.dispatchEvent(new CustomEvent('lp-legale-reagendado', { detail: { id: ev.idagenda } }));
      } else if (++tentativas > 30) {
        clearInterval(timer);
      }
    }, 150);
  }

  // Acha o input associado a um <label> cujo texto contém TODOS os termos.
  function inputPorRotulo(f, termos) {
    const labels = f.querySelectorAll('label, .control-label, .form-label');
    for (const lb of labels) {
      const t = (lb.textContent || '').toLowerCase();
      if (!termos.every((x) => t.includes(x))) continue;
      const forId = lb.getAttribute('for');
      if (forId) { const el = f.querySelector('#' + (window.CSS ? CSS.escape(forId) : forId)); if (el) return el; }
      const grp = lb.closest('.form-group, .mb-3, .col, .row, div');
      const el = grp && grp.querySelector('input, textarea');
      if (el) return el;
    }
    return null;
  }

  // Troca SÓ a parte da data (dd/mm/aaaa) preservando a hora, em TODOS os campos de
  // data do compromisso. CRÍTICO: além dos visíveis "Início/Término (dia com hora)"
  // (DAGENDA/DAGENDAF), o form tem os campos OCULTOS dataInicio/dataFim, que são os
  // que o servidor usa no submit (/Compromisso/AlterarCompleto). Se só os visíveis
  // fossem trocados, o Salvar persistia a data ANTIGA e o compromisso ficava no mesmo
  // dia. Por isso atualizamos os dois pares sempre, cada um no seu formato.
  function trocarDataDoForm(f, novaBR) {
    const RE = /\d{2}\/\d{2}\/\d{4}/;
    const alvos = new Set();
    // 1) visíveis por rótulo (início/término com hora)
    [['início', 'hora'], ['inicio', 'hora'], ['término', 'hora'], ['termino', 'hora']]
      .forEach((termos) => { const el = inputPorRotulo(f, termos); if (el) alvos.add(el); });
    // 2) SEMPRE os campos conhecidos, inclusive os OCULTOS de submit (dataInicio/dataFim)
    f.querySelectorAll(
      '#DAGENDA, [name="DAGENDA"], #DAGENDAF, [name="DAGENDAF"], ' +
      '#DAGENDA-SEM-HORA, #DAGENDAF-SEM-HORA, ' +
      '[name="dataInicio"], [name="dataFim"]'
    ).forEach((el) => alvos.add(el));
    alvos.forEach((el) => {
      const v = el.value || '';
      el.value = RE.test(v) ? v.replace(RE, novaBR) : (novaBR + (v ? ' ' + v : ''));
      ['input', 'change', 'keyup', 'blur'].forEach((t) => el.dispatchEvent(new Event(t, { bubbles: true })));
    });
    return alvos.size;
  }

  function realce(f) {
    const resumo = f.querySelector('#RESUMO');
    if (resumo) { try { resumo.focus(); } catch (_) {} }
    const t = document.createElement('div');
    t.className = 'lp-toast';
    t.textContent = 'Nova data preenchida. Revise o Resumo e clique em Salvar.';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 5000);
  }

  function agendar() {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(() => { agendado = false; render(); });
  }

  function iniciar() {
    const i = inst();
    if (i && i.element) {
      new MutationObserver(agendar).observe(i.element, { childList: true, subtree: true });
      new MutationObserver(agendar).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      render();
    } else {
      setTimeout(iniciar, 500);
    }
  }
  iniciar();
})();
