// Telefona özel ekranlar: kurulum (buluttaki kasaya katılma), telefon ayarları ve küçük uyarlamalar.
// Masaüstü arayüz dosyalarından sonra, app.js'ten önce yüklenir; birkaç fonksiyonu telefon sürümüyle değiştirir.
'use strict';

document.body.classList.add('phone');
// Telefonda klavye kısayolu yok
$('#search').placeholder = _t('Her şeyde ara…');

// ---------- kilit ekranı: kurulum yoksa kurulum, varsa ana şifre ----------
const desktopShowLock = window.showLock;

let redirectChecked = false;
window.showLock = async function (msg = '') {
  // Bulutun izin sayfasından dönüldüyse önce oturumu tamamla
  if (!redirectChecked) {
    redirectChecked = true;
    const r = await kasa.phone.finishRedirect();
    if (r.error) msg = r.error;
    else if (r.done && !r.silent && await kasa.vaultExists()) msg = msg || _t('Bulut bağlantısı yenilendi. Ana şifrenle aç.');
    // Oturumu kısa ömürlü bulutlarda (OneDrive) günde bir kez sessiz yenileme
    if (!r.done && !r.silent && !r.error && kasa.phone.renewDriveIfNeeded()) return;
  }
  const exists = await kasa.vaultExists();
  $('#setupView')?.remove();
  if (!exists) return showSetup(msg);
  await desktopShowLock(msg);
  $('#lnkRestore').hidden = true;
  $('#lockHint').textContent = _t('Ana şifreni gir.');
  // Face ID kuruluysa büyük düğme (iPhone Face ID'yi yalnızca dokunuşla açar; kendiliğinden başlatılmaz)
  const bio = await kasa.bio.status();
  // Kilit ekranı aynı anda iki kez çizilebilir (ör. otomatik kilit + uygulamaya dönüş): beklemeden SONRA temizle ki tek düğme kalsın
  document.querySelectorAll('#bioUnlock').forEach((el) => el.remove());
  if (bio.enabled) {
    const b = h('button', { id: 'bioUnlock', class: 'primary bio-btn', type: 'button', onclick: () => bioUnlock(b) }, _t('{0} ile aç', bio.label));
    $('#lockForm').before(b);
    $('#lockHint').textContent = _t('{0} ile aç ya da ana şifreni gir.', bio.label);
    $('#pw1').blur(); // klavye açılıp düğmeyi örtmesin
  }
};

function bioUnlock(btn) {
  $('#lockError').textContent = '';
  btn.disabled = true;
  kasa.bio.unlock() // dokunuşun içinde, beklemeden çağrılır
    .then((res) => acceptVault(res))
    .catch((e) => { if (!e?.cancelled) $('#lockError').textContent = cleanErr(e); })
    .finally(() => { btn.disabled = false; });
}

// Telefonda "Ana şifremi unuttum" kilit ekranının kendi akışını (kurtarma anahtarı + yeni şifre) kullanır

// Kurulum ekranlarının üstündeki logo
const brandHero = () => h('div', { class: 'brand-hero' },
  h('div', { class: 'brand-logo' }, BitigBrand.brandEl('mark')),
  h('div', { class: 'brand-name' }, 'Bitig'),
  h('div', { class: 'brand-runes', title: _t('“bitig” Göktürk yazısıyla: yazıt, kitap') }, BitigBrand.brandEl('word')));

function setupShell(...children) {
  clearSession();
  $('#lockView').hidden = true;
  $('#pinView').hidden = true;
  const view = h('div', { id: 'setupView', class: 'lock' }, h('div', { class: 'lock-card setup-card' }, ...children));
  $('#setupView')?.remove();
  $('#lockView').after(view);
  return view;
}

// Ana ekrandan mı açıldı? (iPhone'da Safari ile ana ekrandaki uygulama ayrı hafıza kullanır: kurulum orada yapılmalı)
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const UA = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
const isAndroid = /Android/.test(UA);
let installEvent = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; if ($('#installBtn')) $('#installBtn').hidden = false; });
addEventListener('appinstalled', () => { installEvent = null; const m = $('#installMsg'); if (m) m.textContent = _t('✓ Yüklendi. Şimdi ana ekrandaki Bitig simgesinden aç.'); });

