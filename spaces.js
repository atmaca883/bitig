// Ortak alanlar (paylaşım, beta). Tasarım: docs/paylasim-tasarimi.md
// Ortak kayıtlar, kişisel kayıtlarla aynı listelerde durur (item.spaceId ile işaretli); böylece satırlar, düzenleyici,
// arama, takvim olduğu gibi çalışır. Kişisel kasaya ve kişisel buluta yalnızca kişisel kayıtlar yazılır (personalCopy).
// db.share = { identity: kimlik, session: { accountId, name, token }, spaces: { [alanId]: önbellek } }
// Kimlik ve alan anahtarları kişisel kasada (ana şifreyle şifreli) durur; sunucu hiçbirini görmez.
'use strict';

const SC = window.KasaShareCrypto;
const SHARE_KINDS = { task: 'tasks', note: 'notes', password: 'passwords', project: 'projects' };
const INVITE_BASE = 'https://atmaca883.github.io/bitig/';
let shareTimer = null;
let shareSyncing = null;
let shareAvailableCache = null;

const shareSession = () => db?.share?.session || null;
const shareIdentity = () => db?.share?.identity || null;
const shareSpace = (id) => db?.share?.spaces?.[id] || null;
const spaceName = (id) => shareSpace(id)?.name || _t('Ortak alan');
async function shareAvailable() {
  if (shareAvailableCache === null) shareAvailableCache = !!(await kasa.shareAvailable?.());
  return shareAvailableCache;
}
shareAvailable().catch(() => {}); // açılışta öğren: proje başlığındaki "Paylaş" düğmesi buna bakar

async function shareCall(method, path, body) {
  const r = await kasa.shareFetch({ method, path, body, token: shareSession()?.token });
  if (r.status >= 400) {
    const e = new Error(r.body?.message && r.body.message !== r.body.error ? r.body.message : _t('Sunucu isteği reddetti ({0}).', r.body?.error || r.status));
    e.status = r.status;
    e.code = r.body?.error;
    throw e;
  }
  return r.body;
}

// ---------- kişisel kasa ile ayrım ----------
// Kaydederken: ortak kayıtlar kişisel kasaya girmez (önbellekleri db.share içinde zaten var)
function personalCopy(d) {
  if (!d?.share) return d;
  const out = { ...d };
  for (const c of ['projects', 'passwords', 'notes', 'tasks']) out[c] = (d[c] || []).filter((x) => !x.spaceId);
  return out;
}

// Ortak kayıtların bu cihazdaki son hâli (henüz gönderilmemiş değişiklikler dahil) kasaya yazılır:
// internet yokken yapılan değişiklik, uygulama kapansa da kaybolmaz; bağlantı gelince gönderilir.
function snapshotShared() {
  for (const [sid, sp] of Object.entries(db?.share?.spaces || {})) {
    if (sp.status !== 'active') continue;
    const local = {};
    for (const [kind, c] of Object.entries(SHARE_KINDS)) {
      for (const x of db[c]) if (x.spaceId === sid) { const { spaceId, ...data } = x; local[x.id] = { kind, data }; }
    }
    sp.local = local;
  }
}

// Önbellekteki ortak kayıtları listelere ekle (kilit açılınca ve kişisel eşitlemeden sonra)
function attachShared() {
  for (const [sid, sp] of Object.entries(db?.share?.spaces || {})) {
    if (sp.status !== 'active') continue;
    for (const [iid, rec] of Object.entries(sp.local || sp.items || {})) {
      const list = db[SHARE_KINDS[rec.kind]];
      if (!list) continue;
      const item = { ...rec.data, spaceId: sid };
      const i = list.findIndex((x) => x.id === iid);
      if (i < 0) list.push(item);
      else if ((list[i].updated || 0) <= (item.updated || 0)) list[i] = item;
    }
  }
}

