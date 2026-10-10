// Alttaki takvim (ay / hafta / kapalı), gün görünümü ve liste/takvim bölücüsü.
'use strict';

// ---------- takvim ----------
const TYPE_META = {
  task: { label: _t('Görev'), cls: 't-task' },
  note: { label: _t('Not'), cls: 't-note' },
  password: { label: _t('Şifre'), cls: 't-pass' },
  project: { label: _t('Proje'), cls: 't-proj' },
};

let selectedDay = null;

let calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

// Hafta görünümünde gösterilen haftanın pazartesisi
const mondayOf = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
let calWeek = mondayOf(new Date());

// Görünüm: "month" | "week" | "collapsed". Kullanıcı seçmediyse panelin yüksekliğine göre kendiliğinden seçilir.
const CAL_MODES = ['month', 'week', 'collapsed'];
let calModeChoice = null;

let calRatio = 45;

try {
  calModeChoice = localStorage.getItem('kasa.calMode');
  if (!CAL_MODES.includes(calModeChoice)) calModeChoice = localStorage.getItem('kasa.calCollapsed') === '1' ? 'collapsed' : null;
  calRatio = Number(localStorage.getItem('kasa.calRatio')) || 45;
} catch {}

// Liste için yer kalsın: uzun panelde ay, orta boyda tek satırlık hafta, kısa panelde yalnızca başlık
function autoCalMode() {
  const h = $('#split')?.getBoundingClientRect().height || window.innerHeight;
  // Telefonda liste daha önemli: ay görünümü yalnızca uzun ekranlarda (tablet)
  const monthFrom = document.body.classList.contains('phone') ? 760 : 640;
  return h >= monthFrom ? 'month' : h >= 400 ? 'week' : 'collapsed';
}
const calMode = () => calModeChoice || autoCalMode();
let lastCalMode = null;

const dayOf = (ms) => (ms ? localDate(new Date(ms)) : '');

const fmtDayLong = (day) => new Date(day + 'T00:00').toLocaleDateString(KasaI18n.locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// Gün → o güne düşen kayıtlar. Görev: son tarih ve tamamlandığı gün.
// Not, şifre: oluşturulduğu ve değiştiği gün. Proje: oluşturulduğu gün.
function dayIndex() {
  const map = new Map();
  const add = (day, type, x) => {
    if (!day) return;
    let e = map.get(day);
    if (!e) map.set(day, (e = { task: new Set(), note: new Set(), password: new Set(), project: new Set(), late: false }));
    e[type].add(x);
  };
  const t0 = todayStr();
  for (const t of db.tasks) {
    if (!inFilter(t)) continue;
    add(t.due, 'task', t);
    add(dayOf(t.completedAt), 'task', t);
    for (const ms of t.history || []) add(dayOf(ms), 'task', t); // tekrarlayan görev: her tamamlandığı gün
    if (!t.done && t.due && t.due < t0) map.get(t.due).late = true;
  }
  for (const n of db.notes) if (inFilter(n)) { add(dayOf(n.created), 'note', n); add(dayOf(n.updated), 'note', n); }
  for (const p of db.passwords) {
    if (inFilter(p)) { add(dayOf(p.created), 'password', p); add(dayOf(p.pwChanged), 'password', p); add(dayOf(p.updated), 'password', p); }
  }
  for (const p of db.projects) if (projectFilter === 'all' || p.id === projectFilter) add(dayOf(p.created), 'project', p);
  return map;
}

function selectDay(day) {
  selectedDay = day;
  if (day) {
    const d = new Date(day + 'T00:00');
    calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    calWeek = mondayOf(d);
    query = '';
    $('#search').value = '';
  }
  render();
  $('#content').scrollTop = 0;
}

// ‹ › : ay görünümünde bir ay, hafta görünümünde bir hafta
function shiftCal(n) {
  if (calMode() === 'week') {
    calWeek = new Date(calWeek.getFullYear(), calWeek.getMonth(), calWeek.getDate() + 7 * n);
    calMonth = new Date(calWeek.getFullYear(), calWeek.getMonth(), 1);
  } else {
    calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + n, 1);
  }
  renderCalendar();
}

