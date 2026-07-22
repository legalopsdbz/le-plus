/* Legale+ , Modo Daltônico: marca a classe o mais cedo possível (document_start),
 * lendo o último estado do localStorage, para manter o estado consistente antes do
 * script principal. A fonte de verdade é o chrome.storage, reconciliada pelo daltonico.js. */
try {
  if (localStorage.getItem('lp-cvd') === '1') {
    document.documentElement.classList.add('lp-cvd-on');
  }
} catch (e) {}
