// Kilit ekranı, kasa oluşturma/açma, kurtarma ve otomatik kilit.
'use strict';

// ---------- kilit ----------
async function showLock(msg = '') {
  db = null;
  editing = null;
  vaultExists = await kasa.vaultExists();
  $('#lockView').hidden = false;
  $('#pinView').hidden = true;
  $('#mainView').hidden = true;
  $('#sheet').hidden = true;
  $('#btnLock').hidden = true;
  $('#btnBrowser').hidden = true;
  $('#btnSettings').hidden = true;
  $('#lnkForgot').hidden = !vaultExists;
  $('#lnkJoin').hidden = vaultExists || !kasa.join; // telefonda kurulum ekranı bunu kendisi sunar
  $('#prompts').replaceChildren();   // öneri kartları şifre içerebilir; kilitte temizle
  closeDialog(null);
  $('#lockTitle').textContent = vaultExists ? _t('Tekrar hoş geldin') : _t('Kasanı oluştur');
  $('#lockHint').textContent = vaultExists
    ? _t('Devam etmek için ana şifreni gir.')
    : _t('Tüm verilerin bu ana şifreyle şifrelenip bu bilgisayarda saklanacak.');
  $('#pw2').hidden = vaultExists;
  $('#lockWarn').hidden = vaultExists;
  $('#lockSubmit').textContent = vaultExists ? _t('Kilidi aç') : _t('Kasayı oluştur');
  $('#pw1').value = '';
  $('#pw2').value = '';
  $('#lockError').textContent = msg;
  $('#pw1').focus();
  if (vaultExists && kasa.hello) {
    const st = await kasa.hello.status().catch(() => null);
    // Kilit ekranı aynı anda iki kez çizilebilir: beklemeden sonra temizle ki tek düğme kalsın
    document.querySelectorAll('#helloUnlock').forEach((el) => el.remove());
    if (st?.enabled && !$('#lockView').hidden) {
      const b = h('button', { id: 'helloUnlock', class: 'primary bio-btn', type: 'button', onclick: () => helloUnlock(b) }, _t('{0} ile aç', st.label));
      $('#lockForm').before(b);
      $('#lockHint').textContent = _t('{0} ile aç ya da ana şifreni gir.', st.label);
    }
  }
}

