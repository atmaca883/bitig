// Dosya ekleri: ortak kurallar (bilgisayar ana süreci, telefon ve arayüz aynı kodu kullanır).
// Kayıtta yalnızca bilgi durur: item.files = [{ id, name, type, size, added }].
// Dosyanın kendisi kasanın veri anahtarıyla ayrı şifrelenir ve "ek-<id>.enc" adıyla saklanır;
// eşitleme açıksa aynı adla buluta da gider. Bir kez yazılan ek dosyası değişmez (yeni dosya = yeni kimlik).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KasaAttach = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_BYTES = 10 * 1024 * 1024; // tek dosya en fazla 10 MB
  const FILE_RE = /^ek-([0-9a-zA-Z-]{8,})\.enc$/;
  // Hiçbir kayıtta kalmamış ek, ancak bu kadar eskiyse buluttan silinir
  // (çevrimdışı bir cihaz hâlâ ona bağlı bir değişiklik getirebilir)
  const REMOTE_GRACE_MS = 30 * 24 * 3600_000;
  const LOCAL_GRACE_MS = 24 * 3600_000; // kaydedilmeden vazgeçilen düzenleyicideki ekler için

  const fileName = (id) => `ek-${id}.enc`;
  const idOf = (name) => (String(name).match(FILE_RE) || [])[1] || null;
  const validId = (id) => /^[0-9a-zA-Z-]{8,}$/.test(String(id || ''));

  // Kasadaki (çöp kutusu dahil) kayıtların kullandığı ek kimlikleri
  function referenced(data) {
    const ids = new Set();
    const add = (x) => { for (const f of x?.files || []) if (validId(f.id)) ids.add(f.id); };
    for (const k of ['passwords', 'notes', 'tasks']) for (const x of data?.[k] || []) add(x);
    for (const e of data?.trash || []) add(e.item);
    return ids;
  }

  // Dosya adı: yol parçaları ve denetim karakterleri olmadan, en fazla 120 karakter
  function cleanName(name) {
    const s = String(name || '').split(/[\\/]/).pop().replace(/[\u0000-\u001f<>:"|?*]/g, '_').trim();
    return (s || 'dosya').slice(0, 120);
  }

  const isImage = (f) => /^image\/(png|jpe?g|gif|webp|bmp)$/i.test(f?.type || '');

  function prettySize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10 * 1024 ? 1 : 0) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  const icon = (f) => (isImage(f) ? '🖼' : /pdf/i.test(f?.type || '') ? '📄' : /zip|rar|7z/i.test(f?.type || '') ? '🗜' : '📎');

  return { MAX_BYTES, FILE_RE, REMOTE_GRACE_MS, LOCAL_GRACE_MS, fileName, idOf, validId, referenced, cleanName, isImage, prettySize, icon };
});
