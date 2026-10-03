// Çöp kutusu: silinen kayıtlar 30 gün saklanır ve geri yüklenebilir.
'use strict';

const TRASH_DAYS = 30;
const TRASH_ICON = { task: '✓', note: '📝', password: '🔑', project: '📁' };
const itemName = (x) => x.title || x.name || _t('Başlıksız');

// Kaydı çöp kutusuna taşı. Proje silinirse bağlı kayıtlar projesiz kalır; geri yüklenince yeniden bağlanır.
function moveToTrash(type, item, { silent = false } = {}) {
  const col = db[COLLECTION[type]];
  const i = col.indexOf(item);
  if (i < 0) return null;
  col.splice(i, 1);
  const now = Date.now();
  tombstone(COLLECTION[type], item.id);
  const entry = { id: uid(), type, item, deletedAt: now, updated: now };
  if (type === 'project') {
    entry.linked = {};
    for (const k of ['tasks', 'notes', 'passwords']) {
      entry.linked[k] = db[k].filter((x) => x.projectId === item.id).map((x) => x.id);
      for (const x of db[k]) if (x.projectId === item.id) { x.projectId = ''; x.updated = now; }
    }
    if (openProjectId === item.id) openProjectId = null;
    if (projectFilter === item.id) projectFilter = 'all';
  }
  (db.trash ||= []).push(entry);
  persist();
  if (!silent) {
    render();
    toast(_t("“{0}” çöp kutusuna taşındı", itemName(item)), { label: _t('Geri al'), fn: () => restoreFromTrash(entry.id) });
  }
  return entry;
}

function restoreFromTrash(entryId, { silent = false } = {}) {
  const i = (db.trash || []).findIndex((e) => e.id === entryId);
  if (i < 0) return;
  const [e] = db.trash.splice(i, 1);
  const now = Date.now();
  tombstone('trash', e.id);
  e.item.updated = now; // silinme zamanından yeni olsun ki diğer cihazlarda da geri gelsin
  const col = db[COLLECTION[e.type]];
  if (!col.some((x) => x.id === e.item.id)) col.push(e.item);
  if (e.type === 'project' && e.linked) {
    for (const [k, ids] of Object.entries(e.linked)) {
      for (const x of db[k]) if (ids.includes(x.id) && !x.projectId) { x.projectId = e.item.id; x.updated = now; }
    }
  }
  // bağlı olduğu proje de silinmişse projesiz geri gelir
  if (e.item.projectId && !projectById(e.item.projectId)) e.item.projectId = '';
  persist();
  if (!silent) {
    render();
    toast(_t("“{0}” geri yüklendi", itemName(e.item)));
  }
}

// 30 günden eski kayıtları kalıcı sil; silinen sayısını döndürür.
function purgeTrash() {
  const cutoff = Date.now() - TRASH_DAYS * 86_400_000;
  const old = (db.trash ||= []).filter((e) => e.deletedAt <= cutoff);
  for (const e of old) tombstone('trash', e.id);
  db.trash = db.trash.filter((e) => e.deletedAt > cutoff);
  return old.length;
}

async function deleteForever(entry) {
  if (!(await ask(_t('Kalıcı olarak silinsin mi?'), `“${itemName(entry.item)}” geri getirilemeyecek.`,
    [{ label: _t('Vazgeç'), value: false }, { label: _t('Kalıcı sil'), value: true, primary: true }]))) return;
  db.trash.splice(db.trash.indexOf(entry), 1);
  tombstone('trash', entry.id);
  persist();
  render();
  toast(_t('Kalıcı olarak silindi'));
}

async function emptyTrash() {
  const n = db.trash.length;
  if (!n || !(await ask(_t('Çöp kutusu boşaltılsın mı?'), _t("{0} kayıt kalıcı olarak silinecek ve geri getirilemeyecek.", n),
    [{ label: _t('Vazgeç'), value: false }, { label: _t('Boşalt'), value: true, primary: true }]))) return;
  for (const e of db.trash) tombstone('trash', e.id);
  db.trash = [];
  persist();
  render();
  toast(_t('Çöp kutusu boşaltıldı'));
}

function openTrash() {
  if (view !== 'trash' && view !== 'health') healthReturn = view;
  view = 'trash';
  selectedDay = null;
  query = '';
  $('#search').value = '';
  render();
  $('#content').scrollTop = 0;
}

VIEWS.trash = function (c) {
  const list = (db.trash || []).slice().sort((a, b) => b.deletedAt - a.deletedAt);
  c.append(h('div', { class: 'project-head' },
    h('button', { class: 'icon-btn', title: _t('Geri'), onclick: () => { view = healthReturn; render(); } }, '←'),
    h('h3', null, _t('🗑 Çöp kutusu')),
    list.length && h('button', { class: 'mini', onclick: emptyTrash }, _t('Boşalt'))));
  c.append(h('div', { class: 'muted small', style: 'padding:0 4px 8px' },
    _t("Silinen kayıtlar {0} gün burada kalır, sonra kalıcı olarak silinir.", TRASH_DAYS)));
  if (!list.length) return c.append(empty('🗑', _t('Çöp kutusu boş.')));
  for (const e of list) {
    const left = Math.max(0, Math.ceil((e.deletedAt + TRASH_DAYS * 86_400_000 - Date.now()) / 86_400_000));
    c.append(h('div', { class: `item trash-row ${TYPE_META[e.type].cls}` },
      h('div', { class: 'ico' }, TRASH_ICON[e.type]),
      h('div', { class: 'body' },
        h('div', { class: 'title' }, itemName(e.item)),
        h('div', { class: 'sub' }, _t("{0} · silindi {1} · {2} gün kaldı", TYPE_META[e.type].label, fmtStamp(e.deletedAt), left))),
      h('div', { class: 'side' },
        h('button', { class: 'mini primary-mini', onclick: () => restoreFromTrash(e.id) }, _t('Geri yükle')),
        h('button', { class: 'mini', title: _t('Kalıcı sil'), onclick: () => deleteForever(e) }, '✕'))));
  }
};