function showInstall() {
  const iosSafari = isIOS && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(UA);
  const steps = isIOS
    ? (iosSafari
      ? [_t('Alttaki Paylaş düğmesine dokun (yukarı ok çıkan kare).'), _t('Listeden “Ana Ekrana Ekle”yi seç.'), _t('“Web Uygulaması olarak aç” açık kalsın, “Ekle”ye dokun.'), _t('Ana ekrandaki Bitig simgesinden aç.')]
      : [_t('iPhone’da ana ekrana ekleme Safari’den yapılır. Bu sayfayı Safari’de aç.')])
    : [_t('Sağ üstteki ⋮ menüsüne dokun.'), _t('“Ana ekrana ekle” ya da “Uygulamayı yükle”yi seç.'), _t('Ana ekrandaki Bitig simgesinden aç.')];
  setupShell(
    brandHero(),
    h('h1', null, _t('Önce ana ekrana ekle')),
    h('p', { class: 'muted' }, _t('Bitig telefonda uygulama gibi çalışır: ana ekrandan açılır, internetsiz de açılır. Kurulumu ana ekrandaki Bitig’de yap.')),
    isAndroid && h('button', { id: 'installBtn', class: 'primary', type: 'button', hidden: !installEvent,
      onclick: async () => { if (!installEvent) return; installEvent.prompt(); await installEvent.userChoice.catch(() => {}); } }, _t('Bitig’i yükle')),
    h('ol', { class: 'steps setup-steps' }, ...steps.map((s) => h('li', null, s))),
    isIOS && !iosSafari && h('button', { class: 'primary', type: 'button', onclick: () => { kasa.copy(location.href); toast(_t('Adres kopyalandı; Safari’ye yapıştır')); } }, _t('Adresi kopyala')),
    h('p', { id: 'installMsg', class: 'muted small' }),
    h('div', { class: 'lock-links' }, h('button', { type: 'button', class: 'link', onclick: () => { sessionStorage.setItem('bitig.browserOk', '1'); showSetup(); } }, _t('Tarayıcıda devam et'))),
  );
}

async function showSetup(msg = '') {
  const driveId = kasa.phone.driveId();
  if (driveId && kasa.phone.isDriveConnected()) return showSetupPassword(msg);
  // Telefonda tarayıcıdan açıldıysa önce ana ekrana ekletelim (geliştirme bilgisayarında atla)
  const dev = ['localhost', '127.0.0.1'].includes(location.hostname);
  if ((isIOS || isAndroid) && !isStandalone() && !dev && !sessionStorage.getItem('bitig.browserOk')) return showInstall();

  // Test klasörü yalnızca geliştirme bilgisayarında görünür
  const drives = kasa.phone.drives().filter((d) => d.available() || d.comingSoon);
  setupShell(
    brandHero(),
    h('h1', null, _t('Bu telefona kur')),
    h('p', { class: 'muted' }, _t('Bitig verilerini senin bulutunda (Dropbox ya da OneDrive) şifreli olarak saklar; bulut içini göremez. Bilgisayardaki Bitig de aynı buluttan eşitlenir.')),
    h('ol', { class: 'steps setup-steps' },
      h('li', null, _t('Aşağıdan bir bulut seç ve hesabınla bağlan.')),
      h('li', null, _t('Bitig zaten varsa ana şifrenle aç; yoksa yeni oluştur.'))),
    h('div', { class: 'drive-list' }, ...drives.map((d) => h('button', {
      type: 'button',
      class: 'drive-btn' + (d.available() ? '' : ' soon'),
      disabled: !d.available(),
      onclick: async () => {
        $('#setupError').textContent = '';
        try {
          await kasa.phone.connectDrive(d.id); // bazı bulutlar burada oturum açma sayfasına yönlendirir
          showSetupPassword();
        } catch (e) {
          $('#setupError').textContent = cleanErr(e);
        }
      },
    }, d.label, !d.available() && h('small', null, d.comingSoon ? _t('yakında') : 'bu adreste yok')))),
    h('p', { id: 'setupError', class: 'error' }, msg),
  );
}

