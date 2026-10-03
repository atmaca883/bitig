// Alttaki aylık takvim, gün görünümü ve liste/takvim bölücüsü.
'use strict';

// ---------- takvim ----------
const TYPE_META = {
  task: { label: 'Görev', cls: 't-task' },
  note: { label: 'Not', cls: 't-note' },
  password: { label: 'Şifre', cls: 't-pass' },
  project: { label: 'Proje', cls: 't-proj' },
};

let selectedDay = null;

let calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

let calCollapsed = false;

let calRatio = 50;

try {
  calCollapsed = localStorage.getItem('kasa.calCollapsed') === '1';
  calRatio = Number(localStorage.getItem('kasa.calRatio')) || 50;
} catch {}

const dayOf = (ms) => (ms ? localDate(new Date(ms)) : '');

const fmtDayLong = (day) => new Date(day + 'T00:00').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

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
    query = '';
    $('#search').value = '';
  }
  render();
  $('#content').scrollTop = 0;
}

function shiftMonth(n) {
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + n, 1);
  renderCalendar();
}

function applySplit() {
  $('#calendar').style.flexBasis = calCollapsed ? 'auto' : calRatio + '%';
  document.body.classList.toggle('cal-collapsed', calCollapsed);
}

function toggleCalendar() {
  calCollapsed = !calCollapsed;
  try { localStorage.setItem('kasa.calCollapsed', calCollapsed ? '1' : '0'); } catch {}
  applySplit();
  renderCalendar();
}

function renderCalendar() {
  const cal = $('#calendar');
  if (!db) { cal.replaceChildren(); return; }
  applySplit();
  const y = calMonth.getFullYear();
  const m = calMonth.getMonth();
  const today = todayStr();
  const head = h('div', { class: 'cal-head' },
    h('button', { class: 'icon-btn', type: 'button', title: 'Önceki ay', onclick: () => shiftMonth(-1) }, '‹'),
    h('div', { class: 'cal-title' }, calMonth.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })),
    h('button', { class: 'icon-btn', type: 'button', title: 'Sonraki ay', onclick: () => shiftMonth(1) }, '›'),
    h('span', { class: 'spacer' }),
    h('button', { class: 'mini', type: 'button', onclick: () => selectDay(today) }, 'Bugün'),
    h('button', { class: 'icon-btn', type: 'button', title: calCollapsed ? 'Takvimi aç' : 'Takvimi küçült', onclick: toggleCalendar },
      calCollapsed ? '▴' : '▾'));
  if (calCollapsed) { cal.replaceChildren(head); return; }

  const idx = dayIndex();
  const legend = h('div', { class: 'cal-legend' },
    ...Object.values(TYPE_META).map((t) => h('span', { class: t.cls }, h('i'), t.label)));
  const grid = h('div', { class: 'cal-grid' },
    ...['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].map((d) => h('div', { class: 'cal-dow' }, d)));
  const offset = (new Date(y, m, 1).getDay() + 6) % 7; // hafta pazartesi başlar
  for (let i = 0; i < 42; i++) {
    const d = new Date(y, m, 1 - offset + i);
    const day = localDate(d);
    const e = idx.get(day);
    const types = e ? Object.keys(TYPE_META).filter((k) => e[k].size) : [];
    const summary = types.map((k) => `${e[k].size} ${TYPE_META[k].label.toLocaleLowerCase('tr')}`).join(' · ');
    const cls = ['cal-day', d.getMonth() !== m && 'out', day === today && 'today', day === selectedDay && 'sel',
      (d.getDay() === 0 || d.getDay() === 6) && 'weekend'].filter(Boolean).join(' ');
    grid.append(h('button', {
      class: cls, type: 'button', 'data-day': day,
      title: fmtDayLong(day) + (summary ? '\n' + summary : ''),
      onclick: () => selectDay(day === selectedDay ? null : day),
    },
    h('span', { class: 'cal-num' }, d.getDate()),
    h('span', { class: 'cal-badges' }, ...types.map((k) => h('span', {
      class: `cal-badge ${TYPE_META[k].cls}${k === 'task' && e.late ? ' late' : ''}`,
    }, e[k].size > 1 ? e[k].size : '')))));
  }
  cal.replaceChildren(head, legend, grid);
}

// Seçilen günün ayrıntısı (üst bölümde)
function renderDay(c) {
  const e = dayIndex().get(selectedDay);
  const list = (k) => (e ? [...e[k]] : []);
  c.append(h('div', { class: 'project-head' },
    h('button', { class: 'icon-btn', title: 'Gün görünümünü kapat', onclick: () => selectDay(null) }, '←'),
    h('h3', null, '📅 ' + fmtDayLong(selectedDay))));
  c.append(quickAdd('＋ Bu güne görev ekle… (Enter)', selectedDay));

  const tasks = list('task');
  const due = tasks.filter((t) => t.due === selectedDay).sort(byDue);
  const doneThatDay = tasks.filter((t) => t.due !== selectedDay);
  if (due.length) c.append(section('Son tarihi bu gün', due.length), ...due.map((t) => taskRow(t)));
  if (doneThatDay.length) c.append(section('Bu gün tamamlanan', doneThatDay.length), ...doneThatDay.map((t) => taskRow(t)));
  const notes = list('note');
  if (notes.length) c.append(section('Notlar · eklenen / değişen', notes.length), ...notes.map((n) => noteRow(n)));
  const pws = list('password');
  if (pws.length) c.append(section('Şifreler · eklenen / değişen', pws.length), ...pws.map((p) => passwordRow(p)));
  const projects = list('project');
  if (projects.length) c.append(section('Bu gün açılan projeler', projects.length), ...projects.map(projectRow));
  if (!e) c.append(empty('📅', 'Bu günde kayıt yok. Yukarıdan görev ekleyebilirsin.'));
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
