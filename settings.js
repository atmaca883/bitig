// Ayarlar ve tarayıcı bağlantısı sayfaları.
'use strict';

// ---------- ayarlar ----------
async function openSettingsSheet() {
  editing = null;
  clearInterval(pairTimer);
  const [st, info, pin, sy, hel, upd] = await Promise.all([kasa.settings.get(), kasa.info(), kasa.pin.status(), kasa.sync.status(),
    kasa.hello ? kasa.hello.status().catch(() => null) : null,
    kasa.update ? kasa.update.status().catch(() => null) : null]);
  const b = st.backup;
  const reopen = () => openSettingsSheet();
  const toggle = (checked, onchange) => {
    const i = h('input', { type: 'checkbox', class: 'switch', onchange: (e) => onchange(e.target.checked) });
    i.checked = checked;
    return i;
  };
  const row = (title, sub, ...side) => h('div', { class: 'setting' },
    h('div', { class: 'body' }, h('div', { class: 'title' }, title), sub && h('div', { class: 'sub' }, sub)), ...side);
  const backupStatus = !b.enabled ? _t('Kapalı')
    : b.lastError ? '⚠ ' + b.lastError
      : b.lastAt ? _t('Son yedek: ') + fmtAgo(b.lastAt) : _t('Henüz yedek alınmadı');

  $('#sheetForm').replaceChildren(
    section(_t('Güvenlik')),
    row(_t('Kurtarma anahtarı'),
      info.hasRecovery ? _t("✓ Var · {0} oluşturuldu", fmtAgo(info.recoveryCreated)) : _t('⚠ Yok — ana şifreni unutursan veriler kurtarılamaz'),
      h('button', { class: 'mini', type: 'button', onclick: createRecoveryFlow }, info.hasRecovery ? _t('Yenisini oluştur') : _t('Oluştur'))),
    row(_t('Ana şifre'), _t('Kasayı açan şifre'),
      h('button', { class: 'mini', type: 'button', onclick: changePasswordFlow }, _t('Değiştir'))),
    hel?.available && helloRow(hel, row, reopen),
    row(_t('Hızlı kilit PIN\'i'),
      hel?.enabled ? _t('{0} açıkken kullanılmaz', hel.label) : pin.hasPin ? _t('✓ Var · kilitlenince 4 haneli PIN istenir') : _t('Yok · kilitlenince ana şifre istenir'),
      ...(pin.hasPin
        ? [h('button', { class: 'mini', type: 'button', onclick: setPinFlow }, _t('Değiştir')),
          h('button', { class: 'mini', type: 'button', onclick: removePinFlow }, _t('Kaldır'))]
        : [h('button', { class: 'mini primary-mini', type: 'button', onclick: setPinFlow }, _t('PIN belirle'))])),
    row(_t('Otomatik kilit'), _t('Bu süre boyunca işlem yapılmazsa kilitlenir'),
      (() => {
        const sel = h('select', { class: 'compact', onchange: async (e) => {
          autoLockMinutes = Number(e.target.value);
          await kasa.settings.set({ autoLockMinutes });
          toast(autoLockMinutes ? _t("{0} dakika sonra kilitlenecek", autoLockMinutes) : _t('Otomatik kilit kapalı'));
        } }, ...[[1, _t('1 dakika')], [5, _t('5 dakika')], [10, _t('10 dakika')], [15, _t('15 dakika')], [30, _t('30 dakika')], [60, _t('1 saat')], [0, _t('Hiç')]]
          .map(([v, l]) => h('option', { value: String(v) }, l)));
        sel.value = String(st.autoLockMinutes ?? 10);
        return sel;
      })()),
    h('p', { class: 'muted small' },
      _t('Win+L ile bilgisayarı kilitleyince Bitig de kilitlenir (PIN varsa PIN ister). Bilgisayar uyku moduna geçince her zaman ana şifre gerekir. ') +
      _t('Kopyalanan şifreler Windows pano geçmişine (Win+V) ve bulut panosuna alınmaz, 30 saniye sonra panodan silinir.')),

    section(_t('Yedekleme')),
    row(_t('Otomatik yedek'), backupStatus,
      toggle(b.enabled, async (v) => { await kasa.settings.set({ backupEnabled: v }); reopen(); })),
    h('div', { class: 'setting col' },
      h('div', { class: 'sub' }, _t('Yedek klasörü')),
      h('div', { class: 'path' }, b.dir),
      h('div', { class: 'group-actions' },
        h('button', { class: 'mini', type: 'button', onclick: async () => { await kasa.settings.chooseBackupDir(); reopen(); } }, _t('Değiştir')),
        h('button', { class: 'mini', type: 'button', onclick: () => kasa.settings.openBackupDir() }, _t('Klasörü aç')),
        h('button', { class: 'mini primary-mini', type: 'button', onclick: async () => {
          await flush();
          const r = await kasa.settings.backupNow();
          toast(r.ok ? _t('Yedek alındı') : _t('Yedek alınamadı: ') + r.error);
          reopen();
        } }, _t('Şimdi yedekle')),
        h('button', { class: 'mini', type: 'button', onclick: async () => { await flush(); if (await kasa.backup()) toast(_t('Yedek kaydedildi')); } }, _t('Farklı yere kaydet…')))),
    h('p', { class: 'muted small' },
      _t('Her değişiklikten sonra “kasa-son.enc” güncellenir, her gün tarihli bir kopya alınır (son 14 gün saklanır). ') +
      _t('Yedekler şifrelidir, OneDrive’da durmaları güvenlidir. Geri yüklemek için kilit ekranındaki “Yedekten geri yükle”yi kullan.')),

    ...syncSection(sy, row, toggle, reopen),

    section(_t('Verileri taşı')),
    importRow(row),
    exportRow(row),

    section(_t('Görünüm ve dil')),
    themeRow(row),
    languageRow(row),

    section(_t('Başlangıç')),
    row(/Mac/.test(navigator.platform) ? _t('Mac açılışında başlat') : _t('Windows açılışında başlat'), _t('Oturum açınca kenarda şerit olarak başlar'),
      toggle(st.autostart, async (v) => { await kasa.settings.set({ autostart: v }); toast(v ? _t('Açılışta başlayacak') : _t('Açılışta başlamayacak')); })),

    ...(upd && upd.state !== 'off' ? updateSection(upd, st, row, toggle, reopen) : []),

    section(_t('Hakkında')),
    h('p', { class: 'muted small' }, _t("Bitig {0} · Electron {1} · Veri klasörü: {2}", info.version, info.electron, info.dataDir)),
  );
  $('#sheetTitle').textContent = _t('⚙ Ayarlar');
  $('#sheet').classList.add('custom');
  $('#sheet').hidden = false;
}

