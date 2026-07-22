/* Legale+ — Meta 2: cronômetro "relojinho" no compromisso.
 * É uma ADIÇÃO, não substitui o fluxo atual. O usuário segue preenchendo o
 * resumo e concluindo/reagendando como sempre; o relojinho apenas mede o tempo
 * REAL (início/fim) e, ao concluir, oferece o lançamento do time sheet na
 * tarefa vinculada, usando o mesmo resumo. */
window.LegalePlus = window.LegalePlus || {};

(function (LP) {
  const CFG = window.LEGALE_PLUS_CONFIG;

  // Identificador REAL do compromisso (idagenda). Prioriza fontes locais ao painel,
  // para NÃO colidir entre compromissos diferentes: o modal de detalhe do Legale
  // não tem id/SEQAGENDA próprios, só o botão AlterarCompleto(N); o form completo
  // tem #SEQAGENDA. O antigo fallback por location.pathname dava o MESMO id a todos
  // os compromissos abertos na mesma tela, impedindo a lista de vários no mini player.
  function idDoCompromisso(container) {
    return (
      container.querySelector('#SEQAGENDA, [name="SEQAGENDA"]')?.value ||
      container.getAttribute('data-id') ||
      container.getAttribute('data-compromisso') ||
      idAlterarCompleto(container) ||
      (LP.compromissoAtual && LP.compromissoAtual.id) ||
      ''
    );
  }

  // Id do compromisso a partir do botão de editar do modal (onclick/href com
  // AlterarCompleto(N)) , usado quando não veio pela Meta 1 nem pelo form.
  function idAlterarCompleto(container) {
    const el = container.querySelector('[onclick*="AlterarCompleto("], [href*="AlterarCompleto("]');
    const src = el ? (el.getAttribute('onclick') || el.getAttribute('href') || '') : '';
    const m = src.match(/AlterarCompleto\((\d+)/);
    return m ? m[1] : '';
  }

  // Título exibido no cabeçalho do modal de detalhe (a faixa colorida). O modal de
  // detalhe do Legale usa .compromisso__rapido-header > h4 (confirmado ao vivo).
  function tituloDoModal(container) {
    const h = container.querySelector(
      '.compromisso__rapido-header h4, .modal-header h4, .modal-title, ' +
      '[class*="titulo"], [class*="Titulo"], h1, h2, h3'
    );
    const t = h ? (h.textContent || '').replace(/\s+/g, ' ').trim() : '';
    return t && t.length > 1 ? t : '';
  }

  /* Cria/injeta o relojinho num painel de compromisso aberto. Agora ele opera
   * sobre os MESMOS marcadores do mini player (LP.miniplayer.*), então os dois
   * cronômetros andam juntos: play grava início, pause grava fim, pausado + play
   * cria um novo marcador, e "Lançar" abre o popup com Início/Fim do marcador. */
  async function injetar(container) {
    const cid = idDoCompromisso(container);
    if (!cid) return; // sem id confiável: não injeta (evita marcador colidindo)
    // Reinjeta se o painel foi REUTILIZADO para outro compromisso (o Legale reaproveita
    // o mesmo nó de modal): se o relojinho existente é de outro cid, recria com o certo.
    const existente = container.querySelector('.lp-cron');
    if (existente) {
      if (existente.dataset.cid === String(cid)) return; // já é o certo
      clearInterval(container._lpTicker);
      existente.remove();
    }

    const box = document.createElement('div');
    box.className = 'lp-cron';
    box.dataset.cid = String(cid);
    box.innerHTML = `
      <button class="lp-cron-btn" title="Iniciar/pausar (marca início e fim)">⏱</button>
      <span class="lp-cron-display">00:00:00</span>
      <button class="lp-cron-player" title="Abrir este compromisso no mini player">⤢ player</button>
      <button class="lp-cron-ts" title="Abrir lançamento de time sheet deste compromisso (sem cronômetro)">🕐 Lançar TS</button>
      <button class="lp-cron-lancar" title="Encerrar e lançar time sheet" hidden>Lançar time sheet</button>
    `;
    container.prepend(box);

    const btn = box.querySelector('.lp-cron-btn');
    const disp = box.querySelector('.lp-cron-display');
    const player = box.querySelector('.lp-cron-player');
    const lancarTs = box.querySelector('.lp-cron-ts');
    const lancar = box.querySelector('.lp-cron-lancar');

    // Feature 2: abre o popup de lançamento direto deste compromisso, sem depender
    // do cronômetro nem de concluir/arrastar. Início/Fim vêm da janela do compromisso.
    lancarTs.addEventListener('click', () => { LP.meta2.lancarDireto(cid); });

    // Título REAL do compromisso deste painel. Só usa LP.compromissoAtual quando o id
    // bate com este cid (senão pode ser de outro compromisso aberto antes); depois cai
    // para o título do próprio modal/form. Garante título individual por item na lista.
    function tituloAtual() {
      const atual = LP.compromissoAtual || null;
      if (atual && String(atual.id) === String(cid) && atual.titulo) return atual.titulo;
      return tituloDoModal(container) || lerContextoCompromisso().titulo || ('Compromisso ' + cid);
    }

    // Envia ao mini player (cria um marcador ocioso se ainda não houver ativo).
    player.addEventListener('click', () => {
      LP.miniplayer.adicionar({ id: String(cid), titulo: tituloAtual(), ctx: lerContextoCompromisso() });
      LP.miniplayer.abrir();
    });

    // Play/Pause: delega ao controle por compromisso do mini player.
    btn.addEventListener('click', async () => {
      await LP.miniplayer.toggleCompromisso(cid, tituloAtual(), lerContextoCompromisso());
      render();
    });

    // Lançar: encerra o marcador atual e abre o popup com Início/Fim já preenchidos.
    lancar.addEventListener('click', async () => {
      await LP.miniplayer.encerrarCompromisso(cid);
      render();
    });

    async function render() {
      if (!container.isConnected) { clearInterval(container._lpTicker); return; }
      const m = await LP.miniplayer.marcadorDoCompromisso(cid);
      const rodando = m && m.inicio && !m.fim;
      const segs = m && m.inicio ? (rodando ? (Date.now() - m.inicio) : (m.fim - m.inicio)) / 1000 : 0;
      disp.textContent = LP.fmtDuracao(segs);
      box.classList.toggle('rodando', !!rodando);
      btn.textContent = rodando ? '⏸' : '⏱';
      lancar.hidden = !(m && m.inicio); // dá para lançar quando há tempo marcado
    }

    clearInterval(container._lpTicker);
    container._lpTicker = setInterval(render, 1000);
    render();
  }

  // Confirma (janela com as regras do SOP) e grava. `chaveLimpar` remove o
  // cronômetro persistido após gravar (quando houver).
  async function gravarComConfirmacao(dados, chaveLimpar) {
    // `dados` é a base do compromisso (não mutar): a cada volta clonamos para o modal
    // preencher, para que "Gravar e novo" reabra com o MESMO pré-preenchimento.
    let gravou = false;
    while (true) {
      const d = { ...dados };
      let acao = 'gravar';
      // Regra de ouro: em dúvida (cliente/tarefa/atividade não resolvidos), parar e perguntar.
      if (CFG.confirmarAntesDeGravar || !dados.codcli || !dados.seqtarefa) {
        acao = await confirmar(d);            // 'gravar' | 'novo' | false (cancelou)
        if (!acao) return gravou;             // cancelou: já gravou algum? encerra o marcador
      }
      try {
        const r = await LP.timesheet.gravar(d);
        LP.toast(`Time sheet lançado na tarefa ${d.seqtarefa || '(sem tarefa)'}: ${r.sucesso || 'ok'}`);
        gravou = true;
        if (chaveLimpar) { await LP.store.del(chaveLimpar); chaveLimpar = null; }
        // RESUMO no compromisso (revisto ao vivo, 2026-07-20): grava o Resumo confirmado
        // de volta no campo Resumo do PRÓPRIO compromisso e PERSISTE, por qualquer rota
        // (não depende de o form estar na tela). Antes só espelhava no DOM quando o form
        // de edição estava aberto e não salvava, então o Resumo se perdia. Agora, tendo o
        // id do compromisso (seqagenda), regrava via /Compromisso/AlterarCompleto.
        // Best-effort: uma falha aqui não desfaz o time sheet já lançado.
        if (d.seqagenda) {
          const ok = await persistirResumoNoCompromisso(d.seqagenda, d.resumo);
          if (ok) LP.toast('Resumo salvo no compromisso.');
        }
      } catch (e) {
        LP.toast(`Erro ao lançar: ${e.message}`, true);
        return gravou;
      }
      if (acao !== 'novo') return true;       // gravou e fechou
      // "Gravar e novo": volta ao topo e reabre o popup no mesmo compromisso, COPIANDO
      // a Data de Início e a Data de Fim que o usuário inseriu (pedido de Vinícius,
      // 2026-07-20), para ele não ter de digitá-las de novo no lançamento seguinte.
      // RESUMO (pedido de Vinícius, 2026-07-20): ao reabrir, o Resumo do popup vem do
      // campo Resumo do compromisso, que o próprio popup acabou de espelhar ao gravar
      // (ver espelharResumoNoCompromisso em concluir). Se o form do compromisso não
      // estiver na tela (aberto por rota sem edição), mantém o Resumo digitado.
      const campoRes = document.querySelector('#formIncluirCompleto #RESUMO, #formIncluirCompleto [name="RESUMO"]');
      const resumoAtual = campoRes ? campoRes.value : d.resumo;
      dados = { ...dados, inicio: d.inicio, fim: d.fim, resumo: resumoAtual };
    }
  }

  // Abre o popup de lançamento já com os dados informados (usado pelo mini player,
  // que passa início/fim do cronômetro). Retorna true se gravou, false se cancelou.
  function abrirLancamento(dados) { return gravarComConfirmacao(dados || {}); }

  // "dd/mm/aaaa HH:MM" -> Date (formato dos campos "dia com hora" do Legale).
  function parseDataHora(s) {
    const m = (s || '').match(/(\d{2})\/(\d{2})\/(\d{4})\D+(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]);
  }

  // Input associado a um <label> cujo texto contém TODOS os termos.
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

  /* Fluxo de arraste: ao reagendar e salvar, capturamos a janela do compromisso
   * (Início/Término dia com hora) e o contexto ANTES do site fechar o form; depois
   * lançamos o time sheet pelas regras do SOP. Chamado a partir do content.js. */
  function snapshotJanela(id) {
    const f = document.querySelector('#formIncluirCompleto');
    if (!f) return null;
    const ini = inputPorRotulo(f, ['início', 'hora']) || inputPorRotulo(f, ['inicio', 'hora']);
    const fim = inputPorRotulo(f, ['término', 'hora']) || inputPorRotulo(f, ['termino', 'hora']);
    return { id, inicio: ini && parseDataHora(ini.value), fim: fim && parseDataHora(fim.value), ctx: lerContextoCompromisso() };
  }

  async function lancarSnapshot(s) {
    if (!s || !s.inicio || !s.fim) {
      LP.toast('Não consegui ler o horário do compromisso para o time sheet.', true);
      return;
    }
    const c = s.ctx || {};
    await gravarComConfirmacao({
      seqagenda: c.seqagenda || s.id,
      inicio: s.inicio, fim: s.fim, resumo: c.resumo, codcli: c.codcli, codcliNome: c.codcliNome,
      procedim: c.procedim, seqtarefa: c.seqtarefa, usuario: c.usuario, tipoNome: c.tipoNome,
      nprocesso: c.nprocesso, nprocessoNome: c.nprocessoNome,
    });
  }

  /* Lê o contexto do compromisso a partir do formulário completo (#formIncluirCompleto)
   * quando aberto, ou do modal de detalhe. Seletores confirmados ao vivo. */
  // Processo vinculado ao compromisso (usado no fluxo judicial). Best-effort:
  // procura link para a ficha do processo, depois campos ocultos conhecidos.
  // Escopo restrito ao form/modal do compromisso para não pegar link de menu.
  function lerProcessoVinculado(escopo) {
    const linkProc = escopo.querySelector(
      'a[href*="/Processo/Visualizar/"], a[href*="/Processo/Detalhar/"], ' +
      'a[href*="/Processo/Editar/"], a[href*="/Processo/Alterar/"], a[href*="/Processo/Ficha/"]'
    );
    if (linkProc) {
      const href = linkProc.getAttribute('href') || '';
      const m = href.match(/\/Processo\/[A-Za-z]+\/(\d+)/);
      if (m) {
        const label = (linkProc.textContent || '').replace(/\s+/g, ' ').trim();
        return { id: m[1], label: label || ('Processo ' + m[1]) };
      }
    }
    const campo = escopo.querySelector(
      '#SEQPROCESSO, [name="SEQPROCESSO"], #NPROCESSO, [name="NPROCESSO"], ' +
      '#CODPROCESSO, [name="CODPROCESSO"], #PROCESSO, [name="PROCESSO"]'
    );
    if (campo && String(campo.value || '').trim()) {
      const auto = escopo.querySelector('#PROCESSO_AUTOCOMPLETE, [name="PROCESSO_AUTOCOMPLETE"]');
      return { id: String(campo.value).trim(), label: (auto && auto.value ? auto.value.trim() : '') };
    }
    return { id: '', label: '' };
  }

  // Extrai o contexto do compromisso de uma RAIZ (form vivo, modal de detalhe ou
  // um documento HTML já buscado do /Compromisso/AlterarCompleto). Seletores confirmados
  // ao vivo. Não depende de estar na tela: por isso serve a todas as rotas.
  function contextoDeRaiz(raiz) {
    const val = (sel) => raiz.querySelector(sel)?.value || '';
    // Tarefa vinculada: link /Tarefa/Visualizar/N
    const linkTarefa = raiz.querySelector('a[href*="/Tarefa/Visualizar/"]');
    const seqtarefa = linkTarefa
      ? (linkTarefa.getAttribute('href').match(/\/Tarefa\/Visualizar\/(\d+)/) || [])[1] || ''
      : '';
    // Processo vinculado (judicial).
    const proc = lerProcessoVinculado(raiz);
    // Título: do form completo (#TITULO) ou do cabeçalho do modal de detalhe.
    const titulo = (val('#TITULO') ||
      raiz.querySelector('.modalEventos h2, .modalEventos .modal-title, .modalEventos [class*="titulo"]')?.textContent ||
      '').trim();
    // Nome do tipo do compromisso (para pré-preencher a Atividade por nome, quando coincidir).
    const selTipo = raiz.querySelector('#TIPO');
    const tipoNome = (selTipo && selTipo.options && selTipo.selectedIndex >= 0)
      ? (selTipo.options[selTipo.selectedIndex].textContent || '').trim() : '';
    // Início/Fim do compromisso (para pré-preencher o lançamento direto sem cronômetro).
    // Vêm dos campos "dia com hora" do form completo (DAGENDA/DAGENDAF), quando a raiz
    // é o form do /Compromisso/AlterarCompleto. Aditivo: campos novos, ninguém quebra.
    const inicio = parseDataHora(val('#DAGENDA')) || null;
    const fim = parseDataHora(val('#DAGENDAF')) || null;
    return {
      seqagenda: val('#SEQAGENDA'),
      codcli: val('#CODCLI'),
      codcliNome: (val('#CODCLI_AUTOCOMPLETE') || '').trim(),
      resumo: val('#RESUMO'),
      usuario: val('#USUARIO'),
      tipo: val('#TIPO'),
      tipoNome,
      titulo,
      procedim: '', // atividade do time sheet: confirmada/escolhida na conferência
      seqtarefa,
      nprocesso: proc.id,       // processo vinculado (judicial), se houver
      nprocessoNome: proc.label,
      inicio,
      fim,
    };
  }

  // Contexto a partir do que está na tela (form completo ou modal de detalhe).
  function lerContextoCompromisso() {
    const raiz = document.querySelector('#formIncluirCompleto') ||
      document.querySelector('.modalEventos') || document;
    return contextoDeRaiz(raiz);
  }

  /* Carrega o contexto COMPLETO do compromisso pelo id (idagenda), buscando o form
   * do próprio Legale (/Compromisso/AlterarCompleto?id=N). Endpoint confirmado ao vivo;
   * traz tarefa, processo, cliente, resumo, usuário e tipo, que o modal de detalhe NÃO
   * expõe. Assim o lançamento fica correto vindo de qualquer rota (mini player, etc.).
   * Retorna null se falhar (o chamador cai no contexto que já tiver). */
  async function carregarContextoCompromisso(id) {
    if (!id) return null;
    try {
      const url = '/Compromisso/AlterarCompleto?id=' + encodeURIComponent(id) +
        '&multiAgenda=false&fecharAba=undefined&naoCarregarCalendario=undefined';
      const r = await fetch(url, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      if (!r.ok) return null;
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
      return contextoDeRaiz(doc);
    } catch (_) { return null; }
  }

  /* Grava o Resumo de volta no compromisso e PERSISTE (confirmado ao vivo no TESTE 29:
   * POST serializado em /Compromisso/AlterarCompleto devolve {"sucesso":"Salvo com
   * sucesso"} e o Resumo fica salvo). Funciona por qualquer rota, sem o form na tela:
   * busca o form completo do compromisso, troca só o campo RESUMO e reenvia o form
   * inteiro (o Legale exige o formulário completo). Não toca em nenhum outro campo.
   * Best-effort: retorna false em qualquer falha, sem lançar. */
  async function persistirResumoNoCompromisso(id, resumo) {
    if (!id || resumo == null) return false;
    try {
      const url = '/Compromisso/AlterarCompleto?id=' + encodeURIComponent(id) +
        '&multiAgenda=false&fecharAba=undefined&naoCarregarCalendario=undefined';
      const r = await fetch(url, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      if (!r.ok) return false;
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
      const form = doc.querySelector('#formIncluirCompleto');
      if (!form) return false;
      const alvo = form.querySelector('#RESUMO, [name="RESUMO"]');
      if (!alvo) return false;
      if ((alvo.value || '') === (resumo || '')) return true; // já está igual, nada a fazer
      const fd = new FormData(form);
      fd.set('RESUMO', resumo);
      const p = await fetch('/Compromisso/AlterarCompleto', {
        method: 'POST', body: fd, credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      let j = null; try { j = await p.json(); } catch (_) {}
      return !!(j && j.sucesso);
    } catch (_) { return false; }
  }

  // "Date -> dd/mm/aaaa HH:MM" seguro (aceita Date ou nulo).
  function fmtOuVazio(d) { try { return d ? LP.fmtDataHora(d) : ''; } catch (_) { return ''; } }
  function esc(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  /* Campo de busca reutilizável (cliente, tarefa, procedimento).
   * host = .lp-busca (div relativo) com input.lp-in e div.lp-lista dentro.
   * buscar(termo) -> Promise<[{id, label}]>. onSelecionar(item) opcional.
   * Retorna API { get(), set(id,label), recarregar() }. Abre a lista ao focar
   * (lista tudo) e ao digitar (filtra). Estados de vazio/erro são VISÍVEIS. */
  function campoBusca(host, buscar, onSelecionar) {
    const inp = host.querySelector('.lp-in');
    const lista = host.querySelector('.lp-lista');
    let selId = host.dataset.id || '';
    let timer = null;

    function fechar() { lista.hidden = true; lista.innerHTML = ''; }
    function abrir(itens, msg) {
      lista.innerHTML = '';
      if (msg) { lista.innerHTML = `<div class="lp-op-vazio">${msg}</div>`; lista.hidden = false; return; }
      if (!itens.length) { lista.innerHTML = '<div class="lp-op-vazio">Nenhum resultado</div>'; lista.hidden = false; return; }
      itens.forEach((it) => {
        const op = document.createElement('div');
        op.className = 'lp-op';
        op.textContent = it.label;
        op.addEventListener('mousedown', (e) => {
          e.preventDefault();
          selId = String(it.id);
          host.dataset.id = selId;
          inp.value = it.label;
          fechar();
          if (onSelecionar) onSelecionar(it);
        });
        lista.appendChild(op);
      });
      lista.hidden = false;
    }
    async function carregar(termo) {
      abrir([], 'buscando...');
      try {
        const itens = await buscar(termo);
        abrir(itens || []);
      } catch (_) { abrir([], 'erro ao buscar, tente de novo'); }
    }
    inp.addEventListener('focus', () => { selId = ''; host.dataset.id = ''; carregar(''); });
    inp.addEventListener('input', () => {
      selId = ''; host.dataset.id = '';
      clearTimeout(timer);
      timer = setTimeout(() => carregar(inp.value.trim()), 250);
    });
    inp.addEventListener('blur', () => setTimeout(fechar, 200));

    return {
      get: () => ({ id: selId || host.dataset.id || '', label: inp.value }),
      set: (id, label) => { selId = String(id || ''); host.dataset.id = selId; inp.value = label || ''; },
      focarVazio: () => { inp.value = ''; selId = ''; host.dataset.id = ''; },
    };
  }

  // Modal de confirmação antes de gravar (1ª versão sempre confirma).
  // Início/Fim editáveis; Cliente, Tarefa e Procedimento são listas pesquisáveis.
  function confirmar(d) {
    return new Promise((res) => {
      const bg = document.createElement('div');
      bg.className = 'lp-modal-bg';
      bg.innerHTML = `
        <div class="lp-modal">
          <button class="lp-fechar" type="button" title="Fechar sem lançar" aria-label="Fechar">✕</button>
          <h3>Confirmar lançamento de Time Sheet</h3>
          ${CFG.modoTeste ? '<p class="lp-teste-aviso">Modo teste ativo: será lançado no cliente TESTE, sem tocar dados reais.</p>' : ''}
          <div class="lp-linha-hora">
            <div class="lp-campo"><label><b>Início</b></label>
              <input class="lp-ini" placeholder="dd/mm/aaaa HH:MM" value="${esc(fmtOuVazio(d.inicio))}" autocomplete="off"></div>
            <div class="lp-campo"><label><b>Fim</b></label>
              <input class="lp-fim" placeholder="dd/mm/aaaa HH:MM" value="${esc(fmtOuVazio(d.fim))}" autocomplete="off"></div>
            <span class="lp-dur">Duração: <b>--:--</b></span>
          </div>

          <div class="lp-campo lp-busca" data-campo="cliente" data-id="${esc(d.codcli || '')}">
            <label><b>Cliente</b></label>
            <input class="lp-in" placeholder="clique para listar ou digite o nome" autocomplete="off" value="${esc(d.codcliNome || '')}">
            <div class="lp-lista" hidden></div>
          </div>

          <div class="lp-campo lp-busca" data-campo="tarefa" data-id="${esc(d.seqtarefa || '')}">
            <label><b>Tarefa</b></label>
            <input class="lp-in" placeholder="clique para listar ou digite número/nome" autocomplete="off" value="${d.seqtarefa ? 'Nº ' + esc(d.seqtarefa) : ''}">
            <div class="lp-lista" hidden></div>
          </div>

          <div class="lp-campo lp-busca" data-campo="procedim">
            <label><b>Atividade (procedimento)</b></label>
            <input class="lp-in" placeholder="clique para listar ou digite o nome" autocomplete="off" value="${esc(d.procedim || '')}">
            <div class="lp-lista" hidden></div>
          </div>

          <details class="lp-judicial">
            <summary>Judicial (opcional): tipo, processo, publicação</summary>
            <div class="lp-campo lp-busca" data-campo="tipoproc">
              <label><b>Tipo de atividade</b> (procedimento, ex.: ACOMPANHAMENTO, PUBLICAÇÃO, PETIÇÃO)</label>
              <input class="lp-in" placeholder="clique para listar ou digite o nome do procedimento" autocomplete="off">
              <div class="lp-lista" hidden></div>
            </div>
            <div class="lp-campo lp-busca" data-campo="processo">
              <label><b>Processo / Pasta</b> (do cliente selecionado)</label>
              <input class="lp-in" placeholder="clique para listar ou digite CNJ/pasta" autocomplete="off">
              <div class="lp-lista" hidden></div>
            </div>
            <div class="lp-linha-check">
              <label><input type="checkbox" class="lp-vinc-andamento"> Vincular ao Andamento (publicação)</label>
              <label><input type="checkbox" class="lp-vinc-fd"> Vincular ao Fundo de Despesas</label>
            </div>
          </details>

          <div class="lp-linha-sel">
            <label><b>Unidade:</b>
              <select class="lp-unidade"><option value="1">DBZ</option><option value="4">GZN</option></select>
            </label>
            <label><b>Concluído:</b>
              <select class="lp-concluido"><option value="S">Sim</option><option value="N">Não</option></select>
            </label>
          </div>

          <div class="lp-campo"><label><b>Resumo</b></label>
            <textarea class="lp-resumo" rows="3">${esc(d.resumo || '')}</textarea></div>

          <p class="lp-erro" hidden></p>
          <div class="lp-modal-acoes">
            <button class="lp-cancelar">Cancelar</button>
            <button class="lp-novo" title="Grava este lançamento e reabre o popup para um novo, no mesmo compromisso">Gravar e novo</button>
            <button class="lp-ok">Confirmar e gravar</button>
          </div>
        </div>`;
      document.body.appendChild(bg);

      const inpIni = bg.querySelector('.lp-ini');
      const inpFim = bg.querySelector('.lp-fim');
      const durEl = bg.querySelector('.lp-dur b');
      const erroEl = bg.querySelector('.lp-erro');

      /* ADIÇÃO (aditiva): espelhar o Resumo do popup no campo Resumo do compromisso
       * aberto para edição. Ao clicar num compromisso e no Lápis (editar), o Legale
       * abre #formIncluirCompleto com o campo #RESUMO; enquanto o usuário digita o
       * Resumo aqui no lançamento de time sheet, o mesmo texto passa a preencher/
       * atualizar aquele campo do compromisso. Só age quando o form de edição está na
       * tela; se não estiver, não faz nada (não abre nem altera o fluxo existente). */
      function campoResumoCompromisso() {
        const f = document.querySelector('#formIncluirCompleto');
        return f ? f.querySelector('#RESUMO, [name="RESUMO"]') : null;
      }
      function espelharResumoNoCompromisso(valor) {
        const alvo = campoResumoCompromisso();
        if (!alvo || alvo.value === valor) return;
        alvo.value = valor;
        // Dispara os eventos que o Legale escuta, para o Salvar do compromisso
        // reconhecer a alteração do campo (senão a mudança poderia não persistir).
        alvo.dispatchEvent(new Event('input', { bubbles: true }));
        alvo.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const resumoEl = bg.querySelector('.lp-resumo');
      if (resumoEl) resumoEl.addEventListener('input', () => espelharResumoNoCompromisso(resumoEl.value));

      function recalcDur() {
        const a = parseDataHora(inpIni.value), b = parseDataHora(inpFim.value);
        durEl.textContent = (a && b && b > a) ? LP.fmtDuracao((b - a) / 1000) : '--:--';
      }
      inpIni.addEventListener('input', recalcDur);
      inpFim.addEventListener('input', recalcDur);
      recalcDur();

      // Cliente atual (rege a lista de tarefas e processos). Default: do compromisso, senão DBZ.
      let codcliAtual = d.codcli || CFG.codcliPadrao;

      // Tarefa depende do cliente selecionado. Ao escolher uma tarefa, tentamos
      // preencher a Atividade (procedimento) a partir dela.
      const apiTarefa = campoBusca(
        bg.querySelector('[data-campo="tarefa"]'),
        (termo) => LP.timesheet.buscarTarefa(codcliAtual, termo, 1)
          .then((itens) => (itens || []).map((t) => ({ id: t.id, label: t.text }))),
        (item) => { autoPreencherProcedim(item.label, item.id); }
      );

      // Processo/Pasta (judicial) também depende do cliente.
      const apiProcesso = campoBusca(
        bg.querySelector('[data-campo="processo"]'),
        (termo) => LP.timesheet.buscarProcesso(codcliAtual, termo, 1)
          .then((itens) => (itens || []).map((p) => ({ id: p.id, label: p.text })))
      );

      // Cliente: ao selecionar, troca o escopo de tarefa E processo, e limpa ambos.
      const apiCliente = campoBusca(
        bg.querySelector('[data-campo="cliente"]'),
        (termo) => LP.timesheet.buscarCliente(termo)
          .then((itens) => (itens || []).map((c) => ({ id: c.key, label: c.value }))),
        (item) => { codcliAtual = String(item.id); apiTarefa.focarVazio(); apiProcesso.focarVazio(); }
      );

      // Procedimento (atividade): lista pesquisável.
      const apiProc = campoBusca(
        bg.querySelector('[data-campo="procedim"]'),
        (termo) => LP.timesheet.buscarProcedimento(termo)
          .then((itens) => (itens || []).map((p) => ({ id: p.key, label: p.value })))
      );

      // "Tipo de atividade" (judicial) = Procedimento/Atividade (PROCEDIM), NÃO o
      // "Tipo de Agenda" do compromisso. Mesma fonte do campo "Atividade" acima.
      const apiTipoProc = campoBusca(
        bg.querySelector('[data-campo="tipoproc"]'),
        (termo) => LP.timesheet.buscarProcedimento(termo)
          .then((itens) => (itens || []).map((p) => ({ id: p.key, label: p.value })))
      );

      // Nome de um cliente pelo código (para refletir no campo ao cair no padrão).
      async function nomeDoCliente(cc) {
        if (String(cc) === String(CFG.codcliPadrao)) return 'DELBIANCO BRENTINI E ZOCOLLARO';
        try {
          const l = await LP.timesheet.buscarCliente('');
          const it = (l || []).find((c) => String(c.key) === String(cc));
          return it ? it.value : '';
        } catch (_) { return ''; }
      }

      /* PRÉ-SELEÇÃO + FALLBACK DE CLIENTE.
       * Compromissos internos costumam ter CODCLI = pessoa (ex.: 475), que NÃO tem
       * tarefas; as tarefas internas vivem no cliente DBZ (codcliPadrao). Se o cliente
       * do compromisso não tiver tarefas, caímos para DBZ, refletimos no campo Cliente
       * e a lista/busca de tarefas passa a funcionar. */
      (async function preSelecionar() {
        let cc = d.codcli || CFG.codcliPadrao;
        let nome = (d.codcliNome || '').trim();
        let tarefas = await LP.timesheet.buscarTarefa(cc, '', 1).catch(() => []);
        if ((!tarefas || !tarefas.length) && String(cc) !== String(CFG.codcliPadrao)) {
          cc = CFG.codcliPadrao;
          nome = await nomeDoCliente(cc);
          tarefas = await LP.timesheet.buscarTarefa(cc, '', 1).catch(() => []);
        }
        codcliAtual = String(cc);
        apiCliente.set(cc, nome || ('Cliente ' + cc));
        // Tarefa vinculada com rótulo real, se existir nesse cliente.
        if (d.seqtarefa) {
          const it = (tarefas || []).find((x) => String(x.id) === String(d.seqtarefa));
          if (it) apiTarefa.set(d.seqtarefa, it.text);
          else {
            const busca = await LP.timesheet.buscarTarefa(cc, String(d.seqtarefa), 1).catch(() => []);
            const it2 = (busca || []).find((x) => String(x.id) === String(d.seqtarefa));
            apiTarefa.set(d.seqtarefa, it2 ? it2.text : ('Nº ' + d.seqtarefa));
          }
        }
        // Com a tarefa resolvida, tenta o auto preenchimento da Atividade.
        autoPreencherProcedim(apiTarefa.get().label, apiTarefa.get().id || d.seqtarefa);
      })();

      /* AUTO PREENCHIMENTO DA ATIVIDADE (PROCEDIMENTO).
       * Casa o procedimento contra o catálogo REAL do time sheet
       * (LP.timesheet.buscarProcedimento), por NOME normalizado (sem acento, sem
       * caixa). Fontes, em ordem de prioridade: (1) procedimento cadastrado na
       * própria tarefa; (2) tipo do compromisso ("Tipo de Agenda"); (3) título do
       * compromisso; (4) nome da tarefa. Só preenche se o usuário ainda não
       * escolheu nada. Nunca inventa id: usa a chave de um item real do catálogo,
       * o que evita gravar procedimento inválido. */
      function normalizaNome(s) {
        return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .toLowerCase().replace(/\s+/g, ' ').trim();
      }
      // Palavras significativas (descarta conectivos e termos curtos).
      const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'por', 'a', 'o', 'em', 'no', 'na']);
      function tokens(s) { return normalizaNome(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w)); }
      async function resolverProcedimento(nome) {
        const alvo = normalizaNome(nome);
        if (alvo.length < 2) return null;
        let itens = [];
        try { itens = (await LP.timesheet.buscarProcedimento(nome)) || []; } catch (_) { itens = []; }
        // Se a busca pelo nome inteiro n\u00e3o trouxe nada (t\u00edtulos longos raramente
        // batem no endpoint), tenta de novo pelo maior termo significativo.
        if (!itens.length) {
          const ts = tokens(nome).sort((a, b) => b.length - a.length);
          if (ts.length) { try { itens = (await LP.timesheet.buscarProcedimento(ts[0])) || []; } catch (_) {} }
        }
        if (!itens.length) return null;
        const exato = itens.find((x) => normalizaNome(x.value) === alvo);
        if (exato) return exato;
        const contidos = itens.filter((x) => normalizaNome(x.value).includes(alvo));
        if (contidos.length === 1) return contidos[0];
        // Melhor casamento por sobreposi\u00e7\u00e3o de termos; s\u00f3 aceita se for confiante e
        // \u00fanico (nunca inventa id: o item escolhido \u00e9 sempre um do cat\u00e1logo real).
        const alvoT = new Set(tokens(nome));
        if (!alvoT.size) return null;
        let best = null, bestScore = 0, empate = false;
        for (const it of itens) {
          const itT = tokens(it.value);
          if (!itT.length) continue;
          const inter = itT.filter((w) => alvoT.has(w)).length;
          if (!inter) continue;
          const score = inter / Math.max(alvoT.size, itT.length);
          if (score > bestScore) { bestScore = score; best = it; empate = false; }
          else if (score === bestScore) { empate = true; }
        }
        return (best && bestScore >= 0.5 && !empate) ? best : null;
      }
      // Nome do procedimento cadastrado NA tarefa (best-effort; falha em silêncio).
      async function procedimentoDaTarefa(seq) {
        if (!seq) return '';
        for (const rota of ['/Tarefa/Alterar/', '/Tarefa/Visualizar/']) {
          try {
            const r = await fetch(rota + encodeURIComponent(seq),
              { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
            if (!r.ok) continue;
            const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
            const auto = doc.querySelector('#SEQPROCEDIMENTO_AUTOCOMPLETE, [name="SEQPROCEDIMENTO_AUTOCOMPLETE"], #PROCEDIMENTO_AUTOCOMPLETE');
            if (auto && auto.value && auto.value.trim()) return auto.value.trim();
            const sel = doc.querySelector('#SEQPROCEDIMENTO, [name="SEQPROCEDIMENTO"], #PROCEDIM, [name="PROCEDIM"]');
            if (sel && sel.tagName === 'SELECT' && sel.selectedIndex >= 0) {
              const o = sel.options[sel.selectedIndex];
              const t = (o && o.textContent || '').trim();
              if (t && !/--\s*selecione/i.test(t)) return t;
            }
          } catch (_) {}
        }
        return '';
      }
      // Extrai só o nome de um rótulo de tarefa "Nº - NOME" / "54 - TESTES".
      function nomeDaTarefaLabel(label) {
        const s = String(label || '').replace(/^\s*n[ºo]?\s*/i, '');
        const m = s.match(/^\s*\d+\s*[-–]\s*(.+)$/);
        return (m ? m[1] : s).trim();
      }
      let autoProcRodando = false;
      async function autoPreencherProcedim(tarefaLabel, seqtarefa) {
        // REATIVADO (pedido de Vinícius, 2026-07-20, 2ª rodada): a Atividade
        // (procedimento) volta a ser pré-preenchida a partir do compromisso, para que
        // o usuário não precise preencher nada e não seja barrado por campo vazio.
        if (autoProcRodando) return;
        if (apiProc.get().id || apiTipoProc.get().id) return; // usuário já escolheu
        autoProcRodando = true;
        try {
          const nomeTar = await procedimentoDaTarefa(seqtarefa || d.seqtarefa);
          const nomes = [];
          if (nomeTar) nomes.push(nomeTar);
          if (d.tipoNome) nomes.push(d.tipoNome);
          if (d.titulo) nomes.push(d.titulo);
          if (tarefaLabel) nomes.push(nomeDaTarefaLabel(tarefaLabel));
          for (const nome of nomes) {
            if (apiProc.get().id || apiTipoProc.get().id) break;
            const it = await resolverProcedimento(nome);
            if (it && !apiProc.get().id && !apiTipoProc.get().id) {
              apiProc.set(it.key, String(it.value).trim());
              break;
            }
          }
        } finally { autoProcRodando = false; }
      }
      // Dispara já (tarefa/tipo/título); a pré-seleção da tarefa chama de novo.
      autoPreencherProcedim('', d.seqtarefa);

      // PRÉ-SELEÇÃO do Processo (judicial): puxado direto do compromisso. Abre a
      // seção Judicial para o usuário ver o processo já preenchido.
      if (d.nprocesso) {
        const setProc = (label) => apiProcesso.set(d.nprocesso, label || ('Processo ' + d.nprocesso));
        if (d.nprocessoNome) setProc(d.nprocessoNome);
        else {
          LP.timesheet.buscarProcesso(d.codcli || codcliAtual, String(d.nprocesso), 1)
            .then((itens) => {
              const it = (itens || []).find((x) => String(x.id) === String(d.nprocesso));
              setProc(it ? it.text : '');
            })
            .catch(() => setProc(''));
        }
        const det = bg.querySelector('.lp-judicial');
        if (det) det.open = true;
      }

      function erro(msg) { erroEl.textContent = msg; erroEl.hidden = false; }

      // Coleta e valida os campos, mutando `d`. Retorna true se está tudo certo
      // para gravar; false (e mostra o erro) caso contrário. Compartilhado pelos
      // botões "Confirmar e gravar" e "Gravar e novo".
      function coletarEValidar() {
        const ini = parseDataHora(inpIni.value);
        const fim = parseDataHora(inpFim.value);
        if (!ini || !fim) { erro('Informe Início e Fim no formato dd/mm/aaaa HH:MM.'); return false; }
        if (fim <= ini) { erro('O Fim precisa ser depois do Início.'); return false; }
        // Judicial (opcional): processo e publicação (vincular andamento/FD).
        const nprocesso = apiProcesso.get().id || '';
        const vincAndamento = bg.querySelector('.lp-vinc-andamento').checked;
        const vincFd = bg.querySelector('.lp-vinc-fd').checked;
        // "Preencheu a parte judicial" = escolheu processo, ou marcou publicação/FD.
        const judicialPreenchido = !!(nprocesso || vincAndamento || vincFd);
        // Tarefa: id selecionado, ou número digitado direto.
        const tar = apiTarefa.get();
        let seqtarefa = tar.id;
        if (!seqtarefa) { const m = (tar.label || '').match(/\d+/); if (m) seqtarefa = m[0]; }
        // Atividade (procedimento): do campo "Atividade" ou do "Tipo de atividade"
        // (judicial) — ambos apontam para o mesmo PROCEDIM.
        const proc = apiProc.get();
        const procJud = apiTipoProc.get();
        const procedimId = proc.id || procJud.id;
        const procedimNome = proc.id ? proc.label : (procJud.id ? procJud.label : (proc.label || procJud.label));
        // OBRIGATORIEDADE (revisto ao vivo, 2026-07-20): a Tarefa NUNCA é exigida (o
        // Legale não a cobra; confirmado em teste no compromisso TESTE 29, o lançamento
        // sem tarefa passou), inclusive em prazo processual, onde o vínculo é com o
        // Processo. O ÚNICO campo que o /TimeSheet/Incluir exige é a Atividade
        // (PROCEDIM): sem ela o servidor devolve "Campo Obrigatório; Não foi salvo.
        // Verifique as informações na tela". Por isso validamos SÓ a Atividade aqui,
        // com mensagem clara, em vez de deixar o POST falhar com o erro genérico. Nos
        // compromissos comuns ela já vem pré-preenchida do próprio compromisso e o
        // usuário só confirma; quando não houver de onde inferir (ex.: tipo
        // ADMINISTRATIVO, sem tarefa/processo), o usuário a escolhe uma vez.
        if (!procedimId) {
          erro('Escolha a Atividade (procedimento): é o único campo que o Legale exige para lançar. A Tarefa é opcional (inclusive em prazo processual) e não precisa ser informada.');
          const inpProc = bg.querySelector('[data-campo="procedim"] .lp-in');
          if (inpProc) inpProc.focus();
          return false;
        }
        d.inicio = ini;
        d.fim = fim;
        d.seqtarefa = seqtarefa;
        d.codcli = codcliAtual;
        d.procedim = procedimId;
        d.procedimNome = procedimNome || '';
        d.resumo = bg.querySelector('.lp-resumo').value;
        d.seqemptrab = bg.querySelector('.lp-unidade').value;   // Unidade DBZ/GZN
        d.jaavexec = bg.querySelector('.lp-concluido').value;   // Concluído Sim/Não
        // Judicial (opcional). Não usamos mais o "Tipo de Agenda" no lançamento.
        d.tipo = '';
        d.nprocesso = nprocesso;
        d.ckvincularandamento = vincAndamento;
        d.ckvincularfd = vincFd;
        return true;
      }

      // Fecha o modal e resolve com a ação escolhida ('gravar' | 'novo').
      function concluir(acao) {
        if (!coletarEValidar()) return;
        espelharResumoNoCompromisso(bg.querySelector('.lp-resumo').value); // reflete o Resumo final no compromisso
        try { document.removeEventListener('keydown', onEsc, true); } catch (_) {}
        bg.remove();
        res(acao);
      }
      bg.querySelector('.lp-ok').onclick = () => concluir('gravar');
      // "Gravar e novo": grava e sinaliza ao chamador para reabrir o popup no mesmo
      // compromisso, repuxando as informações como no primeiro lançamento.
      bg.querySelector('.lp-novo').onclick = () => concluir('novo');
      // Feature 1: fechar sem lançar. "X" no cabeçalho, botão Cancelar, clique no
      // fundo escuro e tecla Esc, todos com o MESMO efeito (não grava nada). Aditivo.
      let fechado = false;
      function fecharSemLancar() {
        if (fechado) return; fechado = true;
        document.removeEventListener('keydown', onEsc, true);
        bg.remove();
        res(false);
      }
      function onEsc(ev) { if (ev.key === 'Escape') { ev.stopPropagation(); fecharSemLancar(); } }
      bg.querySelector('.lp-cancelar').onclick = fecharSemLancar;
      bg.querySelector('.lp-fechar').onclick = fecharSemLancar;
      bg.addEventListener('mousedown', (ev) => { if (ev.target === bg) fecharSemLancar(); });
      document.addEventListener('keydown', onEsc, true);
    });
  }

  // Lê o primeiro par de "dd/mm/aaaa HH:MM" do container (Data Inicial / Data Final),
  // para pré-preencher Início/Fim quando não há cronômetro.
  function lerHorarioDetalhe(container) {
    const datas = [];
    (container || document).querySelectorAll('*').forEach((el) => {
      if (el.children.length) return;
      const m = (el.textContent || '').match(/\d{2}\/\d{2}\/\d{4}\D+\d{1,2}:\d{2}/);
      if (m) { const d = parseDataHora(m[0]); if (d) datas.push(d); }
    });
    return { inicio: datas[0] || null, fim: datas[1] || null };
  }

  /* Botão "Concluir" do modal de detalhe do compromisso (onclick ConcluirAgenda...):
   * abre o MESMO popup de lançamento de time sheet que o arraste, com Início/Fim já
   * lidos do detalhe. ADITIVO: não substitui nem impede a conclusão nativa. Chamado
   * pelo content.js por um listener delegado (o botão não fica em .modalEventos). */
  async function lancarDoConcluir(container, id) {
    // Início/Fim do próprio detalhe; contexto pelo id (traz tarefa/processo/cliente),
    // caindo para o que estiver na tela se o carregamento por id falhar.
    const j = lerHorarioDetalhe(container);
    const ctx = (await carregarContextoCompromisso(id)) || lerContextoCompromisso();
    gravarComConfirmacao({
      seqagenda: ctx.seqagenda || id,
      inicio: j.inicio, fim: j.fim, resumo: ctx.resumo, codcli: ctx.codcli,
      codcliNome: ctx.codcliNome, procedim: ctx.procedim, seqtarefa: ctx.seqtarefa,
      usuario: ctx.usuario, tipoNome: ctx.tipoNome,
      nprocesso: ctx.nprocesso, nprocessoNome: ctx.nprocessoNome,
    });
  }

  /* Feature 2: abre o popup de lançamento de time sheet DIRETO de um compromisso,
   * pelo id (idagenda), sem depender dos gatilhos existentes (concluir, arrastar,
   * cronômetro). Carrega o contexto completo pelo próprio Legale (tarefa/processo/
   * cliente/resumo/usuário) e pré-preenche Início/Fim com a janela do compromisso.
   * opts.inicio/opts.fim (Date) têm prioridade quando informados (ex.: vindos do card). */
  async function lancarDireto(id, opts) {
    opts = opts || {};
    let ctx = null;
    try { ctx = await carregarContextoCompromisso(id); } catch (_) {}
    if (!ctx) ctx = lerContextoCompromisso();
    gravarComConfirmacao({
      seqagenda: ctx.seqagenda || id,
      inicio: opts.inicio || ctx.inicio || null,
      fim: opts.fim || ctx.fim || null,
      resumo: ctx.resumo, codcli: ctx.codcli, codcliNome: ctx.codcliNome,
      procedim: ctx.procedim, seqtarefa: ctx.seqtarefa, usuario: ctx.usuario,
      tipoNome: ctx.tipoNome, nprocesso: ctx.nprocesso, nprocessoNome: ctx.nprocessoNome,
    });
  }

  LP.meta2 = { injetar, snapshotJanela, lancarSnapshot, lancarDoConcluir, lancarDireto, abrirLancamento, carregarContextoCompromisso };

  // Toast utilitário.
  LP.toast = function (msg, erro) {
    const t = document.createElement('div');
    t.className = 'lp-toast' + (erro ? ' erro' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  };
})(window.LegalePlus);
