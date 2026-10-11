// Kayıt düzenleme sayfası, tekrar kontrolü ve silme.
'use strict';

const FORMS = {
  task: {
    titles: [_t('Yeni görev'), _t('Görev')],
    fields: [
      { k: 'title', label: _t('Görev'), type: 'text', req: true, ph: _t('Ne yapılacak?') },
      { k: 'due', label: _t('Son tarih'), type: 'date' },
      { k: 'repeat', label: _t('Tekrar'), type: 'repeat' },
      { k: 'remindAt', label: _t('Hatırlat'), type: 'datetime-local' },
      { k: 'tags', label: _t('Etiketler'), type: 'tags' },
      { k: 'projectId', label: _t('Proje'), type: 'project' },
      { k: 'note', label: _t('Not'), type: 'textarea' },
    ],
  },
  password: {
    titles: [_t('Yeni şifre'), _t('Şifre')],
    fields: [
      { k: 'title', label: _t('Başlık'), type: 'text', req: true, ph: _t('Örn. Hosting paneli') },
      { k: 'username', label: _t('Kullanıcı adı / e-posta'), type: 'text' },
      { k: 'password', label: _t('Şifre'), type: 'secret' },
      { k: 'totp', label: _t('2FA anahtarı (isteğe bağlı)'), type: 'totp' },
      { k: 'url', label: _t('Adres'), type: 'text', ph: 'https://' },
      { k: 'tags', label: _t('Etiketler'), type: 'tags' },
      { k: 'projectId', label: _t('Proje'), type: 'project' },
      { k: 'note', label: _t('Not'), type: 'textarea' },
    ],
  },
  note: {
    titles: [_t('Yeni not'), _t('Not')],
    fields: [
      { k: 'title', label: _t('Başlık'), type: 'text', ph: _t('Başlık') },
      { k: 'body', label: _t('İçerik'), type: 'textarea', grow: true },
      { k: 'tags', label: _t('Etiketler'), type: 'tags' },
      { k: 'projectId', label: _t('Proje'), type: 'project' },
    ],
  },
  project: {
    titles: [_t('Yeni proje'), _t('Proje')],
    fields: [
      { k: 'name', label: _t('Proje adı'), type: 'text', req: true, ph: _t('Örn. Web sitesi') },
      { k: 'color', label: _t('Renk'), type: 'color' },
    ],
  },
};

// Şifre yazılırken güç göstergesi ve "bu şifre başka kayıtta da var" uyarısı
const STRENGTH_LABELS = () => [_t('Çok zayıf'), _t('Zayıf'), _t('Orta'), _t('Güçlü'), _t('Çok güçlü')];
function strengthMeter(input) {
  const label = h('span');
  const meter = h('div', { class: 'pw-meter', hidden: true }, h('i'), label);
  const update = () => {
    const v = input.value;
    meter.hidden = !v;
    if (!v) return;
    const val = (k) => $(`#sheetForm [data-k="${k}"]`)?.value || '';
    const s = KasaStrength.strength(v, { username: val('username'), title: val('title'), url: val('url') });
    const others = db.passwords.filter((p) => p !== editing?.item && p.password === v).length;
    meter.dataset.score = s.score;
    label.textContent = STRENGTH_LABELS()[s.score] + (others ? ' · ' + _t('bu şifre {0} başka kayıtta da var', others) : '');
  };
  input.addEventListener('input', update);
  setTimeout(update);
  return meter;
}