$('#btnSettings').addEventListener('click', (e) => openSettingsSheet(e));

// ---------- tarayıcı bağlantısı ----------
let pairTimer = null;

async function openBrowserSheet() {
  editing = null;
  clearInterval(pairTimer);
  const st = await kasa.bridge.status();
  const body = $('#sheetForm');
  const codeBox = h('div', { class: 'pair-code', hidden: true });

  const clients = st?.clients?.length
    ? st.clients.map((cl) => h('div', { class: 'item' },
      h('div', { class: 'ico' }, '🧩'),
      h('div', { class: 'body' },
        h('div', { class: 'title' }, cl.name),
        h('div', { class: 'sub' }, _t('Son kullanım: ') + fmtAgo(cl.lastSeen))),
      h('button', { class: 'mini', onclick: async () => {
        if (await ask(_t('Bağlantı kaldırılsın mı?'), _t("{0} artık Bitig’e erişemeyecek.", cl.name),
          [{ label: _t('Vazgeç'), value: false }, { label: _t('Kaldır'), value: true, primary: true }])) {
          await kasa.bridge.revoke(cl.id);
          openBrowserSheet();
        }
      } }, _t('Kaldır'))))
    : [h('div', { class: 'muted small' }, _t('Henüz bağlı tarayıcı yok.'))];

  body.replaceChildren(
    h('div', { class: 'status-line ' + (st?.listening ? 'ok' : 'bad') },
      st?.listening ? _t("● Bağlantı servisi çalışıyor (port {0})", st.port) : _t("✕ Servis çalışmıyor: {0}", st?.error || 'bilinmiyor')),
    h('div', { class: 'section-title' }, _t('Bağlı tarayıcılar')),
    ...clients,
    h('div', { class: 'section-title' }, _t('Yeni tarayıcı bağla')),
    h('ol', { class: 'steps' },
      h('li', null, _t('Chrome’da adres çubuğuna '), h('code', null, 'chrome://extensions'), _t(' yaz.')),
      h('li', null, _t('Sağ üstten '), h('b', null, _t('Geliştirici modu')), _t('’nu aç.')),
      h('li', null, h('b', null, _t('Paketlenmemiş öğe yükle')), _t(' → '), h('code', null, 'tarayici-eklentisi'), _t(' klasörünü seç. '),
        h('button', { type: 'button', class: 'mini', onclick: () => kasa.bridge.openExtensionFolder() }, _t('Klasörü aç'))),
      h('li', null, _t('Chrome’un sağ üstündeki yapboz (🧩) menüsünden '), h('b', null, _t('Bitig Bağlantısı')), _t('’nı sabitle, mavi Bitig simgesine tıkla ve aşağıdaki kodu gir.'))),
    h('button', { type: 'button', class: 'primary', onclick: async () => {
      const p = await kasa.bridge.pair();
      codeBox.hidden = false;
      const tick = () => {
        const left = Math.max(0, Math.round((p.expires - Date.now()) / 1000));
        codeBox.replaceChildren(h('b', null, p.code.replace(/(\d{3})(\d{3})/, '$1 $2')),
          h('span', null, left ? _t("{0}:{1} içinde gir", Math.floor(left / 60), pad(left % 60)) : _t('Süre doldu, yeni kod al')));
        if (!left) clearInterval(pairTimer);
      };
      clearInterval(pairTimer);
      tick();
      pairTimer = setInterval(tick, 1000);
    } }, _t('Eşleştirme kodu al')),
    codeBox,
    h('p', { class: 'muted small' },
      _t('Eklenti sadece bu bilgisayardaki Bitig’e bağlanır. Bitig kilitliyken hiçbir bilgi vermez; şifreler yalnızca kaydedildikleri sitede, sen tıklayınca doldurulur.')),
  );
  $('#sheetTitle').textContent = _t('🌐 Tarayıcı bağlantısı');
  $('#sheet').classList.add('custom');
  $('#sheet').hidden = false;
}

