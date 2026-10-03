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
  $('#prompts').replaceChildren();   // öneri kartları şifre içerebilir; kilitte temizle
  closeDialog(null);
  $('#lockTitle').textContent = vaultExists ? 'Tekrar hoş geldin' : 'Kasanı oluştur';
  $('#lockHint').textContent = vaultExists
    ? 'Devam etmek için ana şifreni gir.'
    : 'Tüm verilerin bu ana şifreyle şifrelenip bu bilgisayarda saklanacak.';
  $('#pw2').hidden = vaultExists;
  $('#lockWarn').hidden = vaultExists;
  $('#lockSubmit').textContent = vaultExists ? 'Kilidi aç' : 'Kasayı oluştur';
  $('#pw1').value = '';
  $('#pw2').value = '';
  $('#lockError').textContent = msg;
  $('#pw1').focus();
}

$('#lockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = $('#pw1').value;
  const btn = $('#lockSubmit');
  let res;
  $('#lockError').textContent = '';
  try {
    if (!vaultExists) {
      if (pw.length < 8) throw new Error('Ana şifre en az 8 karakter olmalı.');
      if (pw !== $('#pw2').value) throw new Error('Şifreler aynı değil.');
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
  } else if (!res.hasRecovery) {
    addPrompt({
      key: 'recovery', icon: '🛟', title: 'Kurtarma anahtarın yok',
      sub: 'Ana şifreni unutursan kasayı açmanın tek yolu bu. Bir dakikanı alır.',
      actions: [{ label: 'Şimdi oluştur', primary: true, fn: createRecoveryFlow }, { label: 'Sonra' }],
    });
  }
}

$('#lnkForgot').addEventListener('click', async () => {
  let res = null;
  const ok = await formDialog({
    title: 'Ana şifremi unuttum',
    text: 'Bitig oluşturulurken verilen kurtarma anahtarını ve yeni ana şifreni gir.',
    fields: [
      { k: 'key', label: 'Kurtarma anahtarı (XXXX-XXXX-…)', type: 'text', mono: true },
      { k: 'n1', label: 'Yeni ana şifre' },
      { k: 'n2', label: 'Yeni ana şifre (tekrar)' },
    ],
    submitLabel: 'Kasayı aç',
    onSubmit: async (v) => {
      if (v.n1.length < 8) return 'Ana şifre en az 8 karakter olmalı.';
      if (v.n1 !== v.n2) return 'Yeni şifreler aynı değil.';
      res = await kasa.recover(v.key, v.n1);
    },
  });
  if (ok && res) {
    acceptVault(res);
    toast('Bitig açıldı, yeni ana şifren kaydedildi');
  }
});

$('#lnkRestore').addEventListener('click', async () => {
  if (vaultExists && !(await ask('Yedekten geri yükle',
    'Şu anki kasa silinmez, “vault-onceki-…” adıyla saklanır. Yüklenen yedeği, o yedeğin ana şifresiyle açacaksın.',
    [{ label: 'Vazgeç', value: false }, { label: 'Yedek seç', value: true, primary: true }]))) return;
  try {
    if (await kasa.restore()) showLock('Yedek yüklendi. Bu yedeğin ana şifresiyle aç.');
  } catch (e) {
    $('#lockError').textContent = cleanErr(e);
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
  if (r.full) { showLock('PIN 5 kez yanlış girildi. Güvenlik için ana şifre gerekiyor.'); return; }
  $('#pinError').textContent = `Yanlış PIN · ${r.left} deneme kaldı`;
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
  if (kind === 'full') lock('Bilgisayar uyku moduna geçtiği için kasa kilitlendi.');
  else quickLock('Bilgisayar kilitlendiği için kasa da kilitlendi.');
});
kasa.onLocked((mode) => {
  if (!db) return;
  if (mode === 'pin') showPinLock('Bitig kilitlendi.'); else showLock('Bitig kilitlendi.');
});

for (const ev of ['mousemove', 'keydown', 'mousedown', 'wheel']) {
  window.addEventListener(ev, () => { lastActivity = Date.now(); }, { passive: true });
}

setInterval(() => {
  if (db && autoLockMinutes > 0 && Date.now() - lastActivity > autoLockMinutes * 60_000) {
    quickLock(`${autoLockMinutes} dakika işlem yapılmadığı için kilitlendi.`);
  }
  if (db) updateBadge();
}, 30_000);

const WEAK_PINS = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '1212', '0123']);

