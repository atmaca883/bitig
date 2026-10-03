// Listelerdeki satırlar: görev, şifre, not, proje ve hızlı ekleme.
'use strict';

// ---------- satırlar ----------
const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
// Fareyle satırın üstüne gelince görünen sil düğmesi (kayıt çöp kutusuna gider, "Geri al" ile döner)
const delBtn = (type, item) => h('button', { class: 'mini del-btn', title: 'Çöp kutusuna taşı', onclick: stop(() => moveToTrash(type, item)) }, '🗑');

function taskRow(t, { hideProject = false } = {}) {
  return h('div', { class: 'item t-task' + (t.done ? ' done' : ''), onclick: () => openEditor('task', t) },
    h('button', {
      class: 'check', title: t.done ? 'Geri al' : 'Tamamla',
      onclick: (e) => {
        e.stopPropagation();
        setDone(t, !t.done);
        persist();
        render();
        if (t.done) toast('✓ Tamamlandı');
      },
    }, '✓'),
    h('div', { class: 'body' },
      h('div', { class: 'title' }, t.title),
      h('div', { class: 'chips' },
        !t.done && dueChip(t.due),
        !t.done && t.remindAt && h('span', { class: 'chip' }, '⏰ ' + fmtDateTime(t.remindAt)),
        t.done ? stampChip(t, t.completedAt || t.updated, '✓ ') : stampChip(t),
        !hideProject && projectChip(t.projectId))),
    h('div', { class: 'side' }, delBtn('task', t)),
  );
}

function passwordRow(p, { hideProject = false } = {}) {
  return h('div', { class: 'item t-pass', onclick: () => openEditor('password', p) },
    h('div', { class: 'ico' }, '🔑'),
    h('div', { class: 'body' },
      h('div', { class: 'title' }, p.title),
      h('div', { class: 'sub' }, p.username || p.url || '—'),
      h('div', { class: 'chips' }, stampChip(p), !hideProject && projectChip(p.projectId))),
    h('div', { class: 'side' },
      p.username && h('button', { class: 'mini', title: 'Kullanıcı adını kopyala',
        onclick: stop(() => { kasa.copy(p.username); toast('Kullanıcı adı kopyalandı'); }) }, '@'),
      p.password && h('button', { class: 'mini', title: 'Şifreyi kopyala',
        onclick: stop(() => { kasa.copy(p.password, true); toast('Şifre kopyalandı · 30 sn sonra panodan silinecek'); }) }, '🔑 Kopyala'),
      p.url && h('button', { class: 'mini', title: 'Adresi aç',
        onclick: stop(() => kasa.openUrl(p.url)) }, '↗'),
      delBtn('password', p)),
  );
}

function noteRow(n, { hideProject = false } = {}) {
  const first = (n.body || '').split('\n').find((l) => l.trim()) || 'Boş not';
  return h('div', { class: 'item t-note', onclick: () => openEditor('note', n) },
    h('div', { class: 'ico' }, '📝'),
    h('div', { class: 'body' },
      h('div', { class: 'title' }, n.title || 'Başlıksız not'),
      h('div', { class: 'sub' }, first),
      h('div', { class: 'chips' },
        stampChip(n),
        !hideProject && projectChip(n.projectId))),
    h('div', { class: 'side' }, delBtn('note', n)),
  );
}

function projectRow(p) {
  const tasks = db.tasks.filter((t) => t.projectId === p.id && !t.done).length;
  const notes = db.notes.filter((n) => n.projectId === p.id).length;
  const pws = db.passwords.filter((x) => x.projectId === p.id).length;
  return h('div', { class: 'item t-proj project-card', onclick: () => { openProjectId = p.id; render(); } },
    h('div', { class: 'ico' }, h('span', { class: 'dot', style: `width:14px;height:14px;background:${COLORS[p.color] || COLORS.gray}` })),
    h('div', { class: 'body' },
      h('div', { class: 'title' }, p.name),
      h('div', { class: 'sub' }, `${tasks} açık görev · ${notes} not · ${pws} şifre`),
      h('div', { class: 'chips' }, stampChip(p, projectActivity(p), '🕒 Son hareket: '))),
    h('div', { class: 'side' }, delBtn('project', p), h('span', { class: 'muted' }, '›')),
  );
}

function quickAdd(placeholder, due) {
  const input = h('input', { type: 'text', placeholder });
  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' || !input.value.trim()) return;
    const task = newItem('task', { title: input.value.trim(), due: due || '' });
    if (findDuplicateTask(task) && !(await ask('Bu görev zaten var',
      `“${task.title}” açık görevler arasında zaten duruyor.`,
      [{ label: 'Vazgeç', value: false }, { label: 'Yine de ekle', value: true, primary: true }]))) return;
    db.tasks.push(task);
    persist();
    render();
    $('#content input')?.focus();
  });
  return h('div', { class: 'quick-add' }, input);
}
