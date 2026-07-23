/* Legale+ , Mini player flutuante (Document Picture-in-Picture).
 *
 * Uma única janela sempre-no-topo (fica por cima de qualquer app/janela) que
 * lista MARCADORES de tempo, cada um com seu cronômetro independente. Vários
 * rodam ao mesmo tempo.
 *
 * Modelo de marcadores (pedido de Vinícius, 2026-07-06):
 * - Cada marcador guarda o compromisso (cid + título + contexto), a HORA DE
 *   INÍCIO e a HORA DE FIM reais.
 * - Play inicia (grava início). Pause grava o FIM naquele instante (não é preciso
 *   apertar o X na hora exata do término).
 * - Se, depois de pausar, o usuário der PLAY de novo, abre-se um NOVO marcador do
 *   MESMO compromisso, com nova hora de início (o marcador pausado continua na
 *   lista, intacto).
 * - O "🕐" de cada marcador ENCERRA e abre o popup de lançamento de Time Sheet já
 *   com Início e Fim preenchidos pelos dados do cronômetro. Se o lançamento for
 *   gravado, o marcador some; se for cancelado, ele permanece.
 * - O "✕" fecha o compromisso e o remove da lista (sem abrir o popup).
 * - "Limpar" (no cabeçalho) esvazia toda a lista, mediante confirmação.
 *
 * Requer Chrome com suporte a documentPictureInPicture (Chrome 116+). */
window.LegalePlus = window.LegalePlus || {};