// Telefonda yeni kasa: ana şifre (iki kez) → kurtarma anahtarı gösterilir
function showCreateVault(msg = '') {
  const p1 = h('input', { type: 'password', placeholder: _t('Ana şifre'), autocomplete: 'new-password' });
  const p2 = h('input', { type: 'password', placeholder: _t('Ana şifre (tekrar)'), autocomplete: 'new-password' });
  const err = h('p', { class: 'error' }, msg);
  const btn = h('button', { class: 'primary', type: 'submit' }, _t('Kasayı oluştur'));
  setupShell(
    brandHero(),
    h('h1', null, _t('Yeni Bitig')),
    h('p', { class: 'muted' }, _t('Tüm verilerin bu ana şifreyle şifrelenir. Ana şifre hiçbir yere kaydedilmez; unutursan birazdan vereceğim kurtarma anahtarıyla açabilirsin.')),
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        if (p1.value.length < 8) { err.textContent = _t('Ana şifre en az 8 karakter olmalı.'); return; }
        if (p1.value !== p2.value) { err.textContent = _t('Şifreler aynı değil.'); return; }
        btn.disabled = true;
        btn.textContent = _t('Oluşturuluyor…');
        try {
          const res = await kasa.phone.create(p1.value);
          $('#setupView')?.remove();
          acceptVault(res); // kurtarma anahtarını gösterir
          toast(_t('Bitig bu telefonda oluşturuldu ✓'));
        } catch (ex) {
          err.textContent = cleanErr(ex);
        } finally {
          btn.disabled = false;
          btn.textContent = _t('Kasayı oluştur');
        }
      },
    }, p1, p2, btn, err),
    h('div', { class: 'lock-links' }, h('button', { type: 'button', class: 'link', onclick: () => showSetupPassword() }, _t('Geri'))),
  );
  p1.focus();
}

async function showSetupPassword(msg = '') {
  const label = kasa.phone.drives().find((d) => d.id === kasa.phone.driveId())?.label || 'Bulut';
  let found = 0;
  let listError = '';
  try { found = await kasa.phone.vaultFilesFound(); } catch (e) { listError = cleanErr(e); }

  if (!found) {
    setupShell(
      brandHero(),
      h('h1', null, _t("{0} bağlandı", label)),
      h('p', { class: 'muted' }, listError || _t('Burada henüz Bitig yok. Yeni başlıyorsan şimdi oluştur. Bilgisayarda zaten kullanıyorsan orada Ayarlar → Cihazlar arası eşitleme’yi aç ve aynı bulutu seç, sonra “Tekrar dene”.')),
      !listError && h('button', { class: 'primary', type: 'button', onclick: () => showCreateVault() }, _t('Yeni Bitig oluştur')),
      h('button', { class: listError ? 'primary' : '', type: 'button', onclick: () => showSetupPassword() }, _t('Tekrar dene')),
      h('div', { class: 'lock-links' }, h('button', { type: 'button', class: 'link', onclick: async () => { await kasa.phone.reset(); showSetup(); } }, _t('Başka bulut seç'))),
    );
    return;
  }

  const input = h('input', { type: 'password', placeholder: _t('Ana şifre'), autocomplete: 'current-password' });
  const err = h('p', { class: 'error' }, msg);
  const btn = h('button', { class: 'primary', type: 'submit' }, _t('Kasayı aç'));
  setupShell(
    brandHero(),
    h('h1', null, _t('Bitig bulundu')),
    h('p', { class: 'muted' }, _t("{0} içinde {1} cihazın kasası var. Bilgisayardaki ana şifreni gir.", label, found)),
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        btn.disabled = true;
        btn.textContent = _t('Açılıyor…');
        try {
          const res = await kasa.phone.join(input.value);
          $('#setupView')?.remove();
          acceptVault(res);
          toast(_t('Bitig bu telefona kuruldu ✓'));
          kasa.bio.status().then((b) => {
            if (b.available && !b.enabled) addPrompt({
              key: 'bio', icon: '🔐', title: _t('{0} ile açmak ister misin?', b.label),
              sub: _t('Her seferinde ana şifre yazmadan, {0} ile açılır.', b.label),
              actions: [{ label: _t('Kur'), primary: true, fn: () => openSettingsSheet() }, { label: _t('Sonra') }],
            });
          });
        } catch (ex) {
          err.textContent = cleanErr(ex);
          input.select();
        } finally {
          btn.disabled = false;
          btn.textContent = _t('Kasayı aç');
        }
      },
    }, input, btn, err),
    h('div', { class: 'lock-links' },
      h('button', { type: 'button', class: 'link', onclick: () => $('#lnkForgot').click() }, _t('Ana şifremi unuttum')),
      h('button', { type: 'button', class: 'link', onclick: async () => { await kasa.phone.reset(); showSetup(); } }, _t('Başka bulut seç'))),
  );
  input.focus();
}

// Kilit açılınca kurulum ekranı kalmasın
const desktopShowMain = window.showMain;
window.showMain = function () {
  $('#setupView')?.remove();
  desktopShowMain();
};