function applySplit() {
  const mode = calMode();
  // Hafta ve kapalı görünüm kendi yüksekliği kadar yer kaplar; bölücü yalnızca ay görünümünde
  $('#calendar').style.flexBasis = mode === 'month' ? calRatio + '%' : 'auto';
  document.body.classList.toggle('cal-collapsed', mode === 'collapsed');
  document.body.classList.toggle('cal-week', mode === 'week');
}

function setCalMode(mode) {
  calModeChoice = mode;
  try { localStorage.setItem('kasa.calMode', mode); } catch {}
  renderCalendar();
}

// Kapalıyken açınca: daha önce seçilen görünüm ya da panele uygun olan (kapalı değil)
const openMode = () => (autoCalMode() === 'month' ? 'month' : 'week');

function toggleCalendar() {
  setCalMode(calMode() === 'collapsed' ? openMode() : 'collapsed');
}

const shortMonth = (d) => d.toLocaleDateString(KasaI18n.locale(), { day: 'numeric', month: 'short' });
function weekTitle() {
  const end = new Date(calWeek.getFullYear(), calWeek.getMonth(), calWeek.getDate() + 6);
  const sameMonth = end.getMonth() === calWeek.getMonth();
  return (sameMonth ? calWeek.getDate() : shortMonth(calWeek)) + ' – ' + shortMonth(end);
}

function dayCell(d, idx, { outOf = null } = {}) {
  const today = todayStr();
  const day = localDate(d);
  const e = idx.get(day);
  const types = e ? Object.keys(TYPE_META).filter((k) => e[k].size) : [];
  const summary = types.map((k) => `${e[k].size} ${TYPE_META[k].label.toLocaleLowerCase('tr')}`).join(' · ');
  const cls = ['cal-day', outOf !== null && d.getMonth() !== outOf && 'out', day === today && 'today', day === selectedDay && 'sel',
    (d.getDay() === 0 || d.getDay() === 6) && 'weekend'].filter(Boolean).join(' ');
  return h('button', {
    class: cls, type: 'button', 'data-day': day,
    title: fmtDayLong(day) + (summary ? '\n' + summary : ''),
    onclick: () => selectDay(day === selectedDay ? null : day),
  },
  h('span', { class: 'cal-num' }, d.getDate()),
  h('span', { class: 'cal-badges' }, ...types.map((k) => h('span', {
    class: `cal-badge ${TYPE_META[k].cls}${k === 'task' && e.late ? ' late' : ''}`,
  }, e[k].size > 1 ? e[k].size : ''))));
}

function renderCalendar() {
  const cal = $('#calendar');
  if (!db) { cal.replaceChildren(); return; }
  const mode = calMode();
  lastCalMode = mode;
  applySplit();
  const y = calMonth.getFullYear();
  const m = calMonth.getMonth();
  const today = todayStr();
  const week = mode === 'week';
  const head = h('div', { class: 'cal-head' },
    h('button', { class: 'icon-btn', type: 'button', title: week ? _t('Önceki hafta') : _t('Önceki ay'), onclick: () => shiftCal(-1) }, '‹'),
    h('div', { class: 'cal-title' }, week ? weekTitle() : calMonth.toLocaleDateString(KasaI18n.locale(), { month: 'long', year: 'numeric' })),
    h('button', { class: 'icon-btn', type: 'button', title: week ? _t('Sonraki hafta') : _t('Sonraki ay'), onclick: () => shiftCal(1) }, '›'),
    h('span', { class: 'spacer' }),
    h('button', { class: 'mini', type: 'button', onclick: () => selectDay(today) }, _t('Bugün')),
    mode !== 'collapsed' && h('button', {
      class: 'mini cal-mode', type: 'button',
      title: week ? _t('Tüm ayı göster') : _t('Yalnızca bu haftayı göster'),
      onclick: () => setCalMode(week ? 'month' : 'week'),
    }, week ? _t('Ay') : _t('Hafta')),
    h('button', { class: 'icon-btn', type: 'button', title: mode === 'collapsed' ? _t('Takvimi aç') : _t('Takvimi küçült'), onclick: toggleCalendar },
      mode === 'collapsed' ? '▴' : '▾'));
  if (mode === 'collapsed') { cal.replaceChildren(head); return; }

  const idx = dayIndex();
  const dows = [_t('Pt'), _t('Sa'), _t('Ça'), _t('Pe'), _t('Cu'), _t('Ct'), _t('Pz')].map((d) => h('div', { class: 'cal-dow' }, d));
  if (week) {
    const grid = h('div', { class: 'cal-grid week' }, ...dows);
    for (let i = 0; i < 7; i++) grid.append(dayCell(new Date(calWeek.getFullYear(), calWeek.getMonth(), calWeek.getDate() + i), idx));
    cal.replaceChildren(head, grid);
    return;
  }
  const legend = h('div', { class: 'cal-legend' },
    ...Object.values(TYPE_META).map((t) => h('span', { class: t.cls }, h('i'), t.label)));
  const offset = (new Date(y, m, 1).getDay() + 6) % 7; // hafta pazartesi başlar
  const weeks = Math.ceil((offset + new Date(y, m + 1, 0).getDate()) / 7); // yalnızca bu ayın haftaları (4–6)
  const grid = h('div', { class: 'cal-grid', style: `grid-template-rows: auto repeat(${weeks}, minmax(26px, 1fr))` }, ...dows);
  for (let i = 0; i < weeks * 7; i++) grid.append(dayCell(new Date(y, m, 1 - offset + i), idx, { outOf: m }));
  cal.replaceChildren(head, legend, grid);
}

