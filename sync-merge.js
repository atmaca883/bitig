// Cihazlar arası eşitleme: iki kasa verisini kayıt kayıt birleştirir.
// Bilgisayar (ana süreç ve arayüz) ve telefon uygulaması aynı kuralı kullanır.
//
// Kurallar:
//  • Aynı kayıt iki tarafta da varsa son değiştirilen (updated) kazanır.
//  • Silinen kayıtlar "mezar taşı" (tombstones["koleksiyon:id"] = silinme zamanı) bırakır;
//    mezar taşı kayıttan yeniyse kayıt her yerde silinir.
//  • Silindikten sonra başka cihazda düzenlenen kayıt geri gelir (düzenleme daha yeni).
//  • Mezar taşları 180 gün sonra unutulur.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KasaSync = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COLLECTIONS = ['projects', 'passwords', 'notes', 'tasks', 'trash'];
  const TOMBSTONE_DAYS = 180;

  const stamp = (x) => x.updated || x.deletedAt || x.created || 0;

  function mergeTombstones(a = {}, b = {}, now = Date.now()) {
    const out = { ...a };
    for (const [k, t] of Object.entries(b)) if (!(out[k] >= t)) out[k] = t;
    const cutoff = now - TOMBSTONE_DAYS * 86_400_000;
    for (const k of Object.keys(out)) if (out[k] < cutoff) delete out[k];
    return out;
  }

  // local öncelikli: eşit zaman damgasında yereldeki sürüm kalır, sıralama yereldeki gibi korunur
  function merge(local, remote, now = Date.now()) {
    local = local || {};
    remote = remote || {};
    const out = { ...remote, ...local };
    const tomb = mergeTombstones(local.tombstones, remote.tombstones, now);
    out.tombstones = tomb;

    for (const c of COLLECTIONS) {
      const map = new Map();
      for (const src of [local[c] || [], remote[c] || []]) {
        for (const x of src) {
          if (!x || !x.id) continue;
          const prev = map.get(x.id);
          if (!prev || stamp(x) > stamp(prev)) map.set(x.id, x);
        }
      }
      out[c] = [...map.values()].filter((x) => !(tomb[`${c}:${x.id}`] >= stamp(x)));
    }

    // Çöpteki bir kayıt başka cihazda düzenlenip geri geldiyse çöpteki kopyası kalkar
    const live = new Set();
    for (const c of ['projects', 'passwords', 'notes', 'tasks']) for (const x of out[c]) live.add(`${c}:${x.id}`);
    const collOf = { project: 'projects', password: 'passwords', note: 'notes', task: 'tasks' };
    out.trash = out.trash.filter((e) => !(e.item && live.has(`${collOf[e.type]}:${e.item.id}`)));

    // Tercihler (ör. Bugün kartları) tek parça: son değiştirilen kazanır
    const lp = local.prefs;
    const rp = remote.prefs;
    out.prefs = !lp ? rp : !rp ? lp : ((rp.updated || 0) > (lp.updated || 0) ? rp : lp);
    if (out.prefs === undefined) delete out.prefs;
    return out;
  }

  // İki veri arasında kaç kaydın farklı olduğu (bildirim için)
  function countChanges(before, after) {
    let n = 0;
    for (const c of ['projects', 'passwords', 'notes', 'tasks']) {
      const prev = new Map((before?.[c] || []).map((x) => [x.id, JSON.stringify(x)]));
      const next = new Map((after?.[c] || []).map((x) => [x.id, JSON.stringify(x)]));
      for (const [id, s] of next) if (prev.get(id) !== s) n++;
      for (const id of prev.keys()) if (!next.has(id)) n++;
    }
    return n;
  }

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  return { merge, countChanges, same, stamp, COLLECTIONS };
});