// ---------- Face ID / parmak izi ----------
// Kurulum adımları ayrı dokunuşlarla: şifre → "Şimdi kur" → (gerekirse) "Onayla".
let bioStep = '';
function bioRow(bio, row, reopen) {
  const L = bio.label;
  const run = (p) => p
    .then((r) => {
      if (r?.needConfirm) { bioStep = 'confirm'; toast(_t('Son adım: bir kez daha onayla')); }
      else { bioStep = ''; toast(_t('✓ {0} ile açma kuruldu', L)); }
      reopen();
    })
    .catch((e) => { if (!e?.cancelled) toast(cleanErr(e)); if (bioStep === 'confirm') bioStep = ''; reopen(); });
  if (bio.enabled) {
    return row(_t('{0} ile aç', L), _t('✓ Açık · Bitig kilit ekranında {0} ile açılır', L),
      h('button', { class: 'mini', type: 'button', onclick: async () => {
        if (!(await ask(_t('{0} ile açma kapatılsın mı?', L), _t('Bundan sonra Bitig’i ana şifrenle açarsın. İstediğin zaman yeniden kurabilirsin.'),
          [{ label: _t('Vazgeç'), value: false }, { label: _t('Kaldır'), value: true, primary: true }]))) return;
        await kasa.bio.disable();
        toast(_t('{0} ile açma kapatıldı', L));
        reopen();
      } }, _t('Kaldır')));
  }
  if (bioStep === 'ready') {
    return row(_t('{0} ile aç', L), _t('Şifre doğru. Şimdi {0} onayını ver.', L),
      h('button', { class: 'mini primary-mini', type: 'button', onclick: () => run(kasa.bio.enroll()) }, _t('Şimdi kur')));
  }
  if (bioStep === 'confirm') {
    return row(_t('{0} ile aç', L), _t('Son adım: bir kez daha onayla.'),
      h('button', { class: 'mini primary-mini', type: 'button', onclick: () => run(kasa.bio.confirm()) }, _t('Onayla')));
  }
  return row(_t('{0} ile aç', L), _t('Kapalı · Bitig’i ana şifre yazmadan, {0} ile aç', L),
    h('button', { class: 'mini primary-mini', type: 'button', onclick: async () => {
      const ok = await formDialog({
        title: _t('{0} ile aç', L),
        text: _t('Kurmak için önce ana şifreni gir. Anahtar yalnızca bu telefonda saklanır; ana şifren her zaman çalışmaya devam eder.'),
        fields: [{ k: 'pw', label: _t('Ana şifre') }], submitLabel: _t('Devam'),
        onSubmit: async (v) => { await kasa.bio.verify(v.pw); },
      });
      if (ok) { bioStep = 'ready'; reopen(); }
    } }, _t('Kur')));
}