function buildField(f, value) {
  const label = h('label', { class: f.grow ? 'grow' : null }, f.label);
  let input;
  if (f.type === 'textarea') {
    input = h('textarea', { 'data-k': f.k });
    input.value = value || '';
    label.append(input);
  } else if (f.type === 'project') {
    input = h('select', { 'data-k': f.k },
      h('option', { value: '' }, _t('— Projesiz —')),
      ...db.projects.map((p) => h('option', { value: p.id }, p.name)));
    input.value = value || '';
    label.append(input);
  } else if (f.type === 'color') {
    let selected = value || 'blue';
    const wrap = h('div', { class: 'colors', 'data-k': f.k, 'data-value': selected });
    for (const [name, hex] of Object.entries(COLORS)) {
      wrap.append(h('button', {
        type: 'button', title: name, style: `background:${hex}`, class: name === selected ? 'sel' : null,
        onclick: (e) => {
          selected = name;
          wrap.dataset.value = name;
          wrap.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b === e.currentTarget));
        },
      }));
    }
    label.append(wrap);
  } else if (f.type === 'secret') {
    input = h('input', { type: 'password', 'data-k': f.k, autocomplete: 'off' });
    input.value = value || '';
    label.append(h('div', { class: 'field-row' }, input,
      h('button', { type: 'button', class: 'mini', title: _t('Göster / gizle'),
        onclick: () => { input.type = input.type === 'password' ? 'text' : 'password'; } }, '👁'),
      h('button', { type: 'button', class: 'mini', title: _t('Güçlü şifre üret'),
        onclick: () => { input.value = generatePassword(); input.type = 'text'; input.dispatchEvent(new Event('input')); } }, '🎲'),
      h('button', { type: 'button', class: 'mini', title: _t('Kopyala'),
        onclick: () => { if (input.value) { kasa.copy(input.value, true); toast(_t('Şifre kopyalandı · 30 sn sonra silinecek')); } } }, '⧉')),
      strengthMeter(input));
  } else if (f.type === 'tags') {
    // Etiket çipleri + yazma kutusu (Enter ya da virgülle ekle, boşken ⌫ ile son etiketi sil); var olan etiketler önerilir
    let tags = normTags(value);
    const wrap = h('div', { class: 'tag-input', 'data-k': f.k });
    const add = h('input', { type: 'text', class: 'tag-new', placeholder: _t('Etiket ekle (Enter)'), list: 'tag-suggest', autocomplete: 'off', spellcheck: 'false' });
    const suggest = h('datalist', { id: 'tag-suggest' }, ...allTags().map((x) => h('option', { value: x.tag })));
    const draw = () => {
      wrap.dataset.value = JSON.stringify(tags);
      wrap.replaceChildren(...tags.map((t) => h('span', { class: 'chip tag' }, '#' + t,
        h('button', { type: 'button', class: 'tag-x', title: _t('Kaldır'), onclick: () => { tags = tags.filter((x) => x !== t); draw(); add.focus(); } }, '×'))),
      add, suggest);
    };
    const commit = () => {
      if (!add.value.trim()) return false;
      tags = normTags([...tags, ...add.value.split(',')]);
      add.value = '';
      draw();
      return true;
    };
    add.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ',') && commit()) { e.preventDefault(); add.focus(); } else if (e.key === ',') e.preventDefault();
      else if (e.key === 'Backspace' && !add.value && tags.length) { tags = tags.slice(0, -1); draw(); add.focus(); }
    });
    add.addEventListener('change', () => { if (add.value.includes(',')) commit(); }); // öneri listesinden seçilince
    add.addEventListener('blur', commit); // yazılıp bırakılan etiket kaybolmasın
    draw();
    label.append(wrap);
  } else if (f.type === 'repeat') {
    input = h('select', { 'data-k': f.k },
      h('option', { value: '' }, _t('Tekrarlanmaz')),
      ...Object.entries(REPEAT_LABELS()).map(([k, l]) => h('option', { value: k }, l)));
    input.value = value || '';
    label.append(input);
  } else if (f.type === 'totp') {
    // Sitenin verdiği anahtar ya da otpauth:// adresi; QR'dan da eklenebilir. Geçerliyse şu anki kod canlı görünür.
    input = h('input', { type: 'password', 'data-k': f.k, autocomplete: 'off', spellcheck: 'false', placeholder: _t('Anahtar ya da QR kod') });
    input.value = value || '';
    const preview = h('div', { class: 'totp-preview', hidden: true });
    const update = async () => {
      const v = input.value.trim();
      preview.hidden = !v;
      if (!v) return;
      const g = await KasaTotp.generate(v);
      preview.classList.toggle('bad', !g);
      preview.textContent = g ? _t('Şu anki kod: {0} · {1} sn', KasaTotp.pretty(g.code), g.remaining) : _t('⚠ Geçersiz anahtar');
    };
    input.addEventListener('input', update);
    const timer = setInterval(() => (input.isConnected ? update() : clearInterval(timer)), 1000);
    setTimeout(update);
    label.append(h('div', { class: 'field-row' }, input,
      h('button', { type: 'button', class: 'mini', title: _t('Göster / gizle'),
        onclick: () => { input.type = input.type === 'password' ? 'text' : 'password'; } }, '👁'),
      h('button', { type: 'button', class: 'mini', title: _t('QR koddan ekle'), onclick: () => scanQrInto(input) }, '📷')),
    preview);
  } else {
    input = h('input', { type: f.type, 'data-k': f.k, placeholder: f.ph || '', autocomplete: 'off' });
    input.value = value || '';
    label.append(input);
  }
  return label;
}