$('#btnBrowser').addEventListener('click', (e) => openBrowserSheet(e));

kasa.onPaired((cl) => {
  clearInterval(pairTimer);
  toast(_t("✓ {0} bağlandı", cl.name));
  if (!$('#sheet').hidden && $('#sheet').classList.contains('custom')) openBrowserSheet();
});

// ---------- dil ----------
// Seçim tarayıcı deposunda (arayüz açılırken okunur) ve ana süreçte (pencere/bildirim metinleri) saklanır.
// ---------- telefona kur (QR) ----------
const PHONE_APP_URL = 'https://atmaca883.github.io/bitig/';
function qrSvg(text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
}

async function showPhoneQr() {
  const sy = await kasa.sync.status();
  const cloud = sy.clouds?.[sy.provider]?.label;
  const done = ask(_t('Telefona kur'), '', [{ label: _t('Tamam'), value: true, primary: true }]);
  const box = h('div', { class: 'qr-box' });
  box.innerHTML = qrSvg(PHONE_APP_URL); // kendi ürettiğimiz SVG
  $('#dialog .dialog-card h3')?.after(h('div', { class: 'phone-qr' }, box,
    h('ol', { class: 'steps' },
      h('li', null, _t('Telefonunun kamerasıyla bu kodu okut.')),
      h('li', null, _t('Açılan sayfada Bitig’i ana ekrana ekle (sayfa nasıl yapılacağını gösterir).')),
      h('li', null, cloud ? _t('Ana ekrandaki Bitig’i aç, {0} seçeneğini seç ve ana şifreni gir.', cloud) : _t('Ana ekrandaki Bitig’i aç, bilgisayardaki bulutun aynısını seç ve ana şifreni gir.'))),
    !sy.enabled && h('p', { class: 'muted small' }, _t('Not: Telefonun verilerini alabilmesi için önce burada “Eşitleme”yi açıp bir bulut seç.')),
    h('p', { class: 'muted small' }, PHONE_APP_URL)));
  return done;
}

