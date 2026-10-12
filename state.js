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

const REPEAT_LABELS = () => ({
  daily: _t('Her gün'), weekdays: _t('Hafta içi her gün'), weekly: _t('Her hafta'), monthly: _t('Her ay'), yearly: _t('Her yıl'),
});

// Görevi tamamla. Tekrarlayan görev açık kalır, bir sonraki tarihe geçer (tamamlandığı gün geçmişe yazılır).
// Dönen: { before (geri almak için), next (tekrarlıysa yeni tarih) }
function completeTask(t) {
  const before = { done: t.done, due: t.due, remindAt: t.remindAt, completedAt: t.completedAt, history: t.history, updated: t.updated };
  if (t.repeat && !t.done) {
    const now = Date.now();
    const from = t.due || todayStr();
    const next = KasaRecur.next(from, t.repeat, todayStr(), t.repeatDay);
    t.history = [...(t.history || []), now].slice(-60);
    if (t.remindAt) t.remindAt = KasaRecur.shiftDateTime(t.remindAt, from, next);
    t.due = next;
    t.updated = now;
    return { before, next };
  }
  setDone(t, !t.done);
  return { before };
}

function undoComplete(t, before) {
  Object.assign(t, before);
  if (before.history === undefined) delete t.history;
  t.updated = Date.now();
}

// Şifre geçmişi: değiştirilen eski şifreler kayıtta saklanır (en yenisi başta, en fazla PW_HISTORY_MAX).
// { password, from: o şifrenin konduğu an, until: değiştirildiği an }. Kasa gibi şifrelidir ve eşitlenir.
const PW_HISTORY_MAX = 10;
function rememberOldPassword(p, next) {
  if (!p.password || p.password === next) return;
  const old = { password: p.password, from: p.pwChanged || p.created || 0, until: Date.now() };
  // geri dönülen şifre (şimdiki olacak) ve aynı şifrenin eski kopyaları listede tekrar durmasın
  const rest = (p.pwHistory || []).filter((x) => x.password !== next && x.password !== p.password);
  p.pwHistory = [old, ...rest].slice(0, PW_HISTORY_MAX);
}

function setPassword(p, pw) {
  if (p.password !== pw) { rememberOldPassword(p, pw); p.pwChanged = Date.now(); }
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
  if (due < t) return h('span', { class: 'chip late' }, _t('Gecikti · ') + fmtDate(due));
  if (due === t) return h('span', { class: 'chip today' }, _t('Bugün'));
  if (due === addDays(1)) return h('span', { class: 'chip' }, _t('Yarın'));
  return h('span', { class: 'chip' }, '📅 ' + fmtDate(due));
}

const projectById = (id) => db.projects.find((p) => p.id === id);

function projectChip(id) {
  const p = id && projectById(id);
  if (!p) return null;
  return h('span', { class: 'chip' }, h('span', { class: 'dot', style: `background:${COLORS[p.color] || COLORS.gray}` }), p.name);
}

// ---------- etiketler ----------
// Görev, şifre ve notlarda item.tags = ['iş', 'banka']. Büyük/küçük harf ve baştaki # fark etmez.
let tagFilter = ''; // seçili etiket (boş: süzgeç yok)
const tagKey = (t) => K.lower(String(t || '').trim().replace(/^#+/, ''));
function normTags(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list || []) {
    const t = String(raw).trim().replace(/^#+/, '').replace(/\s+/g, ' ').slice(0, 30);
    if (t && !seen.has(tagKey(t))) { seen.add(tagKey(t)); out.push(t); }
  }
  return out;
}
const hasTag = (item, tag) => (item.tags || []).some((t) => tagKey(t) === tagKey(tag));
// Kullanılan etiketler, en çok kullanılan başta: [{ tag, n }]
function allTags() {
  const m = new Map();
  for (const x of [...db.passwords, ...db.notes, ...db.tasks]) {
    for (const t of x.tags || []) {
      const k = tagKey(t);
      if (!m.has(k)) m.set(k, { tag: t, n: 0 });
      m.get(k).n++;
    }
  }
  return [...m.values()].sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag, 'tr'));
}
// Yazılan metindeki #etiketleri ayır: "Faturayı öde #ev #acil" → { text: 'Faturayı öde', tags: ['ev', 'acil'] }
function splitHashtags(s) {
  const tags = [];
  const text = String(s).replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, (_m, sp, t) => { tags.push(t); return sp; }).replace(/\s+/g, ' ').trim();
  return { text, tags: normTags(tags) };
}

function inFilter(item) {
  if (tagFilter && !hasTag(item, tagFilter)) return false;
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
  try {
    normalizeSpaces();
    snapshotShared();
    await kasa.save(personalCopy(db)); // ortak alan kayıtları kişisel kasaya ve kişisel buluta girmez
    scheduleSharePush();
  } catch (e) { toast(_t('Kaydedilemedi: ') + cleanErr(e)); }
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

// Yıldızlı kayıtlar listede hep üstte
const starredFirst = (cmp) => (a, b) => (!!b.starred - !!a.starred) || cmp(a, b);
function toggleStar(item) {
  if (item.starred) delete item.starred; else item.starred = true;
  item.updated = Date.now();
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
