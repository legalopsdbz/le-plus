/* Utilidades comuns Legale+ */
window.LegalePlus = window.LegalePlus || {};

(function (LP) {
  // Formata segundos como HH:MM:SS.
  LP.fmtDuracao = function (segs) {
    segs = Math.max(0, Math.floor(segs));
    const h = String(Math.floor(segs / 3600)).padStart(2, '0');
    const m = String(Math.floor((segs % 3600) / 60)).padStart(2, '0');
    const s = String(segs % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  // Formata Date como "dd/mm/aaaa hh:mm" (formato que o Legale usa em DAGENDA).
  LP.fmtDataHora = function (d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  // Observa o DOM e chama cb quando algo muda (com throttle simples).
  LP.observar = function (cb) {
    let agendado = false;
    const obs = new MutationObserver(() => {
      if (agendado) return;
      agendado = true;
      requestAnimationFrame(() => { agendado = false; cb(); });
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return obs;
  };

  // Persistência local (por aba/usuário) do cronômetro em andamento.
  LP.store = {
    async get(k, def) {
      return new Promise((res) => chrome.storage.local.get([k], (o) => res(o[k] ?? def)));
    },
    async set(k, v) {
      return new Promise((res) => chrome.storage.local.set({ [k]: v }, res));
    },
    async del(k) {
      return new Promise((res) => chrome.storage.local.remove([k], res));
    },
  };

  LP.log = (...a) => console.log('%c[Legale+]', 'color:#144D2E;font-weight:bold', ...a);
})(window.LegalePlus);