// ---------- içe aktarma ----------
const IMPORT_HELP = () => [
  ['Chrome', _t('Ayarlar → Otomatik doldurma ve şifreler → Google Şifre Yöneticisi → Ayarlar → Şifreleri dışa aktar')],
  ['Edge', _t('Ayarlar → Profiller → Şifreler → ⋯ → Şifreleri dışa aktar')],
  ['Firefox', _t('Menü → Şifreler → ⋯ → Girişleri dışa aktar')],
  ['Safari / iPhone', _t('Mac: Dosya → Dışa aktar → Şifreler. iPhone: Ayarlar → Şifreler → ⋯ → Dışa aktar')],
  ['Bitwarden', _t('Kasa → Araçlar → Kasayı dışa aktar → .csv')],
  ['1Password', _t('Dosya → Dışa aktar → CSV')],
  ['LastPass / KeePass', _t('Hesap seçenekleri / Dosya → Dışa aktar → CSV')],
];

// Kaynak kaynak dışa aktarma adımları (ask penceresinin başlığının altına eklenir)
function importHelp() {
  const done = ask(_t('Şifreleri nasıl dışa aktarırım?'), '', [{ label: _t('Tamam'), value: true, primary: true }]);
  $('#dialog .dialog-card h3')?.after(h('div', { class: 'import-help' },
    ...IMPORT_HELP().map(([n, s]) => h('div', null, h('b', null, n), h('span', null, s))),
    h('p', { class: 'muted small' }, _t('Dışa aktarılan dosyada şifreler açık metin olarak durur; içe aktardıktan sonra silmeyi unutma.'))));
  return done;
}

// Dokunuşun içinde çağrılır (telefonda dosya seçici ancak böyle açılır): kasa.importFile beklemeden başlar
function importFlow() {
  return kasa.importFile().then((f) => f && importPreview(f), (e) => toast(cleanErr(e)));
}

async function importPreview(f) {
  const r = KasaImport.convert(f.text);
  if (r.error) {
    await ask(_t('Bu dosyada şifre bulunamadı'),
      _t('Şifre sütunu olan bir CSV dosyası seç (Chrome, Edge, Firefox, Safari, Bitwarden, 1Password, LastPass, KeePass).'),
      [{ label: _t('Tamam'), value: true, primary: true }]);
    return;
  }
  const match = (p) => db.passwords.find((x) => K.sameAccount(x, p));
  const fresh = r.passwords.filter((p) => !match(p));
  const changed = r.passwords.filter((p) => { const x = match(p); return x && x.password !== p.password; });
  const same = r.passwords.length - fresh.length - changed.length;
  const lines = [
    _t('{0} şifre yeni', fresh.length),
    same && _t('{0} şifre zaten kayıtlı (aynısı)', same),
    changed.length && _t('{0} hesap kayıtlı ama şifresi farklı', changed.length),
    r.notes.length && _t('{0} güvenli not', r.notes.length),
    r.skipped && _t('{0} satır atlandı (şifresi yok)', r.skipped),
  ].filter(Boolean);
  const choice = await ask(
    _t('{0}: {1} kayıt bulundu', r.source || f.name, r.passwords.length + r.notes.length),
    lines.join(' · '),
    [{ label: _t('Vazgeç'), value: null },
      ...(changed.length ? [{ label: _t('Farklı olanları da güncelle'), value: 'update' }] : []),
      { label: _t('İçe aktar'), value: 'add', primary: true }]);
  if (!choice) return;

  for (const p of fresh) db.passwords.push(newItem('password', { ...p, projectId: '' }));
  if (choice === 'update') {
    for (const p of changed) {
      const x = match(p);
      setPassword(x, p.password);
      if (p.note && !(x.note || '').includes(p.note)) x.note = [x.note, p.note].filter(Boolean).join('\n');
      if (p.totp && !x.totp) x.totp = p.totp;
    }
  }
  for (const n of r.notes) db.notes.push(newItem('note', { ...n, projectId: '' }));
  persist();
  render();
  toast(_t('✓ {0} şifre, {1} not içe aktarıldı', fresh.length + (choice === 'update' ? changed.length : 0), r.notes.length));

  // Açık metin dosya ortada kalmasın
  if (f.canDelete) {
    const del = await ask(_t('CSV dosyası silinsin mi?'),
      _t('“{0}” dosyasında şifrelerin açık metin olarak duruyor. Hepsi Bitig’e şifreli olarak aktarıldı; dosyayı silmen önerilir.', f.name),
      [{ label: _t('Sakla'), value: false }, { label: _t('Dosyayı sil'), value: true, primary: true }]);
    if (del) toast((await kasa.deleteImportFile()) ? _t('✓ Dosya silindi') : _t('Dosya silinemedi; kendin sil.'));
  } else {
    await ask(_t('Dosyayı silmeyi unutma'),
      _t('“{0}” dosyasında şifrelerin açık metin olarak duruyor. Dosyalar uygulamasından silmeni öneririz.', f.name),
      [{ label: _t('Tamam'), value: true, primary: true }]);
  }
}

