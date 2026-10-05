// Telefon: arayüzün kullandığı "kasa" arka ucu. Bilgisayarda bu işleri Electron ana süreci yapar;
// telefonda her şey bu sayfada, cihazın içinde olur. Veriler telefonda şifreli saklanır,
// buluta yalnızca şifreli dosya gider.
(function (root) {
  'use strict';

  const C = root.KasaCrypto;
  const Store = root.KasaStore;
  const Sync = root.KasaSync;
  const PIN_MAX_TRIES = 5;
  const FILE_RE = /^kasa-([0-9a-zA-Z-]{8,})\.sync\.enc$/;

  // ---------- ayarlar (gizli olmayan) ----------
  const SETTINGS_KEY = 'kasa.phone';
  function loadSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch {}
    if (!s.deviceId) s.deviceId = 'tel-' + crypto.randomUUID();
    if (!s.deviceName) s.deviceName = /iPhone/.test(navigator.userAgent) ? 'iPhone' : /iPad/.test(navigator.userAgent) ? 'iPad' : /Android/.test(navigator.userAgent) ? _t('Android telefon') : 'Telefon';
    s.autoLockMinutes ??= 5;
    return s;
  }
  let settings = loadSettings();
  const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} };
  saveSettings();
  // Telefonda takvim ilk açılışta küçük başlasın (listeye yer kalsın)
  try { if (localStorage.getItem('kasa.calCollapsed') === null) localStorage.setItem('kasa.calCollapsed', '1'); } catch {}

  const platform = /iPhone|iPad/.test(navigator.userAgent) ? 'ios' : /Android/.test(navigator.userAgent) ? 'android' : 'web';

  // ---------- durum ----------
  const S = {
    dek: null, wraps: null, data: null,
    pinRecord: null, pinLocked: false, pinFails: 0,
    bioRec: null, // Face ID kaydı: bellekte hazır durur ki dokunuştan sonra araya bekleme girmesin (iPhone izni düşürür)
    remotes: new Map(), lastSync: null, lastUpload: null, lastError: '',
    dirty: false, uploadTimer: null, pollTimer: null, syncing: null,
  };
  const listeners = {};
  const on = (name) => (cb) => { (listeners[name] ||= []).push(cb); };
  const emit = (name, v) => (listeners[name] || []).forEach((cb) => { try { cb(v); } catch (e) { console.error(e); } });
  const slowDown = () => new Promise((r) => setTimeout(r, 600));

  const drive = () => root.KasaDrives[settings.drive] || null;
  const syncWraps = (w) => { const { pinBox, ...rest } = w; return rest; };
  const ownName = () => `kasa-${settings.deviceId}.sync.enc`;

  async function persistLocal() {
    const wraps = { ...S.wraps };
    if (S.pinRecord) wraps.pinBox = await C.sealJson(S.dek, S.pinRecord); else delete wraps.pinBox;
    await Store.set('vault', await C.buildFile(S.dek, wraps, S.data));
  }

  function unlockedResult() {
    startSync();
    return { data: S.data, hasRecovery: !!S.wraps.recovery, hasPin: !!S.pinRecord };
  }

  function clearSession() {
    stopSync();
    Object.assign(S, { dek: null, wraps: null, data: null, pinRecord: null, pinLocked: false, pinFails: 0, primed: false, bioPending: null, bioAuthUntil: 0 });
    S.remotes.clear();
  }

  // ---------- eşitleme ----------
  function mergeRemotes(data) {
    let out = data;
    for (const r of S.remotes.values()) if (r.data) out = Sync.merge(out, r.data);
    return out;
  }
  // Bu turda yeni veri gönderen cihazların adı (bildirim için)
  const changedFrom = new Set();
  const deviceNames = () => [...S.remotes.entries()].filter(([id, r]) => r.data && changedFrom.has(id))
    .map(([, r]) => r.device?.name).filter(Boolean).join(', ');

  // Bilgisayarda ana şifre değiştiyse telefon da yeni şifre kilidini alır
  function adoptWraps(remote) {
    if (!remote?.password || !S.wraps?.password) return false;
    if ((remote.password.created || 0) <= (S.wraps.password.created || 0)) return false;
    S.wraps = { ...S.wraps, password: remote.password, ...(remote.recovery ? { recovery: remote.recovery } : {}) };
    return true;
  }

  async function readRemotes(files) {
    let wrapsChanged = false;
    changedFrom.clear();
    const firstRead = !S.primed; // kilit açıldıktan sonraki ilk okumada kimin değiştirdiği belli değil
    const seen = new Set();
    for (const f of files) {
      const m = f.name.match(FILE_RE);
      if (!m || m[1] === settings.deviceId) continue;
      seen.add(m[1]);
      const version = f.version || `${f.modified}:${f.size}`;
      const prev = S.remotes.get(m[1]);
      if (prev && !prev.error && prev.version === version) continue;
      try {
        const file = JSON.parse(await drive().read(f));
        const payload = await C.openJson(S.dek, file.box);
        if (payload.kasaSync !== 1 || !payload.data) throw new Error('biçim');
        S.remotes.set(m[1], { version, data: payload.data, device: payload.device, savedAt: payload.savedAt, error: '' });
        changedFrom.add(m[1]);
        if (adoptWraps(file.wraps)) wrapsChanged = true;
      } catch (e) {
        if (e?.authLost) throw e;
        S.remotes.set(m[1], { version, data: null, device: { id: m[1], name: _t('Bilinmeyen cihaz') }, savedAt: f.modified,
          error: _t('Okunamadı: başka bir kasaya ait ya da henüz tam yüklenmemiş') });
      }
    }
    for (const id of [...S.remotes.keys()]) if (!seen.has(id)) S.remotes.delete(id);
    if (firstRead) changedFrom.clear();
    S.primed = true;
    return wrapsChanged;
  }

  async function uploadOwn() {
    clearTimeout(S.uploadTimer);
    if (!S.dek || !drive()?.isConnected()) return;
    try {
      const payload = { kasaSync: 1, device: { id: settings.deviceId, name: settings.deviceName, platform }, savedAt: Date.now(), data: S.data };
      await drive().write(ownName(), JSON.stringify(await C.buildFile(S.dek, syncWraps(S.wraps), payload)));
      S.dirty = false;
      S.needsReconnect = false;
      S.lastUpload = Date.now();
    } catch (e) {
      S.dirty = true; // bağlantı gelince yeniden denenir
      if (e?.authLost) S.needsReconnect = true;
      S.lastError = e?.authLost ? e.message : _t('Yüklenemedi: ') + e.message;
    }
  }

  function scheduleUpload() {
    S.dirty = true;
    clearTimeout(S.uploadTimer);
    S.uploadTimer = setTimeout(uploadOwn, 2000);
  }

  async function syncNow() {
    if (S.syncing) return S.syncing;
    S.syncing = (async () => {
      if (!S.dek || !drive()?.isConnected()) return;
      if (!navigator.onLine) { S.lastError = _t('İnternet yok · değişiklikler bağlantı gelince gönderilecek'); return; }
      try {
        const wrapsChanged = await readRemotes(await drive().list());
        const merged = mergeRemotes(S.data);
        S.lastSync = Date.now();
        S.lastError = '';
        S.needsReconnect = false;
        if (!Sync.same(merged, S.data)) {
          const changes = Sync.countChanges(S.data, merged);
          S.data = merged;
          await persistLocal();
          scheduleUpload();
          if (!S.pinLocked) emit('merged', { data: merged, changes, from: deviceNames() });
        } else if (wrapsChanged) {
          await persistLocal();
        }
        if (S.dirty) await uploadOwn();
      } catch (e) {
        if (e?.authLost) S.needsReconnect = true;
        S.lastError = e.message;
      }
    })().finally(() => { S.syncing = null; });
    return S.syncing;
  }

  function startSync() {
    stopSync();
    setTimeout(syncNow, 50);
    S.pollTimer = setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 30_000);
  }
  function stopSync() {
    clearInterval(S.pollTimer);
    S.pollTimer = null;
  }

  document.addEventListener('visibilitychange', () => {
    if (!S.dek) return;
    if (document.visibilityState === 'visible') syncNow();
    else if (S.dirty) uploadOwn(); // arka plana geçerken bekleyen değişikliği hemen gönder
  });
  addEventListener('online', () => { if (S.dek) syncNow(); });

  // ---------- kurulum: buluttaki kasaya katıl ----------
  async function listVaultFiles() {
    const files = await drive().list();
    return files.filter((f) => FILE_RE.test(f.name) && f.name !== ownName());
  }

  async function join(password) {
    const files = await listVaultFiles();
    if (!files.length) throw new Error(_t('Bulutta Bitig bulunamadı. Bilgisayardaki Bitig’de Ayarlar → Cihazlar arası eşitleme’yi aç.'));
    const parsed = [];
    for (const f of files) {
      try { parsed.push({ f, file: JSON.parse(await drive().read(f)) }); } catch {}
    }
    let dek = null;
    for (const p of parsed) {
      try { dek = await C.unwrapKey(p.file.wraps.password, password); break; } catch {}
    }
    if (!dek) { await slowDown(); throw new Error(_t('Ana şifre yanlış.')); }
    let data = null;
    let wraps = null;
    for (const p of parsed) {
      try {
        const payload = await C.openJson(dek, p.file.box);
        data = data ? Sync.merge(data, payload.data) : payload.data;
        if (!wraps || (p.file.wraps.password.created || 0) > (wraps.password.created || 0)) wraps = syncWraps(p.file.wraps);
      } catch {}
    }
    Object.assign(S, { dek, wraps, data, pinRecord: null, pinLocked: false, pinFails: 0 });
    await persistLocal();
    await uploadOwn();
    return unlockedResult();
  }

  // Veri anahtarı elde edildikten sonra (ana şifre ya da Face ID) kasayı aç
  async function openWithKey(dek, file) {
    const data = await C.openJson(dek, file.box);
    let pinRecord = null;
    try { if (file.wraps.pinBox) pinRecord = await C.openJson(dek, file.wraps.pinBox); } catch {}
    Object.assign(S, { dek, wraps: syncWraps(file.wraps), data, pinRecord, pinLocked: false, pinFails: 0 });
    return unlockedResult();
  }

  async function saveBio(pending, prf) {
    S.bioRec = await root.KasaBio.seal(S.dek, pending, prf);
    await Store.set('bio', S.bioRec);
    S.bioPending = null;
    S.bioAuthUntil = 0;
  }

  async function verifyPassword(password) {
    if (!S.dek || S.pinLocked) throw new Error(_t('Bitig kilitli.'));
    try { await C.unwrapKey(S.wraps.password, password); } catch { await slowDown(); throw new Error(_t('Mevcut ana şifre yanlış.')); }
  }

  const onlyOnComputer = (what) => async () => {
    throw new Error(_t("{0} bilgisayardaki Bitig’den yapılır; telefon değişikliği eşitlemeyle otomatik alır.", what));
  };

  Store.get('bio').then((r) => { S.bioRec = r || null; }).catch(() => {});

  // ---------- arayüzün beklediği API ----------
  root.kasa = {
    vaultExists: async () => !!(await Store.get('vault')),
    createVault: onlyOnComputer(_t('Yeni kasa oluşturmak')),
    async unlock(password) {
      const file = await Store.get('vault');
      let dek;
      try { dek = await C.unwrapKey(file.wraps.password, password); } catch { await slowDown(); throw new Error(_t('Ana şifre yanlış.')); }
      return openWithKey(dek, file);
    },
    async save(data) {
      if (!S.dek || S.pinLocked) throw new Error(_t('Bitig kilitli.'));
      S.data = mergeRemotes(data);
      await persistLocal();
      scheduleUpload();
      if (!Sync.same(S.data, data)) emit('merged', { data: S.data, changes: Sync.countChanges(data, S.data), from: deviceNames() });
      return true;
    },
    async lock() { if (S.dirty) await uploadOwn(); clearSession(); return true; },
    async quickLock() {
      if (!S.dek) return 'full';
      // Face ID açıksa anahtarı bellekte tutmaya gerek yok: tam kilitle, kilit ekranında Face ID ile açılır
      if (!S.pinRecord || S.bioRec) { if (S.dirty) await uploadOwn(); clearSession(); return 'full'; }
      S.pinLocked = true;
      S.pinFails = 0;
      return 'pin';
    },
    pin: {
      status: async () => ({ hasPin: !!S.pinRecord, pinLocked: S.pinLocked }),
      async unlock(pin) {
        if (!S.dek || !S.pinLocked || !S.pinRecord) return { ok: false, full: true };
        if (await C.checkPin(String(pin), S.pinRecord)) {
          S.pinLocked = false;
          S.pinFails = 0;
          setTimeout(syncNow, 50);
          return { ok: true, data: S.data, hasRecovery: !!S.wraps.recovery, hasPin: true };
        }
        S.pinFails++;
        await slowDown();
        if (S.pinFails >= PIN_MAX_TRIES) { clearSession(); return { ok: false, full: true }; }
        return { ok: false, left: PIN_MAX_TRIES - S.pinFails };
      },
      async set(password, pin) {
        await verifyPassword(password);
        if (!/^\d{4}$/.test(String(pin))) throw new Error(_t('PIN 4 rakam olmalı.'));
        S.pinRecord = await C.hashPin(String(pin));
        await persistLocal();
        return true;
      },
      async remove(password) {
        await verifyPassword(password);
        S.pinRecord = null;
        await persistLocal();
        return true;
      },
    },
    // Face ID / Touch ID / parmak izi (telefona özel; kayıt yalnızca bu cihazda durur, eşitlenmez)
    bio: {
      async status() {
        S.bioRec = (await Store.get('bio')) || null;
        const enabled = !!S.bioRec;
        return { label: root.KasaBio.label(), enabled, available: enabled || await root.KasaBio.supported() };
      },
      // Kurulum iki adımlı: önce ana şifre (verify), sonra ayrı bir dokunuşla Face ID (enroll).
      // iPhone, Face ID'yi yalnızca doğrudan bir dokunuşa yanıt olarak açar; şifre kontrolü araya girerse izin düşer.
      async verify(password) {
        await verifyPassword(password);
        S.bioAuthUntil = Date.now() + 3 * 60_000;
        return true;
      },
      // Dönen: { done: true } ya da { needConfirm: true } (cihaz sırrı oluştururken vermediyse bir onay daha)
      async enroll() {
        if (!S.dek || S.pinLocked || !(S.bioAuthUntil > Date.now())) throw new Error(_t('Önce ana şifreni gir.'));
        const pending = await root.KasaBio.create(settings.deviceName);
        if (!pending.prf) { S.bioPending = pending; return { needConfirm: true }; }
        await saveBio(pending, pending.prf);
        return { done: true };
      },
      async confirm() {
        if (!S.dek || !S.bioPending) throw new Error(_t('Önce ana şifreni gir.'));
        await saveBio(S.bioPending, await root.KasaBio.prfFor(S.bioPending));
        return { done: true };
      },
      async disable() {
        await Store.del('bio');
        S.bioRec = null;
        return true;
      },
      // Dokunuşun içinde çağrılır: kayıt bellekte olduğu için Face ID isteği hemen gider
      unlock() {
        const rec = S.bioRec;
        if (!rec) return Promise.reject(new Error(_t('{0} ile açma kurulu değil.', root.KasaBio.label())));
        return root.KasaBio.open(rec).then(async (dek) => {
          const file = await Store.get('vault');
          if (!file) throw new Error(_t('Bitig kilitli.'));
          return openWithKey(dek, file);
        });
      },
    },
    recover: onlyOnComputer(_t('Kurtarma anahtarıyla yeni ana şifre belirlemek')),
    changePassword: onlyOnComputer(_t('Ana şifreyi değiştirmek')),
    newRecoveryKey: onlyOnComputer(_t('Kurtarma anahtarı oluşturmak')),
    restore: onlyOnComputer(_t('Yedekten geri yüklemek')),
    backup: async () => false,
    info: async () => ({
      hasRecovery: !!S.wraps?.recovery, recoveryCreated: S.wraps?.recovery?.created || null,
      dataDir: _t('Bu telefon (şifreli)'), electron: 'telefon',
    }),

    settings: {
      get: async () => ({ autoLockMinutes: settings.autoLockMinutes, autostart: false, backup: { enabled: false } }),
      async set(patch) {
        if (typeof patch?.autoLockMinutes === 'number') { settings.autoLockMinutes = patch.autoLockMinutes; saveSettings(); }
        return root.kasa.settings.get();
      },
      backupNow: async () => ({ ok: false, error: 'Telefonda yedek yok; bilgisayar yedekliyor.' }),
      chooseBackupDir: async () => {},
      openBackupDir: async () => {},
    },

    // Telefonda pano geçmişi yok; kopyalanan metni sonradan silmek iOS'ta mümkün değil
    async copy(text) {
      try { await navigator.clipboard.writeText(String(text)); } catch {}
      return { protected: false };
    },
    async openUrl(url) {
      try { window.open(/^https?:\/\//i.test(url) ? url : 'https://' + url, '_blank', 'noopener'); } catch {}
    },
    setReminders: () => {},

    win: {
      collapse() {}, expand() {}, togglePin() {}, dock() {}, quit() {},
      state: async () => ({ dock: 'float', collapsed: false, pinned: false }),
    },
    bridge: {
      status: async () => ({ listening: false, error: 'telefonda yok', port: 0, clients: [] }),
      pair: async () => ({ code: '', expires: 0 }),
      revoke: async () => ({}), pending: async () => [], openExtensionFolder: async () => {},
    },

    sync: {
      async status() {
        const d = drive();
        return {
          enabled: !!d?.isConnected(), provider: d?.label || '', dir: d?.label || '',
          account: d?.account?.() || '', needsReconnect: !!S.needsReconnect,
          deviceId: settings.deviceId, deviceName: settings.deviceName,
          lastSync: S.lastSync, lastWrite: S.lastUpload, lastError: S.lastError, pending: S.dirty,
          devices: [
            { id: settings.deviceId, name: settings.deviceName, platform, savedAt: S.lastUpload, self: true, error: '' },
            ...[...S.remotes.entries()].map(([id, r]) => ({ id, name: r.device?.name || _t('Bilinmeyen cihaz'), platform: r.device?.platform || '', savedAt: r.savedAt, error: r.error })),
          ],
        };
      },
      async set(patch) {
        if (typeof patch?.deviceName === 'string' && patch.deviceName.trim()) {
          settings.deviceName = patch.deviceName.trim().slice(0, 40);
          saveSettings();
          scheduleUpload();
        }
        return root.kasa.sync.status();
      },
      async now() { if (S.dirty) await uploadOwn(); await syncNow(); return root.kasa.sync.status(); },
      async removeDevice(id) {
        if (id === settings.deviceId) return root.kasa.sync.status();
        await drive()?.remove?.(`kasa-${id}.sync.enc`);
        S.remotes.delete(id);
        return root.kasa.sync.status();
      },
      chooseDir: async () => root.kasa.sync.status(),
      openDir: async () => {},
    },

    // Telefona özel: kurulum ve sıfırlama
    phone: {
      drives: () => Object.values(root.KasaDrives),
      driveId: () => settings.drive || null,
      async connectDrive(id) {
        settings.drive = id;
        saveSettings();
        await root.KasaDrives[id].connect();
      },
      isDriveConnected: () => !!drive()?.isConnected(),
      // Bulutun izin sayfasından dönüldüyse oturumu tamamla (sayfa açılışında bir kez çağrılır)
      async finishRedirect() {
        try {
          const r = await drive()?.finishRedirect?.();
          return { done: r === true || !!r?.done, silent: !!r?.silent };
        } catch (e) { return { error: e.message }; }
      },
      // Bulut oturumu yakında dolacaksa sessizce tazele (sayfa kısa süre buluta gidip döner). Yönlendirme başladıysa true.
      renewDriveIfNeeded() {
        const d = drive();
        if (!d?.needsRenew?.()) return false;
        d.renew();
        return true;
      },
      async reconnect() { if (S.dirty) await uploadOwn(); await drive()?.connect(); },
      async vaultFilesFound() { return (await listVaultFiles()).length; },
      join,
      async reset() {
        clearSession();
        await Store.clear();
        S.bioRec = null;
        await drive()?.disconnect?.();
        localStorage.removeItem(SETTINGS_KEY);
        settings = loadSettings();
        saveSettings();
      },
    },

    onMerged: on('merged'),
    onCapture: on('capture'),
    onCapturePending: on('capturePending'),
    onPaired: on('paired'),
    onState: on('state'),
    onReminder: on('reminder'),
    onLocked: on('locked'),
    onLockRequest: on('lockRequest'),
  };
})(self);