// Ortak projeye taşınan kayıt ortak olur; projeden çıkan kişisel olur. Proje kendisi spaceId taşır.
function normalizeSpaces() {
  if (!db?.share) return;
  const proj = new Map(db.projects.map((p) => [p.id, p]));
  for (const c of ['tasks', 'notes', 'passwords']) {
    for (const x of db[c]) {
      const want = (x.projectId && proj.get(x.projectId)?.spaceId) || null;
      if ((x.spaceId || null) === want) continue;
      if (want && !x.spaceId) tombstone(c, x.id); // kişisel kopyası diğer cihazlarımda da kalksın
      if (want) { x.spaceId = want; x.createdBy ||= shareSession()?.accountId; } else { delete x.spaceId; delete x.createdBy; delete x.updatedBy; }
      x.updated = Date.now() + 1;
    }
  }
}

// ---------- giriş (e-postasız) ----------
// Hesap = bu kasadaki kimlik anahtarı. Sunucu tek kullanımlık bir soru verir, cihaz imzalar; şifre ya da e-posta yok.
// Kimlik kişisel kasada durduğu için kişinin diğer cihazları da (kişisel eşitlemeyle) aynı hesabı kullanır.
async function signInWithKey(name) {
  const identity = db.share.identity;
  const ch = await shareCall('POST', '/auth/challenge');
  const signature = await SC.sign(identity, `bitig-login|${ch.id}|${ch.nonce}`);
  return shareCall('POST', '/auth/key', { ...SC.publicPart(identity), name, challengeId: ch.id, signature, device: 'Bitig' });
}

async function shareLogin() {
  if (shareSession()) return true;
  if (!(await shareAvailable())) { toast(_t('Paylaşım bu sürümde henüz açık değil.')); return false; }
  db.share ||= { v: 1, spaces: {} };
  db.share.spaces ||= {};
  let res = null;
  if (db.share.identity) {
    res = await signInWithKey(''); // kayıtlı hesap: soru sormadan girer
  } else {
    const ok = await formDialog({
      title: _t('👥 Paylaşım için adın'),
      text: _t('Ortak alanlarda diğer kişiler seni bu adla görür. Hesabın bu cihazdaki güvenlik anahtarıdır; şifre ya da e-posta gerekmez.'),
      fields: [{ k: 'name', label: _t('Adın (ör. Ali)'), type: 'text', attrs: { maxlength: '40' } }], submitLabel: _t('Devam'),
      onSubmit: async (v) => {
        const name = v.name.trim();
        if (!name) return _t('Bir ad yaz.');
        db.share.identity ||= await SC.generateIdentity();
        res = await signInWithKey(name);
        return '';
      },
    });
    if (!ok || !res) return false;
  }
  db.share.session = { accountId: res.accountId, name: res.name, token: res.token };
  persist();
  toast(_t('✓ {0} olarak giriş yapıldı', res.name));
  startShareSync();
  return true;
}

async function shareLogout() {
  if (!(await ask(_t('Paylaşımdan çıkılsın mı?'), _t('Ortak alanlar bu cihazda görünmez olur; alanlar ve içindekiler silinmez. Tekrar giriş yapınca geri gelir.'),
    [{ label: _t('Vazgeç'), value: false }, { label: _t('Çıkış yap'), value: true, primary: true }]))) return;
  try { await shareCall('POST', '/auth/logout'); } catch {}
  dropSharedItems(() => true);
  db.share.spaces = {};
  delete db.share.session;
  stopShareSync();
  persist();
  render();
}

// Erişilemeyen alanların kayıtlarını listelerden kaldır
function dropSharedItems(pred) {
  for (const c of ['projects', 'passwords', 'notes', 'tasks']) db[c] = db[c].filter((x) => !(x.spaceId && pred(x.spaceId)));
}

// ---------- paylaşma ve davet ----------
async function shareProject(p) {
  if (!(await shareLogin())) return;
  if (p.spaceId) return inviteToSpace(p.spaceId);
  if (!(await ask(_t('“{0}” paylaşılsın mı?', p.name),
    _t('Proje ve içindeki görevler, notlar, şifreler ortak bir alana taşınır. Davet ettiğin kişiler görür ve düzenleyebilir. Her şey uçtan uca şifreli kalır.'),
    [{ label: _t('Vazgeç'), value: false }, { label: _t('Paylaş'), value: true, primary: true }]))) return;
  const s = shareSession();
  const identity = shareIdentity();
  const id = crypto.randomUUID();
  const key = SC.newSpaceKey();
  const meta = await SC.encryptMeta(key, id, 1, { name: p.name, color: p.color });
  const wrappedKey = await SC.wrapSpaceKey(identity.enc.pub, key, { spaceId: id, accountId: s.accountId, keyVersion: 1 });
  await shareCall('POST', '/spaces', { id, meta, wrappedKey });
  db.share.spaces[id] = { name: p.name, color: p.color, role: 'owner', owner: true, status: 'active', keyVersion: 1, key: SC.b64url(key), rev: 0, items: {} };
  tombstone('projects', p.id);
  p.spaceId = id;
  p.createdBy ||= s.accountId;
  p.updated = Date.now() + 1;
  normalizeSpaces();
  persist();
  render();
  await shareSyncNow();
  await inviteToSpace(id);
}

