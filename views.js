// Sekme görünümleri, arama, proje filtresi ve Kontrol (tekrarlar) ekranı.
'use strict';

// ---------- görünümler ----------
const VIEWS = {
  // Bugün: kartlardan oluşur; kartlar küçültülebilir, kapatılabilir, sırası değiştirilebilir.
  today(c) {
    const prefs = todayPrefs();
    for (const key of prefs.order) {
      if (prefs.hidden.includes(key)) continue;
      const card = TODAY_CARDS[key];
      const data = card.data();
      if (data === null) continue; // gösterecek bir şey yoksa kart hiç çıkmaz
      if (card.bare) { c.append(card.render(data)); continue; }
      const collapsed = prefs.collapsed.includes(key);
      c.append(h('div', { class: 'today-card' + (collapsed ? ' collapsed' : ''), 'data-card': key },
        section(card.title, Array.isArray(data) ? data.length : null,
          h('button', { class: 'card-btn', title: collapsed ? 'Genişlet' : 'Küçült', onclick: () => toggleTodayPref('collapsed', key) }, collapsed ? '▸' : '▾'),
          h('button', { class: 'card-btn', title: 'Kartı kapat (Kartları düzenle’den geri açılır)', onclick: () => toggleTodayPref('hidden', key) }, '✕')),
        !collapsed && card.render(data)));
    }
    c.append(h('div', { class: 'footer-actions' },
      h('button', { class: 'ghost small', onclick: () => openTodayCardsSheet() }, '⚙ Kartları düzenle')));
  },

  passwords(c) {
    const list = db.passwords.filter(inFilter).sort((a, b) => a.title.localeCompare(b.title, 'tr'));
    if (!list.length) return c.append(empty('🔑', 'Henüz şifre yok. ＋ ile ekle.'));
    c.append(...list.map((x) => passwordRow(x)));
  },

  notes(c) {
    const list = db.notes.filter(inFilter).sort((a, b) => (b.updated || 0) - (a.updated || 0));
    if (!list.length) return c.append(empty('📝', 'Henüz not yok. ＋ ile ekle.'));
    c.append(...list.map((x) => noteRow(x)));
  },

  tasks(c) {
    const all = db.tasks.filter(inFilter);
    const open = all.filter((x) => !x.done).sort(byDue);
    const done = all.filter((x) => x.done).sort((a, b) => (b.updated || 0) - (a.updated || 0));
    c.append(quickAdd('＋ Hızlı görev ekle… (Enter)'));
    c.append(section('Açık', open.length));
    c.append(...(open.length ? open.map((x) => taskRow(x)) : [empty('✅', 'Açık görev yok.')]));
    if (done.length) {
      c.append(section('Tamamlanan', done.length,
        h('button', { class: 'mini', onclick: () => { showDone = !showDone; render(); } }, showDone ? 'Gizle' : 'Göster')));
      if (showDone) c.append(...done.map((x) => taskRow(x)));
    }
  },

  projects(c) {
    const p = openProjectId && projectById(openProjectId);
    if (!p) {
      openProjectId = null;
      if (!db.projects.length) c.append(empty('📁', 'Henüz proje yok. ＋ ile ekle.'));
      c.append(...db.projects.slice().sort((a, b) => a.name.localeCompare(b.name, 'tr')).map(projectRow));
      c.append(h('div', { class: 'footer-actions' },
        h('button', { class: 'ghost small', onclick: () => openHealth() }, '🛡 Kontrol'),
        h('button', { class: 'ghost small', onclick: () => openTrash() }, `🗑 Çöp kutusu${db.trash?.length ? ` (${db.trash.length})` : ''}`),
        h('button', { class: 'ghost small', onclick: () => openSettingsSheet() }, '⚙ Ayarlar ve yedek')));
      return;
    }
    // proje detayı: projeye bağlı her şey tek ekranda
    const opts = { hideProject: true };
    const tasks = db.tasks.filter((t) => t.projectId === p.id);
    const open = tasks.filter((t) => !t.done).sort(byDue);
    const done = tasks.filter((t) => t.done);
    const notes = db.notes.filter((n) => n.projectId === p.id).sort((a, b) => (b.updated || 0) - (a.updated || 0));
    const pws = db.passwords.filter((x) => x.projectId === p.id);
    const add = (type) => h('button', { class: 'mini', onclick: () => openEditor(type, null, { projectId: p.id }) }, '＋');

    c.append(h('div', { class: 'project-head' },
      h('button', { class: 'icon-btn', title: 'Projelere dön', onclick: () => { openProjectId = null; render(); } }, '←'),
      h('span', { class: 'dot', style: `width:12px;height:12px;background:${COLORS[p.color] || COLORS.gray}` }),
      h('h3', null, p.name),
      h('button', { class: 'mini', onclick: () => openEditor('project', p) }, 'Düzenle')));
    c.append(h('div', { class: 'chips project-stamps' },
      p.created && h('span', { class: 'chip stamp', title: stampTitle(p) }, '📅 Oluşturuldu: ' + fmtStamp(p.created)),
      stampChip(p, projectActivity(p), '🕒 Son hareket: ')));

    c.append(section('Görevler', open.length, add('task')));
    c.append(...open.map((x) => taskRow(x, opts)));
    if (done.length) c.append(h('div', { class: 'muted small', style: 'padding:0 4px' }, `+ ${done.length} tamamlanmış görev`));
    c.append(section('Notlar', notes.length, add('note')), ...notes.map((x) => noteRow(x, opts)));
    c.append(section('Şifreler', pws.length, add('password')), ...pws.map((x) => passwordRow(x, opts)));
  },

  // Kontrol: tekrarlı kayıtlar, aynı şifreyi kullanan hesaplar, notlarda unutulmuş şifreler
  health(c) {
    const r = healthReport();
    c.append(h('div', { class: 'project-head' },
      h('button', { class: 'icon-btn', title: 'Geri', onclick: () => { view = healthReturn; render(); } }, '←'),
      h('h3', null, '🛡 Kontrol')));

    if (!r.fixable && !r.reused.length) {
      return c.append(empty('✅', 'Her şey temiz: tekrarlı kayıt ya da notlarda unutulmuş şifre yok.'));
    }

    if (r.loose.length) {
      c.append(section('Notlarda unutulmuş şifreler', r.loose.length));
      for (const x of r.loose) {
        c.append(h('div', { class: 'group' },
          x.type === 'note' ? noteRow(x.item) : taskRow(x.item),
          h('div', { class: 'group-info' }, x.found.map((e) => `🔑 ${e.title || e.site || 'Giriş'}${e.username ? ' · ' + e.username : ''}`).join('\n')),
          h('div', { class: 'group-actions' },
            h('button', { class: 'mini primary-mini', onclick: () => importLoose(x.item, x.found, false) }, 'Şifrelere aktar'),
            h('button', { class: 'mini', onclick: () => importLoose(x.item, x.found, true) }, 'Aktar + nottan gizle'),
            h('button', { class: 'mini', onclick: () => ignoreLoose(x.item, x.found) }, 'Göz ardı et'))));
      }
    }

    if (r.dupAccounts.length) {
      c.append(section('Tekrarlı şifre kayıtları', r.dupAccounts.length));
      for (const g of r.dupAccounts) {
        const differs = new Set(g.map((p) => p.password)).size > 1;
        c.append(h('div', { class: 'group' },
          ...g.map((p) => passwordRow(p)),
          differs && h('div', { class: 'group-info' }, 'Şifreler farklı: birleştirince en son güncellenen şifre korunur.'),
          h('div', { class: 'group-actions' },
            h('button', { class: 'mini primary-mini', onclick: () => mergePasswords(g) }, 'Birleştir'))));
      }
    }

    const dupGroup = (title, groups, rowFn, coll) => {
      if (!groups.length) return;
      c.append(section(title, groups.length));
      for (const g of groups) {
        c.append(h('div', { class: 'group' }, ...g.map((x) => rowFn(x)),
          h('div', { class: 'group-actions' },
            h('button', { class: 'mini primary-mini', onclick: () => removeExtras(coll, g) }, `Fazlaları sil (${g.length - 1})`))));
      }
    };
    dupGroup('Tekrarlı görevler', r.dupTasks, (x) => taskRow(x), 'tasks');
    dupGroup('Tekrarlı notlar', r.dupNotes, (x) => noteRow(x), 'notes');

    if (r.reused.length) {
      c.append(section('Aynı şifreyi kullanan hesaplar', r.reused.length));
      c.append(h('div', { class: 'muted small', style: 'padding:0 4px 6px' },
        'Bir site ele geçirilirse aynı şifreli diğer hesaplar da risk altına girer. Bunların şifresini değiştirmen önerilir.'));
      for (const g of r.reused) c.append(h('div', { class: 'group warn' }, ...g.map((p) => passwordRow(p))));
    }
  },
};