async function setPinFlow() {
  const st = await kasa.pin.status();
  const pinField = (k, label) => ({ k, label, attrs: { inputmode: 'numeric', maxlength: '4' } });
  const ok = await formDialog({
    title: st.hasPin ? 'PIN\'i değiştir' : 'Hızlı kilit PIN\'i belirle',
    text: 'Kilitlenince ana şifre yerine 4 haneli PIN istenir. 5 yanlış denemede ana şifre gerekir. Onaylamak için ana şifreni de gir.',
    fields: [{ k: 'pw', label: 'Ana şifre' }, pinField('p1', 'Yeni PIN (4 rakam)'), pinField('p2', 'Yeni PIN (tekrar)')],
    submitLabel: 'Kaydet',
    onSubmit: async (v) => {
      if (!/^\d{4}$/.test(v.p1)) return 'PIN 4 rakam olmalı.';
      if (v.p1 !== v.p2) return 'PIN\'ler aynı değil.';
      if (WEAK_PINS.has(v.p1)) return 'Bu PIN çok kolay tahmin edilir; başka bir tane seç.';
      await kasa.pin.set(v.pw, v.p1);
    },
  });
  if (ok) { toast('PIN kaydedildi · 🔒 artık PIN ile kilitler'); openSettingsSheet(); }
}

async function removePinFlow() {
  const ok = await formDialog({
    title: 'PIN\'i kaldır',
    text: 'Kilitlenince yeniden ana şifre istenir. Onaylamak için ana şifreni gir.',
    fields: [{ k: 'pw', label: 'Ana şifre' }],
    submitLabel: 'Kaldır',
    onSubmit: async (v) => { await kasa.pin.remove(v.pw); },
  });
  if (ok) { toast('PIN kaldırıldı'); openSettingsSheet(); }
}

async function createRecoveryFlow() {
  const info = await kasa.info();
  let recoveryKey = null;
  const ok = await formDialog({
    title: info.hasRecovery ? 'Yeni kurtarma anahtarı' : 'Kurtarma anahtarı oluştur',
    text: (info.hasRecovery ? 'Eski anahtar geçersiz olacak. ' : '') + 'Onaylamak için ana şifreni gir.',
    fields: [{ k: 'pw', label: 'Ana şifre' }],
    submitLabel: 'Oluştur',
    onSubmit: async (v) => { recoveryKey = await kasa.newRecoveryKey(v.pw); },
  });
  if (!ok || !recoveryKey) return;
  [...$('#prompts').children].find((el) => el.dataset.key === 'recovery')?.remove();
  await showRecoveryKey(recoveryKey);
  if ($('#sheet').classList.contains('custom') && !$('#sheet').hidden) openSettingsSheet();
}

async function changePasswordFlow() {
  const ok = await formDialog({
    title: 'Ana şifreyi değiştir',
    fields: [
      { k: 'cur', label: 'Mevcut ana şifre' },
      { k: 'n1', label: 'Yeni ana şifre' },
      { k: 'n2', label: 'Yeni ana şifre (tekrar)' },
    ],
    submitLabel: 'Değiştir',
    onSubmit: async (v) => {
      if (v.n1.length < 8) return 'Yeni ana şifre en az 8 karakter olmalı.';
      if (v.n1 !== v.n2) return 'Yeni şifreler aynı değil.';
      await kasa.changePassword(v.cur, v.n1);
    },
  });
  if (ok) toast('Ana şifre değiştirildi');
}
