/* Legale+ , Busca de Tarefas (v0.16.2).
 *
 * v0.16.2: o campo "Nome (assunto)" passou a puxar automaticamente TODAS as tarefas
 * (grade /Tarefa/Consultar, cacheada) e a filtrar AO VIVO por fragmento de palavra,
 * frase ou termos fora de ordem (sem acento e sem caixa). Os demais filtros seguem
 * pelo servidor via botão Buscar.
 *
 * v0.16.0 (base):
 * Botão flutuante 🔍 disponível em QUALQUER página do Legale (como o modo noturno e o
 * player do cronômetro). Abre um popup para pesquisar tarefas por Nome, Nº, Cliente,
 * Área, Gestor e SETOR, usando a própria grade do Legale (/Tarefa/Consultar), com uma
 * aba de FAVORITOS (guardados no navegador).
 *
 * v0.16.0:
 *  - Paginação COMPLETA: a busca percorre TODAS as páginas da grade (30/página) e lista
 *    tudo num painel rolável, em vez de mostrar só a 1ª página. Confirmado ao vivo que
 *    a grade pagina por GET (?...&pagina=N&aba=0, N base 0) e informa o total ("N
 *    registros").
 *  - Filtro de SETOR (derivado): o Legale não tem campo "Setor"; ele é mapeado em
 *    config.js (setoresTarefa) para conjuntos de PROCEDIMENTO (filtro multi da grade) e,
 *    no caso das Tarefas Internas, para os CLIENTES do escritório (DBZ/GZN).
 *
 * Tudo aditivo: não altera nenhum fluxo existente. Endpoints/campos confirmados ao vivo
 * (2026-07-20). */
window.LegalePlus = window.LegalePlus || {};