async function inviteToSpace(spaceId) {
  const sp = shareSpace(spaceId);
  if (!sp?.owner) { toast(_t('Davet yalnızca alanın sahibinden gönderilir.')); return; }
  const inviteId = crypto.randomUUID();
  const secret = SC.newInviteSecret();
  const blob = await SC.encryptInvite(secret, inviteId, {
    spaceId, key: sp.key, keyVersion: sp.keyVersion, name: sp.name, from: shareSession().name,
    code: await SC.safetyCode(SC.publicPart(shareIdentity())),
  });
  await shareCall('POST', `/spaces/${spaceId}/invites`, { id: inviteId, blob });
  const link = SC.inviteLink(INVITE_BASE, inviteId, secret);
  const done = ask(_t('Davet bağlantısı'), _t('Bu bağlantıyı WhatsApp ya da e-postayla gönder. Tek kişilik, 48 saat geçerli; katılan kişiyi sen onaylayınca alanı görür.'),
    [{ label: _t('Kopyala'), value: 'copy', primary: true }, { label: _t('Kapat'), value: null }]);
  $('#dialog .dialog-card p')?.after(h('input', { class: 'mono invite-link', readonly: true, value: link, onclick: (e) => e.target.select() }));
  if ((await done) === 'copy') { kasa.copy(link); toast(_t('Davet bağlantısı kopyalandı')); }
}

async function joinInvite() {
  let parsed = null;
  const ok = await formDialog({
    title: _t('Davete katıl'), text: _t('Sana gönderilen davet bağlantısını yapıştır.'),
    fields: [{ k: 'link', label: 'https://…#davet=…', type: 'text' }], submitLabel: _t('Devam'),
    onSubmit: async (v) => { parsed = SC.parseInviteLink(v.link.trim()); return parsed ? '' : _t('Bu bir Bitig davet bağlantısı değil.'); },
  });
  if (!ok || !(await shareLogin())) return;
  const inv = await shareCall('GET', `/invites/${parsed.inviteId}`);
  let payload;
  try { payload = await SC.decryptInvite(parsed.secret, parsed.inviteId, inv.blob); } catch { toast(_t('Davet açılamadı; bağlantı eksik ya da bozuk.')); return; }
  if (!(await ask(_t('“{0}” alanına katıl', payload.name),
    _t('Davet eden: {0} · güvenlik kodu {1}. Kod, davet edenin Bitig’inde (Ayarlar → Paylaşım) görünenle aynı olmalı.', payload.from, payload.code),
    [{ label: _t('Vazgeç'), value: false }, { label: _t('Katıl'), value: true, primary: true }]))) return;
  const s = shareSession();
  const key = SC.unb64url(payload.key);
  const wrappedKey = await SC.wrapSpaceKey(shareIdentity().enc.pub, key, { spaceId: payload.spaceId, accountId: s.accountId, keyVersion: payload.keyVersion });
  await shareCall('POST', `/invites/${parsed.inviteId}/accept`, { wrappedKey });
  db.share.spaces[payload.spaceId] = { name: payload.name, role: 'editor', owner: false, status: 'pending', keyVersion: payload.keyVersion, key: payload.key, rev: 0, items: {} };
  persist();
  toast(_t('İstek gönderildi; {0} onaylayınca alan görünecek.', payload.from));
  startShareSync();
}

