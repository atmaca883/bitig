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
      title: e.title || K.hostOf(e.site) || item.title || _t('Not içinden'),
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
    title: _t("“{0}” içinde {1} giriş bilgisi buldum", item.title || 'Not', found.length),
    sub: found.map((e) => e.title + (e.username ? ' · ' + e.username : '')).join(', ') + _t(' — Şifrelere kaydedilsin mi?'),
    actions: [
      { label: _t('Kaydet'), primary: true, fn: () => importLoose(item, found, false) },
      { label: _t('Kaydet + nottan gizle'), fn: () => importLoose(item, found, true) },
      { label: _t('Göz ardı et'), fn: () => ignoreLoose(item, found) },
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
        projectId: item.projectId || '', note: _t("“{0}” notundan aktarıldı.", item.title || 'Not'),
      }));
      added++;
    }
    if (hide) item[field] = item[field].split(e.password).join('•••• (Bitig’de)');
  }
  if (hide) item.updated = Date.now();
  persist();
  render();
  toast(_t("{0} yeni şifre kaydedildi{1}", added, updated ? `, ${updated} güncellendi` : ''));
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
      title: _t("{0} şifresi değişmiş görünüyor", host),
      sub: _t("{0} · Kayıtlı şifre yenisiyle güncellensin mi?", c.username || '(kullanıcı adı yok)'),
      actions: [
        { label: _t('Güncelle'), primary: true, fn: () => {
          setPassword(r.existing, c.password);
          persist(); render(); toast(_t('Şifre güncellendi'));
        } },
        { label: _t('Hayır') },
      ],
    });
    return;
  }

  const fields = { title: K.baseDomain(host) || host, username: c.username, password: c.password, url: origin };
  addPrompt({
    key: 'cap:' + host + '|' + K.lower(c.username),
    icon: '🌐',
    title: _t("{0} için giriş kaydedilsin mi?", host),
    sub: c.username || _t('(kullanıcı adı yok)'),
    actions: [
      { label: _t('Kaydet'), primary: true, fn: () => {
        db.passwords.push(newItem('password', fields));
        persist(); render(); toast(_t('Şifre kaydedildi'));
      } },
      { label: _t('Düzenle'), fn: () => openEditor('password', null, fields) },
      { label: _t('Hayır') },
    ],
  });
}

kasa.onCapture((x) => handleCapture(x));

kasa.onCapturePending((n) => {
  if (!db) $('#lockHint').textContent = _t("Tarayıcıdan {0} yeni giriş bekliyor. Kaydetmek için kilidi aç.", n);
});