// ---------- Bugün kartları ----------
// data(): kartın verisi; null dönerse kart gizlenir. bare: başlıksız kart.
const TODAY_CARDS = {
  health: {
    title: 'Kontrol uyarısı', bare: true,
    data: () => healthReport().fixable || null,
    render: (n) => h('div', { class: 'item health-link', onclick: () => openHealth() },
      h('div', { class: 'ico' }, '🛡'),
      h('div', { class: 'body' },
        h('div', { class: 'title' }, `${n} konu kontrol bekliyor`),
        h('div', { class: 'sub' }, 'Tekrarlı kayıtlar ya da notlarda unutulmuş şifreler')),
      h('span', { class: 'muted' }, '›')),
  },
  quick: {
    title: 'Hızlı görev ekleme', bare: true,
    data: () => true,
    render: () => quickAdd('＋ Bugün için hızlı görev… (Enter)', todayStr()),
  },
  late: {
    title: 'Gecikmiş',
    data: () => nonEmpty(openTasks().filter((x) => x.due && x.due < todayStr()).sort(byDue)),
    render: (list) => h('div', null, ...list.map((x) => taskRow(x))),
  },
  today: {
    title: 'Bugün',
    data: () => openTasks().filter((x) => x.due === todayStr()),
    render: (list) => h('div', null, ...(list.length ? list.map((x) => taskRow(x))
      : [h('div', { class: 'muted small', style: 'padding:2px 4px 6px' }, 'Bugün için görev yok 🎉')])),
  },
  soon: {
    title: 'Önümüzdeki 7 gün',
    data: () => nonEmpty(openTasks().filter((x) => x.due > todayStr() && x.due <= addDays(7)).sort(byDue)),
    render: (list) => h('div', null, ...list.map((x) => taskRow(x))),
  },
  reminders: {
    title: 'Yaklaşan hatırlatmalar',
    data: () => nonEmpty(openTasks().filter((x) => x.remindAt && new Date(x.remindAt) > Date.now()
      && new Date(x.remindAt) - Date.now() < 7 * 86_400_000).sort((a, b) => a.remindAt.localeCompare(b.remindAt))),
    render: (list) => h('div', null, ...list.map((x) => taskRow(x))),
  },
  notes: {
    title: 'Son notlar',
    data: () => nonEmpty(db.notes.filter(inFilter).sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, 3)),
    render: (list) => h('div', null, ...list.map((x) => noteRow(x))),
  },
  passwords: {
    title: 'Son eklenen şifreler',
    data: () => nonEmpty(db.passwords.filter(inFilter)
      .sort((a, b) => (b.created || b.updated || 0) - (a.created || a.updated || 0)).slice(0, 3)),
    render: (list) => h('div', null, ...list.map((x) => passwordRow(x))),
  },
  doneToday: {
    title: 'Bugün tamamlananlar',
    data: () => nonEmpty(db.tasks.filter((x) => x.done && inFilter(x) && dayOf(x.completedAt) === todayStr())),
    render: (list) => h('div', null, ...list.map((x) => taskRow(x))),
  },
  projects: {
    title: 'Projeler',
    data: () => nonEmpty(db.projects.filter((p) => projectFilter === 'all' || p.id === projectFilter)
      .sort((a, b) => projectActivity(b) - projectActivity(a)).slice(0, 4)),
    render: (list) => h('div', null, ...list.map((p) => {
      const row = projectRow(p);
      row.onclick = () => { view = 'projects'; openProjectId = p.id; render(); };
      return row;
    })),
  },
};
const TODAY_DEFAULT_HIDDEN = ['reminders', 'passwords', 'doneToday', 'projects'];
const nonEmpty = (list) => (list.length ? list : null);
const openTasks = () => db.tasks.filter((x) => !x.done && inFilter(x));