// ---------- eşitleme ----------
async function refreshSpaces() {
  const s = shareSession();
  const identity = shareIdentity();
  const { spaces } = await shareCall('GET', '/spaces');
  const seen = new Set();
  let joined = '';
  for (const r of spaces) {
    seen.add(r.id);
    const cur = db.share.spaces[r.id] || { rev: 0, items: {} };
    if (r.status === 'active' && (!cur.key || cur.keyVersion !== r.keyVersion || cur.status !== 'active')) {
      const key = await SC.unwrapSpaceKey(identity, r.wrappedKey, { spaceId: r.id, accountId: s.accountId, keyVersion: r.memberKeyVersion });
      // Eski sürümler saklanır: henüz yeni anahtarla yeniden yazılmamış kayıtlar ve ekler onlarla açılır
      cur.keys = { ...(cur.keys || {}), ...(cur.key ? { [cur.keyVersion]: cur.key } : {}), [r.memberKeyVersion]: SC.b64url(key) };
      cur.key = SC.b64url(key);
      cur.keyVersion = r.memberKeyVersion;
      if (cur.status === 'pending') joined = cur.name;
    }
    if (r.status === 'active') {
      try {
        const meta = await SC.decryptMeta(SC.unb64url(cur.key), r.id, r.keyVersion, r.meta);
        cur.name = meta.name;
        cur.color = meta.color;
      } catch {}
    }
    Object.assign(cur, { role: r.role, owner: r.owner, status: r.status });
    db.share.spaces[r.id] = cur;
  }
  // Çıkarılan ya da silinen alanlar
  const gone = Object.keys(db.share.spaces).filter((id) => !seen.has(id));
  if (gone.length) {
    dropSharedItems((sid) => gone.includes(sid));
    for (const id of gone) delete db.share.spaces[id];
  }
  if (joined) toast(_t('✓ “{0}” alanına katıldın', joined));
  return gone.length > 0 || !!joined;
}

// Bir anahtar sürümünün anahtarı (yoksa null)
function keyFor(sp, v) {
  const b = sp.keys?.[v] || (v === sp.keyVersion ? sp.key : null);
  return b ? SC.unb64url(b) : null;
}

async function pullSpace(sid, sp) {
  let changed = false;
  let fromOthers = 0;
  const me = shareSession()?.accountId;
  for (;;) {
    const res = await shareCall('GET', `/spaces/${sid}/records?since=${sp.rev || 0}`);
    for (const r of res.records) {
      let data;
      const key = keyFor(sp, r.keyVersion);
      if (!key) continue; // bu anahtar sürümü bizde yok (ör. alana sonradan katıldık)
      try { data = await SC.decryptRecord(key, { spaceId: sid, itemId: r.itemId, kind: r.kind, keyVersion: r.keyVersion }, r.cipher); } catch { continue; }
      if (r.kind === 'tomb') {
        const c = SHARE_KINDS[data.kind];
        const local = c && db[c].find((x) => x.id === r.itemId);
        if (local && (local.updated || 0) <= (data.updated || 0)) { db[c] = db[c].filter((x) => x.id !== r.itemId); changed = true; }
        delete sp.items[r.itemId];
        continue;
      }
      const c = SHARE_KINDS[r.kind];
      const local = db[c].find((x) => x.id === r.itemId);
      if (!local || (data.updated || 0) > (local.updated || 0)) {
        const item = { ...data, spaceId: sid };
        if (local) Object.assign(local, item); else db[c].push(item);
        changed = true;
        if (r.by !== me && sp.primed) fromOthers++;
      }
      if ((sp.items[r.itemId]?.data.updated || 0) <= (data.updated || 0)) sp.items[r.itemId] = { kind: r.kind, data };
    }
    sp.rev = res.records.length ? res.records.at(-1).rev : res.rev;
    if (!res.more) break;
  }
  if (fromOthers) toast(_t('👥 {0}: {1} değişiklik geldi', sp.name || _t('Ortak alan'), fromOthers));
  sp.primed = true;
  return changed;
}

