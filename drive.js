// Telefon: bulut bağlantıları. Her bulut aynı küçük arayüzü sağlar:
//   label                      görünen ad
//   available()                bu sürümde kullanılabilir mi (uygulama kaydı yapıldı mı)
//   connect()                  gerekiyorsa oturum açma (yönlendirme yapabilir)
//   isConnected()
//   list()  → [{ name, modified, size, ref }]   Bitig klasöründeki dosyalar
//   read(entry) → metin
//   write(name, metin)
//   remove(name)
//   disconnect()
// Dropbox, OneDrive ve Google Drive. (iCloud'un web uygulamalarına açık bir bağlantısı yok.)
(function (root) {
  'use strict';

  // Geliştirme: bilgisayardaki ön izleme sunucusunun /dev-drive/ klasörü (sahte bulut)
  const DevDrive = {
    id: 'dev',
    label: _t('Geliştirme klasörü (test)'),
    available: () => ['localhost', '127.0.0.1'].includes(location.hostname),
    connected: false,
    async connect() {
      const r = await fetch('/dev-drive/list', { cache: 'no-store' });
      if (!r.ok) throw new Error(_t('Geliştirme klasörüne ulaşılamadı'));
      this.connected = true;
      localStorage.setItem('kasa.dev.connected', '1');
    },
    isConnected() { return this.connected || localStorage.getItem('kasa.dev.connected') === '1'; },
    async list() {
      const r = await fetch('/dev-drive/list', { cache: 'no-store' });
      if (!r.ok) throw new Error(_t('Liste alınamadı (') + r.status + ')');
      return (await r.json()).map((f) => ({ ...f, ref: f.name }));
    },
    async read(entry) {
      const r = await fetch('/dev-drive/file/' + encodeURIComponent(entry.name), { cache: 'no-store' });
      if (!r.ok) throw new Error(_t('Okunamadı (') + r.status + ')');
      return r.text();
    },
    async write(name, text) {
      const r = await fetch('/dev-drive/file/' + encodeURIComponent(name), { method: 'PUT', body: text, headers: { 'Content-Type': 'application/octet-stream' } });
      if (!r.ok) throw new Error(_t('Yazılamadı (') + r.status + ')');
    },
    async remove(name) {
      await fetch('/dev-drive/file/' + encodeURIComponent(name), { method: 'DELETE' });
    },
    disconnect() { this.connected = false; localStorage.removeItem('kasa.dev.connected'); },
  };

  const comingSoon = (id, label) => ({
    id, label, available: () => false, comingSoon: true,
    isConnected: () => false,
    connect: async () => { throw new Error(label + _t(' bağlantısı bir sonraki aşamada gelecek.')); },
  });

  // ---------- doğrudan bağlanılan bulutlar (Uygulamalar/Bitig klasörü) ----------
  const cfg = () => root.KASA_CONFIG || {};
  const here = () => location.origin + location.pathname.replace(/index\.html$/, '');

  // lib: KasaDropbox / KasaOneDrive (aynı arayüz). tag: yerel kayıt anahtarlarındaki kısa ad.
  // renewAfterMs: telefonda yenileme anahtarı kısa ömürlüyse (OneDrive: 24 saat) açılışta sessizce yenile.
  // clientSecret: Google'ın web istemcisi oturum alırken istemci sırrı da ister (yalnızca kayıtlı dönüş adresiyle işe yarar)
  function oauthDrive({ id, label, lib, clientId, clientSecret = () => undefined, endpoints, tag, renewAfterMs = 0 }) {
    const tokensKey = id + '-tokens';
    const ls = (k) => `kasa.${tag}.${k}`;
    return {
      id,
      label,
      _client: null,
      available: () => !!clientId() && !!lib(),
      get comingSoon() { return !this.available(); }, // anahtar tanımlı değilse "yakında" görünsün
      client() {
        return (this._client ||= lib().createClient({
          clientId: clientId(), clientSecret: clientSecret(), endpoints: endpoints(),
          getTokens: () => root.KasaStore.get(tokensKey),
          saveTokens: (t) => root.KasaStore.set(tokensKey, t),
        }));
      },
      // Bulutun izin sayfasına git; dönüşte finishRedirect() oturumu tamamlar.
      // silent: kullanıcıya bir şey sormadan oturumu tazele (olmazsa sessizce vazgeçilir)
      async connect({ silent = false } = {}) {
        const p = await lib().pkce();
        sessionStorage.setItem(`kasa.${tag}`, JSON.stringify({ verifier: p.verifier, state: p.state, redirect: here(), silent }));
        location.assign(lib().authUrl({
          clientId: clientId(), redirectUri: here(), challenge: p.challenge, state: p.state, endpoints: endpoints(),
          ...(silent ? { prompt: 'none', loginHint: localStorage.getItem(ls('email')) || undefined } : {}),
        }));
        return new Promise(() => {}); // sayfa buluta gidiyor
      },
      // Dönen sonuç: false (yönlendirme yok) ya da { done, silent }
      async finishRedirect() {
        const q = new URLSearchParams(location.search);
        if (!q.has('code') && !q.has('error')) return false;
        const saved = JSON.parse(sessionStorage.getItem(`kasa.${tag}`) || 'null');
        sessionStorage.removeItem(`kasa.${tag}`);
        history.replaceState(null, '', here()); // adres çubuğunda kod kalmasın
        if (q.has('error')) {
          if (saved?.silent) return { done: false, silent: true }; // sessiz yenileme olmadı; gerekirse "Yeniden bağlan" çıkar
          throw new Error(q.get('error_description') || _t('{0} izni verilmedi.', label));
        }
        if (!saved || saved.state !== q.get('state')) throw new Error(_t('{0} girişi doğrulanamadı; tekrar dene.', label));
        const tokens = await lib().exchangeCode({
          clientId: clientId(), clientSecret: clientSecret(), redirectUri: saved.redirect, code: q.get('code'), verifier: saved.verifier, endpoints: endpoints(),
        });
        await root.KasaStore.set(tokensKey, tokens);
        localStorage.setItem(ls('connected'), '1');
        localStorage.setItem(ls('issued'), String(tokens.issuedAt || Date.now()));
        this._client = null;
        try { localStorage.setItem(ls('email'), (await this.client().account()).email || ''); } catch {}
        return { done: true, silent: !!saved.silent };
      },
      // Açılışta: oturum yakında dolacaksa (ve son denemeden beri yeterince geçtiyse) sessizce yenile
      needsRenew() {
        if (!renewAfterMs || !this.isConnected()) return false;
        const issued = Number(localStorage.getItem(ls('issued')) || 0);
        const tried = Number(localStorage.getItem(ls('renewTried')) || 0);
        return Date.now() - issued > renewAfterMs && Date.now() - tried > 30 * 60_000;
      },
      renew() {
        localStorage.setItem(ls('renewTried'), String(Date.now()));
        return this.connect({ silent: true });
      },
      isConnected: () => localStorage.getItem(ls('connected')) === '1',
      account: () => localStorage.getItem(ls('email')) || '',
      async list() {
        return (await this.client().list()).map((f) => ({ name: f.name, modified: f.modified, size: f.size, version: f.rev }));
      },
      read(entry) { return this.client().read(entry.name); },
      write(name, text) { return this.client().write(name, text); },
      remove(name) { return this.client().remove(name); },
      async disconnect() {
        await root.KasaStore.del(tokensKey);
        for (const k of ['connected', 'email', 'issued', 'renewTried']) localStorage.removeItem(ls(k));
        this._client = null;
      },
    };
  }

  const DropboxDrive = oauthDrive({
    id: 'dropbox', label: 'Dropbox', tag: 'dbx',
    lib: () => root.KasaDropbox,
    clientId: () => cfg().dropbox,
    endpoints: () => cfg().dropboxEndpoints || root.KasaDropbox.DEFAULT_ENDPOINTS,
  });

  const OneDriveDrive = oauthDrive({
    id: 'onedrive', label: 'OneDrive', tag: 'od',
    lib: () => root.KasaOneDrive,
    clientId: () => cfg().onedrive,
    endpoints: () => cfg().onedriveEndpoints || root.KasaOneDrive.endpointsFor(cfg().onedriveTenant || 'common'),
    renewAfterMs: 16 * 3600_000, // Microsoft telefondaki web uygulamasının oturumunu 24 saatte bitirir
  });

  root.KasaDrives = {
    dropbox: DropboxDrive,
    onedrive: OneDriveDrive,
    google: oauthDrive({
      id: 'google', label: 'Google Drive', tag: 'gd',
      lib: () => root.KasaGoogle,
      clientId: () => cfg().googleWeb,
      clientSecret: () => cfg().googleWebSecret,
      endpoints: () => cfg().googleEndpoints || root.KasaGoogle.DEFAULT_ENDPOINTS,
    }),
    dev: DevDrive,
  };
})(self);