// Kart tercihleri kasanın içinde saklanır (yedeklerle birlikte gider)
function todayPrefs() {
  db.prefs ||= {};
  const p = (db.prefs.today ||= { order: [], hidden: [...TODAY_DEFAULT_HIDDEN], collapsed: [] });
  for (const k of Object.keys(TODAY_CARDS)) if (!p.order.includes(k)) p.order.push(k); // sonradan eklenen kartlar
  p.order = p.order.filter((k) => TODAY_CARDS[k]);
  return p;
}

function toggleTodayPref(list, key) {
  const p = todayPrefs();
  p[list] = p[list].includes(key) ? p[list].filter((k) => k !== key) : [...p[list], key];
  db.prefs.updated = Date.now();
  persist();
  render();
  if (list === 'hidden' && p.hidden.includes(key)) {
    toast(`“${TODAY_CARDS[key].title}” kartı kapatıldı`, { label: 'Geri al', fn: () => toggleTodayPref('hidden', key) });
  }
}

function moveTodayCard(key, dir) {
  const p = todayPrefs();
  const i = p.order.indexOf(key);
  const j = i + dir;
  if (j < 0 || j >= p.order.length) return;
  [p.order[i], p.order[j]] = [p.order[j], p.order[i]];
  db.prefs.updated = Date.now();
  persist();
  render();
  openTodayCardsSheet();
}