function openEditor(type, item = null, extra = {}) {
  const def = FORMS[type];
  const isNew = !item;
  const draft = item || newItem(type, { ...(tagFilter && type !== 'project' ? { tags: [tagFilter] } : {}), ...extra });
  editing = { type, item: draft, isNew };

  $('#sheetTitle').textContent = def.titles[isNew ? 0 : 1];
  $('#sheet').classList.remove('custom');
  $('#sheetDelete').hidden = isNew;
  const form = $('#sheetForm');
  form.replaceChildren(...def.fields.map((f) => buildField(f, draft[f.k])));
  if (type === 'note') attachChecklist(form);
  if (type === 'password' && !isNew) form.querySelector('[data-k="password"]')?.closest('label').after(passwordHistory(draft) || '');
  addExtrasRow(form, draft);
  if (!isNew) form.append(stampDetails(type, draft));
  $('#sheet').hidden = false;
  form.querySelector('input, textarea')?.focus();
}

// Az kullanılan alanlar (etiketler) boşken gizli durur; düzenleyicinin altında küçük bir bağlantıyla açılır.
// Düzenleyici sade kalsın: her kayıtta görünen boş alan olmasın.
function addExtrasRow(form, draft) {
  const tagsLabel = form.querySelector('.tag-input')?.closest('label');
  if (!tagsLabel) return; // proje düzenleyicisinde ek alan yok
  const row = h('div', { class: 'extras' });
  if (!draft.tags?.length) {
    tagsLabel.hidden = true;
    row.append(h('button', { type: 'button', class: 'link-btn', onclick: (e) => {
      tagsLabel.hidden = false;
      e.currentTarget.remove();
      tagsLabel.querySelector('.tag-new')?.focus();
    } }, _t('# Etiket ekle')));
  }
  const list = h('div', { class: 'attach-list' });
  row.append(h('button', { type: 'button', class: 'link-btn', onclick: () => pickAttachments(draft, list) }, _t('📎 Dosya ekle')));
  tagsLabel.after(list, row);
  drawAttachments(draft, list);
}

// ---------- dosya ekleri ----------
// Kayıtlı bir kayıtta ek ekleme/kaldırma hemen kaydedilir (Kaydet'e basmayı unutunca kaybolmasın)
function saveAttachChange(draft) {
  if (!editing || editing.isNew || editing.item !== draft) return;
  draft.updated = Date.now();
  persist();
}

function pickAttachments(draft, list) {
  const inp = h('input', { type: 'file', multiple: true });
  inp.addEventListener('change', async () => {
    for (const f of inp.files || []) {
      if (f.size > KasaAttach.MAX_BYTES) { toast(_t('“{0}” çok büyük (en fazla {1}).', f.name, KasaAttach.prettySize(KasaAttach.MAX_BYTES))); continue; }
      try {
        const meta = await kasa.files.add(f.name, f.type, new Uint8Array(await f.arrayBuffer()));
        draft.files = [...(draft.files || []), meta];
        saveAttachChange(draft);
        drawAttachments(draft, list);
      } catch (e) { toast(cleanErr(e)); }
    }
  });
  inp.click();
}

