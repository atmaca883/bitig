// Tekrarlayan görevlerin tarih hesabı ve notlardaki yapılacak listeleri ("- [ ] madde").
// Bilgisayar, telefon ve Node testleri aynı kodu kullanır.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.KasaRecur = api.recur; root.KasaList = api.list; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- tekrarlayan görevler ----------
  const REPEATS = ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'];
  const parse = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();

  // Bir adım sonrası. anchor: ayın asıl günü (31 → Şubat'ta 28/29, Mart'ta yine 31)
  function step(s, repeat, anchor) {
    const d = parse(s);
    const day = anchor || d.getDate();
    if (repeat === 'daily') d.setDate(d.getDate() + 1);
    else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
    else if (repeat === 'weekdays') { do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6); }
    else if (repeat === 'monthly') { const y = d.getFullYear(), m = d.getMonth() + 1; return fmt(new Date(y, m, Math.min(day, daysIn(y, m)))); }
    else if (repeat === 'yearly') { const y = d.getFullYear() + 1, m = d.getMonth(); return fmt(new Date(y, m, Math.min(day, daysIn(y, m)))); }
    else throw new Error('tekrar: ' + repeat);
    return fmt(d);
  }

  // Tamamlanınca bir sonraki tarih: son tarihten ilerle, bugünden sonraki ilk tekrara gel (kaçırılan dönemler atlanır)
  function next(due, repeat, today, anchor) {
    let cur = due;
    for (let i = 0; i < 10000; i++) {
      cur = step(cur, repeat, anchor);
      if (cur > today) return cur;
    }
    return cur;
  }

  // Hatırlatma ("2026-10-06T09:30") son tarihle aynı gün kadar kaysın, saat aynı kalsın
  function shiftDateTime(dt, fromDue, toDue) {
    if (!dt) return dt;
    const days = Math.round((Date.UTC(...toDue.split('-').map((x, i) => (i === 1 ? x - 1 : +x))) - Date.UTC(...fromDue.split('-').map((x, i) => (i === 1 ? x - 1 : +x)))) / 86_400_000);
    const [date, time] = dt.split('T');
    const d = parse(date);
    d.setDate(d.getDate() + days);
    return fmt(d) + (time ? 'T' + time : '');
  }

  // ---------- notlarda yapılacak listesi ----------
  const LINE = /^(\s*)[-*] \[( |x|X)\] ?(.*)$/;

  function items(body) {
    const out = [];
    String(body || '').split('\n').forEach((l, i) => {
      const m = l.match(LINE);
      if (m) out.push({ line: i, checked: m[2] !== ' ', text: m[3] });
    });
    return out;
  }
  function toggle(body, line) {
    const lines = String(body || '').split('\n');
    const m = lines[line]?.match(LINE);
    if (m) lines[line] = `${m[1]}- [${m[2] === ' ' ? 'x' : ' '}] ${m[3]}`;
    return lines.join('\n');
  }
  function add(body, text) {
    const b = String(body || '');
    return b + (b && !b.endsWith('\n') ? '\n' : '') + `- [ ] ${text}`;
  }
  function progress(body) {
    const it = items(body);
    return { done: it.filter((x) => x.checked).length, total: it.length };
  }
  // Listede gösterim için: "- [x] süt" → "☑ süt"
  const pretty = (line) => String(line).replace(LINE, (m, sp, c, t) => `${c === ' ' ? '☐' : '☑'} ${t}`);

  return {
    recur: { REPEATS, next, step, shiftDateTime },
    list: { items, toggle, add, progress, pretty },
  };
});
