// Tema: "auto" (cihazın ayarı), "dark" ya da "light". Seçim bu cihazda saklanır.
// <head> içinde, sayfa çizilmeden yüklenir ki açılışta yanlış renk görünüp kaybolmasın.
(function () {
  'use strict';
  const KEY = 'bitig.theme';
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function get() {
    try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; }
  }
  const isDark = (t = get()) => t === 'dark' || (t !== 'light' && !!media?.matches);

  function apply(t = get()) {
    const root = document.documentElement;
    if (t === 'dark' || t === 'light') root.dataset.theme = t;
    else delete root.dataset.theme;
    // telefonda üst çubuk rengi
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = isDark(t) ? '#15171c' : '#f6f6f3';
  }

  function set(t) {
    try { if (t === 'dark' || t === 'light') localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch {}
    apply(t);
  }

  apply();
  media?.addEventListener?.('change', () => apply());
  window.BitigTheme = { get, set, apply, isDark };
})();
