// Google Drive bağlantısı (Drive API v3): hem bilgisayar (Electron ana süreç) hem telefon (tarayıcı) kullanır.
// İzin "drive.file": Bitig yalnızca kendi oluşturduğu dosyaları görür (Drive'daki "Bitig" klasörü); diğer dosyalarına erişemez.
// Oturum açma PKCE ile yapılır. Google, istemci türüne göre ayrıca "istemci sırrı" ister: masaüstü istemcisinin sırrı
// Google'ın kendi açıklamasıyla gizli değildir; web istemcisinin sırrı da yalnızca kayıtlı dönüş adresiyle işe yarar.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KasaGoogle = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // Çeviri: tarayıcıda/ana süreçte genel _t, tek başına çalışırken Türkçe
  const _t = (s, ...a) => (typeof globalThis._t === 'function' ? globalThis._t(s, ...a) : String(s).replace(/\{(\d+)\}/g, (m, i) => (a[i] !== undefined ? a[i] : m)));

  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const FOLDER = 'Bitig';
  const FOLDER_MIME = 'application/vnd.google-apps.folder';
  const DEFAULT_ENDPOINTS = {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    api: 'https://www.googleapis.com/drive/v3',
    upload: 'https://www.googleapis.com/upload/drive/v3',
  };

  class AuthLost extends Error {
    constructor(msg = _t('Google Drive bağlantısı sona erdi; yeniden bağlanman gerekiyor.')) { super(msg); this.authLost = true; }
  }

  const subtle = () => globalThis.crypto.subtle;
  const b64url = (bytes) => {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  async function pkce() {
    const verifier = b64url(globalThis.crypto.getRandomValues(new Uint8Array(48)));
    const digest = new Uint8Array(await subtle().digest('SHA-256', new TextEncoder().encode(verifier)));
    return { verifier, challenge: b64url(digest), state: b64url(globalThis.crypto.getRandomValues(new Uint8Array(16))) };
  }

  // Google kalıcı oturum anahtarını (refresh token) yalnızca izin ekranından geçilince verir: varsayılan prompt=consent.
  // prompt: "none" → kullanıcıya bir şey sormadan dön (sessiz yenileme); loginHint: hangi hesap
  function authUrl({ clientId, redirectUri, challenge, state, prompt = 'consent', loginHint, endpoints = DEFAULT_ENDPOINTS }) {
    const q = new URLSearchParams({
      client_id: clientId, response_type: 'code', redirect_uri: redirectUri, scope: SCOPE,
      code_challenge: challenge, code_challenge_method: 'S256', state, access_type: 'offline', prompt,
    });
    if (loginHint) q.set('login_hint', loginHint);
    return `${endpoints.authorize}?${q}`;
  }

  const LOST = ['invalid_grant', 'interaction_required', 'login_required', 'consent_required', 'unauthorized_client'];

  async function tokenRequest(params, endpoints) {
    const r = await fetch(endpoints.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString(),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (LOST.includes(j.error)) throw new AuthLost();
      throw new Error(_t('Google Drive oturumu alınamadı: ') + (j.error_description || j.error || r.status));
    }
    return j;
  }

  async function exchangeCode({ clientId, clientSecret, redirectUri, code, verifier, endpoints = DEFAULT_ENDPOINTS }) {
    const j = await tokenRequest({
      grant_type: 'authorization_code', code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code_verifier: verifier,
    }, endpoints);
    if (!j.refresh_token) throw new Error(_t('Google kalıcı oturum vermedi; bağlantıyı tekrar dene.'));
    const now = Date.now();
    return { access: j.access_token, refresh: j.refresh_token, expiresAt: now + (j.expires_in || 3600) * 1000, issuedAt: now };
  }

  // Drive sorgusunda metin: ' ve \ kaçırılır
  const lit = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

  // tokens: { access, refresh, expiresAt, issuedAt } — getTokens/saveTokens kalıcı saklamayı çağıran tarafa bırakır
  function createClient({ clientId, clientSecret, getTokens, saveTokens, endpoints = DEFAULT_ENDPOINTS }) {
    let refreshing = null;
    let folderId = null;
    let ids = new Map(); // dosya adı → kimlik (son listelemeden)
    const writing = new Map(); // dosya adı → süren yazma
    const A = endpoints.api;
    const U = endpoints.upload;

    async function accessToken(force = false) {
      const t = await getTokens();
      if (!t?.refresh) throw new AuthLost(_t('Google Drive’a bağlı değil.'));
      if (!force && t.access && t.expiresAt - 60_000 > Date.now()) return t.access;
      refreshing ||= tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: clientId, client_secret: clientSecret }, endpoints)
        .then(async (j) => {
          const next = { ...t, access: j.access_token, refresh: j.refresh_token || t.refresh, expiresAt: Date.now() + (j.expires_in || 3600) * 1000 };
          await saveTokens(next);
          return next.access;
        })
        .finally(() => { refreshing = null; });
      return refreshing;
    }

    async function call(url, init = {}, retry = true) {
      const token = await accessToken();
      const r = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
      if (r.status === 401 && retry) {
        await accessToken(true);
        return call(url, init, false);
      }
      if (r.status === 401) throw new AuthLost();
      return r;
    }

    async function fail(r, what) {
      const j = await r.json().catch(() => ({}));
      const e = new Error(what + ' (' + (j.error?.status || j.error?.message || r.status) + ')');
      e.status = r.status;
      return e;
    }

    async function query(q, fields) {
      const out = [];
      let page = '';
      do {
        const p = new URLSearchParams({ q, fields: `nextPageToken,files(${fields})`, pageSize: '200', spaces: 'drive', orderBy: 'createdTime' });
        if (page) p.set('pageToken', page);
        const r = await call(`${A}/files?${p}`);
        if (!r.ok) throw await fail(r, _t('Google Drive klasörü okunamadı'));
        const j = await r.json();
        out.push(...(j.files || []));
        page = j.nextPageToken || '';
      } while (page);
      return out;
    }

    // Drive'daki "Bitig" klasörü. Aynı anda gelen istekler tek arama/oluşturma işini bekler;
    // iki cihaz aynı anda oluşturduysa hepsi en eski klasörde buluşur.
    let finding = null;
    const findFolders = () => query(`name = ${lit(FOLDER)} and mimeType = ${lit(FOLDER_MIME)} and 'root' in parents and trashed = false`, 'id');
    function folder(create) {
      if (folderId) return Promise.resolve(folderId);
      if (finding && (!create || finding.create)) return finding.p;
      const p = (async () => {
        const found = await findFolders();
        if (found.length) return (folderId = found[0].id);
        if (!create) return null;
        const r = await call(`${A}/files?fields=id`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: FOLDER, mimeType: FOLDER_MIME, parents: ['root'] }),
        });
        if (!r.ok) throw await fail(r, _t('Google Drive’da klasör oluşturulamadı'));
        const mine = (await r.json()).id;
        const again = await findFolders(); // başka cihaz da az önce oluşturduysa en eskisini kullan
        return (folderId = again[0]?.id || mine);
      })();
      finding = { p, create };
      p.finally(() => { if (finding?.p === p) finding = null; }).catch(() => {});
      return p;
    }

    async function files() {
      const fid = await folder(false);
      if (!fid) return [];
      const list = await query(`${lit(fid)} in parents and trashed = false and mimeType != ${lit(FOLDER_MIME)}`, 'id,name,size,modifiedTime,version');
      // Aynı adda birden fazla dosya olursa (aynı anda yazma) en yenisi geçerli
      const byName = new Map();
      for (const f of list) {
        const cur = byName.get(f.name);
        if (!cur || Date.parse(f.modifiedTime) >= Date.parse(cur.modifiedTime)) byName.set(f.name, f);
      }
      ids = new Map([...byName].map(([n, f]) => [n, f.id]));
      return [...byName.values()];
    }

    async function writeNow(name, text) {
      const fid = await folder(true);
      let id = await idOf(name);
      if (id) {
        const r = await call(`${U}/files/${encodeURIComponent(id)}?uploadType=media&fields=id`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/octet-stream' }, body: text,
        });
        if (r.ok) return;
        if (r.status !== 404) throw await fail(r, _t('Google Drive’a yazılamadı'));
        ids.delete(name); // başka cihaz silmiş: yeniden oluştur
      }
      const boundary = 'bitig' + Math.random().toString(36).slice(2);
      const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [fid] })}\r\n`
        + `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n${text}\r\n--${boundary}--`;
      const r = await call(`${U}/files?uploadType=multipart&fields=id`, {
        method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
      });
      if (!r.ok) throw await fail(r, _t('Google Drive’a yazılamadı'));
      id = (await r.json()).id;
      ids.set(name, id);
    }

    async function idOf(name) {
      if (ids.has(name)) return ids.get(name);
      await files();
      return ids.get(name) || null;
    }

    return {
      async list() {
        return (await files()).map((f) => ({ name: f.name, modified: Date.parse(f.modifiedTime), size: Number(f.size || 0), rev: String(f.version || f.modifiedTime) }));
      },
      async read(name) {
        const id = await idOf(name);
        if (!id) throw new Error(_t('Google Drive’dan okunamadı'));
        const r = await call(`${A}/files/${encodeURIComponent(id)}?alt=media`);
        if (r.status === 404) { ids.delete(name); throw await fail(r, _t('Google Drive’dan okunamadı')); }
        if (!r.ok) throw await fail(r, _t('Google Drive’dan okunamadı'));
        return r.text();
      },
      // Aynı dosyaya art arda gelen yazmalar sıraya girer (yoksa ilk yazmada aynı adla iki dosya açılabilir)
      write(name, text) {
        const prev = writing.get(name) || Promise.resolve();
        const p = prev.catch(() => {}).then(() => writeNow(name, text));
        writing.set(name, p);
        p.finally(() => { if (writing.get(name) === p) writing.delete(name); }).catch(() => {});
        return p;
      },
      async remove(name) {
        const id = await idOf(name);
        if (!id) return;
        const r = await call(`${A}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
        ids.delete(name);
        if (!r.ok && r.status !== 404) throw await fail(r, _t('Google Drive’dan silinemedi'));
      },
      async account() {
        const r = await call(`${A}/about?fields=user(emailAddress,displayName)`);
        if (!r.ok) throw await fail(r, 'Google Drive');
        const u = (await r.json()).user || {};
        return { email: u.emailAddress || '', name: u.displayName || '' };
      },
    };
  }

  return { DEFAULT_ENDPOINTS, SCOPE, FOLDER, AuthLost, pkce, authUrl, exchangeCode, createClient };
});