// ---------- telefon ayarları ----------
window.openSettingsSheet = async function () {
  editing = null;
  const [st, pin, sy, bio] = await Promise.all([kasa.settings.get(), kasa.pin.status(), kasa.sync.status(), kasa.bio.status()]);
  const reopen = () => openSettingsSheet();
  const row = (title, sub, ...side) => h('div', { class: 'setting' },
    h('div', { class: 'body' }, h('div', { class: 'title' }, title), sub && h('div', { class: 'sub' }, sub)), ...side);
  const autoLock = h('select', { class: 'compact', onchange: async (e) => {
    autoLockMinutes = Number(e.target.value);
    await kasa.settings.set({ autoLockMinutes });
  } }, ...[[1, _t('1 dakika')], [5, _t('5 dakika')], [15, _t('15 dakika')], [30, _t('30 dakika')], [0, _t('Hiç')]].map(([v, l]) => h('option', { value: String(v) }, l)));
  autoLock.value = String(st.autoLockMinutes ?? 5);

  const syncStatus = sy.needsReconnect ? _t('⚠ Bağlantı sona erdi; yeniden bağlanman gerekiyor')
    : sy.lastError ? '⚠ ' + sy.lastError
    : sy.lastSync ? _t("Son eşitleme: {0}{1}", fmtStamp(sy.lastSync), sy.pending ? _t(' · gönderilmeyi bekleyen değişiklik var') : '') : _t('Eşitleniyor…');

  $('#sheetForm').replaceChildren(
    section(_t('Güvenlik')),
    bio.available && bioRow(bio, row, reopen),
    row(_t('Hızlı kilit PIN’i'), bio.enabled ? _t('{0} açıkken kullanılmaz', bio.label) : pin.hasPin ? _t('✓ Var · kilitlenince 4 haneli PIN istenir') : _t('Yok · kilitlenince ana şifre istenir'),
      ...(pin.hasPin
        ? [h('button', { class: 'mini', type: 'button', onclick: setPinFlow }, _t('Değiştir')), h('button', { class: 'mini', type: 'button', onclick: removePinFlow }, _t('Kaldır'))]
        : [h('button', { class: bio.enabled ? 'mini' : 'mini primary-mini', type: 'button', onclick: setPinFlow }, _t('PIN belirle'))])),
    row(_t('Otomatik kilit'), _t('Uygulamadan çıkınca da bu süre sayılır'), autoLock),
    row(_t('Ana şifre'), _t('Değişiklik diğer cihazlara da eşitlenir'),
      h('button', { class: 'mini', type: 'button', onclick: changePasswordFlow }, _t('Değiştir'))),
    row(_t('Kurtarma anahtarı'), _t('Ana şifreni unutursan kasayı bununla açarsın'),
      h('button', { class: 'mini', type: 'button', onclick: createRecoveryFlow }, _t('Yenisini oluştur'))),
    h('p', { class: 'muted small' }, _t('PIN ve Face ID bu telefona özeldir.')),

    section(_t('Eşitleme')),
    row((sy.provider || 'Bulut') + (sy.account ? ' · ' + sy.account : ''), syncStatus,
      sy.needsReconnect
        ? h('button', { class: 'mini primary-mini', type: 'button', onclick: async () => { await flush(); await kasa.phone.reconnect(); } }, _t('Yeniden bağlan'))
        : h('button', { class: 'mini primary-mini', type: 'button', onclick: async () => { await flush(); await kasa.sync.now(); toast(_t('Eşitlendi')); reopen(); } }, _t('Şimdi eşitle'))),
    row(_t('Bu cihazın adı'), sy.deviceName,
      h('button', { class: 'mini', type: 'button', onclick: async () => {
        let name = '';
        const ok = await formDialog({
          title: _t('Cihaz adı'), text: _t('Diğer cihazlarda bu adla görünür.'),
          fields: [{ k: 'name', label: _t('Ör. iPhone’um'), type: 'text' }], submitLabel: _t('Kaydet'),
          onSubmit: (v) => { if (!v.name.trim()) return _t('Bir ad yaz.'); name = v.name; },
        });
        if (ok) { await kasa.sync.set({ deviceName: name }); reopen(); }
      } }, _t('Değiştir'))),
    h('div', { class: 'device-list' }, ...sy.devices.map((d) => h('div', { class: 'item device-row' + (d.error ? ' bad' : '') },
      h('div', { class: 'ico' }, d.platform === 'ios' || d.platform === 'android' ? '📱' : '💻'),
      h('div', { class: 'body' },
        h('div', { class: 'title' }, d.name + (d.self ? _t(' (bu cihaz)') : '')),
        h('div', { class: 'sub' }, d.error || (d.savedAt ? _t('Son kayıt: ') + fmtStamp(d.savedAt) : _t('Henüz kaydetmedi'))))))),

    section(_t('Verileri taşı')),
    importRow(row),
    exportRow(row),

    section(_t('Görünüm ve dil')),
    themeRow(row),
    languageRow(row),

    section(_t('Bu telefon')),
    row(_t('Bitig’i bu telefondan kaldır'), _t('Bu telefondaki şifreli kopya silinir. Bilgisayardaki ve buluttaki kasan etkilenmez.'),
      h('button', { class: 'mini', type: 'button', onclick: async () => {
        if (!(await ask(_t('Bu telefondan kaldırılsın mı?'), _t('Yeniden kurmak için bulut hesabın ve ana şifren gerekecek.'),
          [{ label: _t('Vazgeç'), value: false }, { label: _t('Kaldır'), value: true, primary: true }]))) return;
        await flush();
        await kasa.sync.now();
        await kasa.phone.reset();
        $('#sheet').hidden = true;
        showLock(_t('Bitig bu telefondan kaldırıldı.'));
      } }, _t('Kaldır'))),
  );
  $('#sheetTitle').textContent = _t('⚙ Ayarlar');
  $('#sheet').classList.add('custom');
  $('#sheet').hidden = false;
};

// ---------- uygulamaya geri dönülünce otomatik kilit ----------
// Telefon uygulamayı arka planda dondurabilir; dönüşte geçen süreye bak.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && db && autoLockMinutes > 0
    && Date.now() - lastActivity > autoLockMinutes * 60_000) {
    quickLock(_t("{0} dakikadan uzun süre uzak kaldığın için kilitlendi.", autoLockMinutes));
  }
});

// ---------- çevrimdışı çalışma (servis çalışanı) ----------
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
