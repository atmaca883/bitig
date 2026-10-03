// Telefona özel ekranlar: kurulum (buluttaki kasaya katılma), telefon ayarları ve küçük uyarlamalar.
// Masaüstü arayüz dosyalarından sonra, app.js'ten önce yüklenir; birkaç fonksiyonu telefon sürümüyle değiştirir.
'use strict';

document.body.classList.add('phone');

// ---------- kilit ekranı: kurulum yoksa kurulum, varsa ana şifre ----------
const desktopShowLock = window.showLock;

let redirectChecked = false;
window.showLock = async function (msg = '') {
  // Bulutun izin sayfasından dönüldüyse önce oturumu tamamla
  if (!redirectChecked) {
    redirectChecked = true;
    const r = await kasa.phone.finishRedirect();
    if (r.error) msg = r.error;
    else if (r.done && await kasa.vaultExists()) msg = msg || 'Bulut bağlantısı yenilendi. Ana şifrenle aç.';
  }
  const exists = await kasa.vaultExists();
  $('#setupView')?.remove();
  if (!exists) return showSetup(msg);
  await desktopShowLock(msg);
  $('#lnkRestore').hidden = true;
  $('#lockHint').textContent = 'Ana şifreni gir.';
};

// Telefonda "unuttum": kurtarma bilgisayardan yapılır
(() => {
  const old = $('#lnkForgot');
  const link = old.cloneNode(true); // masaüstü dinleyicisini bırak
  old.replaceWith(link);
  link.addEventListener('click', () => ask('Ana şifreni mi unuttun?',
    'Bilgisayardaki Bitig’de kilit ekranındaki “Ana şifremi unuttum” ile kurtarma anahtarını kullanıp yeni ana şifre belirle. Telefon yeni şifreyi eşitlemeyle otomatik alır; sonra burada yeni şifreyle açarsın.',
    [{ label: 'Tamam', value: true, primary: true }]));
})();

// Kurulum ekranlarının üstündeki logo
const brandHero = () => h('div', { class: 'brand-hero' },
  h('div', { class: 'brand-logo' }, BitigBrand.brandEl('mark')),
  h('div', { class: 'brand-name' }, 'Bitig'),
  h('div', { class: 'brand-runes', title: '“bitig” Göktürk yazısıyla: yazıt, kitap' }, BitigBrand.brandEl('word')));

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
    h('h1', null, 'Bu telefona kur'),
    h('p', { class: 'muted' }, 'Telefon, bilgisayarındaki Bitig ile bulut üzerinden eşitlenir. Veriler şifreli gider; bulut içini göremez.'),
    h('ol', { class: 'steps setup-steps' },
      h('li', null, 'Bilgisayardaki Bitig’de ', h('b', null, 'Ayarlar → Cihazlar arası eşitleme'), '’yi aç.'),
      h('li', null, 'Aşağıdan aynı bulutu seç ve hesabınla bağlan.'),
      h('li', null, 'Ana şifreni gir.')),
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
    }, d.label, !d.available() && h('small', null, d.comingSoon ? 'yakında' : 'bu adreste yok')))),
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
      h('h1', null, `${label} bağlandı`),
      h('p', { class: 'muted' }, listError || 'Ama burada henüz Bitig yok. Bilgisayardaki Bitig’de Ayarlar → Cihazlar arası eşitleme’yi açtığından ve aynı bulutun seçili olduğundan emin ol.'),
      h('button', { class: 'primary', type: 'button', onclick: () => showSetupPassword() }, 'Tekrar dene'),
      h('div', { class: 'lock-links' }, h('button', { type: 'button', class: 'link', onclick: async () => { await kasa.phone.reset(); showSetup(); } }, 'Başka bulut seç')),
    );
    return;
  }

  const input = h('input', { type: 'password', placeholder: 'Ana şifre', autocomplete: 'current-password' });
  const err = h('p', { class: 'error' }, msg);
  const btn = h('button', { class: 'primary', type: 'submit' }, 'Kasayı aç');
  setupShell(
    brandHero(),
    h('h1', null, 'Bitig bulundu'),
    h('p', { class: 'muted' }, `${label} içinde ${found} cihazın kasası var. Bilgisayardaki ana şifreni gir.`),
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        btn.disabled = true;
        btn.textContent = 'Açılıyor…';
        try {
          const res = await kasa.phone.join(input.value);
          $('#setupView')?.remove();
          acceptVault(res);
          toast('Bitig bu telefona kuruldu ✓');
        } catch (ex) {
          err.textContent = cleanErr(ex);
          input.select();
        } finally {
          btn.disabled = false;
          btn.textContent = 'Kasayı aç';
        }
      },
    }, input, btn, err),
    h('div', { class: 'lock-links' }, h('button', { type: 'button', class: 'link', onclick: async () => { await kasa.phone.reset(); showSetup(); } }, 'Başka bulut seç')),
  );
  input.focus();
}

// Kilit açılınca kurulum ekranı kalmasın
const desktopShowMain = window.showMain;
window.showMain = function () {
  $('#setupView')?.remove();
  desktopShowMain();
};