async function helloUnlock(btn) {
  const label = btn.textContent;
  $('#lockError').textContent = '';
  btn.disabled = true;
  btn.textContent = _t('Windows Hello bekleniyor…');
  try {
    acceptVault(await kasa.hello.unlock());
  } catch (e) {
    $('#lockError').textContent = cleanErr(e);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

$('#lockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = $('#pw1').value;
  const btn = $('#lockSubmit');
  let res;
  $('#lockError').textContent = '';
  try {
    if (!vaultExists) {
      if (pw.length < 8) throw new Error(_t('Ana şifre en az 8 karakter olmalı.'));
      if (pw !== $('#pw2').value) throw new Error(_t('Şifreler aynı değil.'));
    }
    btn.disabled = true;
    res = vaultExists ? await kasa.unlock(pw) : await kasa.createVault(pw);
  } catch (err) {
    $('#lockError').textContent = cleanErr(err);
    $('#pw1').select();
    return;
  } finally {
    btn.disabled = false;
  }
  acceptVault(res);
});

function acceptVault(res) {
  db = res.data;
  for (const k of ['projects', 'passwords', 'notes', 'tasks', 'trash']) db[k] ||= [];
  if (purgeTrash()) persist(); // 30 günü geçenler kalıcı silinir
  showMain();
  if (res.recoveryKey) {
    showRecoveryKey(res.recoveryKey, { first: true });
    addPrompt({
      key: 'import', icon: '📥', title: _t('Şifrelerini başka yerden aktar'),
      sub: _t('Chrome, Edge, Safari, Bitwarden, 1Password… şifrelerini tek seferde Bitig’e al.'),
      actions: [{ label: _t('İçe aktar'), primary: true, fn: () => importFlow() }, { label: _t('Nasıl?'), fn: () => importHelp() }, { label: _t('Sonra') }],
    });
  } else if (!res.hasRecovery) {
    addPrompt({
      key: 'recovery', icon: '🛟', title: _t('Kurtarma anahtarın yok'),
      sub: _t('Ana şifreni unutursan kasayı açmanın tek yolu bu. Bir dakikanı alır.'),
      actions: [{ label: _t('Şimdi oluştur'), primary: true, fn: createRecoveryFlow }, { label: 'Sonra' }],
    });
  }
}

$('#lnkForgot').addEventListener('click', async () => {
  let res = null;
  const ok = await formDialog({
    title: _t('Ana şifremi unuttum'),
    text: _t('Bitig oluşturulurken verilen kurtarma anahtarını ve yeni ana şifreni gir.'),
    fields: [
      { k: 'key', label: _t('Kurtarma anahtarı (XXXX-XXXX-…)'), type: 'text', mono: true },
      { k: 'n1', label: _t('Yeni ana şifre') },
      { k: 'n2', label: _t('Yeni ana şifre (tekrar)') },
    ],
    submitLabel: _t('Kasayı aç'),
    onSubmit: async (v) => {
      if (v.n1.length < 8) return _t('Ana şifre en az 8 karakter olmalı.');
      if (v.n1 !== v.n2) return _t('Yeni şifreler aynı değil.');
      res = await kasa.recover(v.key, v.n1);
    },
  });
  if (ok && res) {
    acceptVault(res);
    toast(_t('Bitig açıldı, yeni ana şifren kaydedildi'));
  }
});

// Telefonda ya da başka bilgisayarda zaten Bitig varsa: aynı yerden (bulut / klasör) kasaya katıl
$('#lnkJoin').addEventListener('click', async () => {
  const st = await kasa.sync.status();
  const clouds = Object.entries(st.clouds || {}).filter(([, c]) => c.available);
  const where = await ask(_t('Başka cihazdaki Bitig’e katıl'),
    _t('Telefonda ya da başka bir bilgisayarda Bitig kullanıyorsan, orada seçili olan yeri seç (o cihazda eşitleme açık olmalı). Sonra ana şifrenle kasana katılırsın.'),
    [{ label: _t('Vazgeç'), value: null }, { label: _t('Klasör'), value: 'folder' },
      ...clouds.map(([id, c], i) => ({ label: c.label, value: id, primary: i === clouds.length - 1 }))]);
  if (!where) return;
  $('#lockError').textContent = '';
  let r;
  try {
    if (where !== 'folder') toast(_t('Tarayıcıda {0} açıldı; izin verince buraya döner', st.clouds[where].label));
    r = await kasa.join.start(where);
  } catch (e) {
    $('#lockError').textContent = cleanErr(e);
    return;
  }
  if (!r) return;
  if (!r.found) {
    $('#lockError').textContent = _t('Orada Bitig bulunamadı. Diğer cihazda eşitlemenin açık ve aynı yerin seçili olduğundan emin ol.');
    return;
  }
  let res = null;
  const ok = await formDialog({
    title: _t('Bitig bulundu'),
    text: _t('{0} içinde {1} cihazın kasası var. Ana şifreni gir.', r.where, r.found),
    fields: [{ k: 'pw', label: _t('Ana şifre') }], submitLabel: _t('Kasayı aç'),
    onSubmit: async (v) => { res = await kasa.join.finish(v.pw); },
  });
  if (ok && res) {
    acceptVault(res);
    toast(_t('Bitig bu bilgisayara kuruldu ✓'));
  }
});

$('#lnkRestore').addEventListener('click', async () => {
  if (vaultExists && !(await ask(_t('Yedekten geri yükle'),
    _t('Şu anki kasa silinmez, “vault-onceki-…” adıyla saklanır. Yüklenen yedeği, o yedeğin ana şifresiyle açacaksın.'),
    [{ label: _t('Vazgeç'), value: false }, { label: _t('Yedek seç'), value: true, primary: true }]))) return;
  try {
    if (await kasa.restore()) showLock(_t('Yedek yüklendi. Bu yedeğin ana şifresiyle aç.'));
  } catch (e) {
    $('#lockError').textContent = cleanErr(e);
  }
});

// Yeni sürüm hazırsa (Windows) ya da çıktıysa (Mac) üstte kart göster
function updatePrompt(u) {
  if (!db || !u || (u.state !== 'ready' && u.state !== 'available')) return;
  const ready = u.state === 'ready';
  addPrompt({
    key: 'update', icon: '⬆️',
    title: ready ? _t('Bitig {0} hazır', u.version) : _t('Bitig {0} çıktı', u.version),
    sub: ready ? _t('Yeniden başlatınca kurulur; verilerin olduğu gibi kalır.') : _t('İndirme sayfasından yeni sürümü indirip kurabilirsin.'),
    actions: [{ label: ready ? _t('Şimdi yeniden başlat') : _t('İndir'), primary: true, fn: () => installUpdate() }, { label: _t('Sonra') }],
  });
}
kasa.onUpdate?.((u) => {
  updatePrompt(u);
  // Ayarlar açıksa güncelleme satırı canlı kalsın: indirirken yüzde, bitince (hazır/güncel/hata) düğmeyle birlikte yenile
  const r = document.querySelector('#sheetForm [data-update-row]');
  if (!r || $('#sheet').hidden) return;
  if (u.state === 'downloading' || u.state === 'checking') {
    const s = r.querySelector('.sub');
    if (s) s.textContent = updateText(u);
  } else {
    const top = $('#sheetForm').scrollTop;
    openSettingsSheet().then(() => { $('#sheetForm').scrollTop = top; });
  }
});

function showMain() {
  $('#lockView').hidden = true;
  $('#pinView').hidden = true;
  $('#mainView').hidden = false;
  $('#btnLock').hidden = false;
  $('#btnBrowser').hidden = false;
  $('#btnSettings').hidden = false;
  lastActivity = Date.now();
  render();
  pushReminders();
  updateBadge();
  if (pendingReminder) { showBanner(pendingReminder); pendingReminder = null; }
  kasa.bridge.pending().then((list) => list.forEach(handleCapture));
  kasa.settings.get().then((s) => { autoLockMinutes = s.autoLockMinutes ?? 10; });
  kasa.update?.status().then(updatePrompt).catch(() => {});
}

// Tam kilit: ana şifre gerekir.
async function lock(msg) {
  await flush();
  await kasa.lock();
  query = '';
  $('#search').value = '';
  showLock(msg);
}

// Hızlı kilit: PIN varsa PIN ekranı, yoksa tam kilit.
async function quickLock(msg = '') {
  if (!db) return;
  await flush();
  const mode = await kasa.quickLock();
  query = '';
  $('#search').value = '';
  if (mode === 'pin') showPinLock(msg); else showLock(msg);
}

// ---------- PIN ekranı ----------
let pinBuffer = '';
let pinBusy = false;

function clearSession() {
  db = null;
  editing = null;
  $('#mainView').hidden = true;
  $('#sheet').hidden = true;
  $('#btnLock').hidden = true;
  $('#btnBrowser').hidden = true;
  $('#btnSettings').hidden = true;
  $('#prompts').replaceChildren();
  closeDialog(null);
}

function showPinLock(msg = '') {
  clearSession();
  $('#lockView').hidden = true;
  $('#pinView').hidden = false;
  pinBuffer = '';
  drawPinDots();
  $('#pinError').textContent = msg;
}

function drawPinDots() {
  [...$('#pinDots').children].forEach((d, i) => d.classList.toggle('on', i < pinBuffer.length));
}

async function pressPin(key) {
  if (pinBusy || $('#pinView').hidden) return;
  if (key === 'del') pinBuffer = pinBuffer.slice(0, -1);
  else if (pinBuffer.length < 4) pinBuffer += key;
  drawPinDots();
  if (pinBuffer.length < 4) return;
  pinBusy = true;
  $('#pinError').textContent = '';
  const r = await kasa.pin.unlock(pinBuffer);
  pinBuffer = '';
  pinBusy = false;
  drawPinDots();
  if (r.ok) { acceptVault(r); return; }
  if (r.full) { showLock(_t('PIN 5 kez yanlış girildi. Güvenlik için ana şifre gerekiyor.')); return; }
  $('#pinError').textContent = _t("Yanlış PIN · {0} deneme kaldı", r.left);
  $('#pinDots').classList.remove('shake');
  void $('#pinDots').offsetWidth;
  $('#pinDots').classList.add('shake');
}

$('#pinPad').append(...['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k) => (k
  ? h('button', { type: 'button', class: 'pin-key' + (k === 'del' ? ' del' : ''), 'data-key': k, onclick: () => pressPin(k) },
    k === 'del' ? '⌫' : k)
  : h('span'))));
