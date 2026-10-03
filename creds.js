// Notlarda unutulan şifreler ve tarayıcıdan gelen girişler.
'use strict';

// ---------- notlarda unutulan şifreler ----------
function classifyCredential(entry) {
  const probe = { url: entry.url || '', title: entry.title || '', username: entry.username || '' };
  const same = db.passwords.filter((p) => K.sameAccount(p, probe));
  const identical = same.find((p) => p.password === entry.password)
    || db.passwords.find((p) => p.password === entry.password && K.lower(p.username) === K.lower(entry.username));
  if (identical) return { kind: 'exists', existing: identical };
  if (same.length) return { kind: 'update', existing: same[0] };
  return { kind: 'new' };
}

function findLooseCreds(item) {
  const text = 'body' in item ? item.body : item.note;
  if (!text) return [];
  const ignored = new Set(item.credIgnored || []);
  return K.detectCredentials(text)
    .map((e) => ({
      title: e.title || K.hostOf(e.site) || item.title || 'Not içinden',
      url: e.site, username: e.username, password: e.password,
      fp: K.fingerprint(e.username, e.password),
    }))
    .filter((e) => !ignored.has(e.fp) && classifyCredential(e).kind !== 'exists');
}

function offerLooseCreds(item) {
  const found = findLooseCreds(item);
  if (!found.length) return;
  addPrompt({
    key: 'loose:' + item.id,
    icon: '🔑',
    title: `“${item.title || 'Not'}” içinde ${found.length} giriş bilgisi buldum`,
    sub: found.map((e) => e.title + (e.username ? ' · ' + e.username : '')).join(', ') + ' — Şifrelere kaydedilsin mi?',
    actions: [
      { label: 'Kaydet', primary: true, fn: () => importLoose(item, found, false) },
      { label: 'Kaydet + nottan gizle', fn: () => importLoose(item, found, true) },
      { label: 'Göz ardı et', fn: () => ignoreLoose(item, found) },
    ],
  });
}

function importLoose(item, found, hide) {
  const field = 'body' in item ? 'body' : 'note';
  let added = 0;
  let updated = 0;
  for (const e of found) {
    const r = classifyCredential(e);
    if (r.kind === 'update') {
      setPassword(r.existing, e.password);
      updated++;
    } else if (r.kind === 'new') {
      db.passwords.push(newItem('password', {
        title: e.title, username: e.username, password: e.password, url: e.url,
        projectId: item.projectId || '', note: `“${item.title || 'Not'}” notundan aktarıldı.`,
      }));
      added++;
    }
    if (hide) item[field] = item[field].split(e.password).join('•••• (Bitig’de)');
  }
  if (hide) item.updated = Date.now();
  persist();
  render();
  toast(`${added} yeni şifre kaydedildi${updated ? `, ${updated} güncellendi` : ''}`);
}

function ignoreLoose(item, found) {
  item.credIgnored = [...new Set([...(item.credIgnored || []), ...found.map((e) => e.fp)])];
  item.updated = Date.now();
  persist();
  render();
}

// ---------- tarayıcıdan gelen girişler ----------
function handleCapture(c) {
  if (!db) return;
  const host = c.host.replace(/^www\./, '');
  let origin = '';
  try { origin = new URL(c.url).origin; } catch {}
  const r = classifyCredential({ url: c.url, title: host, username: c.username, password: c.password });
  if (r.kind === 'exists') return;

  if (r.kind === 'update') {
    addPrompt({
      key: 'cap:' + K.accountKey(r.existing),
      icon: '🔄',
      title: `${host} şifresi değişmiş görünüyor`,
      sub: `${c.username || '(kullanıcı adı yok)'} · Kayıtlı şifre yenisiyle güncellensin mi?`,
      actions: [
        { label: 'Güncelle', primary: true, fn: () => {
          setPassword(r.existing, c.password);
          persist(); render(); toast('Şifre güncellendi');
        } },
        { label: 'Hayır' },
      ],
    });
    return;
  }

  const fields = { title: K.baseDomain(host) || host, username: c.username, password: c.password, url: origin };
  addPrompt({
    key: 'cap:' + host + '|' + K.lower(c.username),
    icon: '🌐',
    title: `${host} için giriş kaydedilsin mi?`,
    sub: c.username || '(kullanıcı adı yok)',
    actions: [
      { label: 'Kaydet', primary: true, fn: () => {
        db.passwords.push(newItem('password', fields));
        persist(); render(); toast('Şifre kaydedildi');
      } },
      { label: 'Düzenle', fn: () => openEditor('password', null, fields) },
      { label: 'Hayır' },
    ],
  });
}

kasa.onCapture((x) => handleCapture(x));

kasa.onCapturePending((n) => {
  if (!db) $('#lockHint').textContent = `Tarayıcıdan ${n} yeni giriş bekliyor. Kaydetmek için kilidi aç.`;
});
