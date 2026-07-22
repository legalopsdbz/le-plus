/* Legale+ — módulo de lançamento de Time Sheet.
 * Conversa direto com os endpoints internos do Legale (os mesmos que a tela usa).
 * NÃO grava nada sem confirmação enquanto config.confirmarAntesDeGravar = true. */
window.LegalePlus = window.LegalePlus || {};

(function (LP) {
  const CFG = window.LEGALE_PLUS_CONFIG;

  // Autocomplete de cliente/procedimento (retorna [{key, value}]).
  async function popular(endpoint, filtro) {
    const url = `${endpoint}?filtro=${encodeURIComponent(filtro)}&startsWith=false`;
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) throw new Error(`Falha em ${endpoint} (${r.status})`);
    return r.json();
  }

  // Nome COMPLETO da tarefa (o PopularTarefaJSON corta o texto no servidor e devolve
  // ".../..."). Recuperamos o Assunto inteiro pela ficha /Tarefa/Alterar/{id} (campo
  // #ASSUNTO), que traz o texto sem corte para qualquer tarefa. Cacheado por id.
  // Adição de 2026-07-20 (pedido de Vinícius): o dropdown de Tarefa deve sempre mostrar
  // o nome completo e o número.
  const _nomeTarefaCache = {};
  function _truncado(t) { return /(…|\.\.\.)\s*$/.test(t || ''); }
  async function nomeCompletoTarefa(id) {
    if (id == null || id === '') return '';
    if (Object.prototype.hasOwnProperty.call(_nomeTarefaCache, id)) return _nomeTarefaCache[id];
    let full = '';
    try {
      const r = await fetch('/Tarefa/Alterar/' + encodeURIComponent(id),
        { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      if (r.ok) {
        const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
        const el = doc.querySelector('#ASSUNTO, [name="ASSUNTO"]');
        const v = el ? (el.value !== undefined ? el.value : el.textContent) : '';
        if (v && v.trim()) full = v.trim();
      }
    } catch (_) {}
    _nomeTarefaCache[id] = full;
    return full;
  }
  // Completa em bloco os itens cujo texto veio truncado, mantendo o formato "id - nome".
  async function enriquecerNomes(items) {
    await Promise.all((items || []).map(async (it) => {
      if (it && _truncado(it.text)) {
        const full = await nomeCompletoTarefa(it.id);
        if (full) it.text = it.id + ' - ' + full;
      }
    }));
    return items;
  }

  // Tarefas do cliente: /TimeSheet/PopularTarefaJSON/{codcli}?filtro=termo&page=1
  // Retorna { total, items:[{id, text}] }. Busca por número ou nome; filtro vazio lista tudo (paginado).
  async function buscarTarefa(codcli, filtro, page) {
    const cc = codcli || CFG.codcliPadrao;
    const url = `${CFG.api.popularTarefa}/${cc}?filtro=${encodeURIComponent(filtro || '')}&page=${page || 1}`;
    const r = await fetch(url, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    if (!r.ok) throw new Error(`Falha ao listar tarefas (${r.status})`);
    let j = null; try { j = await r.json(); } catch (_) {}
    const items = (j && Array.isArray(j.items)) ? j.items : [];
    return await enriquecerNomes(items);
  }

  // Processos/Pasta do cliente (judicial): mesma forma das tarefas. Remove o placeholder.
  async function buscarProcesso(codcli, filtro, page) {
    const cc = codcli || CFG.codcliPadrao;
    const url = `${CFG.api.popularProcessos}/${cc}?filtro=${encodeURIComponent(filtro || '')}&page=${page || 1}`;
    const r = await fetch(url, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    if (!r.ok) throw new Error(`Falha ao listar processos (${r.status})`);
    let j = null; try { j = await r.json(); } catch (_) {}
    const its = (j && Array.isArray(j.items)) ? j.items : [];
    return its.filter((x) => String(x.id).trim() !== '' && !/--\s*selecione/i.test(x.text || ''));
  }

  // Tipos de atividade (TIPO) do lançamento. Lista ESTÁTICA renderizada no form do Legale;
  // buscamos uma vez em /TimeSheet/Incluir, cacheamos e filtramos localmente por termo.
  let _tiposCache = null;
  async function _carregarTipos() {
    if (_tiposCache) return _tiposCache;
    const r = await fetch(CFG.api.incluirTimeSheet, { credentials: 'include' });
    const html = await r.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const sel = doc.querySelector('#TIPO, select[name="TIPO"]');
    const out = [];
    if (sel) sel.querySelectorAll('option').forEach((o) => {
      const id = o.getAttribute('value') || '';
      const label = (o.textContent || '').trim();
      if (id && !/--\s*selecione/i.test(label)) out.push({ id, label });
    });
    // Fallback (item 3): se a leitura ao vivo não trouxe nada (sessão caída, mudança
    // de layout), usa o catálogo embarcado. A leitura ao vivo continua tendo prioridade.
    if (!out.length && LP.catalogos && typeof LP.catalogos.tiposComoOpcoes === 'function') {
      const cat = LP.catalogos.tiposComoOpcoes();
      if (cat && cat.length) { _tiposCache = cat; return cat; }
    }
    _tiposCache = out;
    return out;
  }
  async function buscarTipo(filtro) {
    const todos = await _carregarTipos();
    const t = (filtro || '').trim().toLowerCase();
    return t ? todos.filter((x) => x.label.toLowerCase().includes(t)) : todos;
  }

  // USUARIO é OBRIGATÓRIO no /TimeSheet/Incluir (validação real "Campo Obrigatório").
  // No fluxo do cronômetro/mini player não há form aberto para ler o USUARIO, então
  // pegamos o usuário LOGADO do próprio form (/TimeSheet/Incluir traz o <select
  // id="USUARIO"> já com o usuário atual selecionado). Cacheado.
  let _usuarioCache = null;
  async function usuarioPadrao() {
    if (_usuarioCache != null) return _usuarioCache;
    try {
      const r = await fetch(CFG.api.incluirTimeSheet, { credentials: 'include' });
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
      const u = doc.querySelector('#USUARIO, select[name="USUARIO"], [name="USUARIO"]');
      let val = '';
      if (u && u.tagName === 'SELECT') { const o = u.options[u.selectedIndex]; val = (o && o.value) || u.value || ''; }
      else if (u) val = u.value || '';
      _usuarioCache = val;
    } catch (_) { _usuarioCache = ''; }
    return _usuarioCache;
  }

  LP.timesheet = {
    buscarCliente: (f) => popular(CFG.api.popularCliente, f),
    buscarProcedimento: (f) => popular(CFG.api.popularProcedimento, f),
    buscarTarefa,
    buscarProcesso,
    buscarTipo,

    /* Monta o FormData do lançamento, ESPELHANDO o formulário /TimeSheet/Incluir por
     * completo (o controlador quebra se faltam campos). Confirmado ao vivo:
     * - DURACAO é HH:MM (não decimal);
     * - PROCEDIM é OBRIGATÓRIO; SEQAREA pode ir em branco;
     * - todos os campos abaixo são enviados, com os defaults do form.
     * dados = { inicio:Date, fim:Date, resumo, codcli, codcliNome, procedim, procedimNome,
     *           seqtarefa, usuario, seqarea?, seqemptrab?, jaavexec?, tipo?, nprocesso?,
     *           ckvincularandamento?, ckvincularfd? } */
    montarPayload(dados) {
      const d = { ...CFG.timesheetDefaults };
      // Duração em HH:MM (formato real do campo "Duração" do Legale).
      const totalMin = Math.max(1, Math.round((dados.fim - dados.inicio) / 60000));
      const durHHMM = String(Math.floor(totalMin / 60)).padStart(2, '0') + ':' + String(totalMin % 60).padStart(2, '0');
      const fd = new FormData();
      const set = (k, v) => fd.append(k, v == null ? '' : String(v));
      set('DAGENDA', LP.fmtDataHora(dados.inicio));
      set('DURACAO', durHHMM);
      set('DAGENDAF', LP.fmtDataHora(dados.fim));
      set('JAAVEXEC', dados.jaavexec || d.JAAVEXEC);            // Concluído Sim/Não
      set('CODCLI_AUTOCOMPLETE', dados.codcliNome || '');
      set('CODCLI', dados.codcli || '');                        // Cliente
      set('PROCEDIM_AUTOCOMPLETE', dados.procedimNome || '');
      set('PROCEDIM', dados.procedim || '');                    // Atividade (OBRIGATÓRIO)
      set('SEQTAREFA', dados.seqtarefa || '');                  // vincula à tarefa
      set('CKEXIBIRCONCLUIDOSEAPROVADOS', 'false');
      set('RESUMO', dados.resumo || '');
      set('TIPOCOBRANCA', d.TIPOCOBRANCA);                      // fixo: Cobrável
      set('SEQTABELATIME', d.SEQTABELATIME);                    // fixo: TABELA 01
      set('SEQAREA', dados.seqarea || '');                      // em branco por padrão (SOP)
      set('SEQEMPTRAB', dados.seqemptrab || d.SEQEMPTRAB);      // Unidade DBZ/GZN
      set('SEQCONTRATO', '');
      set('TIPO', dados.tipo || '');                            // Tipo (judicial: ACOMPANHAMENTO, PUBLICAÇÃO...)
      set('USUARIO', dados.usuario || '');
      set('NPROCESSO', dados.nprocesso || '');                  // Processo/Pasta (judicial)
      set('CKVINCULARANDAMENTO', dados.ckvincularandamento ? 'true' : 'false'); // Vincular ao Andamento (publicação)
      set('CKVINCULARFD', dados.ckvincularfd ? 'true' : 'false');               // Vincular ao Fundo de Despesas
      set('ckCorrigido', 'false');
      return fd;
    },

    /* Grava de fato. Só chame depois da confirmação do usuário.
     * CRÍTICO: o Legale só processa a gravação como AJAX (cabeçalho X-Requested-With);
     * sem ele o servidor devolve a página HTML e NADA é salvo. A resposta é JSON:
     * { sucesso: "..." } quando ok, ou { erros:[{Key,ErrorMessage}] } / { keys, values }
     * na validação. */
    async gravar(dados) {
      // Garante o USUARIO (obrigatório): se não veio do compromisso, usa o logado.
      if (!dados.usuario) { const u = await usuarioPadrao(); if (u) dados = { ...dados, usuario: u }; }
      // Modo teste seguro (item 4): redireciona o lançamento para o cliente fictício
      // TESTE e prefixa o Resumo, sem tocar dados de cliente real. Opt-in via popup.
      // Solta tarefa/processo/vínculos (que pertencem ao cliente real) para não dar
      // erro de vínculo cruzado; a Atividade (procedim) é global e permanece.
      if (CFG.modoTeste && CFG.clienteTeste) {
        const ct = CFG.clienteTeste;
        dados = {
          ...dados,
          codcli: ct.codcli, codcliNome: ct.nome,
          resumo: (ct.prefixoResumo || '[TESTE] ') + (dados.resumo || ''),
          seqtarefa: '', nprocesso: '', ckvincularandamento: false, ckvincularfd: false,
        };
      }
      const fd = this.montarPayload(dados);
      const r = await fetch(CFG.api.incluirTimeSheet, {
        method: 'POST', body: fd, credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      const txt = await r.text();
      let j = null; try { j = JSON.parse(txt); } catch (_) {}
      if (!j) {
        // Item 2: o Legale devolve HTTP 200 com um painel HTML mesmo quando NEGA por
        // permissão ou quando a sessão caiu. Detecta o conteúdo e dá mensagem clara.
        if (/Permiss[aã]o de Acesso|não tem permiss|CONTROLE\s*-\s*TIME/i.test(txt)) {
          throw new Error('Sem permissão para esta operação de Time Sheet (o Legale exige um perfil de controle). Nada foi alterado.');
        }
        if (/\/Acesso|name="Senha"|name="Usuario"|Esqueci Minha Senha/i.test(txt)) {
          throw new Error('Sessão do Legale expirada. Faça login novamente no Legale e tente de novo.');
        }
        throw new Error('O servidor não confirmou a gravação. Confira se está logado no Legale.');
      }
      if (j.sucesso) return j;
      const msgs = [];
      (j.erros || []).forEach((e) => { if (e && e.ErrorMessage) msgs.push(e.ErrorMessage); });
      if (j.keys && j.values) j.keys.forEach((k, i) => { if (j.values[i]) msgs.push(j.values[i]); });
      throw new Error(msgs.length ? msgs.join('; ') : 'Não foi salvo. Verifique os campos.');
    },
  };
})(window.LegalePlus);
