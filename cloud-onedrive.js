// OneDrive bağlantısı (Microsoft Graph): hem bilgisayar (Electron ana süreç) hem telefon (tarayıcı) kullanır.
// İzin "Files.ReadWrite.AppFolder": Bitig yalnızca OneDrive'daki Uygulamalar/Bitig klasörünü görür.
// Oturum açma PKCE ile yapılır; uygulama sırrı gerekmez.
// Not: Microsoft, telefondaki web uygulamasına (SPA) verdiği yenileme anahtarını 24 saatle sınırlar;
// telefon bu yüzden günde bir kez sessizce yeniden yönlendirme yapar (issuedAt). Bilgisayarda bu sınır yoktur.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KasaOneDrive = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // Çeviri: tarayıcıda/ana süreçte genel _t, tek başına çalışırken Türkçe
  const _t = (s, ...a) => (typeof globalThis._t === 'function' ? globalThis._t(s, ...a) : String(s).replace(/\{(\d+)\}/g, (m, i) => (a[i] !== undefined ? a[i] : m)));

  const SCOPE = 'Files.ReadWrite.AppFolder User.Read offline_access';

  // tenant: "common" (kişisel + iş/okul hesapları) ya da "consumers" (yalnızca kişisel)
  const endpointsFor = (tenant = 'common') => ({
    authorize: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    token: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    graph: 'https://graph.microsoft.com/v1.0',
  });
  const DEFAULT_ENDPOINTS = endpointsFor('common');

  class AuthLost extends Error {
    constructor(msg = _t('OneDrive bağlantısı sona erdi; yeniden bağlanman gerekiyor.')) { super(msg); this.authLost = true; }
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

  // prompt: "none" → kullanıcıya hiçbir şey sormadan dön (sessiz yenileme); loginHint: hangi hesap
  function authUrl({ clientId, redirectUri, challenge, state, prompt, loginHint, endpoints = DEFAULT_ENDPOINTS }) {
    const q = new URLSearchParams({
      client_id: clientId, response_type: 'code', redirect_uri: redirectUri, response_mode: 'query',
      scope: SCOPE, code_challenge: challenge, code_challenge_method: 'S256', state,
    });
    if (prompt) q.set('prompt', prompt);
    if (loginHint) q.set('login_hint', loginHint);
    return `${endpoints.authorize}?${q}`;
  }

  const LOST = ['invalid_grant', 'interaction_required', 'login_required', 'consent_required'];

  async function tokenRequest(params, endpoints) {
    const r = await fetch(endpoints.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ scope: SCOPE, ...params }).toString(),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (LOST.includes(j.error)) throw new AuthLost();
      throw new Error(_t('OneDrive oturumu alınamadı: ') + (j.error_description || j.error || r.status));
    }
    return j;
  }

  async function exchangeCode({ clientId, redirectUri, code, verifier, endpoints = DEFAULT_ENDPOINTS }) {
    const j = await tokenRequest({ grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: redirectUri, code_verifier: verifier }, endpoints);
    const now = Date.now();
    return { access: j.access_token, refresh: j.refresh_token, expiresAt: now + (j.expires_in || 3600) * 1000, issuedAt: now };
  }

  // tokens: { access, refresh, expiresAt, issuedAt } — getTokens/saveTokens kalıcı saklamayı çağıran tarafa bırakır
  function createClient({ clientId, getTokens, saveTokens, endpoints = DEFAULT_ENDPOINTS }) {
    let refreshing = null;
    const G = endpoints.graph;
    const item = (name) => `${G}/me/drive/special/approot:/${encodeURIComponent(name)}`;

    async function accessToken(force = false) {
      const t = await getTokens();
      if (!t?.refresh) throw new AuthLost(_t('OneDrive’a bağlı değil.'));
      if (!force && t.access && t.expiresAt - 60_000 > Date.now()) return t.access;
      refreshing ||= tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: clientId }, endpoints)
        .then(async (j) => {
          // Microsoft yenileme anahtarını her seferinde değiştirir; yenisi saklanmalı
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
      const e = new Error(what + ' (' + (j.error?.code || r.status) + ')');
      e.status = r.status;
      return e;
    }

    return {
      async list() {
        const out = [];
        let url = `${G}/me/drive/special/approot/children?$select=name,size,lastModifiedDateTime,eTag,file&$top=200`;
        while (url) {
          const r = await call(url);
          if (r.status === 404) return [];
          if (!r.ok) throw await fail(r, _t('OneDrive klasörü okunamadı'));
          const j = await r.json();
          for (const f of j.value || []) {
            if (f.file) out.push({ name: f.name, modified: Date.parse(f.lastModifiedDateTime), size: f.size, rev: f.eTag });
          }
          url = j['@odata.nextLink'] || '';
        }
        return out;
      },
      async read(name) {
        // İçerik, Graph'ın verdiği kısa ömürlü indirme adresinden alınır (tarayıcıda yönlendirme + yetki başlığı sorun çıkarır)
        const r = await call(item(name));
        if (!r.ok) throw await fail(r, _t('OneDrive’dan okunamadı'));
        const url = (await r.json())['@microsoft.graph.downloadUrl'];
        if (!url) throw new Error(_t('OneDrive’dan okunamadı'));
        const d = await fetch(url);
        if (!d.ok) throw new Error(_t('OneDrive’dan okunamadı') + ' (' + d.status + ')');
        return d.text();
      },
      async write(name, text) {
        const r = await call(`${item(name)}:/content`, {
          method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: text,
        });
        if (!r.ok) throw await fail(r, _t('OneDrive’a yazılamadı'));
      },
      async remove(name) {
        const r = await call(`${item(name)}:`, { method: 'DELETE' });
        if (!r.ok && r.status !== 404) throw await fail(r, _t('OneDrive’dan silinemedi'));
      },
      async account() {
        const r = await call(`${G}/me?$select=userPrincipalName,mail,displayName`);
        if (!r.ok) throw await fail(r, 'OneDrive');
        const j = await r.json();
        return { email: j.mail || j.userPrincipalName || '', name: j.displayName || '' };
      },
    };
  }

  return { DEFAULT_ENDPOINTS, endpointsFor, SCOPE, AuthLost, pkce, authUrl, exchangeCode, createClient };
});