// ---------- dışa aktarma ----------
async function exportFlow() {
  const kind = await ask(_t('Dışa aktar'),
    _t('Şifreli yedek: yalnızca Bitig ve ana şifrenle açılır; saklamak için en güvenlisi. CSV: şifreler başka bir uygulamaya taşımak için (Chrome, Bitwarden, 1Password…). JSON: notlar, görevler ve projeler dahil her şey. CSV ve JSON açık metindir.'),
    [{ label: _t('Vazgeç'), value: null },
      { label: _t('Şifreli yedek'), value: 'enc' },
      { label: _t('Her şey (JSON)'), value: 'json' },
      { label: _t('Şifreler (CSV)'), value: 'csv', primary: true }]);
  if (!kind) return;
  await flush();
  if (kind === 'enc') {
    if (await kasa.backup()) toast(_t('Şifreli yedek kaydedildi'));
    return;
  }
  const ok = await formDialog({
    title: _t('Ana şifreni gir'),
    text: _t('Bu dosyada şifrelerin açık metin olarak yer alır. Kimseyle paylaşma; işin bitince sil.'),
    fields: [{ k: 'pw', label: _t('Ana şifre') }], submitLabel: _t('Dışa aktar'),
    onSubmit: async (v) => { await kasa.verifyPassword(v.pw); },
  });
  if (!ok) return;
  const day = todayStr();
  const name = kind === 'csv' ? `Bitig-sifreler-${day}.csv` : `Bitig-veriler-${day}.json`;
  const text = kind === 'csv' ? KasaImport.toCSV(db.passwords) : KasaImport.toJSON(db);
  const saved = await kasa.exportSave(name, text, kind === 'csv' ? 'text/csv' : 'application/json');
  if (saved) toast(kind === 'csv' ? _t('✓ {0} şifre dışa aktarıldı: {1}', db.passwords.length, saved) : _t('✓ Tüm veriler dışa aktarıldı: {0}', saved));
}

function exportRow(row) {
  return row(_t('Dışa aktar'), _t('Şifreli yedek, şifreler (CSV) ya da her şey (JSON)'),
    h('button', { class: 'mini', type: 'button', onclick: () => exportFlow() }, _t('Dışa aktar')));
}

function importRow(row) {
  return row(_t('Başka yerden içe aktar'), _t('Chrome, Edge, Firefox, Safari, Bitwarden, 1Password, LastPass, KeePass (CSV)'),
    h('button', { class: 'mini', type: 'button', onclick: () => importHelp() }, _t('Nasıl?')),
    h('button', { class: 'mini primary-mini', type: 'button', onclick: () => importFlow() }, _t('İçe aktar')));
}

// ---------- güncellemeler ----------
function updateText(u) {
  switch (u.state) {
    case 'checking': return _t('Denetleniyor…');
    case 'uptodate': return _t('✓ Güncel') + (u.lastCheck ? ' · ' + _t('son denetim ') + fmtStamp(u.lastCheck) : '');
    case 'downloading': return _t('Sürüm {0} indiriliyor… %{1}', u.version, u.percent);
    case 'ready': return _t('Sürüm {0} hazır · yeniden başlatınca kurulur', u.version);
    case 'available': return _t('Sürüm {0} çıktı', u.version);
    case 'installing': return _t('Kuruluyor…');
    case 'error': return _t('⚠ Denetlenemedi: ') + u.error;
    default: return '';
  }
}

async function installUpdate() {
  await flush();
  await kasa.update.install();
}