function openTodayCardsSheet() {
  editing = null;
  const p = todayPrefs();
  $('#sheetForm').replaceChildren(
    h('p', { class: 'muted small' }, 'Bugün ekranında hangi kartların görüneceğini ve sırasını seç. Boş kartlar zaten kendiliğinden gizlenir.'),
    ...p.order.map((key, i) => {
      const sw = h('input', { type: 'checkbox', class: 'switch', onchange: () => toggleTodayPref('hidden', key) });
      sw.checked = !p.hidden.includes(key);
      return h('div', { class: 'setting card-setting' },
        h('div', { class: 'body' }, h('div', { class: 'title' }, TODAY_CARDS[key].title)),
        h('button', { class: 'mini', type: 'button', title: 'Yukarı', disabled: i === 0, onclick: () => moveTodayCard(key, -1) }, '↑'),
        h('button', { class: 'mini', type: 'button', title: 'Aşağı', disabled: i === p.order.length - 1, onclick: () => moveTodayCard(key, 1) }, '↓'),
        sw);
    }),
    h('button', { class: 'ghost small', type: 'button', onclick: () => {
      db.prefs.today = null;
      todayPrefs();
      db.prefs.updated = Date.now();
      persist();
      render();
      openTodayCardsSheet();
    } }, 'Varsayılana dön'),
  );
  $('#sheetTitle').textContent = '☀ Bugün kartları';
  $('#sheet').classList.add('custom');
  $('#sheet').hidden = false;
}

function openHealth() {
  if (view !== 'health') healthReturn = view;
  selectedDay = null;
  view = 'health';
  query = '';
  $('#search').value = '';
  render();
  $('#content').scrollTop = 0;
}

function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return [...m.values()].filter((g) => g.length > 1);
}

