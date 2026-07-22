/* Legale+ — bootstrap (world isolado). Liga as metas conforme a escolha do
 * usuário e reage a mudanças de tela (SPA). Meta 1 e Meta 2 são independentes.
 *
 * Meta 1 (render de todos os compromissos) roda no contexto da PÁGINA
 * (src/page-render.js, world MAIN), porque precisa da instância Mobiscroll e da
 * função getCompromissoRapido do site. Aqui só ligamos/desligamos a Meta 1
 * marcando a classe 'lp-meta1-on' no <html>, que o page-render observa.
 *
 * Meta 2 (cronômetro) roda aqui mesmo, injetando o widget no painel do
 * compromisso. Nada remove o comportamento nativo; as metas apenas ADICIONAM. */
(function () {
  const LP = window.LegalePlus;
  const CFG = window.LEGALE_PLUS_CONFIG;
  LP.log('carregado em', location.href);

  const SEL_PAINEL_COMPROMISSO = CFG.seletores.modalCompromisso + ', #formIncluirCompleto';
  let metas = { ...CFG.metasPadrao };

  function aplicarMeta1() {
    document.documentElement.classList.toggle('lp-meta1-on', !!metas.meta1);
  }

  // Meta 3 (ocultar concluídos) roda no world MAIN (page-render), que precisa da
  // instância Mobiscroll. Aqui só marcamos a classe e espelhamos a config de
  // detecção no <html> (atravessa para o MAIN via DOM). Aditivo e reversível.
  let cfg3Espelhada = false;
  function aplicarMeta3() {
    if (!cfg3Espelhada) {
      try {
        document.documentElement.setAttribute('data-lp-cfg3', JSON.stringify(CFG.ocultarConcluidos || {}));
      } catch (_) {}
      cfg3Espelhada = true;
    }
    document.documentElement.classList.toggle('lp-meta3-on', !!metas.meta3);
  }

  // Botão flutuante que abre o mini player (só quando a Meta 2 está ligada).
  function garantirLauncher() {
    let b = document.getElementById('lp-launcher');
    if (!metas.meta2) { if (b) b.remove(); return; }
    if (b) return;
    b = document.createElement('button');
    b.id = 'lp-launcher';
    b.textContent = '⏱';
    b.title = 'Abrir mini player de cronômetros';
    b.addEventListener('click', () => LP.miniplayer.abrir());
    document.body.appendChild(b);
  }

  function ciclo() {
    garantirLauncher();
    if (metas.meta2) {
      document.querySelectorAll(SEL_PAINEL_COMPROMISSO).forEach((p) => LP.meta2.injetar(p));
      // Engata o Salvar do compromisso sempre que o form estiver na tela (editar
      // Resumo / Salvar abre o popup de TS). Idempotente (marca o botão).
      engancharSalvar();
    }
  }

  // Anti-duplicação: uma mesma ação (ex.: concluir que também salva) não deve abrir
  // dois popups de TS. Janela curta compartilhada por TODOS os gatilhos (concluir,
  // salvar, reagendar). Date.now está disponível no runtime da extensão.
  let ultimoTs = 0;
  function podeLancarTs() {
    const n = Date.now();
    if (n - ultimoTs < 4000) return false;
    ultimoTs = n;
    return true;
  }

  // Concluir o compromisso (por qualquer via: modal de detalhe, expandido, aba de
  // edição, com ou sem recorrência): abre o popup de lançamento de time sheet com
  // Início/Fim do compromisso. ADITIVO: não bloqueia a conclusão nativa. Listener
  // delegado, cobrindo as variações de nome do gatilho de conclusão.
  document.addEventListener('click', (e) => {
    if (!metas.meta2) return;
    const btn = e.target.closest && e.target.closest(
      '[onclick*="ConcluirAgenda"], [onclick*="ConcluirCompromisso"], [onclick*="Concluir_Agenda"]'
    );
    if (!btn) return;
    if (!podeLancarTs()) return; // dedup: uma ação = um único popup (não repete na recorrência)
    const cont = btn.closest('.tab-content, .modal, .jconfirm, [class*="modal"], #formIncluirCompleto') || document;
    // RECORRÊNCIA: para efeito do lançamento de time sheet, considera SEMPRE o
    // compromisso ORIGINAL selecionado pelo usuário (uma única ocorrência), nunca a
    // série inteira. Usa o id da própria ação (Concluir...(N)); na falta, o
    // compromisso aberto no momento. A escolha nativa "somente este / todos" do
    // Legale NÃO é alterada: apenas ADICIONAMOS o popup para essa ocorrência, e o
    // anti-duplicação acima garante um único lançamento mesmo se o usuário escolher
    // "todos".
    const oc = btn.getAttribute('onclick') || '';
    const id = (oc.match(/Concluir\w*\((\d+)/) || [])[1] ||
      (LP.compromissoAtual && LP.compromissoAtual.id) || '';
    LP.meta2.lancarDoConcluir(cont, id);
  }, false);

  // Os botões nativos do Legale de criar compromisso ("+" Incluir Compromisso e o
  // raio "Rápido"/flash_on) NÃO são interceptados: seguem com o comportamento
  // original do site. A extensão não interfere na criação de compromissos.

  // O botão "+player" nos cartões (render no contexto da página) avisa por este
  // evento; aqui adicionamos ao mini player e abrimos.
  document.addEventListener('lp-legale-add-player', (e) => {
    const d = e.detail || {};
    if (!d.id) return;
    LP.miniplayer.adicionar({ id: d.id, titulo: d.titulo });
    LP.miniplayer.abrir();
  });

  // Guarda o compromisso aberto no momento (id + título reais vindos da Meta 1),
  // para o botão "⤢ player" do modal enviar o título certo ao mini player.
  document.addEventListener('lp-legale-compromisso-aberto', (e) => {
    const d = e.detail || {};
    if (d.id) LP.compromissoAtual = { id: String(d.id), titulo: d.titulo || '' };
  });

  // Feature 2: botão "🕐" de um card da agenda pediu o lançamento direto de time
  // sheet daquele compromisso (sem concluir/arrastar/cronômetro). Abre o popup.
  document.addEventListener('lp-legale-lancar-ts', (e) => {
    const d = e.detail || {};
    if (!d.id || !metas.meta2) return;
    if (d.titulo) LP.compromissoAtual = { id: String(d.id), titulo: d.titulo };
    LP.meta2.lancarDireto(String(d.id));
  });

  // Arraste -> reagendou: garante o engate do Salvar (o mesmo abaixo, que já vale
  // para qualquer salvamento do compromisso).
  document.addEventListener('lp-legale-reagendado', (e) => {
    const id = (e.detail || {}).id;
    if (!id || !metas.meta2) return;
    engancharSalvar();
  });

  // Engata o botão "Salvar" do compromisso: ao salvar (editar Resumo, concluir dentro
  // do form, reagendar por arraste, ou qualquer alteração), abre o popup de lançamento
  // de time sheet pelo protocolo padrão (snapshot da janela do compromisso). ADITIVO:
  // não impede o salvar nativo. Idempotente (marca o botão) e com anti-duplicação.
  function engancharSalvar() {
    const f = document.querySelector('#formIncluirCompleto');
    if (!f) return;
    const alvos = f.querySelectorAll('button, input[type="submit"], a.btn, a[role="button"]');
    const btn = [...alvos].find((b) => /\bsalvar\b/i.test(b.textContent || b.value || ''));
    if (!btn || btn.dataset.lpTs) return;
    btn.dataset.lpTs = '1';
    btn.addEventListener('click', () => {
      if (!metas.meta2 || !podeLancarTs()) return; // dedup com o gatilho de concluir
      const snap = LP.meta2.snapshotJanela(f.querySelector('#SEQAGENDA')?.value || null); // captura agora
      setTimeout(() => LP.meta2.lancarSnapshot(snap), 1500); // deixa o site salvar antes
    });
  }

  LP.store.get('metasAtivas', CFG.metasPadrao).then((m) => {
    metas = { ...CFG.metasPadrao, ...(m || {}) };
    // Sem popup: expandir (meta1) e cronometro (meta2) sempre ligados; so meta3 pelo botao.
    metas.meta1 = true; metas.meta2 = true;
    aplicarMeta1();
    aplicarMeta3();
    LP.observar(ciclo);
    ciclo();
  });

  // Modo teste (item 4): lido do storage e refletido em CFG.modoTeste, que o módulo
  // de time sheet consulta na hora de gravar. Default desligado.
  LP.store.get('modoTeste', !!CFG.modoTeste).then((v) => { CFG.modoTeste = !!v; });

  // Reage a mudança feita no popup sem precisar recarregar.
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch.metasAtivas) {
      metas = { ...CFG.metasPadrao, ...(ch.metasAtivas.newValue || {}) };
      metas.meta1 = true; metas.meta2 = true;
      aplicarMeta1();
      aplicarMeta3();
      ciclo();
    }
    if (ch.modoTeste) { CFG.modoTeste = !!ch.modoTeste.newValue; }
  });
})();
