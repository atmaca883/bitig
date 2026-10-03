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
      h('button', { class: 'ghost', type: 'button', onclick: () => closeDialog(false) }, 'Vazgeç'), btn));
    $('#dialog').replaceChildren(form);
    $('#dialog').hidden = false;
    inputs[0].focus();
  });
}

function showRecoveryKey(recoveryKey, { first = false } = {}) {
  closeDialog(null);
  return new Promise((resolve) => {
    dialogResolve = resolve;
    dialogLocked = true; // anahtar yazılmadan Esc ile kapanmasın
    const ok = h('button', { class: 'primary', type: 'button', disabled: true, onclick: () => closeDialog(true) }, 'Tamam');
    const cb = h('input', { type: 'checkbox', onchange: () => { ok.disabled = !cb.checked; } });
    $('#dialog').replaceChildren(h('div', { class: 'dialog-card' },
      h('h3', null, '🛟 Kurtarma anahtarın'),
      h('p', null, (first ? 'Kasan hazır. ' : '') +
        'Ana şifreni unutursan kasayı sadece bu anahtarla açabilirsin. Kâğıda yaz ve güvenli bir yerde sakla; bu bilgisayarda bir dosyaya kaydetme.'),
      h('div', { class: 'recovery-key' }, recoveryKey),
      h('button', { class: 'ghost small', type: 'button', onclick: () => { kasa.copy(recoveryKey, true); toast('Kopyalandı · 30 sn sonra panodan silinecek'); } }, '⧉ Kopyala'),
      h('label', { class: 'check-line' }, cb, 'Bu anahtarı güvenli bir yere yazdım'),
      h('div', { class: 'dialog-actions' }, ok)));
    $('#dialog').hidden = false;
  });
}