function healthReport() {
  const dupAccounts = groupBy(db.passwords, (p) => K.accountKey(p));
  const reused = groupBy(db.passwords.filter((p) => p.password), (p) => p.password)
    .filter((g) => new Set(g.map(K.accountKey)).size > 1);
  const dupTasks = groupBy(db.tasks.filter((t) => !t.done), (t) => K.lower(t.title) + '|' + (t.projectId || ''));
  const dupNotes = groupBy(db.notes, (n) => ((n.title || '').trim() || (n.body || '').trim())
    ? K.lower(n.title) + '|' + (n.body || '').trim() : '');
  const loose = [
    ...db.notes.map((item) => ({ item, type: 'note' })),
    ...db.tasks.map((item) => ({ item, type: 'task' })),
  ].map((x) => ({ ...x, found: findLooseCreds(x.item) })).filter((x) => x.found.length);
  return {
    dupAccounts, reused, dupTasks, dupNotes, loose,
    fixable: dupAccounts.length + dupTasks.length + dupNotes.length + loose.length,
  };
}

function mergePasswords(group) {
  const sorted = group.slice().sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const keep = sorted[0];
  for (const other of sorted.slice(1)) {
    for (const k of ['username', 'url', 'projectId', 'title']) if (!keep[k] && other[k]) keep[k] = other[k];
    if (other.note && !(keep.note || '').includes(other.note)) keep.note = [keep.note, other.note].filter(Boolean).join('\n');
    moveToTrash('password', other, { silent: true });
  }
  keep.updated = Date.now();
  persist();
  render();
  toast(`${group.length} kayıt birleştirildi · fazlaları çöp kutusunda`, { label: 'Çöp kutusu', fn: openTrash });
}

function removeExtras(coll, group) {
  const sorted = group.slice().sort((a, b) => (a.updated || 0) - (b.updated || 0));
  const type = { tasks: 'task', notes: 'note', passwords: 'password' }[coll];
  const entries = sorted.slice(1).map((x) => moveToTrash(type, x, { silent: true }));
  persist();
  render();
  toast(`${entries.length} tekrar çöp kutusuna taşındı`, {
    label: 'Geri al',
    fn: () => { for (const e of entries) restoreFromTrash(e.id, { silent: true }); render(); toast('Geri alındı'); },
  });
}

function renderSearch(c) {
  const q = lower(query);
  const has = (...vals) => vals.some((v) => lower(v).includes(q));
  const tasks = db.tasks.filter((x) => has(x.title, x.note)).sort(byDue);
  const pws = db.passwords.filter((x) => has(x.title, x.username, x.url, x.note));
  const notes = db.notes.filter((x) => has(x.title, x.body));
  const projects = db.projects.filter((x) => has(x.name));
  if (!tasks.length && !pws.length && !notes.length && !projects.length) {
    return c.append(empty('🔍', `“${query}” için sonuç yok.`));
  }
  if (pws.length) c.append(section('Şifreler', pws.length), ...pws.map((x) => passwordRow(x)));
  if (tasks.length) c.append(section('Görevler', tasks.length), ...tasks.map((x) => taskRow(x)));
  if (notes.length) c.append(section('Notlar', notes.length), ...notes.map((x) => noteRow(x)));
  if (projects.length) {
    c.append(section('Projeler', projects.length), ...projects.map((p) => {
      const row = projectRow(p);
      row.onclick = () => { query = ''; $('#search').value = ''; view = 'projects'; openProjectId = p.id; render(); };
      return row;
    }));
  }
}

function renderProjectFilter() {
  const sel = $('#projectFilter');
  if (projectFilter !== 'all' && projectFilter !== 'none' && !projectById(projectFilter)) projectFilter = 'all';
  sel.replaceChildren(
    h('option', { value: 'all' }, 'Tüm projeler'),
    ...db.projects.map((p) => h('option', { value: p.id }, p.name)),
    h('option', { value: 'none' }, 'Projesiz'),
  );
  sel.value = projectFilter;
  sel.hidden = view === 'projects' && !query;
}