window.addEventListener('keydown', (e) => {
  if ($('#pinView').hidden) return;
  if (/^\d$/.test(e.key)) { e.preventDefault(); pressPin(e.key); }
  else if (e.key === 'Backspace') { e.preventDefault(); pressPin('del'); }
});
$('#lnkPinMaster').addEventListener('click', () => showLock());

// Sistem kilidi (Win+L) → hızlı kilit; uyku → tam kilit. Önce bekleyen değişiklik kaydedilir.
kasa.onLockRequest((kind) => {
  if (!db) return;
  if (kind === 'full') lock(_t('Bilgisayar uyku moduna geçtiği için kasa kilitlendi.'));
  else quickLock(_t('Bilgisayar kilitlendiği için kasa da kilitlendi.'));
});
kasa.onLocked((mode) => {
  if (!db) return;
  if (mode === 'pin') showPinLock(_t('Bitig kilitlendi.')); else showLock(_t('Bitig kilitlendi.'));
});

for (const ev of ['mousemove', 'keydown', 'mousedown', 'wheel']) {
  window.addEventListener(ev, () => { lastActivity = Date.now(); }, { passive: true });
}

setInterval(() => {
  if (db && autoLockMinutes > 0 && Date.now() - lastActivity > autoLockMinutes * 60_000) {
    quickLock(_t("{0} dakika işlem yapılmadığı için kilitlendi.", autoLockMinutes));
  }
  if (db) updateBadge();
}, 30_000);

