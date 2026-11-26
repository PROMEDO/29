(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  var KEY = 'mp_css_recover_ts';
  function recoverFromBrokenStylesheet() {
    if (navigator.onLine === false) return;
    try {
      var now = Date.now();
      var prev = Number(sessionStorage.getItem(KEY) || '0');
      if (prev && now - prev < 20000) return;
      sessionStorage.setItem(KEY, String(now));
    } catch (e) {}
    var tasks = [];
    try {
      if ('serviceWorker' in navigator) {
        tasks.push(
          navigator.serviceWorker
            .getRegistrations()
            .then(function (regs) {
              return Promise.all(regs.map(function (r) { return r.unregister(); }));
            })
            .catch(function () {})
        );
      }
      if ('caches' in window) {
        tasks.push(
          caches
            .keys()
            .then(function (keys) {
              return Promise.all(keys.map(function (k) { return caches.delete(k); }));
            })
            .catch(function () {})
        );
      }
    } catch (e) {}
    Promise.all(tasks).finally(function () {
      try {
        var u = new URL(window.location.href);
        u.searchParams.set('_mp_recover', String(Date.now()));
        window.location.replace(u.toString());
      } catch (e) {
        window.location.reload();
      }
    });
  }
  document.addEventListener(
    'error',
    function (ev) {
      var t = ev && ev.target;
      if (
        t &&
        t.tagName === 'LINK' &&
        String(t.rel || '').toLowerCase() === 'stylesheet' &&
        String(t.getAttribute('href') || '').indexOf('/assets/') !== -1
      ) {
        recoverFromBrokenStylesheet();
      }
    },
    true
  );
  window.addEventListener('load', function () {
    var builtCssLink = document.querySelector('link[rel="stylesheet"][href*="/assets/"]');
    if (!builtCssLink) return;
    var flag = '';
    try {
      flag = getComputedStyle(document.documentElement).getPropertyValue('--mp-css-loaded').trim();
    } catch (e) {}
    if (flag !== '1') {
      recoverFromBrokenStylesheet();
    }
  });
})();