async function pushSpace(sid, sp) {
  if (sp.role === 'viewer') return;
  const key = SC.unb64url(sp.key);
  const me = shareSession()?.accountId;
  const out = [];
  const present = new Set();
  for (const [kind, c] of Object.entries(SHARE_KINDS)) {
    for (const x of db[c]) {
      if (x.spaceId !== sid) continue;
      present.add(x.id);
      const { spaceId, ...before } = x;
      if (JSON.stringify(sp.items[x.id]?.data) === JSON.stringify(before)) continue;
      // Kim oluşturdu / kim değiştirdi (adlar üyeler listesinden; içerikle birlikte şifreli gider)
      x.createdBy ||= me;
      if (sp.items[x.id]) x.updatedBy = me; else delete x.updatedBy;
      const { spaceId: _s, ...data } = x;
      out.push({ itemId: x.id, kind, data });
    }
  }
  const now = Date.now();
  for (const [id, rec] of Object.entries(sp.items)) {
    if (!present.has(id)) out.push({ itemId: id, kind: 'tomb', data: { id, kind: rec.kind, updated: now } });
  }
  for (let i = 0; i < out.length; i += 100) {
    const batch = out.slice(i, i + 100);
    const records = [];
    for (const r of batch) {
      records.push({ itemId: r.itemId, kind: r.kind, keyVersion: sp.keyVersion,
        cipher: await SC.encryptRecord(key, { spaceId: sid, itemId: r.itemId, kind: r.kind, keyVersion: sp.keyVersion }, r.data) });
    }
    await shareCall('POST', `/spaces/${sid}/records`, { records });
    for (const r of batch) { if (r.kind === 'tomb') delete sp.items[r.itemId]; else sp.items[r.itemId] = { kind: r.kind, data: r.data }; }
  }
  return out.length > 0;
}

// ---------- kişiler ----------
async function refreshPeople(sid, sp) {
  const ids = new Set();
  for (const c of Object.values(SHARE_KINDS)) for (const x of db[c]) if (x.spaceId === sid) { if (x.createdBy) ids.add(x.createdBy); if (x.updatedBy) ids.add(x.updatedBy); }
  const unknown = [...ids].some((id) => !sp.people?.[id]);
  if (sp.people && !unknown && Date.now() - (sp.peopleAt || 0) < 5 * 60_000) return false;
  const { members } = await shareCall('GET', `/spaces/${sid}/members`);
  sp.people = { ...(sp.people || {}), ...Object.fromEntries(members.map((m) => [m.id, m.name])) }; // ayrılanların adı kalır
  sp.peopleAt = Date.now();
  return unknown; // yeni ad öğrenildiyse ekran yenilensin
}
const personName = (sid, id) => (id && (id === shareSession()?.accountId ? shareSession().name : shareSpace(sid)?.people?.[id])) || '';

// ---------- ortak ekler ----------
// Ortak kayıttaki ek, alan anahtarıyla şifrelenip sunucuya gider; diğer üyeler indirip kendi kasalarında saklar.
const sharedFiles = (sid) => {
  const out = [];
  for (const c of Object.values(SHARE_KINDS)) for (const x of db[c]) if (x.spaceId === sid) for (const f of x.files || []) out.push(f);
  return out;
};

async function pushFiles(sid, sp) {
  if (sp.role === 'viewer') return;
  sp.files ||= {};
  const key = SC.unb64url(sp.key);
  for (const f of sharedFiles(sid)) {
    if (sp.files[f.id]) continue;
    let bytes;
    try { bytes = await kasa.files.read(f.id); } catch { continue; } // bu cihazda yok: ekleyen cihaz gönderecek
    const text = await SC.encryptFile(key, sid, f.id, sp.keyVersion, new Uint8Array(bytes));
    const r = await kasa.shareFetch({ method: 'PUT', path: `/spaces/${sid}/files/${f.id}`, text, token: shareSession().token });
    if (r.status === 200) sp.files[f.id] = true;
  }
}

async function pullFiles(sid, sp) {
  sp.files ||= {};
  for (const f of sharedFiles(sid)) {
    if (await kasa.files.has(f.id)) continue;
    const r = await kasa.shareFetch({ method: 'GET', path: `/spaces/${sid}/files/${f.id}`, raw: true, token: shareSession().token });
    if (r.status !== 200 || typeof r.text !== 'string') continue; // henüz yüklenmemiş
    const key = keyFor(sp, SC.fileKeyVersion(r.text));
    if (!key) continue;
    try { await kasa.files.put(f.id, await SC.decryptFile(key, sid, f.id, r.text)); sp.files[f.id] = true; } catch {}
  }
}