function drawAttachments(draft, list) {
  const files = draft.files || [];
  list.replaceChildren(...files.map((f) => h('div', { class: 'attach-row' },
    h('button', { type: 'button', class: 'attach-open', title: _t('Aç'), onclick: () => openAttachment(f) },
      h('span', { class: 'attach-ico' }, KasaAttach.icon(f)),
      h('span', { class: 'attach-name' }, f.name),
      h('small', null, KasaAttach.prettySize(f.size))),
    h('button', { type: 'button', class: 'tag-x', title: _t('Kaldır'), onclick: () => {
      draft.files = files.filter((x) => x !== f);
      if (!draft.files.length) delete draft.files;
      saveAttachChange(draft);
      drawAttachments(draft, list);
      toast(_t('“{0}” kaldırıldı', f.name), { label: _t('Geri al'), fn: () => {
        draft.files = [...(draft.files || []), f];
        saveAttachChange(draft);
        if (list.isConnected) drawAttachments(draft, list); else render();
      } });
    } }, '×'))));
}

// Resimler pencerede görünür; diğer dosyalar kaydedilir (telefonda indirilir)
async function openAttachment(f) {
  try {
    if (KasaAttach.isImage(f)) {
      const bytes = new Uint8Array(await kasa.files.read(f.id));
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const shown = ask(f.name, '', [{ label: _t('Kaydet'), value: 'save' }, { label: _t('Kapat'), value: null, primary: true }]);
      $('#dialog .dialog-card h3')?.after(h('img', { class: 'attach-preview', alt: f.name, src: `data:${f.type};base64,${btoa(bin)}` }));
      if ((await shown) !== 'save') return;
    }
    const saved = await kasa.files.save(f.id, f.name);
    if (saved) toast(_t('Kaydedildi: {0}', saved));
  } catch (e) {
    toast(cleanErr(e));
  }
}

// Şifre geçmişi: eski şifreler gizli durur; gösterilebilir, kopyalanabilir ya da yeniden şimdiki şifre yapılabilir
function passwordHistory(item) {
  const list = item.pwHistory || [];
  if (!list.length) return null;
  const MASK = '••••••••';
  const box = h('details', { class: 'pw-history' },
    h('summary', null, _t('🕘 Şifre geçmişi ({0})', list.length)),
    ...list.map((x) => {
      const val = h('code', { class: 'pw-old' }, MASK);
      return h('div', { class: 'pw-old-row', title: (x.from ? fmtFull(x.from) : '?') + ' → ' + fmtFull(x.until) },
        h('div', { class: 'body' }, val, h('small', null, _t('Değiştirildi: {0}', fmtStamp(x.until)))),
        h('button', { type: 'button', class: 'mini', title: _t('Göster / gizle'),
          onclick: () => { val.textContent = val.textContent === MASK ? x.password : MASK; } }, '👁'),
        h('button', { type: 'button', class: 'mini', title: _t('Kopyala'),
          onclick: () => { kasa.copy(x.password, true); toast(_t('Eski şifre kopyalandı · 30 sn sonra silinecek')); } }, '⧉'),
        h('button', { type: 'button', class: 'mini', title: _t('Bu şifreye geri dön'),
          onclick: () => {
            const input = $('#sheetForm [data-k="password"]');
            input.value = x.password;
            input.type = 'text';
            input.dispatchEvent(new Event('input'));
            toast(_t('Eski şifre yazıldı; Kaydet’e basınca geri döner'));
          } }, '↩'));
    }),
    h('button', { type: 'button', class: 'mini pw-history-clear', onclick: async () => {
      if (!(await ask(_t('Şifre geçmişi silinsin mi?'), _t('Bu kayıttaki eski şifreler kalıcı olarak silinir.'),
        [{ label: _t('Vazgeç'), value: false }, { label: _t('Sil'), value: true, primary: true }]))) return;
      delete item.pwHistory;
      item.updated = Date.now();
      persist();
      box.remove();
      toast(_t('Şifre geçmişi silindi'));
    } }, _t('Geçmişi temizle')));
  return box;
}

