/* PWA glue: service worker registration and the install button. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const standalone = () =>
    matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }

  const btn = $('btnInstall'), ios = $('iosHint');
  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferred = e;
    if (btn && !standalone()) btn.hidden = false;
  });
  if (btn) btn.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch (e) {}
    deferred = null; btn.hidden = true;
  });
  window.addEventListener('appinstalled', () => { deferred = null; if (btn) btn.hidden = true; if (ios) ios.hidden = true; });

  // iOS Safari has no install prompt, so show the manual steps instead.
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIos && !standalone() && ios) ios.hidden = false;
})();
