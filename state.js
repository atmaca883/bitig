// Uygulama durumu, kayıt (persist) ve kayıtların durumunu değiştiren yardımcılar.
'use strict';

let autoLockMinutes = 10;   // 0 = otomatik kilit yok (Ayarlar'dan değişir)

let db = null;            // çözülmüş kasa — sadece kilit açıkken

let vaultExists = false;

let view = 'today';

let projectFilter = 'all';

let openProjectId = null;

let query = '';

let showDone = false;

let editing = null;       // { type, item, isNew }

let pendingReminder = null;

let lastActivity = Date.now();

let saveTimer = null;

let healthReturn = 'today';

let dialogResolve = null;

let dialogLocked = false;

// Durum değiştiren işlemler zaman damgalarını da günceller
// Eşitleme için: bir kaydın kalıcı olarak listeden çıktığını (silindiğini) işaretler
function tombstone(coll, id) {
  (db.tombstones ||= {})[`${coll}:${id}`] = Date.now();
}

function setDone(t, done) {
  t.done = done;
  t.completedAt = done ? Date.now() : null;
  t.updated = Date.now();
}

function setPassword(p, pw) {
  if (p.password !== pw) p.pwChanged = Date.now();
  p.password = pw;
  p.updated = Date.now();
}

// Projenin son hareketi: kendisi ya da bağlı herhangi bir kaydın son değişikliği
function projectActivity(p) {
  let last = p.updated || 0;
  for (const k of ['tasks', 'notes', 'passwords']) for (const x of db[k]) if (x.projectId === p.id && (x.updated || 0) > last) last = x.updated;
  return last;
}

function dueChip(due) {
  if (!due) return null;
  const t = todayStr();
  if (due < t) return h('span', { class: 'chip late' }, 'Gecikti · ' + fmtDate(due));
  if (due === t) return h('span', { class: 'chip today' }, 'Bugün');
  if (due === addDays(1)) return h('span', { class: 'chip' }, 'Yarın');
  return h('span', { class: 'chip' }, '📅 ' + fmtDate(due));
}

const projectById = (id) => db.projects.find((p) => p.id === id);

function projectChip(id) {
  const p = id && projectById(id);
  if (!p) return null;
  return h('span', { class: 'chip' }, h('span', { class: 'dot', style: `background:${COLORS[p.color] || COLORS.gray}` }), p.name);
}

function inFilter(item) {
  if (projectFilter === 'all') return true;
  if (projectFilter === 'none') return !item.projectId;
  return item.projectId === projectFilter;
}

// ---------- kayıt ----------
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
  pushReminders();
  updateBadge();
}

async function flush() {
  if (!saveTimer || !db) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  try { await kasa.save(db); } catch (e) { toast('Kaydedilemedi: ' + cleanErr(e)); }
}

function pushReminders() {
  if (!db) return;
  kasa.setReminders(db.tasks
    .filter((t) => !t.done && t.remindAt)
    .map((t) => ({ id: t.id, title: t.title, at: new Date(t.remindAt).getTime() })));
}

function updateBadge() {
  if (!db) return;
  const t = todayStr();
  const n = db.tasks.filter((x) => !x.done && x.due && x.due <= t).length;
  const b = $('#tabBadge');
  b.textContent = n;
  b.hidden = n === 0;
}

const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.title.localeCompare(b.title, 'tr');

// ---------- düzenleme ----------
const COLLECTION = { task: 'tasks', password: 'passwords', note: 'notes', project: 'projects' };

function newItem(type, extra = {}) {
  const pid = openProjectId || (!['all', 'none'].includes(projectFilter) ? projectFilter : '');
  const base = {
    task: { title: '', done: false, due: '', remindAt: '', projectId: pid, note: '' },
    password: { title: '', username: '', password: '', url: '', projectId: pid, note: '' },
    note: { title: '', body: '', projectId: pid },
    project: { name: '', color: 'blue' },
  }[type];
  const now = Date.now();
  const item = { id: uid(), ...base, ...extra, created: now, updated: now };
  if (type === 'password' && item.password) item.pwChanged = now;
  return item;
}