// Notta yapılacak listesi: metindeki "- [ ] madde" satırları kutucuklu gösterilir. İşaretleme kayıtlı notta hemen kaydedilir
// (alışverişte "Kaydet"e basmayı unutunca kaybolmasın).
function attachChecklist(form) {
  const ta = form.querySelector('[data-k="body"]');
  if (!ta) return;
  const add = h('input', { type: 'text', class: 'check-add', placeholder: _t('＋ Madde ekle (Enter)') });
  const panel = h('div', { class: 'checklist' });
  const saveNow = () => {
    if (!editing || editing.isNew || editing.type !== 'note') return;
    editing.item.body = ta.value;
    editing.item.updated = Date.now();
    persist();
  };
  const draw = () => {
    const items = KasaList.items(ta.value);
    panel.replaceChildren(...items.map((it) => {
      const cb = h('input', { type: 'checkbox' });
      cb.checked = it.checked;
      cb.addEventListener('change', () => { ta.value = KasaList.toggle(ta.value, it.line); saveNow(); draw(); });
      return h('label', { class: 'check-item' + (it.checked ? ' on' : '') }, cb, h('span', null, it.text));
    }), add);
  };
  add.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = add.value.trim();
    if (!v) return;
    ta.value = KasaList.add(ta.value, v);
    add.value = '';
    saveNow();
    draw();
    add.focus();
  });
  ta.addEventListener('input', draw);
  ta.closest('label').before(panel);
  draw();
}

// Düzenleme ekranının altındaki zaman bilgisi (otomatik tutulur, elle değiştirilmez)
function stampDetails(type, x) {
  const rows = [
    [_t('Oluşturuldu'), x.created],
    [_t('Son değişiklik'), x.updated],
    type === 'password' && [_t('Şifre son değişti'), x.pwChanged],
    type === 'task' && x.done && [_t('Tamamlandı'), x.completedAt],
    type === 'project' && [_t('Son hareket'), projectActivity(x)],
  ].filter(Boolean);
  return h('div', { class: 'stamps' },
    ...rows.map(([label, ms]) => h('div', null, h('span', null, label), h('b', null, ms ? fmtFull(ms) : _t('bu özellikten önce eklendi')))));
}

function closeEditor() {
  editing = null;
  clearInterval(pairTimer);
  $('#sheet').hidden = true;
}

function findDuplicateTask(task) {
  const t = K.lower(task.title);
  return db.tasks.find((x) => x.id !== task.id && !x.done && K.lower(x.title) === t
    && (x.projectId || '') === (task.projectId || ''));
}

// Kaydetmeden önce tekrar kontrolü. false dönerse kayıt yapılmaz (ya da başka şekilde halledildi).
async function checkDuplicates(type, item, values, isNew) {
  const probe = { ...item, ...values };

  if (type === 'password' && (isNew || K.accountKey(item) !== K.accountKey(probe))) {
    const dup = db.passwords.find((p) => p !== item && K.sameAccount(p, probe));
    if (!dup) return true;
    const choice = await ask(_t('Bu hesap zaten kayıtlı'),
      _t("“{0}” · {1} aynı site ve kullanıcı adıyla kayıtlı.", dup.title, dup.username || _t('kullanıcı adı yok')),
      [{ label: _t('Vazgeç'), value: null }, { label: _t('Ayrı kaydet'), value: 'keep' },
        { label: _t('Mevcut kaydı güncelle'), value: 'merge', primary: true }]);
    if (choice === 'merge') {
      for (const [k, v] of Object.entries(values)) {
        if (k === 'note') { if (v && !(dup.note || '').includes(v)) dup.note = [dup.note, v].filter(Boolean).join('\n'); }
        else if (k === 'password') { if (v) setPassword(dup, v); }
        else if (k === 'tags') { if (v.length) dup.tags = normTags([...(dup.tags || []), ...v]); }
        else if (v) dup[k] = v;
      }
      dup.updated = Date.now();
      if (!isNew) db.passwords.splice(db.passwords.indexOf(item), 1);
      persist();
      closeEditor();
      render();
      toast(_t('Mevcut kayıt güncellendi'));
      return false;
    }
    return choice === 'keep';
  }

  if (type === 'task' && (isNew || K.lower(item.title) !== K.lower(values.title))) {
    const dup = findDuplicateTask(probe);
    if (!dup) return true;
    return !!(await ask(_t('Bu görev zaten var'), _t("“{0}” açık görevler arasında zaten duruyor.", dup.title),
      [{ label: _t('Vazgeç'), value: false }, { label: _t('Yine de kaydet'), value: true, primary: true }]));
  }

  if (type === 'note' && (isNew || K.lower(item.title) !== K.lower(values.title))) {
    const title = K.lower(values.title);
    const body = values.body.trim();
    const dup = db.notes.find((n) => n !== item
      && ((title && K.lower(n.title) === title) || (body && (n.body || '').trim() === body)));
    if (!dup) return true;
    const choice = await ask(_t('Benzer bir not var'), _t("“{0}” aynı başlığa ya da içeriğe sahip.", dup.title || _t('Başlıksız not')),
      [{ label: _t('Vazgeç'), value: null }, { label: _t('Mevcut notu aç'), value: 'open' },
        { label: _t('Yine de kaydet'), value: 'keep', primary: true }]);
    if (choice === 'open') openEditor('note', dup);
    return choice === 'keep';
  }

  if (type === 'project') {
    const dup = db.projects.find((p) => p !== item && K.lower(p.name) === K.lower(values.name));
    if (dup) { toast(_t('Bu isimde bir proje zaten var')); return false; }
  }
  return true;
}

