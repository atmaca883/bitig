// Kayıt düzenleme sayfası, tekrar kontrolü ve silme.
'use strict';

const FORMS = {
  task: {
    titles: ['Yeni görev', 'Görev'],
    fields: [
      { k: 'title', label: 'Görev', type: 'text', req: true, ph: 'Ne yapılacak?' },
      { k: 'due', label: 'Son tarih', type: 'date' },
      { k: 'remindAt', label: 'Hatırlat', type: 'datetime-local' },
      { k: 'projectId', label: 'Proje', type: 'project' },
      { k: 'note', label: 'Not', type: 'textarea' },
    ],
  },
  password: {
    titles: ['Yeni şifre', 'Şifre'],
    fields: [
      { k: 'title', label: 'Başlık', type: 'text', req: true, ph: 'Örn. Hosting paneli' },
      { k: 'username', label: 'Kullanıcı adı / e-posta', type: 'text' },
      { k: 'password', label: 'Şifre', type: 'secret' },
      { k: 'url', label: 'Adres', type: 'text', ph: 'https://' },
      { k: 'projectId', label: 'Proje', type: 'project' },
      { k: 'note', label: 'Not', type: 'textarea' },
    ],
  },
  note: {
    titles: ['Yeni not', 'Not'],
    fields: [
      { k: 'title', label: 'Başlık', type: 'text', ph: 'Başlık' },
      { k: 'body', label: 'İçerik', type: 'textarea', grow: true },
      { k: 'projectId', label: 'Proje', type: 'project' },
    ],
  },
  project: {
    titles: ['Yeni proje', 'Proje'],
    fields: [
      { k: 'name', label: 'Proje adı', type: 'text', req: true, ph: 'Örn. Web sitesi' },
      { k: 'color', label: 'Renk', type: 'color' },
    ],
  },
};

function buildField(f, value) {
  const label = h('label', { class: f.grow ? 'grow' : null }, f.label);
  let input;
  if (f.type === 'textarea') {
    input = h('textarea', { 'data-k': f.k });
    input.value = value || '';
    label.append(input);
  } else if (f.type === 'project') {
    input = h('select', { 'data-k': f.k },
      h('option', { value: '' }, '— Projesiz —'),
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
      h('button', { type: 'button', class: 'mini', title: 'Göster / gizle',
        onclick: () => { input.type = input.type === 'password' ? 'text' : 'password'; } }, '👁'),
      h('button', { type: 'button', class: 'mini', title: 'Güçlü şifre üret',
        onclick: () => { input.value = generatePassword(); input.type = 'text'; } }, '🎲'),
      h('button', { type: 'button', class: 'mini', title: 'Kopyala',
        onclick: () => { if (input.value) { kasa.copy(input.value, true); toast('Şifre kopyalandı · 30 sn sonra silinecek'); } } }, '⧉')));
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
    ['Oluşturuldu', x.created],
    ['Son değişiklik', x.updated],
    type === 'password' && ['Şifre son değişti', x.pwChanged],
    type === 'task' && x.done && ['Tamamlandı', x.completedAt],
    type === 'project' && ['Son hareket', projectActivity(x)],
  ].filter(Boolean);
  return h('div', { class: 'stamps' },
    ...rows.map(([label, ms]) => h('div', null, h('span', null, label), h('b', null, ms ? fmtFull(ms) : 'bu özellikten önce eklendi'))));
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
    const choice = await ask('Bu hesap zaten kayıtlı',
      `“${dup.title}” · ${dup.username || 'kullanıcı adı yok'} aynı site ve kullanıcı adıyla kayıtlı.`,
      [{ label: 'Vazgeç', value: null }, { label: 'Ayrı kaydet', value: 'keep' },
        { label: 'Mevcut kaydı güncelle', value: 'merge', primary: true }]);
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
      toast('Mevcut kayıt güncellendi');
      return false;
    }
    return choice === 'keep';
  }

  if (type === 'task' && (isNew || K.lower(item.title) !== K.lower(values.title))) {
    const dup = findDuplicateTask(probe);
    if (!dup) return true;
    return !!(await ask('Bu görev zaten var', `“${dup.title}” açık görevler arasında zaten duruyor.`,
      [{ label: 'Vazgeç', value: false }, { label: 'Yine de kaydet', value: true, primary: true }]));
  }

  if (type === 'note' && (isNew || K.lower(item.title) !== K.lower(values.title))) {
    const title = K.lower(values.title);
    const body = values.body.trim();
    const dup = db.notes.find((n) => n !== item
      && ((title && K.lower(n.title) === title) || (body && (n.body || '').trim() === body)));
    if (!dup) return true;
    const choice = await ask('Benzer bir not var', `“${dup.title || 'Başlıksız not'}” aynı başlığa ya da içeriğe sahip.`,
      [{ label: 'Vazgeç', value: null }, { label: 'Mevcut notu aç', value: 'open' },
        { label: 'Yine de kaydet', value: 'keep', primary: true }]);
    if (choice === 'open') openEditor('note', dup);
    return choice === 'keep';
  }

  if (type === 'project') {
    const dup = db.projects.find((p) => p !== item && K.lower(p.name) === K.lower(values.name));
    if (dup) { toast('Bu isimde bir proje zaten var'); return false; }
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
    toast(`“${missing.label}” boş olamaz`);
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
  toast('Kaydedildi');
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
