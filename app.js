'use strict';

// Mac'te kısayollar ⌘ ile yazılsın (telefonda kısayol yok)
if (/Mac/.test(navigator.platform) && !document.body.classList.contains('phone')) {
  const mac = (s) => s.replace(/Ctrl\+Shift\+Space/g, '⌘⇧Space').replace(/Ctrl\+/g, '⌘');
  for (const el of document.querySelectorAll('[title*="Ctrl+"]')) el.title = mac(el.title);
  for (const el of document.querySelectorAll('[placeholder*="Ctrl+"]')) el.placeholder = mac(el.placeholder);
}
// Giriş noktası: pencere durumu, üst çubuk, sekmeler, klavye kısayolları ve açılış.

// ---------- pencere durumu ----------
function applyWinState(s) {
  const cl = document.body.classList;
  cl.toggle('collapsed', s.collapsed);
  cl.toggle('pinned', s.pinned);
  for (const d of ['left', 'right', 'float']) cl.toggle('dock-' + d, s.dock === d);
  $('#btnPin').title = s.pinned ? _t('Her zaman üstte: açık') : _t('Her zaman üstte: kapalı');
}

kasa.win.state().then(applyWinState);

kasa.onState((x) => applyWinState(x));

$('#tabExpand').addEventListener('click', () => kasa.win.expand());

$('#btnCollapse').addEventListener('click', () => kasa.win.collapse());

$('#btnPin').addEventListener('click', () => kasa.win.togglePin());

$('#btnQuit').addEventListener('click', async () => { await flush(); kasa.win.quit(); });

$('#btnLock').addEventListener('click', () => quickLock());

// ---------- hatırlatıcı ----------
function showBanner(r) {
  const b = $('#banner');
  b.replaceChildren(
    h('span', null, '⏰ ' + r.title),
    h('button', { class: 'mini', onclick: () => {
      const t = db?.tasks.find((x) => x.id === r.id);
      if (t) { setDone(t, true); persist(); render(); }
      b.hidden = true;
    } }, _t('Tamamlandı')),
    h('button', { class: 'mini', onclick: () => { b.hidden = true; } }, _t('Tamam')),
  );
  b.hidden = false;
}

kasa.onReminder((r) => {
  kasa.win.expand();
  if (db) showBanner(r); else pendingReminder = r;
});

// Başka cihazdan değişiklik geldi: yerel (henüz kaydedilmemiş olabilecek) veriyle birleştir
kasa.onMerged(({ data, changes, from }) => {
  if (!db) return;
  const next = KasaSync.merge(db, data);
  if (KasaSync.same(next, db)) return;
  const hadPending = !!saveTimer;
  const edit = editing && !editing.isNew ? { type: editing.type, id: editing.item.id } : null;
  db = next;
  for (const k of ['projects', 'passwords', 'notes', 'tasks', 'trash']) db[k] ||= [];
  if (edit) {
    const fresh = db[COLLECTION[edit.type]].find((x) => x.id === edit.id);
    if (fresh) editing.item = fresh; // açık düzenleme yeni nesneye bağlansın
  }
  if (hadPending) persist();
  render();
  pushReminders();
  updateBadge();
  if (changes) toast(from ? _t("⟳ {0}: {1} değişiklik geldi", from, changes) : _t("⟳ Diğer cihazlardan {0} değişiklik geldi", changes));
});

function render() {
  if (!db) return;
  renderProjectFilter();
  for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('active', b.dataset.view === view && !query && !selectedDay);
  const c = $('#content');
  c.replaceChildren();
  if (query) renderSearch(c); else if (selectedDay) renderDay(c); else VIEWS[view](c);
  $('#fab').hidden = !!query || (!selectedDay && (view === 'health' || view === 'trash' || (view === 'projects' && !!openProjectId)));
  renderCalendar();
}

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]');
  if (!b) return;
  view = b.dataset.view;
  openProjectId = null;
  selectedDay = null;
  query = '';
  $('#search').value = '';
  render();
  $('#content').scrollTop = 0;
});

$('#search').addEventListener('input', (e) => { query = e.target.value.trim(); render(); });

$('#projectFilter').addEventListener('change', (e) => { projectFilter = e.target.value; render(); });

$('#fab').addEventListener('click', () => {
  if (selectedDay) { openEditor('task', null, { due: selectedDay }); return; }
  const type = { today: 'task', tasks: 'task', passwords: 'password', notes: 'note', projects: 'project' }[view];
  openEditor(type);
});

// ---------- klavye ----------
window.addEventListener('keydown', (e) => {
  if (!db) return;
  if (!$('#dialog').hidden) {
    if (e.key === 'Escape' && !dialogLocked) { e.preventDefault(); closeDialog(null); }
    return;
  }
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.key === 'Escape' && !$('#sheet').hidden) { closeEditor(); return; }
  if (ctrl && e.key.toLowerCase() === 's' && editing) { e.preventDefault(); saveEditor(); }
  else if (ctrl && e.key.toLowerCase() === 'k') { e.preventDefault(); closeEditor(); $('#search').focus(); $('#search').select(); }
  else if (ctrl && e.key.toLowerCase() === 'l') { e.preventDefault(); quickLock(); }
  else if (ctrl && e.key.toLowerCase() === 'n' && !editing) { e.preventDefault(); $('#fab').click(); }
  else if (e.key === 'Escape') {
    if (editing) closeEditor();
    else if (query) { query = ''; $('#search').value = ''; render(); }
    else kasa.win.collapse();
  } else if (e.key === 'Enter' && editing && e.target.tagName === 'INPUT' && e.target.type !== 'button') {
    e.preventDefault();
    saveEditor();
  }
});

showLock();