(function (LP) {
  const CFG = window.LEGALE_PLUS_CONFIG || {};
  const FAV_KEY = 'tarefasFavoritas';
  const CONSULTAR = '/Tarefa/Consultar';
  const AC_CLIENTE = '/Tarefa/PopularCliente';
  const AC_GESTOR = '/Tarefa/PopularGestor';
  const POR_PAGINA = 30;      // tamanho de página da grade (confirmado ao vivo)
  const MAX_PAGINAS = 100;    // trava de segurança (até 3000 tarefas por busca)

  // ------------------------------------------------ Índice local de tarefas (assunto)
  // O campo "Nome (assunto)" pesquisa por FRAGMENTO de palavra, frase ou termos fora de
  // ordem. Para isso carregamos UMA vez TODAS as tarefas da grade (/Tarefa/Consultar) e
  // filtramos localmente, sem acento e sem caixa. Cacheado no módulo, reusado entre
  // aberturas do popup. (Pedido de Vinícius em 2026-07-20: puxar automaticamente todos
  // os registros de tarefas e filtrar por parte da palavra/frase.)
  let _todasTarefas = null;
  let _carregandoTodas = null;
  async function carregarTodasTarefas(onProgresso) {
    if (_todasTarefas) return _todasTarefas;
    if (_carregandoTodas) return _carregandoTodas;
    _carregandoTodas = (async () => {
      const { itens } = await buscarTodasPaginas(montarQuery({}, []), onProgresso);
      _todasTarefas = itens;
      return itens;
    })();
    try { return await _carregandoTodas; } finally { _carregandoTodas = null; }
  }
  function normaliza(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
  // Casa quando TODOS os termos digitados aparecem no número/assunto (ordem livre).
  function filtrarPorAssunto(tarefas, termo) {
    const termos = normaliza(termo).split(/\s+/).filter(Boolean);
    if (!termos.length) return tarefas.slice();
    return tarefas.filter((t) => {
      const alvo = normaliza((t.num || '') + ' ' + (t.assunto || ''));
      return termos.every((tk) => alvo.includes(tk));
    });
  }

  // ---------------------------------------------------------------- Favoritos
  async function lerFavoritos() { return (await LP.store.get(FAV_KEY, [])) || []; }
  async function salvarFavoritos(l) { await LP.store.set(FAV_KEY, l); }
  async function alternarFavorito(t) {
    const l = await lerFavoritos();
    const i = l.findIndex((x) => String(x.seq) === String(t.seq));
    if (i >= 0) { l.splice(i, 1); await salvarFavoritos(l); return false; }
    l.unshift({ seq: String(t.seq), num: t.num || '', assunto: t.assunto || '', cliente: t.cliente || '', href: t.href || '' });
    await salvarFavoritos(l);
    return true;
  }

  // ------------------------------------------------------------ Grade de busca
  // Form de /Tarefa/Consultar (usado só para LER as opções reais de Área). Cacheado.
  let _formCache = null;
  async function carregarFormConsultar() {
    if (_formCache) return _formCache;
    const r = await fetch(CONSULTAR, { credentials: 'include' });
    if (!r.ok) throw new Error('Não consegui abrir a consulta de tarefas (' + r.status + ').');
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    const f = doc.querySelector('form[action="' + CONSULTAR + '"]');
    if (!f) throw new Error('Formulário de consulta de tarefas não encontrado.');
    _formCache = f;
    return f;
  }
  async function areasDisponiveis() {
    try {
      const f = await carregarFormConsultar();
      const sel = f.querySelector('[name="AREAPROCEDIMENTO"]');
      if (!sel) return [];
      return [...sel.options].filter((o) => o.value).map((o) => ({ v: o.value, t: o.textContent.trim() }));
    } catch (_) { return []; }
  }

  async function autocompletar(url, filtro) {
    const u = url + '?filtro=' + encodeURIComponent(filtro || '') + '&startsWith=false';
    const r = await fetch(u, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    let j = null; try { j = await r.json(); } catch (_) {}
    return Array.isArray(j) ? j : [];
  }

  // Monta a querystring MÍNIMA da grade (confirmado ao vivo que um GET "frio" com estes
  // parâmetros já pagina sozinho, sem depender de POST anterior nem do form completo).
  // filtros: {ASSUNTO, SEQTAREFA, SEQCLIENTE, SEQGESTOR, AREAPROCEDIMENTO}
  // procedimentos: array de códigos (repetidos como PROCEDIMENTO=..&PROCEDIMENTO=..).
  function montarQuery(filtros, procedimentos) {
    const q = new URLSearchParams();
    // Tarefa=true: lista as TAREFAS, exatamente como /Tarefa/Consultar?Tarefa=true
    // (ajuste pedido por Vinícius em 2026-07-20; antes ia 'False').
    q.set('Tarefa', 'true');
    q.set('F_ORDENARPOR', 'CODIGO');
    q.set('F_ORDEM', 'DESC');
    q.set('aba', '0');
    Object.entries(filtros || {}).forEach(([k, v]) => { if (v != null && v !== '') q.set(k, String(v)); });
    (procedimentos || []).forEach((v) => q.append('PROCEDIMENTO', String(v)));
    return q;
  }

  // Percorre TODAS as páginas de uma consulta e devolve {itens, total}.
  async function buscarTodasPaginas(query, onProgresso) {
    const itens = [];
    let total = null;
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const q = new URLSearchParams(query);
      q.set('pagina', String(pagina));
      const r = await fetch(CONSULTAR + '?' + q.toString(), { credentials: 'include' });
      if (!r.ok) break;
      const html = await r.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const linhas = parseGrade(doc);
      if (total == null) { const m = html.match(/(\d+)\s*registros?/i); total = m ? +m[1] : null; }
      itens.push(...linhas);
      if (onProgresso) onProgresso(itens.length, total);
      if (!linhas.length || linhas.length < POR_PAGINA) break;     // última página
      if (total != null && itens.length >= total) break;
    }
    return { itens, total: total == null ? itens.length : total };
  }

  // Executa a busca aplicando o SETOR (quando escolhido). Setor com clientes (Internas)
  // roda uma consulta por cliente e mescla; setor com procedimentos entra como filtro
  // multi; sem setor, busca só pelos filtros informados.
  async function executarBusca(filtros, setor, onProgresso) {
    if (setor && Array.isArray(setor.clientes) && setor.clientes.length) {
      const mapa = new Map();
      for (const cli of setor.clientes) {
        const q = montarQuery({ ...filtros, SEQCLIENTE: cli }, setor.procedimentos || []);
        const { itens } = await buscarTodasPaginas(q, () => { if (onProgresso) onProgresso(mapa.size); });
        itens.forEach((t) => { if (!mapa.has(t.seq)) mapa.set(t.seq, t); });
        if (onProgresso) onProgresso(mapa.size);
      }
      return { itens: [...mapa.values()], total: mapa.size };
    }
    const procedimentos = setor ? (setor.procedimentos || []) : [];
    const q = montarQuery(filtros, procedimentos);
    return await buscarTodasPaginas(q, onProgresso);
  }

  // Lê a grade casando pelas COLUNAS do cabeçalho (Número, Assunto, Cliente, Status).
  function parseGrade(doc) {
    const tabela = doc.querySelector('table');
    if (!tabela) return [];
    const heads = [...tabela.querySelectorAll('thead th')].map((th) => th.textContent.trim().toLowerCase());
    const idx = (nome) => heads.findIndex((h) => h.includes(nome));
    const iNum = idx('número') >= 0 ? idx('número') : idx('numero');
    const iAss = idx('assunto');
    const iCli = idx('cliente');
    const iSta = idx('status');
    const out = [];
    [...tabela.querySelectorAll('tbody tr')].forEach((tr) => {
      const tds = [...tr.querySelectorAll('td')];
      if (!tds.length) return;
      const txt = (i) => (i >= 0 && tds[i] ? tds[i].textContent.replace(/\s+/g, ' ').trim() : '');
      const link = tr.querySelector('a[href*="/Tarefa/Alterar/"], a[href*="/Tarefa/Visualizar/"]');
      const href = link ? link.getAttribute('href') : '';
      const seq = (href.match(/\/Tarefa\/\w+\/(\d+)/) || [])[1] || '';
      const num = txt(iNum), assunto = txt(iAss);
      if (!num && !assunto) return;
      out.push({ seq, num, assunto, cliente: txt(iCli), status: txt(iSta), href });
    });
    return out;
  }

  // ------------------------------------------------------------ Botão flutuante
  function garantirBotao() {
    if (document.getElementById('lp-busca-btn')) return;
    if (!document.body) return;
    const b = document.createElement('button');
    b.id = 'lp-busca-btn';
    b.type = 'button';
    b.textContent = '🔍';
    b.title = 'Buscar tarefa';
    b.setAttribute('aria-label', 'Buscar tarefa');
    b.addEventListener('click', abrirPopup);
    document.body.appendChild(b);
  }

  // ------------------------------------------------------------------- Popup
  let _aberto = false;
  function fecharPopup(bg, onEsc) {
    if (onEsc) document.removeEventListener('keydown', onEsc, true);
    bg.remove();
    _aberto = false;
  }

  function abrirPopup() {
    if (_aberto) return;
    _aberto = true;
    const setores = CFG.setoresTarefa || [];
    const bg = document.createElement('div');
    bg.className = 'lp-modal-bg lp-busca-bg';
    bg.innerHTML = `
      <div class="lp-modal lp-busca-modal">
        <button class="lp-fechar" type="button" title="Fechar" aria-label="Fechar">✕</button>
        <h3>Buscar tarefa</h3>
        <div class="lp-busca-abas">
          <button class="lp-aba lp-aba-buscar ativa" type="button">Buscar</button>
          <button class="lp-aba lp-aba-fav" type="button">★ Favoritos</button>
        </div>

        <div class="lp-painel lp-painel-buscar">
          <div class="lp-busca-grid">
            <div class="lp-campo"><label><b>Nome (assunto)</b></label>
              <input class="lp-f-nome" type="text" placeholder="parte do assunto" autocomplete="off"></div>
            <div class="lp-campo"><label><b>Nº da Tarefa</b></label>
              <input class="lp-f-num" type="text" placeholder="ex.: 456" autocomplete="off"></div>
            <div class="lp-campo lp-ac" data-hid="SEQCLIENTE"><label><b>Cliente</b></label>
              <input class="lp-in lp-f-cliente" type="text" placeholder="digite o nome do cliente" autocomplete="off">
              <div class="lp-lista" hidden></div></div>
            <div class="lp-campo"><label><b>Área</b></label>
              <select class="lp-f-area"><option value="">Todas</option></select></div>
            <div class="lp-campo lp-ac" data-hid="SEQGESTOR"><label><b>Gestor</b></label>
              <input class="lp-in lp-f-gestor" type="text" placeholder="digite o nome do gestor" autocomplete="off">
              <div class="lp-lista" hidden></div></div>
            <div class="lp-campo"><label><b>Setor</b></label>
              <select class="lp-f-setor"><option value="">Todos</option>
                ${setores.map((s) => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join('')}
              </select></div>
          </div>
          <div class="lp-busca-acoes">
            <button class="lp-limpar" type="button">Limpar</button>
            <button class="lp-buscar" type="button">Buscar</button>
          </div>
          <p class="lp-busca-status"></p>
          <div class="lp-busca-result"></div>
        </div>

        <div class="lp-painel lp-painel-fav" hidden>
          <p class="lp-busca-status lp-fav-status"></p>
          <div class="lp-busca-result lp-fav-result"></div>
        </div>
      </div>`;
    document.body.appendChild(bg);

    const inNome = bg.querySelector('.lp-f-nome');
    const inNum = bg.querySelector('.lp-f-num');
    const selArea = bg.querySelector('.lp-f-area');
    const selSetor = bg.querySelector('.lp-f-setor');
    const status = bg.querySelector('.lp-painel-buscar .lp-busca-status');
    const result = bg.querySelector('.lp-painel-buscar .lp-busca-result');

    function onEsc(ev) { if (ev.key === 'Escape') { ev.stopPropagation(); fecharPopup(bg, onEsc); } }
    bg.querySelector('.lp-fechar').onclick = () => fecharPopup(bg, onEsc);
    bg.addEventListener('mousedown', (ev) => { if (ev.target === bg) fecharPopup(bg, onEsc); });
    document.addEventListener('keydown', onEsc, true);

    areasDisponiveis().then((areas) => {
      areas.forEach((a) => {
        const o = document.createElement('option');
        o.value = a.v; o.textContent = a.t; selArea.appendChild(o);
      });
    });

    montarAutocomplete(bg.querySelector('.lp-ac[data-hid="SEQCLIENTE"]'), AC_CLIENTE);
    montarAutocomplete(bg.querySelector('.lp-ac[data-hid="SEQGESTOR"]'), AC_GESTOR);

    // Abas Buscar / Favoritos.
    const abaBuscar = bg.querySelector('.lp-aba-buscar');
    const abaFav = bg.querySelector('.lp-aba-fav');
    const painelBuscar = bg.querySelector('.lp-painel-buscar');
    const painelFav = bg.querySelector('.lp-painel-fav');
    abaBuscar.onclick = () => {
      abaBuscar.classList.add('ativa'); abaFav.classList.remove('ativa');
      painelBuscar.hidden = false; painelFav.hidden = true;
    };
    abaFav.onclick = () => {
      abaFav.classList.add('ativa'); abaBuscar.classList.remove('ativa');
      painelFav.hidden = false; painelBuscar.hidden = true;
      renderFavoritos(bg);
    };

    // Busca LOCAL do campo "Nome (assunto)": carrega (uma vez) todas as tarefas e filtra
    // ao vivo por fragmento/frase. Um token por chamada evita render fora de ordem.
    let seqAssunto = 0;
    async function buscarAssuntoLocal(termo) {
      const meu = ++seqAssunto;
      if (!_todasTarefas) status.textContent = 'Carregando tarefas...';
      let todas;
      try {
        todas = await carregarTodasTarefas((n, tot) => {
          if (!_todasTarefas && meu === seqAssunto) status.textContent = 'Carregando tarefas... ' + n + (tot ? ' de ' + tot : '');
        });
      } catch (e) {
        if (meu === seqAssunto) { status.textContent = 'Erro ao carregar tarefas: ' + e.message; }
        return;
      }
      if (meu !== seqAssunto) return;   // o usuário digitou de novo: abandona este render
      const filtrados = filtrarPorAssunto(todas, termo);
      const termoLimpo = (termo || '').trim();
      if (!filtrados.length) {
        status.textContent = todas.length ? 'Nenhuma tarefa com esse termo. Tente outro fragmento.' : 'Nenhuma tarefa encontrada.';
        result.innerHTML = '';
        return;
      }
      status.textContent = termoLimpo
        ? filtrados.length + ' de ' + todas.length + ' tarefa(s). Role para ver todas.'
        : todas.length + ' tarefa(s). Digite parte do assunto para filtrar.';
      await renderResultados(result, filtrados);
    }

    let buscando = false;
    async function executar() {
      if (buscando) return;
      const setorSel = (CFG.setoresTarefa || []).find((s) => s.id === selSetor.value) || null;
      // Setor "a definir" (sem procedimento nem cliente): avisa e não busca.
      if (setorSel && !(setorSel.procedimentos && setorSel.procedimentos.length) && !(setorSel.clientes && setorSel.clientes.length)) {
        status.textContent = 'O setor "' + setorSel.label + '" ainda não tem critério definido na base. Escolha outro setor ou combine os demais filtros.';
        result.innerHTML = '';
        return;
      }
      const filtros = {
        ASSUNTO: inNome.value.trim(),
        SEQTAREFA: inNum.value.trim(),
        SEQCLIENTE: bg.querySelector('.lp-ac[data-hid="SEQCLIENTE"]').dataset.id || '',
        SEQGESTOR: bg.querySelector('.lp-ac[data-hid="SEQGESTOR"]').dataset.id || '',
        AREAPROCEDIMENTO: selArea.value,
      };
      // Só "Nome (assunto)" (ou nada): pesquisa LOCAL sobre TODAS as tarefas, por
      // fragmento de palavra, frase ou termos fora de ordem. Os demais filtros
      // (Nº, Cliente, Área, Gestor, Setor) seguem pelo servidor, como antes.
      const soAssunto = !filtros.SEQTAREFA && !filtros.SEQCLIENTE && !filtros.SEQGESTOR && !filtros.AREAPROCEDIMENTO && !setorSel;
      if (soAssunto) { await buscarAssuntoLocal(filtros.ASSUNTO); return; }
      buscando = true;
      status.textContent = 'Buscando...';
      result.innerHTML = '';
      try {
        const { itens, total } = await executarBusca(filtros, setorSel, (carregados, tot) => {
          status.textContent = 'Carregando... ' + carregados + (tot ? ' de ' + tot : '');
        });
        if (!itens.length) { status.textContent = 'Nenhuma tarefa encontrada. Refine ou limpe os filtros.'; return; }
        status.textContent = itens.length + ' tarefa(s)' + (total && total !== itens.length ? ' de ' + total : '') + '. Role para ver todas.';
        await renderResultados(result, itens);
      } catch (e) {
        status.textContent = 'Erro: ' + e.message;
      } finally { buscando = false; }
    }
    bg.querySelector('.lp-buscar').onclick = executar;
    bg.querySelector('.lp-limpar').onclick = () => {
      inNome.value = ''; inNum.value = ''; selArea.value = ''; selSetor.value = '';
      ['SEQCLIENTE', 'SEQGESTOR'].forEach((h) => { bg.querySelector('.lp-ac[data-hid="' + h + '"]').dataset.id = ''; });
      bg.querySelector('.lp-f-cliente').value = ''; bg.querySelector('.lp-f-gestor').value = '';
      status.textContent = ''; result.innerHTML = '';
      buscarAssuntoLocal('');   // volta a listar todas as tarefas
    };
    [inNome, inNum].forEach((el) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') executar(); }));

    // "Nome (assunto)": a digitação puxa automaticamente as tarefas (todas em cache) e
    // filtra ao vivo por fragmento/frase. Se houver outro filtro ativo, o usuário usa o
    // botão Buscar (fluxo servidor); aqui priorizamos a experiência de digitar o assunto.
    let timerNome = null;
    inNome.addEventListener('input', () => {
      clearTimeout(timerNome);
      const temOutros = inNum.value.trim()
        || bg.querySelector('.lp-ac[data-hid="SEQCLIENTE"]').dataset.id
        || bg.querySelector('.lp-ac[data-hid="SEQGESTOR"]').dataset.id
        || selArea.value || selSetor.value;
      timerNome = setTimeout(() => { if (!temOutros) buscarAssuntoLocal(inNome.value); }, 160);
    });

    // Ao abrir, já carrega e lista TODAS as tarefas (comportamento pedido).
    inNome.focus();
    buscarAssuntoLocal('');
  }

  function montarAutocomplete(host, url) {
    const inp = host.querySelector('.lp-in');
    const lista = host.querySelector('.lp-lista');
    let timer = null;
    function fechar() { lista.hidden = true; lista.innerHTML = ''; }
    function abrir(itens, msg) {
      lista.innerHTML = '';
      if (msg) { lista.innerHTML = '<div class="lp-op-vazio">' + msg + '</div>'; lista.hidden = false; return; }
      if (!itens.length) { lista.innerHTML = '<div class="lp-op-vazio">Nenhum resultado</div>'; lista.hidden = false; return; }
      itens.forEach((it) => {
        const op = document.createElement('div');
        op.className = 'lp-op';
        op.textContent = it.value;
        op.addEventListener('mousedown', (e) => {
          e.preventDefault();
          host.dataset.id = String(it.key);
          inp.value = it.value;
          fechar();
        });
        lista.appendChild(op);
      });
      lista.hidden = false;
    }
    async function carregar(termo) {
      abrir([], 'buscando...');
      try { abrir(await autocompletar(url, termo)); } catch (_) { abrir([], 'erro ao buscar'); }
    }
    inp.addEventListener('input', () => {
      host.dataset.id = '';
      clearTimeout(timer);
      const t = inp.value.trim();
      if (t.length < 2) { fechar(); return; }
      timer = setTimeout(() => carregar(t), 250);
    });
    inp.addEventListener('blur', () => setTimeout(fechar, 200));
  }

  async function renderResultados(container, tarefas) {
    const favs = await lerFavoritos();
    const favSet = new Set(favs.map((x) => String(x.seq)));
    container.innerHTML = '';
    tarefas.forEach((t) => {
      const linha = document.createElement('div');
      linha.className = 'lp-tar';
      const marcado = favSet.has(String(t.seq));
      linha.innerHTML = `
        <button class="lp-tar-fav${marcado ? ' on' : ''}" title="Favoritar/desfavoritar" aria-label="Favoritar">${marcado ? '★' : '☆'}</button>
        <div class="lp-tar-info">
          <div class="lp-tar-t"><b>${esc(t.num)}</b> ${esc(t.assunto)}</div>
          <div class="lp-tar-sub">${esc(t.cliente)}${t.status ? ' · ' + esc(t.status) : ''}</div>
        </div>
        <button class="lp-tar-abrir" title="Abrir a tarefa">Abrir</button>`;
      linha.querySelector('.lp-tar-abrir').onclick = () => abrirTarefa(t);
      const btnFav = linha.querySelector('.lp-tar-fav');
      btnFav.onclick = async () => {
        const agora = await alternarFavorito(t);
        btnFav.classList.toggle('on', agora);
        btnFav.textContent = agora ? '★' : '☆';
      };
      container.appendChild(linha);
    });
  }

  async function renderFavoritos(bg) {
    const status = bg.querySelector('.lp-fav-status');
    const result = bg.querySelector('.lp-fav-result');
    const favs = await lerFavoritos();
    if (!favs.length) {
      status.textContent = 'Nenhuma tarefa favoritada ainda. Marque a estrela ao lado de uma tarefa na aba Buscar.';
      result.innerHTML = '';
      return;
    }
    status.textContent = favs.length + ' tarefa(s) favoritada(s).';
    await renderResultados(result, favs.map((f) => ({ seq: f.seq, num: f.num, assunto: f.assunto, cliente: f.cliente, status: '', href: f.href })));
  }

  function abrirTarefa(t) {
    const url = t.href ? (location.origin + t.href) : (location.origin + '/Tarefa/Alterar/' + t.seq);
    window.open(url, '_blank');
  }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  garantirBotao();
  try { LP.observar(garantirBotao); } catch (_) {}
  document.addEventListener('DOMContentLoaded', garantirBotao);

  LP.buscaTarefa = { abrir: abrirPopup, executarBusca, lerFavoritos, alternarFavorito };
})(window.LegalePlus);
