// Öneri kartları, onay pencereleri, şifre formları ve kurtarma anahtarı penceresi.
'use strict';

// ---------- öneri kartları ve onay penceresi ----------
function addPrompt({ key, icon, title, sub, actions }) {
  const box = $('#prompts');
  if (key) [...box.children].find((el) => el.dataset.key === key)?.remove();
  const card = h('div', { class: 'prompt', 'data-key': key || null },
    h('div', { class: 'prompt-ico' }, icon),
    h('div', { class: 'prompt-body' },
      h('div', { class: 'prompt-title' }, title),
      sub && h('div', { class: 'prompt-sub' }, sub),
      h('div', { class: 'prompt-actions' }, ...actions.map((a) => h('button', {
        class: a.primary ? 'mini primary-mini' : 'mini',
        onclick: () => { card.remove(); a.fn?.(); },
      }, a.label)))));
  box.append(card);
}

function ask(title, text, buttons) {
  closeDialog(null);
  return new Promise((resolve) => {
    dialogResolve = resolve;
    $('#dialog').replaceChildren(h('div', { class: 'dialog-card' },
      h('h3', null, title),
      text && h('p', null, text),
      h('div', { class: 'dialog-actions' }, ...buttons.map((b) => h('button', {
        class: b.primary ? 'primary' : 'ghost', type: 'button', onclick: () => closeDialog(b.value),
      }, b.label)))));
    $('#dialog').hidden = false;
    $('#dialog .primary')?.focus();
  });
}

function closeDialog(value) {
  $('#dialog').hidden = true;
  dialogLocked = false;
  const r = dialogResolve;
  dialogResolve = null;
  r?.(value);
}

// Şifre isteyen küçük form. onSubmit hata metni döndürürse (ya da hata atarsa) pencere açık kalır.
function formDialog({ title, text, fields, submitLabel, onSubmit }) {
  closeDialog(null);
  return new Promise((resolve) => {
    dialogResolve = resolve;
    const err = h('p', { class: 'error' });
    const inputs = fields.map((f) => h('input', {
      type: f.type || 'password', placeholder: f.label, autocomplete: 'off', 'data-k': f.k, class: f.mono ? 'mono' : null, ...(f.attrs || {}),
    }));
    const btn = h('button', { class: 'primary', type: 'submit' }, submitLabel);
    const form = h('form', {
      class: 'dialog-card',
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        btn.disabled = true;
        try {
          const msg = await onSubmit(Object.fromEntries(inputs.map((i) => [i.dataset.k, i.value])));
          if (msg) err.textContent = msg; else closeDialog(true);
        } catch (ex) {
          err.textContent = cleanErr(ex);
        } finally {
          btn.disabled = false;
        }
      },
    },
    h('h3', null, title),
    text && h('p', null, text),
    h('div', { class: 'dialog-fields' }, ...inputs),
    err,
    h('div', { class: 'dialog-actions' },
      h('button', { class: 'ghost', type: 'button', onclick: () => closeDialog(false) }, _t('Vazgeç')), btn));
    $('#dialog').replaceChildren(form);
    $('#dialog').hidden = false;
    inputs[0].focus();
  });
}

// Acil durum kâğıdı: kurtarma anahtarı ve "ana şifreni unutursan" adımları; yazdırılıp saklanır.
// Anahtar yalnızca oluşturulduğu an bilinir (kasada açık saklanmaz), bu yüzden kâğıt anahtar penceresinden basılır.
function emergencyKitHtml(recoveryKey) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const day = new Date().toLocaleDateString(KasaI18n.locale(), { day: 'numeric', month: 'long', year: 'numeric' });
  const steps = [
    _t('Bitig’i aç. Kilit ekranında “Ana şifremi unuttum”a bas.'),
    _t('Bu kâğıttaki kurtarma anahtarını yaz.'),
    _t('Yeni bir ana şifre belirle. Kayıtların olduğu gibi açılır.'),
  ];
  return `<!doctype html><html lang="${esc(KasaI18n.lang?.() || 'tr')}"><head><meta charset="utf-8"><title>Bitig</title><style>
    @page { margin: 18mm; }
    body { font: 13pt/1.5 "Segoe UI", system-ui, sans-serif; color: #111; margin: 0; }
    h1 { font-size: 24pt; margin: 0 0 2pt; } .muted { color: #555; font-size: 10.5pt; }
    .key { font: 600 20pt/1.3 Consolas, "Courier New", monospace; letter-spacing: 1.5pt; border: 2px solid #111; border-radius: 8pt; padding: 12pt 14pt; margin: 14pt 0; text-align: center; }
    ol { padding-left: 18pt; } li { margin: 4pt 0; }
    .box { border: 1px dashed #999; border-radius: 8pt; padding: 10pt 12pt; margin-top: 16pt; font-size: 11pt; }
  </style></head><body>
    <h1>Bitig</h1>
    <div class="muted">${esc(_t('Acil durum kâğıdı'))} · ${esc(day)}</div>
    <p>${esc(_t('Ana şifreni unutursan kasanı bu kurtarma anahtarıyla açabilirsin:'))}</p>
    <div class="key">${esc(recoveryKey)}</div>
    <ol>${steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
    <div class="box">⚠ ${esc(_t('Bu kâğıdı güvenli bir yerde sakla (ör. kilitli çekmece). Anahtarı bilen biri, ana şifre olmadan da kasanı açabilir. Yeni bir kurtarma anahtarı oluşturursan bu kâğıt geçersiz olur.'))}</div>
    <p class="muted">${esc(_t('Bitig’i indir:'))} atmaca883.github.io/bitig/indir</p>
  </body></html>`;
}

function showRecoveryKey(recoveryKey, { first = false } = {}) {
  closeDialog(null);
  return new Promise((resolve) => {
    dialogResolve = resolve;
    dialogLocked = true; // anahtar yazılmadan Esc ile kapanmasın
    const ok = h('button', { class: 'primary', type: 'button', disabled: true, onclick: () => closeDialog(true) }, _t('Tamam'));
    const cb = h('input', { type: 'checkbox', onchange: () => { ok.disabled = !cb.checked; } });
    $('#dialog').replaceChildren(h('div', { class: 'dialog-card' },
      h('h3', null, _t('🛟 Kurtarma anahtarın')),
      h('p', null, (first ? _t('Kasan hazır. ') : '') +
        _t('Ana şifreni unutursan kasayı sadece bu anahtarla açabilirsin. Kâğıda yaz ve güvenli bir yerde sakla; bu bilgisayarda bir dosyaya kaydetme.')),
      h('div', { class: 'recovery-key' }, recoveryKey),
      h('div', { class: 'row-actions' },
        h('button', { class: 'ghost small', type: 'button', onclick: () => { kasa.copy(recoveryKey, true); toast(_t('Kopyalandı · 30 sn sonra panodan silinecek')); } }, '⧉ Kopyala'),
        h('button', { class: 'ghost small', type: 'button', onclick: () => kasa.printHtml(emergencyKitHtml(recoveryKey)).catch((e) => toast(cleanErr(e))) }, _t('🖨 Acil durum kâğıdını yazdır'))),
      h('label', { class: 'check-line' }, cb, _t('Bu anahtarı güvenli bir yere yazdım')),
      h('div', { class: 'dialog-actions' }, ok)));
    $('#dialog').hidden = false;
  });
}