const WEAK_PINS = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '1212', '0123']);

async function setPinFlow() {
  const st = await kasa.pin.status();
  const pinField = (k, label) => ({ k, label, attrs: { inputmode: 'numeric', maxlength: '4' } });
  const ok = await formDialog({
    title: st.hasPin ? _t('PIN\'i değiştir') : _t('Hızlı kilit PIN\'i belirle'),
    text: _t('Kilitlenince ana şifre yerine 4 haneli PIN istenir. 5 yanlış denemede ana şifre gerekir. Onaylamak için ana şifreni de gir.'),
    fields: [{ k: 'pw', label: _t('Ana şifre') }, pinField('p1', _t('Yeni PIN (4 rakam)')), pinField('p2', _t('Yeni PIN (tekrar)'))],
    submitLabel: _t('Kaydet'),
    onSubmit: async (v) => {
      if (!/^\d{4}$/.test(v.p1)) return _t('PIN 4 rakam olmalı.');
      if (v.p1 !== v.p2) return _t('PIN\'ler aynı değil.');
      if (WEAK_PINS.has(v.p1)) return _t('Bu PIN çok kolay tahmin edilir; başka bir tane seç.');
      await kasa.pin.set(v.pw, v.p1);
    },
  });
  if (ok) { toast(_t('PIN kaydedildi · 🔒 artık PIN ile kilitler')); openSettingsSheet(); }
}

async function removePinFlow() {
  const ok = await formDialog({
    title: _t('PIN\'i kaldır'),
    text: _t('Kilitlenince yeniden ana şifre istenir. Onaylamak için ana şifreni gir.'),
    fields: [{ k: 'pw', label: _t('Ana şifre') }],
    submitLabel: _t('Kaldır'),
    onSubmit: async (v) => { await kasa.pin.remove(v.pw); },
  });
  if (ok) { toast(_t('PIN kaldırıldı')); openSettingsSheet(); }
}

async function createRecoveryFlow() {
  const info = await kasa.info();
  let recoveryKey = null;
  const ok = await formDialog({
    title: info.hasRecovery ? _t('Yeni kurtarma anahtarı') : _t('Kurtarma anahtarı oluştur'),
    text: (info.hasRecovery ? _t('Eski anahtar geçersiz olacak. ') : '') + _t('Onaylamak için ana şifreni gir.'),
    fields: [{ k: 'pw', label: _t('Ana şifre') }],
    submitLabel: _t('Oluştur'),
    onSubmit: async (v) => { recoveryKey = await kasa.newRecoveryKey(v.pw); },
  });
  if (!ok || !recoveryKey) return;
  [...$('#prompts').children].find((el) => el.dataset.key === 'recovery')?.remove();
  await showRecoveryKey(recoveryKey);
  if ($('#sheet').classList.contains('custom') && !$('#sheet').hidden) openSettingsSheet();
}

async function changePasswordFlow() {
  const ok = await formDialog({
    title: _t('Ana şifreyi değiştir'),
    fields: [
      { k: 'cur', label: _t('Mevcut ana şifre') },
      { k: 'n1', label: _t('Yeni ana şifre') },
      { k: 'n2', label: _t('Yeni ana şifre (tekrar)') },
    ],
    submitLabel: _t('Değiştir'),
    onSubmit: async (v) => {
      if (v.n1.length < 8) return _t('Yeni ana şifre en az 8 karakter olmalı.');
      if (v.n1 !== v.n2) return _t('Yeni şifreler aynı değil.');
      await kasa.changePassword(v.cur, v.n1);
    },
  });
  if (ok) toast(_t('Ana şifre değiştirildi'));
}
