// Listelerdeki satırlar: görev, şifre, not, proje ve hızlı ekleme.
'use strict';

// ---------- satırlar ----------
const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
// Fareyle satırın üstüne gelince görünen sil düğmesi (kayıt çöp kutusuna gider, "Geri al" ile döner)
// Yıldız: yıldızlıysa hep görünür, değilse fareyle üstüne gelince (telefonda soluk)
const starBtn = (item) => !readOnlyShared(item) && h('button', {
  class: 'mini star-btn' + (item.starred ? ' on' : ''), title: item.starred ? _t('Yıldızı kaldır') : _t('Yıldızla (üstte tut)'),
  onclick: stop(() => { toggleStar(item); persist(); render(); }),
}, item.starred ? '★' : '☆');
const delBtn = (type, item) => !readOnlyShared(item) && h('button', { class: 'mini del-btn', title: _t('Çöp kutusuna taşı'), onclick: stop(() => moveToTrash(type, item)) }, '🗑');

// Etiket çipleri: tıklayınca o etiketle süzülür (seçiliyse süzgeç kalkar)
// Ortak alandaki kayıt: 👥 + alan adı
const sharedChip = (x) => {
  if (!x.spaceId) return null;
  const by = personName(x.spaceId, x.createdBy);
  const edited = x.updatedBy && x.updatedBy !== x.createdBy ? personName(x.spaceId, x.updatedBy) : '';
  const title = [_t('Ortak alan: {0}', spaceName(x.spaceId)), by && _t('Oluşturan: {0}', by), edited && _t('Son değiştiren: {0}', edited)].filter(Boolean).join('\n');
  return h('span', { class: 'chip shared', title }, '👥 ' + spaceName(x.spaceId) + (by ? ' · ' + by : ''));
};
const attachChip = (x) => (x.files?.length ? h('span', { class: 'chip', title: x.files.map((f) => f.name).join('\n') }, '📎 ' + x.files.length) : null);

function tagChips(item) {
  return (item.tags || []).map((t) => h('span', {
    class: 'chip tag' + (tagFilter && tagKey(t) === tagKey(tagFilter) ? ' on' : ''),
    title: _t('Bu etiketle süz'),
    onclick: stop(() => { tagFilter = tagKey(t) === tagKey(tagFilter) ? '' : t; render(); $('#content').scrollTop = 0; }),
  }, '#' + t));
}

function taskRow(t, { hideProject = false } = {}) {
  return h('div', { class: 'item t-task' + (t.done ? ' done' : ''), onclick: () => openEditor('task', t) },
    h('button', {
      class: 'check', title: t.done ? _t('Geri al') : _t('Tamamla'), disabled: readOnlyShared(t),
      onclick: (e) => {
        e.stopPropagation();
        const r = completeTask(t);
        persist();
        render();
        if (r.next) {
          toast(_t('✓ Tamamlandı · sonraki: {0}', fmtDate(r.next)),
            { label: _t('Geri al'), fn: () => { undoComplete(t, r.before); persist(); render(); } });
        } else if (t.done) toast(_t('✓ Tamamlandı'));
      },
    }, '✓'),
    h('div', { class: 'body' },
      h('div', { class: 'title' }, t.title),
      h('div', { class: 'chips' },
        !t.done && dueChip(t.due),
        !t.done && t.remindAt && h('span', { class: 'chip' }, '⏰ ' + fmtDateTime(t.remindAt)),
        t.repeat && h('span', { class: 'chip', title: _t('Tekrarlayan görev') }, '🔁 ' + (REPEAT_LABELS()[t.repeat] || '')),
        sharedChip(t), attachChip(t), ...tagChips(t),
        t.done ? stampChip(t, t.completedAt || t.updated, '✓ ') : stampChip(t),
        !hideProject && projectChip(t.projectId))),
    h('div', { class: 'side' }, starBtn(t), delBtn('task', t)),
  );
}