// ---------- üyelik ----------
// Üye çıkarılınca: yeni alan anahtarı, kalan herkese ayrı kilit, bütün kayıtlar yeni anahtarla yeniden gönderilir
async function rekeySpace(sid) {
  const sp = shareSpace(sid);
  const s = shareSession();
  const kv = sp.keyVersion + 1;
  const key = SC.newSpaceKey();
  const { members } = await shareCall('GET', `/spaces/${sid}/members`);
  const wraps = {};
  for (const m of members) {
    const pub = m.id === s.accountId ? SC.publicPart(shareIdentity()) : await shareCall('GET', `/accounts/${m.id}/keys`);
    wraps[m.id] = await SC.wrapSpaceKey(pub.enc, key, { spaceId: sid, accountId: m.id, keyVersion: kv });
  }
  const meta = await SC.encryptMeta(key, sid, kv, { name: sp.name, color: sp.color });
  await shareCall('POST', `/spaces/${sid}/rekey`, { keyVersion: kv, meta, wraps });
  sp.keys = { ...(sp.keys || {}), [sp.keyVersion]: sp.key, [kv]: SC.b64url(key) };
  sp.key = SC.b64url(key);
  sp.keyVersion = kv;
  sp.items = {}; // sunucudaki kopya eski anahtarla: hepsi yeniden gönderilsin
  sp.files = {};
  await pushSpace(sid, sp);
  await pushFiles(sid, sp);
  persist();
}

async function removeMemberFlow(sid, m) {
  const sp = shareSpace(sid);
  if (!(await ask(_t('{0} çıkarılsın mı?', m.name),
    _t('“{0}” alanını artık göremez. Alanın anahtarı yenilenir; ama şimdiye kadar gördüğü şifreleri değiştirmen önerilir.', sp.name),
    [{ label: _t('Vazgeç'), value: false }, { label: _t('Çıkar'), value: true, primary: true }]))) return;
  await shareCall('DELETE', `/spaces/${sid}/members/${m.id}`);
  await rekeySpace(sid);
  const pws = db.passwords.filter((p) => p.spaceId === sid);
  if (pws.length) {
    const done = ask(_t('Bu şifreleri değiştir'), _t('{0} bu şifreleri görmüştü. Sitelerinde değiştirip Bitig’de güncellemen önerilir:', m.name),
      [{ label: _t('Tamam'), value: true, primary: true }]);
    $('#dialog .dialog-card p')?.after(h('div', { class: 'import-help gauth-list' }, ...pws.map((p) => h('div', null, h('b', null, p.title), h('span', null, p.username || '')))));
    await done;
  } else toast(_t('✓ {0} çıkarıldı', m.name));
}

async function leaveSpace(sid) {
  const sp = shareSpace(sid);
  if (!(await ask(_t('“{0}” alanından ayrılınsın mı?', sp.name), _t('Alandaki kayıtlar bu cihazdan kalkar; diğer üyelerde durur. Tekrar katılmak için yeni bir davet gerekir.'),
    [{ label: _t('Vazgeç'), value: false }, { label: _t('Ayrıl'), value: true, primary: true }]))) return;
  await shareCall('DELETE', `/spaces/${sid}/members/${shareSession().accountId}`);
  dropSharedItems((x) => x === sid);
  delete db.share.spaces[sid];
  persist();
  render();
  toast(_t('“{0}” alanından ayrıldın', sp.name));
}

