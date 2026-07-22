/* Legale+ (Projeto Usuário) — configuração central.
 * TODO tuning: os seletores marcados com  // TUNE  precisam ser confirmados
 * sobre a tela real do Legale Web. Estão com palpites baseados no mapeamento
 * conhecido; ao inspecionar a página ao vivo, ajustamos aqui, num lugar só. */

window.LEGALE_PLUS_CONFIG = {

  // Em qual URL a tela de Compromissos vive (para ligar/desligar a Meta 1).
  rotaCompromissos: /\/Compromisso(\/|$|\?)/i,

  // --- Meta 1: expandir a visualização por dia ---
  // O Legale Web usa o calendário Mobiscroll (mbsc-*). Seletores CONFIRMADOS ao vivo.
  seletores: {
    // Contêiner(es) do grid mensal (recebem a classe lp-mes). Escopo restrito à
    // agenda grande que tem eventos (mbsc-cal-txt), nunca o mini date-picker.
    calendario: '.mbsc-cal-slide, .mbsc-cal-scroll, .mbsc-cal-table',
    // Cada célula de dia do grid mensal (tem data-full="AAAA-M-D").
    celulaDia: '.mbsc-cal-cell.mbsc-cal-day[data-full]',
    // Contêiner de eventos dentro do dia (o que limita a altura e corta).
    eventosDoDia: '.mbsc-cal-day-markup',
    // Cada rótulo de compromisso (título já vem completo no texto; o CSS corta).
    evento: '.mbsc-cal-txt[data-id]',
    // O título fica no próprio .mbsc-cal-txt.
    tituloEvento: '.mbsc-cal-txt[data-id]',
    // Modal de detalhe aberto ao clicar num compromisso.
    modalCompromisso: '.modalEventos',
  },

  // Quantos títulos mostrar por dia antes de "ver mais" (0 = todos, sempre).
  maxTitulosPorDia: 0,

  // --- Meta 2: cronômetro + time sheet ---
  // Endpoints internos do próprio Legale (já usados pela tela).
  api: {
    incluirTimeSheet: '/TimeSheet/Incluir',
    popularCliente: '/TimeSheet/PopularCliente',
    popularProcedimento: '/TimeSheet/PopularProcedimento',
    // Tarefas do cliente (select2 do Legale). Uso: /TimeSheet/PopularTarefaJSON/{codcli}?filtro=termo&page=1
    // Retorna { total, items:[{id, text:"N - NOME"}] }. Busca por número ou nome.
    popularTarefa: '/TimeSheet/PopularTarefaJSON',
    // Processos/Pasta do cliente: /TimeSheet/PopularProcessos/{codcli}?filtro=termo&page=1
    // Retorna { total, items:[{id, text:"CNJ [pasta]"}] } (1º item é o placeholder "-- Selecione --").
    popularProcessos: '/TimeSheet/PopularProcessos',
  },

  // Cliente padrão quando o compromisso não traz CODCLI (DBZ = 257), para listar
  // as tarefas internas no seletor do time sheet.
  codcliPadrao: '257',

  // Defaults DBZ para o lançamento (do procedimento oficial de time sheet).
  timesheetDefaults: {
    TIPOCOBRANCA: 'S',      // Cobrável
    SEQTABELATIME: '1',     // TABELA 01
    SEQEMPTRAB: '1',        // 1 = DBZ | 4 = GZN (ver regra por usuário)
    JAAVEXEC: 'S',          // Concluído = Sim
    // SEQAREA fica em branco salvo indicação (ex.: 21 = CONSULTIVO)
  },

  // Primeira versão SEMPRE pede confirmação antes de gravar o time sheet.
  confirmarAntesDeGravar: true,

  // --- Modo teste seguro (opt-in pelo popup da extensão) ---
  // Quando LIGADO, todo lançamento de time sheet é redirecionado para o cliente
  // fictício "TESTE" (código 1) e o Resumo recebe o prefixo [TESTE], para ensaiar
  // o fluxo sem tocar dados de cliente real. Nasce DESLIGADO. A escolha é salva em
  // chrome.storage (modoTeste) e lida pelo content.js, igual às metas.
  modoTeste: false,
  clienteTeste: { codcli: '1', nome: 'TESTE', prefixoResumo: '[TESTE] ' },

  // --- Busca de Tarefas (v0.15.0+) : mapa de SETOR ---
  // O Legale NÃO tem um campo "Setor"; ele é DERIVADO. Mapeamento montado a partir da
  // base real (2026-07-20): os setores jurídicos e Financeiro/Controladoria casam com
  // conjuntos de PROCEDIMENTO (filtro multi da grade /Tarefa/Consultar); "Tarefas
  // Internas" casa com os CLIENTES do próprio escritório (DBZ=257, GZN=296). Os códigos
  // de procedimento vêm do filtro real da grade. AJUSTÁVEL num lugar só: reordene,
  // acrescente ou tire procedimentos conforme a controladoria confirmar. Setor sem
  // procedimento nem cliente aparece como "a definir" e não filtra até ser configurado
  // (caso de Marketing e DPC, que não têm procedimento próprio na base atual).
  setoresTarefa: [
    { id: 'consultivo', label: 'Consultivo',
      procedimentos: [7, 45, 4, 3, 5, 10, 37, 53, 35, 13, 6, 52, 24, 49] },
    { id: 'contencioso', label: 'Contencioso',
      procedimentos: [9, 33, 57, 55, 43, 41, 12, 42, 34] },
    { id: 'recuperacao', label: 'Recuperação de Crédito',
      procedimentos: [11, 2] },
    { id: 'trabalhista', label: 'Trabalhista',
      procedimentos: [8, 31] },
    { id: 'financeiro', label: 'Financeiro',
      procedimentos: [23, 29, 28, 51, 25] },
    { id: 'controladoria', label: 'Controladoria',
      procedimentos: [40, 39, 48] },
    { id: 'internas', label: 'Tarefas Internas (DBZ/GZN)',
      clientes: ['257', '296'] },
    // Sem procedimento próprio na base atual: dependem de definição da controladoria.
    { id: 'marketing', label: 'Marketing (a definir)', procedimentos: [] },
    { id: 'dpc', label: 'DPC (a definir)', procedimentos: [] },
  ],

  // Ativação seletiva (padrão de fábrica). O usuário liga/desliga cada meta no
  // popup da extensão; a escolha é salva em chrome.storage e lida pelo content.js.
  // Metas independentes: uma não depende da outra.
  // meta3 (ocultar concluídos) nasce DESLIGADA: filtro é opt-in do usuário.
  metasPadrao: { meta1: true, meta2: true, meta3: false },

  // --- Meta 3: filtro "ocultar compromissos concluídos" ---
  // Quando ligada, some da agenda os compromissos já marcados como Concluído;
  // desligada, a agenda fica exatamente como o Legale entrega. O filtro roda no
  // world MAIN (page-render), lendo o objeto real de cada evento em
  // inst().settings.data. A DETECÇÃO de "concluído" é centralizada em
  // ocultarConcluidos.deteccao, para ajuste num lugar só depois da conferência ao vivo.
  ocultarConcluidos: {
    // Campos booleanos/textuais do evento que, sendo verdadeiros, indicam concluído.
    // TUNE: confirmar o nome real do campo no objeto do evento do Legale.
    camposVerdadeiro: ['concluido', 'realizado', 'flg_realizado', 'flgconcluido'],
    // Campos de situação/status em que um destes valores significa concluído.
    // TUNE: confirmar chave e valores reais.
    camposSituacao: ['situacao', 'idsituacao', 'status', 'statusAgenda'],
    valoresConcluido: ['concluido', 'concluído', 'realizado', 'C', 'R', '2', '3'],
    // Fallback visual: cor usada pelo Legale para o concluído (só se ligado abaixo).
    // TUNE: só ative se a detecção por campo não bastar e a cor for estável.
    usarCorComoFallback: false,
    coresConcluido: [],
  },
};
