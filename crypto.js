// Telefon: kasa dosyası şifrelemesi — bilgisayardaki vault.js ile birebir aynı biçim.
// AES-256-GCM (WebCrypto) + scrypt (scrypt-js). Şifre çözme yalnızca bu cihazda yapılır.
(function (root) {
  'use strict';

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const KDF = { N: 1 << 15, r: 8, p: 1 };
  const PIN_KDF = { N: 1 << 14, r: 8, p: 1 };
  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  function b64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const random = (n) => crypto.getRandomValues(new Uint8Array(n));

  // scrypt-js'in parçalı (async) sürümü tarayıcıda ~40 kat yavaş: hızlı sürümü arka plan iş parçacığında çalıştır.
  let worker = null;
  let seq = 0;
  const pending = new Map();
  function getWorker() {
    if (worker !== null) return worker;
    try {
      worker = new Worker('kdf-worker.js');
      worker.onmessage = (e) => {
        const job = pending.get(e.data.id);
        pending.delete(e.data.id);
        if (!job) return;
        if (e.data.error) job.reject(new Error(e.data.error)); else job.resolve(new Uint8Array(e.data.key));
      };
      worker.onerror = () => {
        worker = false; // bir daha deneme; aşağıdaki yedek yola düş
        for (const job of pending.values()) job.retry();
        pending.clear();
      };
    } catch {
      worker = false;
    }
    return worker;
  }

  function scryptHere(pwd, salt, p) {
    return new Uint8Array(root.scrypt.syncScrypt(pwd, salt, p.N, p.r, p.p, 32));
  }

  async function scrypt(secret, salt, p) {
    const pwd = enc.encode(secret);
    const w = typeof Worker !== 'undefined' && root.document ? getWorker() : false;
    if (!w) return scryptHere(pwd, salt, p);
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject, retry: () => { try { resolve(scryptHere(pwd, salt, p)); } catch (e) { reject(e); } } });
      w.postMessage({ id, pwd, salt, N: p.N, r: p.r, p: p.p });
    });
  }
  const kdf = (secret, salt) => scrypt(String(secret).normalize('NFC'), salt, KDF);

  const aesKey = (raw, usage) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [usage]);

  // Node'daki biçim: veri ve doğrulama etiketi (tag) ayrı alanlarda
  async function seal(keyRaw, plain) {
    const iv = random(12);
    const out = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, await aesKey(keyRaw, 'encrypt'), plain));
    return { iv: b64(iv), tag: b64(out.subarray(out.length - 16)), data: b64(out.subarray(0, out.length - 16)) };
  }

  async function open(keyRaw, box) {
    const data = unb64(box.data);
    const tag = unb64(box.tag);
    const joined = new Uint8Array(data.length + tag.length);
    joined.set(data);
    joined.set(tag, data.length);
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv), tagLength: 128 }, await aesKey(keyRaw, 'decrypt'), joined));
  }

  async function wrapKey(dek, secret) {
    const salt = random(16);
    return { salt: b64(salt), ...(await seal(await kdf(secret, salt), dek)), created: Date.now() };
  }
  async function unwrapKey(wrap, secret) {
    return open(await kdf(secret, unb64(wrap.salt)), wrap);
  }

  const sealJson = async (dek, obj) => seal(dek, enc.encode(JSON.stringify(obj)));
  const openJson = async (dek, box) => JSON.parse(dec.decode(await open(dek, box)));

  async function buildFile(dek, wraps, data) {
    return { v: 2, kdf: { name: 'scrypt', N: KDF.N, r: KDF.r, p: KDF.p }, wraps, box: await sealJson(dek, data) };
  }

  async function hashPin(pin, salt = random(16)) {
    return { salt: b64(salt), hash: b64(await scrypt(String(pin), salt, PIN_KDF)) };
  }
  async function checkPin(pin, rec) {
    const { hash } = await hashPin(pin, unb64(rec.salt));
    // sabit süreli karşılaştırma
    const a = unb64(hash);
    const b = unb64(rec.hash);
    let diff = a.length ^ b.length;
    for (let i = 0; i < Math.min(a.length, b.length); i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }

  function normalizeRecoveryKey(s) {
    const clean = String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '')
      .replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
    return (clean.match(/.{1,4}/g) || []).join('-');
  }

  root.KasaCrypto = {
    seal, open, wrapKey, unwrapKey, sealJson, openJson, buildFile, hashPin, checkPin,
    normalizeRecoveryKey, random, b64, unb64, B32,
  };
})(typeof self !== 'undefined' ? self : globalThis);