// ---------- telefon ayarları ----------
window.openSettingsSheet = async function () {
  editing = null;
  const [st, pin, sy] = await Promise.all([kasa.settings.get(), kasa.pin.status(), kasa.sync.status()]);
  const reopen = () => openSettingsSheet();
  const row = (title, sub, ...side) => h('div', { class: 'setting' },
    h('div', { class: 'body' }, h('div', { class: 'title' }, title), sub && h('div', { class: 'sub' }, sub)), ...side);
  const autoLock = h('select', { class: 'compact', onchange: async (e) => {
    autoLockMinutes = Number(e.target.value);
    await kasa.settings.set({ autoLockMinutes });
  } }, ...[[1, '1 dakika'], [5, '5 dakika'], [15, '15 dakika'], [30, '30 dakika'], [0, 'Hiç']].map(([v, l]) => h('option', { value: String(v) }, l)));
  autoLock.value = String(st.autoLockMinutes ?? 5);

  const syncStatus = sy.needsReconnect ? '⚠ Bağlantı sona erdi; yeniden bağlanman gerekiyor'
    : sy.lastError ? '⚠ ' + sy.lastError
    : sy.lastSync ? `Son eşitleme: ${fmtStamp(sy.lastSync)}${sy.pending ? ' · gönderilmeyi bekleyen değişiklik var' : ''}` : 'Eşitleniyor…';

  $('#sheetForm').replaceChildren(
    section('Güvenlik'),
    row('Hızlı kilit PIN’i', pin.hasPin ? '✓ Var · kilitlenince 4 haneli PIN istenir' : 'Yok · kilitlenince ana şifre istenir',
      ...(pin.hasPin
        ? [h('button', { class: 'mini', type: 'button', onclick: setPinFlow }, 'Değiştir'), h('button', { class: 'mini', type: 'button', onclick: removePinFlow }, 'Kaldır')]
        : [h('button', { class: 'mini primary-mini', type: 'button', onclick: setPinFlow }, 'PIN belirle')])),
    row('Otomatik kilit', 'Uygulamadan çıkınca da bu süre sayılır', autoLock),
    h('p', { class: 'muted small' }, 'PIN bu telefona özeldir. Ana şifre, kurtarma anahtarı ve yedekler bilgisayardaki Bitig’den yönetilir.'),

    section('Eşitleme'),
    row((sy.provider || 'Bulut') + (sy.account ? ' · ' + sy.account : ''), syncStatus,
      sy.needsReconnect
        ? h('button', { class: 'mini primary-mini', type: 'button', onclick: async () => { await flush(); await kasa.phone.reconnect(); } }, 'Yeniden bağlan')
        : h('button', { class: 'mini primary-mini', type: 'button', onclick: async () => { await flush(); await kasa.sync.now(); toast('Eşitlendi'); reopen(); } }, 'Şimdi eşitle')),
    row('Bu cihazın adı', sy.deviceName,
      h('button', { class: 'mini', type: 'button', onclick: async () => {
        let name = '';
        const ok = await formDialog({
          title: 'Cihaz adı', text: 'Diğer cihazlarda bu adla görünür.',
          fields: [{ k: 'name', label: 'Ör. iPhone’um', type: 'text' }], submitLabel: 'Kaydet',
          onSubmit: (v) => { if (!v.name.trim()) return 'Bir ad yaz.'; name = v.name; },
        });
        if (ok) { await kasa.sync.set({ deviceName: name }); reopen(); }
      } }, 'Değiştir')),
    h('div', { class: 'device-list' }, ...sy.devices.map((d) => h('div', { class: 'item device-row' + (d.error ? ' bad' : '') },
      h('div', { class: 'ico' }, d.platform === 'ios' || d.platform === 'android' ? '📱' : '💻'),
      h('div', { class: 'body' },
        h('div', { class: 'title' }, d.name + (d.self ? ' (bu cihaz)' : '')),
        h('div', { class: 'sub' }, d.error || (d.savedAt ? 'Son kayıt: ' + fmtStamp(d.savedAt) : 'Henüz kaydetmedi')))))),

    section('Bu telefon'),
    row('Bitig’i bu telefondan kaldır', 'Bu telefondaki şifreli kopya silinir. Bilgisayardaki ve buluttaki kasan etkilenmez.',
      h('button', { class: 'mini', type: 'button', onclick: async () => {
        if (!(await ask('Bu telefondan kaldırılsın mı?', 'Yeniden kurmak için bulut hesabın ve ana şifren gerekecek.',
          [{ label: 'Vazgeç', value: false }, { label: 'Kaldır', value: true, primary: true }]))) return;
        await flush();
        await kasa.sync.now();
        await kasa.phone.reset();
        $('#sheet').hidden = true;
        showLock('Bitig bu telefondan kaldırıldı.');
      } }, 'Kaldır')),
  );
  $('#sheetTitle').textContent = '⚙ Ayarlar';
  $('#sheet').classList.add('custom');
  $('#sheet').hidden = false;
};

// ---------- uygulamaya geri dönülünce otomatik kilit ----------
// Telefon uygulamayı arka planda dondurabilir; dönüşte geçen süreye bak.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && db && autoLockMinutes > 0
    && Date.now() - lastActivity > autoLockMinutes * 60_000) {
    quickLock(`${autoLockMinutes} dakikadan uzun süre uzak kaldığın için kilitlendi.`);
  }
});

// ---------- çevrimdışı çalışma (servis çalışanı) ----------
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