// 2FA kodu: her saniye güncellenir (app.js), tıklayınca kopyalanır ve 30 sn sonra panodan silinir
function totpChip(p) {
  if (!p.totp || !KasaTotp.parse(p.totp)) return null;
  return h('span', { class: 'chip totp', 'data-totp-id': p.id, title: _t('2FA kodunu kopyala'),
    onclick: stop(async () => {
      const g = await KasaTotp.generate(p.totp);
      if (!g) return;
      kasa.copy(g.code, true);
      toast(_t('2FA kodu kopyalandı · {0} sn geçerli', g.remaining));
    }) }, '🔢 ··· ···');
}

function passwordRow(p, { hideProject = false } = {}) {
  return h('div', { class: 'item t-pass', onclick: () => openEditor('password', p) },
    h('div', { class: 'ico' }, '🔑'),
    h('div', { class: 'body' },
      h('div', { class: 'title' }, p.title),
      h('div', { class: 'sub' }, p.username || p.url || '—'),
      h('div', { class: 'chips' }, totpChip(p), ...healthChips(p), sharedChip(p), attachChip(p), ...tagChips(p), stampChip(p), !hideProject && projectChip(p.projectId))),
    h('div', { class: 'side' },
      p.username && h('button', { class: 'mini', title: _t('Kullanıcı adını kopyala'),
        onclick: stop(() => { kasa.copy(p.username); toast(_t('Kullanıcı adı kopyalandı')); }) }, '@'),
      p.password && h('button', { class: 'mini', title: _t('Şifreyi kopyala'),
        onclick: stop(() => { kasa.copy(p.password, true); toast(_t('Şifre kopyalandı · 30 sn sonra panodan silinecek')); }) }, '🔑 Kopyala'),
      p.url && h('button', { class: 'mini', title: _t('Adresi aç'),
        onclick: stop(() => kasa.openUrl(p.url)) }, '↗'),
      starBtn(p), delBtn('password', p)),
  );
}

function noteRow(n, { hideProject = false } = {}) {
  const first = KasaList.pretty((n.body || '').split('\n').find((l) => l.trim()) || _t('Boş not'));
  const pr = KasaList.progress(n.body);
  return h('div', { class: 'item t-note', onclick: () => openEditor('note', n) },
    h('div', { class: 'ico' }, '📝'),
    h('div', { class: 'body' },
      h('div', { class: 'title' }, n.title || _t('Başlıksız not')),
      h('div', { class: 'sub' }, first),
      h('div', { class: 'chips' },
        pr.total && h('span', { class: 'chip' + (pr.done === pr.total ? ' ok' : '') }, `☑ ${pr.done}/${pr.total}`),
        sharedChip(n), attachChip(n), ...tagChips(n),
        stampChip(n),
        !hideProject && projectChip(n.projectId))),
    h('div', { class: 'side' }, starBtn(n), delBtn('note', n)),
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
      h('div', { class: 'sub' }, _t("{0} açık görev · {1} not · {2} şifre", tasks, notes, pws)),
      h('div', { class: 'chips' }, sharedChip(p), stampChip(p, projectActivity(p), '🕒 Son hareket: '))),
    h('div', { class: 'side' }, delBtn('project', p), h('span', { class: 'muted' }, '›')),
  );
}

function quickAdd(placeholder, due) {
  const input = h('input', { type: 'text', placeholder });
  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' || !input.value.trim()) return;
    // '#etiket' yazılan kelimeler göreve etiket olur (seçili etiket de eklenir)
    const { text, tags } = splitHashtags(input.value);
    if (!text) return;
    const allTagsHere = normTags([...tags, ...(tagFilter ? [tagFilter] : [])]);
    const task = newItem('task', { title: text, due: due || '', ...(allTagsHere.length ? { tags: allTagsHere } : {}) });
    if (findDuplicateTask(task) && !(await ask(_t('Bu görev zaten var'),
      _t("“{0}” açık görevler arasında zaten duruyor.", task.title),
      [{ label: _t('Vazgeç'), value: false }, { label: _t('Yine de ekle'), value: true, primary: true }]))) return;
    db.tasks.push(task);
    persist();
    render();
    $('#content input')?.focus();
  });
  return h('div', { class: 'quick-add' }, input);
}