async function saveEditor() {
  if (!editing) return;
  const { type, item, isNew } = editing;
  const form = $('#sheetForm');
  const values = {};
  for (const el of form.querySelectorAll('[data-k]')) {
    values[el.dataset.k] = el.classList.contains('colors') ? el.dataset.value
      // yazılıp Enter'a basılmadan bırakılan etiket de alınır
      : el.classList.contains('tag-input') ? normTags([...JSON.parse(el.dataset.value || '[]'), ...(el.querySelector('.tag-new')?.value || '').split(',')])
      : el.value;
  }
  const missing = FORMS[type].fields.find((f) => f.req && !String(values[f.k] || '').trim());
  if (missing) {
    toast(_t("“{0}” boş olamaz", missing.label));
    form.querySelector(`[data-k="${missing.k}"]`)?.focus();
    return;
  }
  if (type === 'note' && !values.title.trim() && !values.body.trim()) { closeEditor(); return; }
  if (type === 'task') {
    if (values.repeat && !values.due) values.due = todayStr(); // tekrar için başlangıç günü gerekir
    // Ayın asıl günü (31 → kısa aylarda son gün, sonra yine 31)
    values.repeatDay = ['monthly', 'yearly'].includes(values.repeat) ? Number(values.due.slice(8, 10)) : undefined;
  }
  if (type === 'password') {
    values.totp = (values.totp || '').trim();
    if (values.totp && !KasaTotp.parse(values.totp)) {
      toast(_t('2FA anahtarı geçersiz; sitenin verdiği anahtarı ya da QR kodu kontrol et.'));
      form.querySelector('[data-k="totp"]')?.focus();
      return;
    }
  }
  if (!(await checkDuplicates(type, item, values, isNew))) return;
  if (type === 'task' && item.remindAt !== values.remindAt) item.done = false;

  const now = Date.now();
  if (isNew) item.created = now; // form açıldığında değil, kaydedildiğinde oluşturulmuş sayılır
  if (type === 'password' && !isNew && values.password !== item.password) rememberOldPassword(item, values.password);
  if (type === 'password' && values.password && values.password !== (isNew ? undefined : item.password)) item.pwChanged = now;
  if (Array.isArray(values.tags) && !values.tags.length) { delete values.tags; delete item.tags; } // boş etiket listesi saklanmaz
  Object.assign(item, values, { updated: now });
  if (isNew) db[COLLECTION[type]].push(item);
  persist();
  closeEditor();
  render();
  toast(_t('Kaydedildi'));
  if (type === 'note' || type === 'task') offerLooseCreds(item);
}

function deleteEditing() {
  if (!editing) return;
  const { type, item } = editing;
  if (editing.isNew) { closeEditor(); return; }
  closeEditor();
  moveToTrash(type, item); // onay sormaya gerek yok: "Geri al" ve çöp kutusu var
}

$('#sheetSave').addEventListener('click', (e) => saveEditor(e));

$('#sheetCancel').addEventListener('click', (e) => closeEditor(e));

$('#sheetBack').addEventListener('click', (e) => closeEditor(e));

$('#sheetDelete').addEventListener('click', (e) => deleteEditing(e));

$('#sheetForm').addEventListener('submit', (e) => { e.preventDefault(); saveEditor(); });