// Üyeler penceresi: sahip rol değiştirir ve çıkarır; üye ayrılabilir
async function openMembers(sid) {
  const sp = shareSpace(sid);
  const me = shareSession().accountId;
  const { members } = await shareCall('GET', `/spaces/${sid}/members`);
  const roleText = (m) => (m.status === 'pending' ? _t('onay bekliyor') : m.role === 'owner' ? _t('sahibi') : m.role === 'viewer' ? _t('sadece görür') : _t('düzenleyebilir'));
  const done = ask(_t('👥 {0} · üyeler', sp.name), '', [
    ...(sp.owner ? [] : [{ label: _t('Alandan ayrıl'), value: 'leave' }]),
    { label: _t('Kapat'), value: null, primary: true }]);
  const rows = members.map((m) => h('div', { class: 'member-row' },
    h('div', { class: 'body' }, h('b', null, m.name + (m.id === me ? _t(' (sen)') : '')), h('small', null, roleText(m))),
    sp.owner && m.id !== me && m.status === 'active' && h('button', { class: 'mini', type: 'button', onclick: async () => {
      const role = m.role === 'viewer' ? 'editor' : 'viewer';
      try { await shareCall('POST', `/spaces/${sid}/members/${m.id}/role`, { role }); closeDialog(null); toast(_t('✓ {0}: {1}', m.name, role === 'viewer' ? _t('sadece görür') : _t('düzenleyebilir'))); } catch (e) { toast(cleanErr(e)); }
    } }, m.role === 'viewer' ? _t('Düzenleyebilsin') : _t('Sadece görsün')),
    sp.owner && m.id !== me && h('button', { class: 'mini', type: 'button', onclick: async () => {
      closeDialog(null);
      try { await removeMemberFlow(sid, m); } catch (e) { toast(cleanErr(e)); }
    } }, _t('Çıkar'))));
  $('#dialog .dialog-card h3')?.after(h('div', { class: 'member-list' }, ...rows));
  if ((await done) === 'leave') await leaveSpace(sid).catch((e) => toast(cleanErr(e)));
}

// Sadece görüntüleme izni olan ortak kayıt
const readOnlyShared = (x) => !!(x?.spaceId && shareSpace(x.spaceId)?.role === 'viewer');

// Sahip: onay bekleyen üyeler için öneri kartı (güvenlik koduyla)
async function checkPending() {
  for (const [sid, sp] of Object.entries(db.share.spaces)) {
    if (!sp.owner || sp.status !== 'active') continue;
    const { members } = await shareCall('GET', `/spaces/${sid}/members`);
    for (const m of members.filter((x) => x.status === 'pending')) {
      let code = '';
      try { const k = await shareCall('GET', `/accounts/${m.id}/keys`); code = await SC.safetyCode({ enc: k.enc, sig: k.sig }); } catch {}
      addPrompt({
        key: `approve:${sid}:${m.id}`, icon: '👥', title: _t('{0}, “{1}” alanına katılmak istiyor', m.name, sp.name),
        sub: _t('Güvenlik kodu: {0} — onaylamadan önce kişiye sor, kendi Bitig’indeki kodla aynı olmalı.', code || '—'),
        actions: [
          { label: _t('Onayla'), primary: true, fn: async () => { try { await shareCall('POST', `/spaces/${sid}/members/${m.id}/approve`, {}); toast(_t('✓ {0} katıldı', m.name)); } catch (e) { toast(cleanErr(e)); } } },
          { label: _t('Reddet'), fn: async () => { try { await shareCall('DELETE', `/spaces/${sid}/members/${m.id}`); } catch (e) { toast(cleanErr(e)); } } },
        ],
      });
    }
  }
}

function shareSyncNow() {
  if (!db || !shareSession() || !shareIdentity()) return Promise.resolve();
  if (shareSyncing) return shareSyncing;
  // Yalnızca bir şey değiştiyse kaydedilir (kaydetmek yeni bir eşitleme tetikler; boşuna döngü olmasın)
  const fingerprint = () => JSON.stringify(db.share, (k, v) => (k === 'lastSync' ? undefined : v));
  shareSyncing = (async () => {
    let changed = false;
    const before = fingerprint();
    try {
      normalizeSpaces();
      changed = await refreshSpaces();
      for (const [sid, sp] of Object.entries(db.share.spaces)) {
        if (sp.status !== 'active' || !sp.key) continue;
        if (await pullSpace(sid, sp)) changed = true;
        try { await pushSpace(sid, sp); } catch (e) {
          if (e.code !== 'stale_key') throw e;
          // Sahip anahtarı yeniledi: yeni anahtarı al, eski anahtarla yazdıklarımızı yeniden gönder
          await refreshSpaces();
          if (await pullSpace(sid, sp)) changed = true;
          await pushSpace(sid, sp);
        }
        await pushFiles(sid, sp);
        await pullFiles(sid, sp);
        if (await refreshPeople(sid, sp)) changed = true;
      }
      await checkPending();
      // Canlı bağlantı: etkin alanlara açık kalsın (değişince sunucu haber verir)
      kasa.shareLive?.({ token: shareSession()?.token, spaces: Object.entries(db.share.spaces).filter(([, x]) => x.status === 'active').map(([id]) => id) });
      db.share.lastSync = Date.now();
      db.share.lastError = '';
    } catch (e) {
      db.share.lastError = cleanErr(e);
      if (e.status === 401) { delete db.share.session; stopShareSync(); }
    }
    if (!db) return; // bu arada kilitlendi
    if (changed || fingerprint() !== before) persist();
    if (changed) render();
  })().finally(() => { shareSyncing = null; });
  return shareSyncing;
}