// Panel boyu değişince (kullanıcı seçmediyse) uygun görünüme geç
addEventListener('resize', () => {
  if (db && !calModeChoice && autoCalMode() !== lastCalMode) renderCalendar();
});

// Seçilen günün ayrıntısı (üst bölümde)
function renderDay(c) {
  const e = dayIndex().get(selectedDay);
  const list = (k) => (e ? [...e[k]] : []);
  c.append(h('div', { class: 'project-head' },
    h('button', { class: 'icon-btn', title: _t('Gün görünümünü kapat'), onclick: () => selectDay(null) }, '←'),
    h('h3', null, '📅 ' + fmtDayLong(selectedDay))));
  c.append(quickAdd(_t('＋ Bu güne görev ekle… (Enter)'), selectedDay));

  const tasks = list('task');
  const due = tasks.filter((t) => t.due === selectedDay).sort(byDue);
  const doneThatDay = tasks.filter((t) => t.due !== selectedDay);
  if (due.length) c.append(section(_t('Son tarihi bu gün'), due.length), ...due.map((t) => taskRow(t)));
  if (doneThatDay.length) c.append(section(_t('Bu gün tamamlanan'), doneThatDay.length), ...doneThatDay.map((t) => taskRow(t)));
  const notes = list('note');
  if (notes.length) c.append(section(_t('Notlar · eklenen / değişen'), notes.length), ...notes.map((n) => noteRow(n)));
  const pws = list('password');
  if (pws.length) c.append(section(_t('Şifreler · eklenen / değişen'), pws.length), ...pws.map((p) => passwordRow(p)));
  const projects = list('project');
  if (projects.length) c.append(section(_t('Bu gün açılan projeler'), projects.length), ...projects.map(projectRow));
  if (!e) c.append(empty('📅', _t('Bu günde kayıt yok. Yukarıdan görev ekleyebilirsin.')));
}

// Liste ile takvim arasındaki çizgiyi sürükleyerek boyutlandır; çift tıkla takvimi küçült/aç
(() => {
  const sp = $('#splitter');
  sp.addEventListener('pointerdown', (e) => {
    sp.setPointerCapture(e.pointerId);
    sp.classList.add('dragging');
  });
  sp.addEventListener('pointermove', (e) => {
    if (!sp.hasPointerCapture(e.pointerId)) return;
    const r = $('#split').getBoundingClientRect();
    calRatio = Math.round(Math.max(22, Math.min(75, ((r.bottom - e.clientY) / r.height) * 100)));
    applySplit();
  });
  const end = (e) => {
    if (!sp.hasPointerCapture(e.pointerId)) return;
    sp.releasePointerCapture(e.pointerId);
    sp.classList.remove('dragging');
    try { localStorage.setItem('kasa.calRatio', String(calRatio)); } catch {}
  };
  sp.addEventListener('pointerup', (e) => end(e));
  sp.addEventListener('pointercancel', (e) => end(e));
  sp.addEventListener('dblclick', (e) => toggleCalendar(e));
})();
