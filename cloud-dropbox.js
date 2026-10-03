// Dropbox bağlantısı: hem bilgisayar (Electron ana süreç) hem telefon (tarayıcı) kullanır.
// Uygulama "App folder" türündedir: Bitig yalnızca Dropbox'taki Uygulamalar/Bitig klasörünü görür.
// Oturum açma PKCE ile yapılır; uygulama sırrı (app secret) gerekmez, kalıcı oturum için yenileme anahtarı alınır.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KasaDropbox = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_ENDPOINTS = {
    authorize: 'https://www.dropbox.com/oauth2/authorize',
    token: 'https://api.dropboxapi.com/oauth2/token',
    api: 'https://api.dropboxapi.com/2',
    content: 'https://content.dropboxapi.com/2',
  };

  class AuthLost extends Error {
    constructor(msg = 'Dropbox bağlantısı sona erdi; yeniden bağlanman gerekiyor.') { super(msg); this.authLost = true; }
  }

  const subtle = () => globalThis.crypto.subtle;
  const b64url = (bytes) => {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  // PKCE: rastgele doğrulayıcı ve onun SHA-256 özeti
  async function pkce() {
    const verifier = b64url(globalThis.crypto.getRandomValues(new Uint8Array(48)));
    const digest = new Uint8Array(await subtle().digest('SHA-256', new TextEncoder().encode(verifier)));
    return { verifier, challenge: b64url(digest), state: b64url(globalThis.crypto.getRandomValues(new Uint8Array(16))) };
  }

  function authUrl({ clientId, redirectUri, challenge, state, endpoints = DEFAULT_ENDPOINTS }) {
    const q = new URLSearchParams({
      client_id: clientId, response_type: 'code', redirect_uri: redirectUri,
      code_challenge: challenge, code_challenge_method: 'S256', token_access_type: 'offline', state,
    });
    return `${endpoints.authorize}?${q}`;
  }

  async function tokenRequest(params, endpoints) {
    const r = await fetch(endpoints.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (j.error === 'invalid_grant') throw new AuthLost();
      throw new Error('Dropbox oturumu alınamadı: ' + (j.error_description || j.error || r.status));
    }
    return j;
  }

  async function exchangeCode({ clientId, redirectUri, code, verifier, endpoints = DEFAULT_ENDPOINTS }) {
    const j = await tokenRequest({ grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: redirectUri, code_verifier: verifier }, endpoints);
    return { access: j.access_token, refresh: j.refresh_token, expiresAt: Date.now() + (j.expires_in || 14400) * 1000, accountId: j.account_id };
  }

  // Dropbox-API-Arg başlığı yalnızca ASCII olabilir
  const apiArg = (o) => JSON.stringify(o).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

  // tokens: { access, refresh, expiresAt } — getTokens/saveTokens kalıcı saklamayı çağıran tarafa bırakır
  function createClient({ clientId, getTokens, saveTokens, endpoints = DEFAULT_ENDPOINTS }) {
    let refreshing = null;

    async function accessToken(force = false) {
      const t = await getTokens();
      if (!t?.refresh) throw new AuthLost('Dropbox’a bağlı değil.');
      if (!force && t.access && t.expiresAt - 60_000 > Date.now()) return t.access;
      refreshing ||= tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: clientId }, endpoints)
        .then(async (j) => {
          const next = { ...t, access: j.access_token, expiresAt: Date.now() + (j.expires_in || 14400) * 1000 };
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

    async function rpc(path, body) {
      const r = await call(`${endpoints.api}${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? null),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const e = new Error('Dropbox: ' + (j.error_summary || r.status));
        e.summary = j.error_summary || '';
        throw e;
      }
      return j;
    }

    return {
      async list() {
        let res;
        try {
          res = await rpc('/files/list_folder', { path: '', recursive: false });
        } catch (e) {
          if (/not_found/.test(e.summary)) return [];
          throw e;
        }
        const entries = [...res.entries];
        while (res.has_more) {
          res = await rpc('/files/list_folder/continue', { cursor: res.cursor });
          entries.push(...res.entries);
        }
        return entries.filter((e) => e['.tag'] === 'file')
          .map((e) => ({ name: e.name, modified: Date.parse(e.server_modified), size: e.size, rev: e.rev }));
      },
      async read(name) {
        const r = await call(`${endpoints.content}/files/download`, {
          method: 'POST', headers: { 'Dropbox-API-Arg': apiArg({ path: '/' + name }) },
        });
        if (!r.ok) throw new Error('Dropbox’tan okunamadı (' + r.status + ')');
        return r.text();
      },
      async write(name, text) {
        const r = await call(`${endpoints.content}/files/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': apiArg({ path: '/' + name, mode: 'overwrite', mute: true }) },
          body: text,
        });
        if (!r.ok) throw new Error('Dropbox’a yazılamadı (' + r.status + ')');
      },
      async remove(name) {
        try { await rpc('/files/delete_v2', { path: '/' + name }); } catch (e) { if (!/not_found/.test(e.summary)) throw e; }
      },
      async account() {
        const j = await rpc('/users/get_current_account', null);
        return { email: j.email || '', name: j.name?.display_name || '' };
      },
    };
  }

  return { DEFAULT_ENDPOINTS, AuthLost, pkce, authUrl, exchangeCode, createClient };
});
