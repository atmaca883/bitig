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
  const backupStatus = !b.enabled ? 'Kapalı'
    : b.lastError ? '⚠ ' + b.lastError
      : b.lastAt ? 'Son yedek: ' + fmtAgo(b.lastAt) : 'Henüz yedek alınmadı';

  $('#sheetForm').replaceChildren(
    section('Güvenlik'),
    row('Kurtarma anahtarı',
      info.hasRecovery ? `✓ Var · ${fmtAgo(info.recoveryCreated)} oluşturuldu` : '⚠ Yok — ana şifreni unutursan veriler kurtarılamaz',
      h('button', { class: 'mini', type: 'button', onclick: createRecoveryFlow }, info.hasRecovery ? 'Yenisini oluştur' : 'Oluştur')),
    row('Ana şifre', 'Kasayı açan şifre',
      h('button', { class: 'mini', type: 'button', onclick: changePasswordFlow }, 'Değiştir')),
    row('Hızlı kilit PIN\'i',
      pin.hasPin ? '✓ Var · kilitlenince 4 haneli PIN istenir' : 'Yok · kilitlenince ana şifre istenir',
      ...(pin.hasPin
        ? [h('button', { class: 'mini', type: 'button', onclick: setPinFlow }, 'Değiştir'),
          h('button', { class: 'mini', type: 'button', onclick: removePinFlow }, 'Kaldır')]
        : [h('button', { class: 'mini primary-mini', type: 'button', onclick: setPinFlow }, 'PIN belirle')])),
    row('Otomatik kilit', 'Bu süre boyunca işlem yapılmazsa kilitlenir',
      (() => {
        const sel = h('select', { class: 'compact', onchange: async (e) => {
          autoLockMinutes = Number(e.target.value);
          await kasa.settings.set({ autoLockMinutes });
          toast(autoLockMinutes ? `${autoLockMinutes} dakika sonra kilitlenecek` : 'Otomatik kilit kapalı');
        } }, ...[[1, '1 dakika'], [5, '5 dakika'], [10, '10 dakika'], [15, '15 dakika'], [30, '30 dakika'], [60, '1 saat'], [0, 'Hiç']]
          .map(([v, l]) => h('option', { value: String(v) }, l)));
        sel.value = String(st.autoLockMinutes ?? 10);
        return sel;
      })()),
    h('p', { class: 'muted small' },
      'Win+L ile bilgisayarı kilitleyince Bitig de kilitlenir (PIN varsa PIN ister). Bilgisayar uyku moduna geçince her zaman ana şifre gerekir. ' +
      'Kopyalanan şifreler Windows pano geçmişine (Win+V) ve bulut panosuna alınmaz, 30 saniye sonra panodan silinir.'),

    section('Yedekleme'),
    row('Otomatik yedek', backupStatus,
      toggle(b.enabled, async (v) => { await kasa.settings.set({ backupEnabled: v }); reopen(); })),
    h('div', { class: 'setting col' },
      h('div', { class: 'sub' }, 'Yedek klasörü'),
      h('div', { class: 'path' }, b.dir),
      h('div', { class: 'group-actions' },
        h('button', { class: 'mini', type: 'button', onclick: async () => { await kasa.settings.chooseBackupDir(); reopen(); } }, 'Değiştir'),
        h('button', { class: 'mini', type: 'button', onclick: () => kasa.settings.openBackupDir() }, 'Klasörü aç'),
        h('button', { class: 'mini primary-mini', type: 'button', onclick: async () => {
          await flush();
          const r = await kasa.settings.backupNow();
          toast(r.ok ? 'Yedek alındı' : 'Yedek alınamadı: ' + r.error);
          reopen();
        } }, 'Şimdi yedekle'),
        h('button', { class: 'mini', type: 'button', onclick: async () => { await flush(); if (await kasa.backup()) toast('Yedek kaydedildi'); } }, 'Farklı yere kaydet…'))),
    h('p', { class: 'muted small' },
      'Her değişiklikten sonra “kasa-son.enc” güncellenir, her gün tarihli bir kopya alınır (son 14 gün saklanır). ' +
      'Yedekler şifrelidir, OneDrive’da durmaları güvenlidir. Geri yüklemek için kilit ekranındaki “Yedekten geri yükle”yi kullan.'),

    ...syncSection(sy, row, toggle, reopen),

    section('Başlangıç'),
    row('Windows açılışında başlat', 'Oturum açınca kenarda şerit olarak başlar',
      toggle(st.autostart, async (v) => { await kasa.settings.set({ autostart: v }); toast(v ? 'Açılışta başlayacak' : 'Açılışta başlamayacak'); })),

    section('Hakkında'),
    h('p', { class: 'muted small' }, `Electron ${info.electron} · Veri klasörü: ${info.dataDir}`),
  );
  $('#sheetTitle').textContent = '⚙ Ayarlar';
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
        h('div', { class: 'sub' }, 'Son kullanım: ' + fmtAgo(cl.lastSeen))),
      h('button', { class: 'mini', onclick: async () => {
        if (await ask('Bağlantı kaldırılsın mı?', `${cl.name} artık Bitig’e erişemeyecek.`,
          [{ label: 'Vazgeç', value: false }, { label: 'Kaldır', value: true, primary: true }])) {
          await kasa.bridge.revoke(cl.id);
          openBrowserSheet();
        }
      } }, 'Kaldır')))
    : [h('div', { class: 'muted small' }, 'Henüz bağlı tarayıcı yok.')];

  body.replaceChildren(
    h('div', { class: 'status-line ' + (st?.listening ? 'ok' : 'bad') },
      st?.listening ? `● Bağlantı servisi çalışıyor (port ${st.port})` : `✕ Servis çalışmıyor: ${st?.error || 'bilinmiyor'}`),
    h('div', { class: 'section-title' }, 'Bağlı tarayıcılar'),
    ...clients,
    h('div', { class: 'section-title' }, 'Yeni tarayıcı bağla'),
    h('ol', { class: 'steps' },
      h('li', null, 'Chrome’da adres çubuğuna ', h('code', null, 'chrome://extensions'), ' yaz.'),
      h('li', null, 'Sağ üstten ', h('b', null, 'Geliştirici modu'), '’nu aç.'),
      h('li', null, h('b', null, 'Paketlenmemiş öğe yükle'), ' → ', h('code', null, 'tarayici-eklentisi'), ' klasörünü seç. ',
        h('button', { type: 'button', class: 'mini', onclick: () => kasa.bridge.openExtensionFolder() }, 'Klasörü aç')),
      h('li', null, 'Chrome’un sağ üstündeki yapboz (🧩) menüsünden ', h('b', null, 'Bitig Bağlantısı'), '’nı sabitle, mavi Bitig simgesine tıkla ve aşağıdaki kodu gir.')),
    h('button', { type: 'button', class: 'primary', onclick: async () => {
      const p = await kasa.bridge.pair();
      codeBox.hidden = false;
      const tick = () => {
        const left = Math.max(0, Math.round((p.expires - Date.now()) / 1000));
        codeBox.replaceChildren(h('b', null, p.code.replace(/(\d{3})(\d{3})/, '$1 $2')),
          h('span', null, left ? `${Math.floor(left / 60)}:${pad(left % 60)} içinde gir` : 'Süre doldu, yeni kod al'));
        if (!left) clearInterval(pairTimer);
      };
      clearInterval(pairTimer);
      tick();
      pairTimer = setInterval(tick, 1000);
    } }, 'Eşleştirme kodu al'),
    codeBox,
    h('p', { class: 'muted small' },
      'Eklenti sadece bu bilgisayardaki Bitig’e bağlanır. Bitig kilitliyken hiçbir bilgi vermez; şifreler yalnızca kaydedildikleri sitede, sen tıklayınca doldurulur.'),
  );
  $('#sheetTitle').textContent = '🌐 Tarayıcı bağlantısı';
  $('#sheet').classList.add('custom');
  $('#sheet').hidden = false;
}

