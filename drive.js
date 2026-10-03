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
// OneDrive, Dropbox ve Google Drive bir sonraki aşamada eklenecek.
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

  // ---------- Dropbox (Uygulamalar/Bitig klasörü) ----------
  const cfg = () => root.KASA_CONFIG || {};
  const here = () => location.origin + location.pathname.replace(/index\.html$/, '');
  const dbxEndpoints = () => cfg().dropboxEndpoints || root.KasaDropbox.DEFAULT_ENDPOINTS;

  const DropboxDrive = {
    id: 'dropbox',
    label: 'Dropbox',
    _client: null,
    available: () => !!cfg().dropbox,
    get comingSoon() { return !this.available(); }, // anahtar tanımlı değilse "yakında" görünsün
    client() {
      return (this._client ||= root.KasaDropbox.createClient({
        clientId: cfg().dropbox, endpoints: dbxEndpoints(),
        getTokens: () => root.KasaStore.get('dropbox-tokens'),
        saveTokens: (t) => root.KasaStore.set('dropbox-tokens', t),
      }));
    },
    // Dropbox'ın izin sayfasına git; dönüşte finishRedirect() oturumu tamamlar
    async connect() {
      const p = await root.KasaDropbox.pkce();
      sessionStorage.setItem('kasa.dbx', JSON.stringify({ verifier: p.verifier, state: p.state, redirect: here() }));
      location.assign(root.KasaDropbox.authUrl({ clientId: cfg().dropbox, redirectUri: here(), challenge: p.challenge, state: p.state, endpoints: dbxEndpoints() }));
      return new Promise(() => {}); // sayfa Dropbox'a gidiyor
    },
    async finishRedirect() {
      const q = new URLSearchParams(location.search);
      if (!q.has('code') && !q.has('error')) return false;
      const saved = JSON.parse(sessionStorage.getItem('kasa.dbx') || 'null');
      sessionStorage.removeItem('kasa.dbx');
      history.replaceState(null, '', here()); // adres çubuğunda kod kalmasın
      if (q.has('error')) throw new Error(q.get('error_description') || _t('Dropbox izni verilmedi.'));
      if (!saved || saved.state !== q.get('state')) throw new Error(_t('Dropbox girişi doğrulanamadı; tekrar dene.'));
      const tokens = await root.KasaDropbox.exchangeCode({
        clientId: cfg().dropbox, redirectUri: saved.redirect, code: q.get('code'), verifier: saved.verifier, endpoints: dbxEndpoints(),
      });
      await root.KasaStore.set('dropbox-tokens', tokens);
      localStorage.setItem('kasa.dbx.connected', '1');
      this._client = null;
      try { localStorage.setItem('kasa.dbx.email', (await this.client().account()).email || ''); } catch {}
      return true;
    },
    isConnected: () => localStorage.getItem('kasa.dbx.connected') === '1',
    account: () => localStorage.getItem('kasa.dbx.email') || '',
    async list() {
      return (await this.client().list()).map((f) => ({ name: f.name, modified: f.modified, size: f.size, version: f.rev }));
    },
    read(entry) { return this.client().read(entry.name); },
    write(name, text) { return this.client().write(name, text); },
    remove(name) { return this.client().remove(name); },
    async disconnect() {
      await root.KasaStore.del('dropbox-tokens');
      localStorage.removeItem('kasa.dbx.connected');
      localStorage.removeItem('kasa.dbx.email');
      this._client = null;
    },
  };

  root.KasaDrives = {
    dropbox: DropboxDrive,
    onedrive: comingSoon('onedrive', 'OneDrive'),
    google: comingSoon('google', 'Google Drive'),
    dev: DevDrive,
  };
})(self);
