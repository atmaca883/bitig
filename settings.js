// Ayarlar ve tarayıcı bağlantısı sayfaları.
'use strict';

// ---------- ayarlar ----------
async function openSettingsSheet() {
  editing = null;
  clearInterval(pairTimer);
  const [st, info, pin, sy] = await Promise.all([kasa.settings.get(), kasa.info(), kasa.pin.status(), kasa.sync.status()]);
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
    row(_t('Hızlı kilit PIN\'i'),
      pin.hasPin ? _t('✓ Var · kilitlenince 4 haneli PIN istenir') : _t('Yok · kilitlenince ana şifre istenir'),
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

    section(_t('Dil')),
    languageRow(row),

    section(_t('Başlangıç')),
    row(_t('Windows açılışında başlat'), _t('Oturum açınca kenarda şerit olarak başlar'),
      toggle(st.autostart, async (v) => { await kasa.settings.set({ autostart: v }); toast(v ? _t('Açılışta başlayacak') : _t('Açılışta başlamayacak')); })),

    section(_t('Hakkında')),
    h('p', { class: 'muted small' }, _t("Electron {0} · Veri klasörü: {1}", info.electron, info.dataDir)),
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
    setTimeout(() => location.reload(), 900);
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
      h('div', { class: 'title' }, d.name + (d.self ? ' (bu cihaz)' : '')),
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

  const connectDropbox = async (btn) => {
    btn.disabled = true;
    btn.textContent = _t('Tarayıcıda Dropbox bekleniyor…');
    toast(_t('Tarayıcıda Dropbox açıldı; izin verince buraya döner'));
    try {
      await kasa.sync.connectDropbox();
      toast(_t('✓ Dropbox’a bağlandı'));
    } catch (e) {
      toast(_t('Dropbox’a bağlanılamadı: ') + cleanErr(e));
    }
    reopen();
  };

  const dropboxBlock = !sy.dropboxAvailable
    ? h('p', { class: 'muted small' }, _t('Bu sürümde Dropbox bağlantısı henüz etkin değil.'))
    : sy.dropboxEmail
      ? h('div', { class: 'setting col' },
        h('div', { class: 'sub' }, sy.needsReconnect ? _t('⚠ Dropbox bağlantısı sona erdi') : _t('Bağlı Dropbox hesabı')),
        h('div', { class: 'path' }, sy.dropboxEmail + _t(' · Uygulamalar/Bitig klasörü')),
        h('div', { class: 'group-actions' },
          sy.needsReconnect && h('button', { class: 'mini primary-mini', type: 'button', onclick: (e) => connectDropbox(e.currentTarget) }, _t('Yeniden bağlan')),
          !sy.needsReconnect && nowBtn,
          h('button', { class: 'mini', type: 'button', onclick: async () => {
            if (!(await ask(_t('Dropbox bağlantısı kesilsin mi?'), _t('Bu bilgisayar Dropbox’la eşitlemeyi bırakır. Dropbox’taki şifreli dosyalar silinmez.'),
              [{ label: _t('Vazgeç'), value: false }, { label: _t('Bağlantıyı kes'), value: true, primary: true }]))) return;
            await kasa.sync.disconnectDropbox();
            reopen();
          } }, _t('Bağlantıyı kes'))))
      : h('div', { class: 'setting col' },
        h('div', { class: 'sub' }, _t('Bitig, Dropbox’ında sadece kendine ait “Uygulamalar/Bitig” klasörünü kullanır; diğer dosyalarını göremez.')),
        h('button', { class: 'primary', type: 'button', onclick: (e) => connectDropbox(e.currentTarget) }, _t('Dropbox’a bağlan')));

  const folderBlock = h('div', { class: 'setting col' },
    h('div', { class: 'sub' }, _t('Eşitleme klasörü (OneDrive, Google Drive ya da Dropbox masaüstü programının klasörü)')),
    h('div', { class: 'path' }, sy.dir),
    h('div', { class: 'group-actions' },
      h('button', { class: 'mini', type: 'button', onclick: async () => { await kasa.sync.chooseDir(); reopen(); } }, _t('Değiştir')),
      h('button', { class: 'mini', type: 'button', onclick: () => kasa.sync.openDir() }, _t('Klasörü aç')),
      nowBtn));

  return [
    section(_t('Cihazlar arası eşitleme')),
    row(_t('Eşitleme'), status,
      toggle(sy.enabled, async (v) => { await kasa.sync.set({ enabled: v }); toast(v ? _t('Eşitleme açıldı') : _t('Eşitleme kapatıldı')); reopen(); })),
    sy.enabled && h('div', { class: 'setting col' },
      h('div', { class: 'sub' }, _t('Eşitleme yeri')),
      h('div', { class: 'segmented' }, choose('dropbox', 'Dropbox'), choose('folder', _t('Klasör')))),
    sy.enabled && (provider === 'dropbox' ? dropboxBlock : folderBlock),
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
      : provider === 'dropbox'
        ? (others.length ? '' : _t('Henüz başka cihaz yok. ')) + _t('Telefonda Bitig’i kurarken Dropbox’ı seç. Her cihaz kendi şifreli dosyasını yazar; Dropbox içeriği göremez.')
        : _t('Klasör yolu yalnızca bilgisayarlar arasında çalışır. Telefonla eşitlemek için Dropbox’ı seç.')),
  ].filter(Boolean);
}
