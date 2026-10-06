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

// Telefonda "unuttum": kurtarma bilgisayardan yapılır
(() => {
  const old = $('#lnkForgot');
  const link = old.cloneNode(true); // masaüstü dinleyicisini bırak
  old.replaceWith(link);
  link.addEventListener('click', () => ask(_t('Ana şifreni mi unuttun?'),
    _t('Bilgisayardaki Bitig’de kilit ekranındaki “Ana şifremi unuttum” ile kurtarma anahtarını kullanıp yeni ana şifre belirle. Telefon yeni şifreyi eşitlemeyle otomatik alır; sonra burada yeni şifreyle açarsın.'),
    [{ label: _t('Tamam'), value: true, primary: true }]));
})();

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

async function showSetup(msg = '') {
  const driveId = kasa.phone.driveId();
  if (driveId && kasa.phone.isDriveConnected()) return showSetupPassword(msg);

  // Test klasörü yalnızca geliştirme bilgisayarında görünür
  const drives = kasa.phone.drives().filter((d) => d.available() || d.comingSoon);
  setupShell(
    brandHero(),
    h('h1', null, _t('Bu telefona kur')),
    h('p', { class: 'muted' }, _t('Telefon, bilgisayarındaki Bitig ile bulut üzerinden eşitlenir. Veriler şifreli gider; bulut içini göremez.')),
    h('ol', { class: 'steps setup-steps' },
      h('li', null, _t('Bilgisayardaki Bitig’de '), h('b', null, _t('Ayarlar → Cihazlar arası eşitleme')), _t('’yi aç.')),
      h('li', null, _t('Aşağıdan aynı bulutu seç ve hesabınla bağlan.')),
      h('li', null, _t('Ana şifreni gir.'))),
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

async function showSetupPassword(msg = '') {
  const label = kasa.phone.drives().find((d) => d.id === kasa.phone.driveId())?.label || 'Bulut';
  let found = 0;
  let listError = '';
  try { found = await kasa.phone.vaultFilesFound(); } catch (e) { listError = cleanErr(e); }

  if (!found) {
    setupShell(
      brandHero(),
      h('h1', null, _t("{0} bağlandı", label)),
      h('p', { class: 'muted' }, listError || _t('Ama burada henüz Bitig yok. Bilgisayardaki Bitig’de Ayarlar → Cihazlar arası eşitleme’yi açtığından ve aynı bulutun seçili olduğundan emin ol.')),
      h('button', { class: 'primary', type: 'button', onclick: () => showSetupPassword() }, _t('Tekrar dene')),
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
    h('div', { class: 'lock-links' }, h('button', { type: 'button', class: 'link', onclick: async () => { await kasa.phone.reset(); showSetup(); } }, _t('Başka bulut seç'))),
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
    h('p', { class: 'muted small' }, _t('PIN bu telefona özeldir. Ana şifre, kurtarma anahtarı ve yedekler bilgisayardaki Bitig’den yönetilir.')),

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
