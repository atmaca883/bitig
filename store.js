// Telefon: küçük anahtar-değer deposu (IndexedDB). Bitig burada da şifreli durur.
(function (root) {
  'use strict';
  const DB = 'kasa';
  const STORE = 'kv';
  let dbp = null;

  function open() {
    return (dbp ||= new Promise((resolve, reject) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    }));
  }

  async function tx(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  root.KasaStore = {
    get: (k) => tx('readonly', (s) => s.get(k)),
    set: (k, v) => tx('readwrite', (s) => s.put(v, k)),
    del: (k) => tx('readwrite', (s) => s.delete(k)),
    clear: () => tx('readwrite', (s) => s.clear()),
  };

  // Tarayıcının bu siteye ait verileri kendiliğinden silmemesini iste
  try { navigator.storage?.persist?.(); } catch {}
})(self);
