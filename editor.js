// Kayıt düzenleme sayfası, tekrar kontrolü ve silme.
'use strict';

const FORMS = {
  task: {
    titles: [_t('Yeni görev'), _t('Görev')],
    fields: [
      { k: 'title', label: _t('Görev'), type: 'text', req: true, ph: _t('Ne yapılacak?') },
      { k: 'due', label: _t('Son tarih'), type: 'date' },
      { k: 'remindAt', label: _t('Hatırlat'), type: 'datetime-local' },
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
      { k: 'url', label: _t('Adres'), type: 'text', ph: 'https://' },
      { k: 'projectId', label: _t('Proje'), type: 'project' },
      { k: 'note', label: _t('Not'), type: 'textarea' },
    ],
  },
  note: {
    titles: [_t('Yeni not'), _t('Not')],
    fields: [
      { k: 'title', label: _t('Başlık'), type: 'text', ph: _t('Başlık') },
      { k: 'body', label: _t('İçerik'), type: 'textarea', grow: true },
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
  const draft = item || newItem(type, extra);
  editing = { type, item: draft, isNew };

  $('#sheetTitle').textContent = def.titles[isNew ? 0 : 1];
  $('#sheet').classList.remove('custom');
  $('#sheetDelete').hidden = isNew;
  const form = $('#sheetForm');
  form.replaceChildren(...def.fields.map((f) => buildField(f, draft[f.k])));
  if (!isNew) form.append(stampDetails(type, draft));
  $('#sheet').hidden = false;
  form.querySelector('input, textarea')?.focus();
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
    values[el.dataset.k] = el.classList.contains('colors') ? el.dataset.value : el.value;
  }
  const missing = FORMS[type].fields.find((f) => f.req && !String(values[f.k] || '').trim());
  if (missing) {
    toast(_t("“{0}” boş olamaz", missing.label));
    form.querySelector(`[data-k="${missing.k}"]`)?.focus();
    return;
  }
  if (type === 'note' && !values.title.trim() && !values.body.trim()) { closeEditor(); return; }
  if (!(await checkDuplicates(type, item, values, isNew))) return;
  if (type === 'task' && item.remindAt !== values.remindAt) item.done = false;

  const now = Date.now();
  if (isNew) item.created = now; // form açıldığında değil, kaydedildiğinde oluşturulmuş sayılır
  if (type === 'password' && values.password && values.password !== (isNew ? undefined : item.password)) item.pwChanged = now;
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
