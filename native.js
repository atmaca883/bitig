// Telefon uygulaması (Android / iPhone, Capacitor kabuğu) için uyarlamalar. Tarayıcıda hiçbir şey yapmaz.
//   · Bulut girişi telefonun tarayıcısında açılır; bulut, kayıtlı dönüş adresine (GitHub Pages'teki site) döner,
//     site "app." ile başlayan durumu görünce kodu bitig://oauth?… ile uygulamaya geri gönderir.
//   · Dosya kaydetme / dışa aktarma / yazdırma: telefonun Paylaş menüsü (Dosyalar'a kaydet, Drive, Yazdır…)
//   · Bağlantı açma: uygulama içi tarayıcı · Android geri tuşu
(function (root) {
  'use strict';

  // vendor/capacitor.js (yalnızca uygulama derlemesinde) Capacitor'ı kurar; eklentiler adlarıyla kaydedilince kullanılabilir
  const Cap = root.Capacitor;
  const isNative = !!Cap?.isNativePlatform?.();
  if (isNative) for (const n of ['App', 'Browser', 'Filesystem', 'Share', 'BitigBio']) Cap.Plugins[n] || Cap.registerPlugin(n);
  const P = () => Cap.Plugins;
  const RETURN = 'https://atmaca883.github.io/bitig/'; // bulutlara kayıtlı dönüş adresi
  const APP_STATE = 'app.';
  const SCHEME = 'bitig://oauth';
  const SHARE_DIR = 'paylas'; // paylaşım için geçici dosyalar (açılışta temizlenir)

  // ---------- tarayıcı tarafı: uygulamadan başlatılan girişi uygulamaya geri gönder ----------
  function bounceToApp() {
    if (isNative) return false;
    const q = new URLSearchParams(location.search);
    if (!(q.get('state') || '').startsWith(APP_STATE)) return false;
    const target = SCHEME + location.search;
    history.replaceState(null, '', location.pathname); // kod adres çubuğunda kalmasın
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:0;z-index:99;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;background:#15171c;color:#e8eaf0;font:16px system-ui;text-align:center';
    const p = document.createElement('p');
    p.textContent = _t('Bitig uygulamasına dönülüyor…');
    const a = document.createElement('a');
    a.href = target;
    a.textContent = _t('Bitig’e dön');
    a.style.cssText = 'padding:12px 22px;border-radius:10px;background:#5b8cff;color:#fff;text-decoration:none;font-weight:600';
    box.append(p, a);
    document.body.append(box);
    location.href = target;
    return true;
  }

  // ---------- uygulama tarafı: giriş penceresi ----------
  let pending = null;
  function authorize(url) {
    pending?.reject(Object.assign(new Error(_t('Giriş yarıda kaldı; tekrar dene.')), { cancelled: true }));
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
      P().Browser.open({ url, presentationStyle: 'popover' }).catch((e) => { pending = null; reject(e); });
    });
  }
  function takeAuthUrl(url) {
    if (!String(url || '').startsWith(SCHEME)) return null;
    return new URLSearchParams(String(url).split('?')[1] || '');
  }

  // ---------- paylaşım menüsüyle dosya ----------
  function b64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  async function shareFile(name, data) {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    const safe = String(name || 'dosya').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120) || 'dosya';
    const { Filesystem, Share } = P();
    const r = await Filesystem.writeFile({ path: `${SHARE_DIR}/${safe}`, data: b64(bytes), directory: 'CACHE', recursive: true });
    try { await Share.share({ title: safe, files: [r.uri] }); } catch (e) {
      if (!/cancel/i.test(String(e?.message || e))) throw e; // kullanıcı paylaşımı kapattı
    }
    return safe;
  }
  function cleanShared() {
    P().Filesystem.rmdir({ path: SHARE_DIR, directory: 'CACHE', recursive: true }).catch(() => {});
  }

  // ---------- Android geri tuşu: masaüstündeki Escape gibi; açık bir şey yoksa uygulamayı arka plana al ----------
  // (db, editing, query… arayüz dosyalarındaki genel "let" değişkenleri: window'da görünmez, adlarıyla okunur)
  /* global db, editing, query, dialogLocked, closeDialog, closeEditor, render */
  function onBack() {
    if (!$('#dialog').hidden) { if (!dialogLocked) closeDialog(null); return; }
    if (db && (!$('#sheet').hidden || editing)) { closeEditor(); return; }
    if (db && query) { query = ''; $('#search').value = ''; render(); return; }
    P().App.minimizeApp();
  }

  if (isNative) {
    document.documentElement.classList.add('native', 'native-' + Cap.getPlatform());
    const { App, Browser } = P();
    App.addListener('appUrlOpen', ({ url }) => {
      const q = takeAuthUrl(url);
      if (!q) return;
      Browser.close().catch(() => {});
      const p = pending;
      pending = null;
      p?.resolve(q);
    });
    // Giriş penceresi sonuçsuz kapandıysa (geri dönüş birazdan gelebilir: kısa bekle)
    Browser.addListener('browserFinished', () => setTimeout(() => {
      const p = pending;
      pending = null;
      p?.reject(Object.assign(new Error(_t('Giriş tamamlanmadı.')), { cancelled: true }));
    }, 1500));
    App.addListener('backButton', onBack);
    cleanShared();
  }

  root.KasaNative = {
    isNative,
    platform: isNative ? Cap.getPlatform() : 'web',
    RETURN,
    APP_STATE,
    bounceToApp,
    authorize,
    // Uygulama girişin ortasında kapanıp bağlantıyla yeniden açıldıysa: o bağlantının parametreleri
    async launchAuth() {
      if (!isNative) return null;
      try { return takeAuthUrl((await P().App.getLaunchUrl())?.url); } catch { return null; }
    },
    shareFile,
    openUrl: (url) => P().Browser.open({ url }),
  };
})(self);