$('#btnBrowser').addEventListener('click', (e) => openBrowserSheet(e));

kasa.onPaired((cl) => {
  clearInterval(pairTimer);
  toast(`✓ ${cl.name} bağlandı`);
  if (!$('#sheet').hidden && $('#sheet').classList.contains('custom')) openBrowserSheet();
});

// ---------- cihazlar arası eşitleme ----------
function syncSection(sy, row, toggle, reopen) {
  const status = !sy.enabled ? 'Kapalı · telefon ve diğer bilgisayarlarla eşitlemek için aç'
    : sy.lastError ? '⚠ ' + sy.lastError
      : sy.lastSync ? 'Son eşitleme: ' + fmtStamp(sy.lastSync) : 'Eşitleniyor…';
  const others = sy.devices.filter((d) => !d.self);
  const deviceRow = (d) => h('div', { class: 'item device-row' + (d.error ? ' bad' : '') },
    h('div', { class: 'ico' }, d.platform === 'ios' || d.platform === 'android' ? '📱' : '💻'),
    h('div', { class: 'body' },
      h('div', { class: 'title' }, d.name + (d.self ? ' (bu cihaz)' : '')),
      h('div', { class: 'sub' }, d.error || (d.savedAt ? 'Son kayıt: ' + fmtStamp(d.savedAt) : 'Henüz kaydetmedi'))),
    !d.self && h('button', { class: 'mini', type: 'button', onclick: async () => {
      if (!(await ask('Cihaz listeden çıkarılsın mı?',
        `“${d.name}” cihazının eşitleme dosyası silinir. O cihaz Bitig’i yeniden açarsa tekrar görünür. Kaybolan bir cihazdaki veriler zaten o cihaza inmiş olabilir; böyle bir durumda önemli şifrelerini değiştir.`,
        [{ label: 'Vazgeç', value: false }, { label: 'Çıkar', value: true, primary: true }]))) return;
      await kasa.sync.removeDevice(d.id);
      reopen();
    } }, 'Çıkar'));

  const provider = sy.provider || 'folder';
  const nowBtn = h('button', { class: 'mini primary-mini', type: 'button', onclick: async () => { await flush(); await kasa.sync.now(); toast('Eşitlendi'); reopen(); } }, 'Şimdi eşitle');
  const choose = (p, label) => h('button', {
    type: 'button', class: 'seg' + (provider === p ? ' on' : ''),
    onclick: async () => { if (provider !== p) { await kasa.sync.set({ provider: p }); reopen(); } },
  }, label);

  const connectDropbox = async (btn) => {
    btn.disabled = true;
    btn.textContent = 'Tarayıcıda Dropbox bekleniyor…';
    toast('Tarayıcıda Dropbox açıldı; izin verince buraya döner');
    try {
      await kasa.sync.connectDropbox();
      toast('✓ Dropbox’a bağlandı');
    } catch (e) {
      toast('Dropbox’a bağlanılamadı: ' + cleanErr(e));
    }
    reopen();
  };

  const dropboxBlock = !sy.dropboxAvailable
    ? h('p', { class: 'muted small' }, 'Bu sürümde Dropbox bağlantısı henüz etkin değil.')
    : sy.dropboxEmail
      ? h('div', { class: 'setting col' },
        h('div', { class: 'sub' }, sy.needsReconnect ? '⚠ Dropbox bağlantısı sona erdi' : 'Bağlı Dropbox hesabı'),
        h('div', { class: 'path' }, sy.dropboxEmail + ' · Uygulamalar/Bitig klasörü'),
        h('div', { class: 'group-actions' },
          sy.needsReconnect && h('button', { class: 'mini primary-mini', type: 'button', onclick: (e) => connectDropbox(e.currentTarget) }, 'Yeniden bağlan'),
          !sy.needsReconnect && nowBtn,
          h('button', { class: 'mini', type: 'button', onclick: async () => {
            if (!(await ask('Dropbox bağlantısı kesilsin mi?', 'Bu bilgisayar Dropbox’la eşitlemeyi bırakır. Dropbox’taki şifreli dosyalar silinmez.',
              [{ label: 'Vazgeç', value: false }, { label: 'Bağlantıyı kes', value: true, primary: true }]))) return;
            await kasa.sync.disconnectDropbox();
            reopen();
          } }, 'Bağlantıyı kes')))
      : h('div', { class: 'setting col' },
        h('div', { class: 'sub' }, 'Bitig, Dropbox’ında sadece kendine ait “Uygulamalar/Bitig” klasörünü kullanır; diğer dosyalarını göremez.'),
        h('button', { class: 'primary', type: 'button', onclick: (e) => connectDropbox(e.currentTarget) }, 'Dropbox’a bağlan'));

  const folderBlock = h('div', { class: 'setting col' },
    h('div', { class: 'sub' }, 'Eşitleme klasörü (OneDrive, Google Drive ya da Dropbox masaüstü programının klasörü)'),
    h('div', { class: 'path' }, sy.dir),
    h('div', { class: 'group-actions' },
      h('button', { class: 'mini', type: 'button', onclick: async () => { await kasa.sync.chooseDir(); reopen(); } }, 'Değiştir'),
      h('button', { class: 'mini', type: 'button', onclick: () => kasa.sync.openDir() }, 'Klasörü aç'),
      nowBtn));

  return [
    section('Cihazlar arası eşitleme'),
    row('Eşitleme', status,
      toggle(sy.enabled, async (v) => { await kasa.sync.set({ enabled: v }); toast(v ? 'Eşitleme açıldı' : 'Eşitleme kapatıldı'); reopen(); })),
    sy.enabled && h('div', { class: 'setting col' },
      h('div', { class: 'sub' }, 'Eşitleme yeri'),
      h('div', { class: 'segmented' }, choose('dropbox', 'Dropbox'), choose('folder', 'Klasör'))),
    sy.enabled && (provider === 'dropbox' ? dropboxBlock : folderBlock),
    sy.enabled && row('Bu cihazın adı', sy.deviceName,
      h('button', { class: 'mini', type: 'button', onclick: async () => {
        let name = '';
        const ok = await formDialog({
          title: 'Cihaz adı', text: 'Diğer cihazlarda bu adla görünür.',
          fields: [{ k: 'name', label: 'Ör. Ev bilgisayarı', type: 'text' }], submitLabel: 'Kaydet',
          onSubmit: (v) => { if (!v.name.trim()) return 'Bir ad yaz.'; name = v.name; },
        });
        if (ok) { await kasa.sync.set({ deviceName: name }); reopen(); }
      } }, 'Değiştir')),
    sy.enabled && h('div', { class: 'device-list' }, ...sy.devices.map(deviceRow)),
    h('p', { class: 'muted small' }, !sy.enabled
      ? 'Açınca kasan şifreli olarak buluta da yazılır; telefonun ve diğer bilgisayarların değişiklikleri buradan birleşir.'
      : provider === 'dropbox'
        ? (others.length ? '' : 'Henüz başka cihaz yok. ') + 'Telefonda Bitig’i kurarken Dropbox’ı seç. Her cihaz kendi şifreli dosyasını yazar; Dropbox içeriği göremez.'
        : 'Klasör yolu yalnızca bilgisayarlar arasında çalışır. Telefonla eşitlemek için Dropbox’ı seç.'),
  ].filter(Boolean);
}