(function (LP) {
  const CHAVE_MARK = 'lp_mp_markers';
  let seq = 0;

  const CSS = `
    * { box-sizing: border-box; font-family: system-ui, Arial, sans-serif; }
    body { margin: 0; background: #10331f; color: #fff; }
    header { padding: 8px 12px; background: #144D2E; font-size: 13px; font-weight: 600;
      display: flex; align-items: center; justify-content: space-between; }
    header .badge { background: #B4892A; color: #10331f; border-radius: 10px; padding: 1px 7px; font-size: 11px; }
    .vazio { padding: 18px 12px; font-size: 12px; color: #cdd9d1; line-height: 1.4; }
    .item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid #1c4a30; }
    .item.pausado { background: #123d24; }
    .item .info { flex: 1; min-width: 0; }
    .item .tit { font-size: 12px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .item .tempo { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; color: #ffe; }
    .item.rodando .tempo { color: #ffd98a; }
    .item .quando { font-size: 10px; color: #9fb8a9; font-variant-numeric: tabular-nums; }
    .btn { cursor: pointer; border: none; border-radius: 6px; padding: 5px 9px; font-size: 14px; color: #fff; background: #2e6a45; }
    .item.rodando .btn { background: #B4892A; color: #10331f; }
    .ts { cursor: pointer; border: none; background: transparent; color: #cdd9d1; font-size: 15px; padding: 2px 4px; }
    .ts:hover { color: #ffd98a; }
    .x { cursor: pointer; border: none; background: transparent; color: #9fb8a9; font-size: 15px; padding: 2px 4px; }
    .x:hover { color: #ff9a8a; }
    header .acoes { display: flex; align-items: center; gap: 6px; }
    header .limpar { cursor: pointer; border: 1px solid #ffffff55; background: transparent; color: #fff;
      border-radius: 6px; padding: 2px 8px; font-size: 11px; }
    header .limpar:hover { background: #ffffff22; }
    header .limpar[disabled] { opacity: .4; cursor: default; }
  `;

  let win = null;
  let ticker = null;

  /* Cache em memória dos marcadores = fonte de verdade do render. O armazenamento
   * (via casca/chrome.storage) passa a ser só BACKUP de persistência. Motivo: o elo
   * de storage do carregador pode não responder (ponte lenta/antiga); antes, cada
   * render fazia `await LP.store.get(...)` e, se isso não resolvia, a lista ESPERAVA
   * para sempre e ficava vazia (o mini player abria mas não listava). Agora a leitura
   * é da memória (instantânea) e a escrita persiste em segundo plano, sem bloquear. */
  let _cache = null;      // array de marcadores em memória (null = ainda não semeado)
  let _semeando = null;   // Promise única de semeadura inicial

  // Lê o storage com TETO de tempo: um elo travado nunca segura o render.
  function _lerStorageComTeto(ms) {
    return Promise.race([
      Promise.resolve().then(() => LP.store.get(CHAVE_MARK, [])).catch(() => null),
      new Promise((r) => setTimeout(() => r(null), ms)), // null = não respondeu a tempo
    ]);
  }
  async function _garantirCache() {
    if (_cache) return _cache;
    if (!_semeando) {
      _semeando = (async () => {
        const v = await _lerStorageComTeto(700);
        _cache = Array.isArray(v) ? v : []; // adota o storage só se respondeu; senão começa vazio
        return _cache;
      })();
    }
    await _semeando;
    return _cache;
  }

  async function listar() { return await _garantirCache(); }
  async function salvar(arr) {
    _cache = Array.isArray(arr) ? arr : [];
    // Persistência best-effort: em segundo plano, sem bloquear nem estourar se falhar.
    try { Promise.resolve().then(() => LP.store.set(CHAVE_MARK, _cache)).catch(() => {}); } catch (_) {}
  }
  function novoMid() { return Date.now().toString(36) + '-' + (++seq); }

  function hhmm(ts) {
    const d = new Date(ts); const p = (n) => String(n).padStart(2, '0');
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // Regra de cronômetro ÚNICO ativo (pedido de Vinícius, 2026-07-07): ao dar play
  // em qualquer marcador, os que estiverem rodando são PAUSADOS na hora (grava o
  // fim), registrando início/fim de cada um. Eles permanecem na lista, prontos
  // para lançar. `exceto` é o mid que está sendo iniciado (não se pausa a si mesmo).
  function pausarOutrosRodando(arr, exceto) {
    const agora = Date.now();
    let mudou = false;
    for (const m of arr) {
      if (m.mid !== exceto && m.inicio && !m.fim) { m.fim = agora; mudou = true; }
    }
    return mudou;
  }

  // Envia um compromisso ao mini player: cria um marcador ocioso. Se já houver um
  // marcador ativo (ocioso ou rodando) do mesmo compromisso, não duplica.
  async function adicionar(item) {
    const arr = await listar();
    const cid = String(item.id);
    const jaAtivo = arr.some((m) => String(m.cid) === cid && !m.fim);
    if (!jaAtivo) {
      arr.push({
        mid: novoMid(), cid,
        titulo: item.titulo || ('Compromisso ' + cid),
        ctx: item.ctx || null, inicio: null, fim: null,
      });
      await salvar(arr);
      LP.toast('Compromisso enviado ao mini player.');
    }
    render();
  }

  // Play/Pause do marcador. Pausado + play = NOVO marcador (mesmo compromisso).
  async function alternar(mid) {
    const arr = await listar();
    const m = arr.find((x) => x.mid === mid);
    if (!m) return;
    if (!m.inicio) {                                                // ocioso -> rodando
      pausarOutrosRodando(arr, mid);                               // pausa e registra quem estava contando
      m.inicio = Date.now(); m.fim = null;
    } else if (!m.fim) { m.fim = Date.now(); }                      // rodando -> pausado (grava fim)
    else {                                                          // pausado -> novo marcador
      pausarOutrosRodando(arr, null);                             // pausa e registra outro que esteja rodando
      arr.push({ mid: novoMid(), cid: m.cid, titulo: m.titulo, ctx: m.ctx, inicio: Date.now(), fim: null });
    }
    await salvar(arr);
    render();
  }

  // X: encerra o marcador e abre o popup de lançamento com Início/Fim do cronômetro.
  async function encerrar(mid) {
    const arr = await listar();
    const m = arr.find((x) => x.mid === mid);
    if (!m) return;
    if (m.inicio && !m.fim) m.fim = Date.now();  // X enquanto roda = pausa neste instante
    await salvar(arr);
    if (!m.inicio) { return remover(mid); }      // nunca cronometrado: só remove
    // Contexto fresco pelo id do compromisso (tarefa/processo/cliente/resumo). O modal
    // de detalhe não traz esses vínculos, então buscamos do form completo do Legale.
    const live = await LP.meta2.carregarContextoCompromisso(m.cid);
    const c = live || m.ctx || {};
    const ok = await LP.meta2.abrirLancamento({
      inicio: new Date(m.inicio), fim: new Date(m.fim),
      resumo: c.resumo, codcli: c.codcli, codcliNome: c.codcliNome,
      procedim: '', seqtarefa: c.seqtarefa, usuario: c.usuario, tipoNome: c.tipoNome,
      nprocesso: c.nprocesso, nprocessoNome: c.nprocessoNome,
    });
    if (ok) await remover(mid);  // gravou -> tira da lista
    else render();               // cancelou -> mantém o marcador (não perde o tempo)
  }

  async function remover(mid) {
    await salvar((await listar()).filter((x) => x.mid !== mid));
    render();
  }

  // Limpar: esvazia a lista de cronômetros do mini player. Pede confirmação porque
  // tempos ainda não lançados seriam perdidos.
  async function limparTudo() {
    const arr = await listar();
    if (!arr.length) return;
    const msg = 'Limpar todos os cronômetros da lista? Os tempos ainda não lançados serão perdidos.';
    let ok = true;
    try { ok = win ? win.confirm(msg) : window.confirm(msg); } catch (_) { ok = true; }
    if (!ok) return;
    await salvar([]);
    render();
  }

  /* --- Controle POR COMPROMISSO (usado pelo relojinho do modal, para os dois
   * cronômetros compartilharem os mesmos marcadores) --- */

  // Marcador "atual" de um compromisso: o que está rodando, senão o mais recente.
  async function marcadorDoCompromisso(cid) {
    const doCid = (await listar()).filter((m) => String(m.cid) === String(cid));
    return doCid.find((m) => m.inicio && !m.fim) || doCid[doCid.length - 1] || null;
  }

  // Play/Pause por compromisso. Rodando -> pausa (grava fim). Senão reaproveita um
  // marcador ocioso ou cria um novo já rodando. Pausado + play = novo marcador.
  async function toggleCompromisso(cid, titulo, ctx) {
    const arr = await listar();
    cid = String(cid);
    const rodando = arr.find((m) => String(m.cid) === cid && m.inicio && !m.fim);
    if (rodando) {
      rodando.fim = Date.now();
    } else {
      const ocioso = arr.find((m) => String(m.cid) === cid && !m.inicio);
      pausarOutrosRodando(arr, ocioso ? ocioso.mid : null); // ao iniciar este, pausa e registra os demais
      if (ocioso) { ocioso.inicio = Date.now(); ocioso.fim = null; if (ctx && !ocioso.ctx) ocioso.ctx = ctx; }
      else arr.push({ mid: novoMid(), cid, titulo: titulo || ('Compromisso ' + cid), ctx: ctx || null, inicio: Date.now(), fim: null });
    }
    await salvar(arr);
    render();
  }

  // Encerra o marcador atual do compromisso e abre o popup (igual ao X).
  async function encerrarCompromisso(cid) {
    const m = await marcadorDoCompromisso(cid);
    if (m) await encerrar(m.mid);
  }

  async function abrir() {
    if (!('documentPictureInPicture' in window)) {
      LP.toast('Este Chrome não tem o mini player flutuante (atualize o navegador).', true);
      return;
    }
    if (win && !win.closed) { try { win.focus(); } catch (_) {} return; }
    win = await window.documentPictureInPicture.requestWindow({ width: 320, height: 420 });
    const style = win.document.createElement('style');
    style.textContent = CSS;
    win.document.head.appendChild(style);
    win.document.title = 'Legale+ Cronômetros';
    const root = win.document.createElement('div');
    root.id = 'lp-mp-root';
    win.document.body.appendChild(root);
    win.addEventListener('pagehide', () => { clearInterval(ticker); ticker = null; win = null; });
    render();
    clearInterval(ticker);
    ticker = setInterval(render, 1000);
  }

  // Monta a lista por DOM (createElement + textContent), NUNCA por innerHTML: a
  // página do Legale aplica Trusted Types/CSP, e mesmo na janela do mini player o
  // `root.innerHTML = html` era barrado, então a janela abria mas a lista ficava
  // vazia. Construir os nós elemento a elemento passa pela CSP e ainda escapa o
  // texto sozinho (dispensa o esc() antigo).
  async function render() {
    if (!win || win.closed) return;
    const doc = win.document;
    const root = doc.getElementById('lp-mp-root');
    if (!root) return;

    let arr;
    try { arr = await listar(); } catch (_) { return; } // leitura falhou: mantém o que está na tela
    const rodando = arr.filter((m) => m.inicio && !m.fim).length;

    const el = (tag, cls, txt) => {
      const n = doc.createElement(tag);
      if (cls) n.className = cls;
      if (txt != null) n.textContent = txt;
      return n;
    };

    while (root.firstChild) root.removeChild(root.firstChild);

    const header = el('header');
    header.appendChild(el('span', null, 'Cronômetros'));
    const acoes = el('span', 'acoes');
    const btnLimpar = el('button', 'limpar', 'Limpar');
    btnLimpar.title = 'Limpar a lista de cronômetros';
    btnLimpar.disabled = !arr.length;
    btnLimpar.onclick = () => limparTudo();
    acoes.appendChild(btnLimpar);
    acoes.appendChild(el('span', 'badge', rodando + ' ativo(s)'));
    header.appendChild(acoes);
    root.appendChild(header);

    if (!arr.length) {
      root.appendChild(el('div', 'vazio',
        'Nenhum compromisso aqui ainda. No compromisso, clique em "Enviar ao mini player" para acompanhá-lo por aqui, mesmo em outra janela ou app.'));
      return;
    }

    for (const m of arr) {
      const emAndamento = m.inicio && !m.fim;
      const pausado = m.inicio && m.fim;
      const segs = m.inicio ? (emAndamento ? (Date.now() - m.inicio) : (m.fim - m.inicio)) / 1000 : 0;
      const quando = m.inicio
        ? (hhmm(m.inicio) + (m.fim ? ' → ' + hhmm(m.fim) : ' → …'))
        : 'não iniciado';

      const item = el('div', 'item' + (emAndamento ? ' rodando' : '') + (pausado ? ' pausado' : ''));
      const info = el('div', 'info');
      const tit = el('div', 'tit', m.titulo);
      tit.title = m.titulo || '';
      info.appendChild(tit);
      info.appendChild(el('div', 'tempo', LP.fmtDuracao(segs)));
      info.appendChild(el('div', 'quando', quando));
      item.appendChild(info);

      const btn = el('button', 'btn', emAndamento ? '⏸' : '▶');
      btn.title = emAndamento ? 'Pausar (grava o fim)' : (pausado ? 'Novo marcador' : 'Iniciar');
      btn.onclick = () => alternar(m.mid);
      item.appendChild(btn);

      const ts = el('button', 'ts', '🕐');
      ts.title = 'Encerrar e lançar time sheet';
      ts.onclick = () => encerrar(m.mid);   // 🕐: encerra e abre o popup de lançamento
      item.appendChild(ts);

      const x = el('button', 'x', '✕');
      x.title = 'Fechar o compromisso e remover da lista';
      x.onclick = () => remover(m.mid);     // ✕: fecha o compromisso e tira da lista
      item.appendChild(x);

      root.appendChild(item);
    }
  }

  LP.miniplayer = {
    abrir, adicionar, remover, alternar, encerrar, limparTudo,
    marcadorDoCompromisso, toggleCompromisso, encerrarCompromisso,
    ativo: () => !!(win && !win.closed),
  };
})(window.LegalePlus);