function updateSection(u, st, row, toggle, reopen) {
  const action = u.state === 'ready'
    ? h('button', { class: 'mini primary-mini', type: 'button', onclick: installUpdate }, _t('Yeniden başlat'))
    : u.state === 'available'
      ? h('button', { class: 'mini primary-mini', type: 'button', onclick: installUpdate }, _t('İndir'))
      : h('button', { class: 'mini', type: 'button', disabled: u.state === 'checking' || u.state === 'downloading',
        onclick: async (e) => {
          // Denetlendiği görünsün: düğmede bekleme, sonunda sonuç mesajı
          const b = e.currentTarget;
          b.disabled = true;
          b.textContent = _t('Denetleniyor…');
          const r = await kasa.update.check();
          toast(r?.state === 'uptodate' ? _t('✓ Bitig güncel (sürüm {0})', r.current)
            : r?.state === 'error' ? _t('⚠ Denetlenemedi: ') + r.error
              : r?.version ? _t('Yeni sürüm bulundu: {0}', r.version) : _t('Denetlendi'));
          reopen();
        } }, _t('Denetle'));
  return [
    section(_t('Güncellemeler')),
    (() => { const r = row(_t('Bitig {0}', u.current), updateText(u), action); r.dataset.updateRow = '1'; return r; })(),
    row(_t('Otomatik denetle'), u.mode === 'install' ? _t('Yeni sürüm arka planda iner; yeniden başlatınca kurulur') : _t('Yeni sürüm çıkınca haber verir'),
      toggle(st.autoUpdate !== false, async (v) => { await kasa.settings.set({ autoUpdate: v }); })),
  ];
}

// Windows Hello (yüz, parmak izi ya da Windows PIN'i) ile açma
function helloRow(hel, row, reopen) {
  const L = hel.label;
  if (hel.enabled) {
    return row(_t('{0} ile aç', L), _t('✓ Açık · Bitig kilit ekranında {0} ile açılır', L),
      h('button', { class: 'mini', type: 'button', onclick: async () => {
        if (!(await ask(_t('{0} ile açma kapatılsın mı?', L), _t('Bundan sonra Bitig’i ana şifrenle açarsın. İstediğin zaman yeniden kurabilirsin.'),
          [{ label: _t('Vazgeç'), value: false }, { label: _t('Kaldır'), value: true, primary: true }]))) return;
        await kasa.hello.disable();
        toast(_t('{0} ile açma kapatıldı', L));
        reopen();
      } }, _t('Kaldır')));
  }
  return row(_t('{0} ile aç', L), _t('Kapalı · yüz, parmak izi ya da Windows PIN’inle aç'),
    h('button', { class: 'mini primary-mini', type: 'button', onclick: async () => {
      const ok = await formDialog({
        title: _t('{0} ile aç', L),
        text: _t('Kurmak için önce ana şifreni gir. Sonra Windows Hello onayı istenir. Anahtar yalnızca bu bilgisayarda saklanır; ana şifren her zaman çalışmaya devam eder.'),
        fields: [{ k: 'pw', label: _t('Ana şifre') }], submitLabel: _t('Devam'),
        onSubmit: async (v) => { await kasa.hello.enable(v.pw); },
      });
      if (ok) { toast(_t('✓ {0} ile açma kuruldu', L)); reopen(); }
    } }, _t('Kur')));
}

// Tema: bu cihazda saklanır, hemen uygulanır (yeniden açmaya gerek yok)
function themeRow(row) {
  const sel = h('select', { class: 'compact', onchange: (e) => BitigTheme.set(e.target.value) },
    h('option', { value: 'auto' }, _t('Otomatik (cihaz ayarı)')),
    h('option', { value: 'dark' }, _t('Koyu')),
    h('option', { value: 'light' }, _t('Açık')));
  sel.value = BitigTheme.get();
  return row(_t('Tema'), _t('Açık ya da koyu görünüm'), sel);
}

function languageRow(row) {
  let saved = 'auto';
  try { saved = localStorage.getItem('bitig.lang') || 'auto'; } catch {}
  const sel = h('select', { class: 'compact', onchange: async (e) => {
    const v = e.target.value;
    try { if (v === 'auto') localStorage.removeItem('bitig.lang'); else localStorage.setItem('bitig.lang', v); } catch {}
    await kasa.settings.set({ lang: v });
    toast(KasaI18n.tl(v === 'auto' ? KasaI18n.detect() : v, 'Dil değişti; uygulama yeniden açılıyor…'));
    await flush();
    await kasa.lock(); // sayfa yeniden yüklenecek; kasa güvenle kilitlensin
    setTimeout(() => (kasa.reload ? kasa.reload() : location.reload()), 900);
  } },
  h('option', { value: 'auto' }, _t('Otomatik (sistem dili)')),
  h('option', { value: 'tr' }, 'Türkçe'),
  h('option', { value: 'en' }, 'English'));
  sel.value = saved;
  // İki dilin adı birlikte: yanlış dilde kalan biri de bulabilsin
  return row(KasaI18n.lang() === 'tr' ? 'Dil · Language' : 'Language · Dil', _t('Uygulamanın dili'), sel);
}

