/* Legale+ , Meta 4: aplica o tema escuro o mais cedo possível (document_start),
 * lendo o último estado do localStorage, para não haver "flash" branco antes do
 * content script principal carregar. A fonte de verdade continua no chrome.storage,
 * reconciliada logo em seguida pelo darkmode.js. */
try {
  if (localStorage.getItem('lp-dark') === '1') {
    document.documentElement.classList.add('lp-dark-on');
  }
} catch (e) {}