function startShareSync() {
  stopShareSync();
  if (!shareSession()) return;
  shareSyncNow();
  shareTimer = setInterval(() => { if (!document.hidden) shareSyncNow(); }, 30_000);
}
function stopShareSync() {
  clearInterval(shareTimer);
  shareTimer = null;
  kasa.shareLive?.({ token: null, spaces: [] }); // kilitlenince canlı bağlantılar kapanır
}
// Sunucu "yeni kayıt var" dedi: kısa bir bekleme ile çek (art arda gelen bildirimler tek eşitleme olur)
let shareLiveTimer = null;
kasa.onShareChanged?.((e) => {
  if (!db || !shareSession()) return;
  clearTimeout(shareLiveTimer);
  shareLiveTimer = setTimeout(shareSyncNow, e?.reason === 'open' ? 50 : 300);
});
// Kaydedince kısa süre sonra gönder
let sharePushTimer = null;
function scheduleSharePush() {
  if (!shareSession()) return;
  clearTimeout(sharePushTimer);
  sharePushTimer = setTimeout(shareSyncNow, 800);
}

// ---------- ayarlar ----------
async function shareSection(row) {
  if (!(await shareAvailable())) return [];
  const s = shareSession();
  const rows = [section(_t('Paylaşım (beta)'))];
  if (!s) {
    rows.push(row(_t('Ortak alanlar'), _t('Projeleri aile ya da ekiple paylaş; uçtan uca şifreli.'),
      h('button', { class: 'mini', type: 'button', onclick: () => joinInvite() }, _t('Davete katıl')),
      h('button', { class: 'mini primary-mini', type: 'button', onclick: async () => { if (await shareLogin()) openSettingsSheet(); } }, _t('Giriş yap'))));
    return rows;
  }
  const code = shareIdentity() ? await SC.safetyCode(SC.publicPart(shareIdentity())) : '—';
  rows.push(row(s.name, _t('Güvenlik kodun: {0}', code),
    h('button', { class: 'mini', type: 'button', onclick: async () => { await shareLogout(); openSettingsSheet(); } }, _t('Çıkış'))));
  const spaces = Object.entries(db.share.spaces || {});
  for (const [sid, sp] of spaces) {
    rows.push(row('👥 ' + (sp.name || _t('Ortak alan')),
      sp.status === 'pending' ? _t('Onay bekleniyor') : sp.owner ? _t('Sahibi sensin') : sp.role === 'viewer' ? _t('Üyesin · sadece görürsün') : _t('Üyesin'),
      sp.status === 'active' && h('button', { class: 'mini', type: 'button', onclick: () => openMembers(sid).catch((e) => toast(cleanErr(e))) }, _t('Üyeler')),
      sp.owner && sp.status === 'active' && h('button', { class: 'mini', type: 'button', onclick: () => inviteToSpace(sid).catch((e) => toast(cleanErr(e))) }, _t('Davet et'))));
  }
  rows.push(row(_t('Davete katıl'), _t('Sana gönderilen bağlantıyla bir alana katıl'),
    h('button', { class: 'mini', type: 'button', onclick: () => joinInvite().catch((e) => toast(cleanErr(e))) }, _t('Bağlantı yapıştır'))));
  if (db.share.lastError) rows.push(h('p', { class: 'muted small' }, '⚠ ' + db.share.lastError));
  return rows;
}