// ---------- cihazlar arası eşitleme ----------
function syncSection(sy, row, toggle, reopen) {
  const status = !sy.enabled ? _t('Kapalı · telefon ve diğer bilgisayarlarla eşitlemek için aç')
    : sy.lastError ? '⚠ ' + sy.lastError
      : sy.lastSync ? _t('Son eşitleme: ') + fmtStamp(sy.lastSync) : _t('Eşitleniyor…');
  const others = sy.devices.filter((d) => !d.self);
  const deviceRow = (d) => h('div', { class: 'item device-row' + (d.error ? ' bad' : '') },
    h('div', { class: 'ico' }, d.platform === 'ios' || d.platform === 'android' ? '📱' : '💻'),
    h('div', { class: 'body' },
      h('div', { class: 'title' }, d.name + (d.self ? _t(' (bu cihaz)') : '')),
      h('div', { class: 'sub' }, d.error || (d.savedAt ? _t('Son kayıt: ') + fmtStamp(d.savedAt) : _t('Henüz kaydetmedi')))),
    !d.self && h('button', { class: 'mini', type: 'button', onclick: async () => {
      if (!(await ask(_t('Cihaz listeden çıkarılsın mı?'),
        _t("“{0}” cihazının eşitleme dosyası silinir. O cihaz Bitig’i yeniden açarsa tekrar görünür. Kaybolan bir cihazdaki veriler zaten o cihaza inmiş olabilir; böyle bir durumda önemli şifrelerini değiştir.", d.name),
        [{ label: _t('Vazgeç'), value: false }, { label: _t('Çıkar'), value: true, primary: true }]))) return;
      await kasa.sync.removeDevice(d.id);
      reopen();
    } }, _t('Çıkar')));

  const provider = sy.provider || 'folder';
  const nowBtn = h('button', { class: 'mini primary-mini', type: 'button', onclick: async () => { await flush(); await kasa.sync.now(); toast(_t('Eşitlendi')); reopen(); } }, _t('Şimdi eşitle'));
  const choose = (p, label) => h('button', {
    type: 'button', class: 'seg' + (provider === p ? ' on' : ''),
    onclick: async () => { if (provider !== p) { await kasa.sync.set({ provider: p }); reopen(); } },
  }, label);

  // Doğrudan bağlanılan bulutlar (Dropbox, OneDrive). Bu sürümde anahtarı olmayan bulut seçeneklerde görünmez.
  const clouds = sy.clouds || { dropbox: { label: 'Dropbox', available: sy.dropboxAvailable, email: sy.dropboxEmail } };
  const cloud = clouds[provider];

  const connectCloud = async (id, btn) => {
    const label = clouds[id].label;
    btn.disabled = true;
    btn.textContent = _t('Tarayıcıda {0} bekleniyor…', label);
    toast(_t('Tarayıcıda {0} açıldı; izin verince buraya döner', label));
    try {
      await kasa.sync.connectCloud(id);
      toast(_t('✓ {0} hesabına bağlandı', label));
    } catch (e) {
      toast(_t('{0} hesabına bağlanılamadı: ', label) + cleanErr(e));
    }
    reopen();
  };

  const cloudBlock = (id) => {
    const c = clouds[id];
    if (!c.available) return h('p', { class: 'muted small' }, _t('Bu sürümde {0} bağlantısı henüz etkin değil.', c.label));
    if (!c.email) {
      return h('div', { class: 'setting col' },
        h('div', { class: 'sub' }, _t('Bitig, {0} hesabında sadece kendine ait “Uygulamalar/Bitig” klasörünü kullanır; diğer dosyalarını göremez.', c.label)),
        h('button', { class: 'primary', type: 'button', onclick: (e) => connectCloud(id, e.currentTarget) }, _t('{0} hesabına bağlan', c.label)));
    }
    return h('div', { class: 'setting col' },
      h('div', { class: 'sub' }, sy.needsReconnect ? _t('⚠ {0} bağlantısı sona erdi', c.label) : _t('Bağlı {0} hesabı', c.label)),
      h('div', { class: 'path' }, c.email + _t(' · Uygulamalar/Bitig klasörü')),
      h('div', { class: 'group-actions' },
        sy.needsReconnect && h('button', { class: 'mini primary-mini', type: 'button', onclick: (e) => connectCloud(id, e.currentTarget) }, _t('Yeniden bağlan')),
        !sy.needsReconnect && nowBtn,
        h('button', { class: 'mini', type: 'button', onclick: async () => {
          if (!(await ask(_t('{0} bağlantısı kesilsin mi?', c.label), _t('Bu bilgisayar {0} ile eşitlemeyi bırakır. {0} içindeki şifreli dosyalar silinmez.', c.label),
            [{ label: _t('Vazgeç'), value: false }, { label: _t('Bağlantıyı kes'), value: true, primary: true }]))) return;
          await kasa.sync.disconnectCloud(id);
          reopen();
        } }, _t('Bağlantıyı kes'))));
  };

  const folderBlock = h('div', { class: 'setting col' },
    h('div', { class: 'sub' }, _t('Eşitleme klasörü (OneDrive, Google Drive, iCloud ya da Dropbox masaüstü programının klasörü)')),
    h('div', { class: 'path' }, sy.dir),
    h('div', { class: 'group-actions' },
      h('button', { class: 'mini', type: 'button', onclick: async () => { await kasa.sync.chooseDir(); reopen(); } }, _t('Değiştir')),
      h('button', { class: 'mini', type: 'button', onclick: () => kasa.sync.openDir() }, _t('Klasörü aç')),
      nowBtn));

  const cloudNames = Object.entries(clouds).filter(([id, c]) => c.available || id === provider).map(([, c]) => c.label);
  return [
    section(_t('Cihazlar arası eşitleme')),
    row(_t('Eşitleme'), status,
      toggle(sy.enabled, async (v) => { await kasa.sync.set({ enabled: v }); toast(v ? _t('Eşitleme açıldı') : _t('Eşitleme kapatıldı')); reopen(); })),
    sy.enabled && h('div', { class: 'setting col' },
      h('div', { class: 'sub' }, _t('Eşitleme yeri')),
      h('div', { class: 'segmented' },
        ...Object.entries(clouds).filter(([id, c]) => c.available || id === provider).map(([id, c]) => choose(id, c.label)),
        choose('folder', _t('Klasör')))),
    sy.enabled && (cloud ? cloudBlock(provider) : folderBlock),
    row(_t('Telefona kur'), _t('QR kodu telefonun kamerasıyla okut'),
      h('button', { class: 'mini primary-mini', type: 'button', onclick: () => showPhoneQr() }, _t('QR göster'))),
    sy.enabled && row(_t('Bu cihazın adı'), sy.deviceName,
      h('button', { class: 'mini', type: 'button', onclick: async () => {
        let name = '';
        const ok = await formDialog({
          title: _t('Cihaz adı'), text: _t('Diğer cihazlarda bu adla görünür.'),
          fields: [{ k: 'name', label: _t('Ör. Ev bilgisayarı'), type: 'text' }], submitLabel: _t('Kaydet'),
          onSubmit: (v) => { if (!v.name.trim()) return _t('Bir ad yaz.'); name = v.name; },
        });
        if (ok) { await kasa.sync.set({ deviceName: name }); reopen(); }
      } }, _t('Değiştir'))),
    sy.enabled && h('div', { class: 'device-list' }, ...sy.devices.map(deviceRow)),
    h('p', { class: 'muted small' }, !sy.enabled
      ? _t('Açınca kasan şifreli olarak buluta da yazılır; telefonun ve diğer bilgisayarların değişiklikleri buradan birleşir.')
      : cloud
        ? (others.length ? '' : _t('Henüz başka cihaz yok. ')) + _t('Telefonda Bitig’i kurarken {0} seçeneğini seç. Her cihaz kendi şifreli dosyasını yazar; {0} içeriği göremez.', cloud.label)
        : _t('Klasör yolu yalnızca bilgisayarlar arasında çalışır. Telefonla eşitlemek için şunlardan birini seç: {0}.', cloudNames.join(', '))),
  ].filter(Boolean);
}
