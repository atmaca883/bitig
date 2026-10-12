// Paylaşım şifrelemesi (ortak alanlar). Bilgisayar, telefon ve Node testleri aynı kodu kullanır; yalnızca WebCrypto.
// Tasarım: docs/paylasim-tasarimi.md
//  - Kimlik: ECDH P-256 (şifreleme) + ECDSA P-256 (imza). Özel anahtarlar kişisel kasada durur.
//  - seal: bir açık anahtara kilitleme = tek kullanımlık ECDH + HKDF-SHA-256 + AES-256-GCM.
//  - Alan anahtarı (32 bayt) kayıtları şifreler; her üyeye ayrı ayrı seal ile kilitlenir.
//  - Her kutunun AAD'si bağlamını taşır: bir kutu başka bir alana, kayda ya da üyeye taşınırsa açılmaz.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KasaShareCrypto = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const subtle = () => globalThis.crypto.subtle;
  const random = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function b64url(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64url(s) {
    const t = String(s).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(t + '==='.slice((t.length + 3) % 4)), (c) => c.charCodeAt(0));
  }

  const EC = { name: 'ECDH', namedCurve: 'P-256' };
  const SIG = { name: 'ECDSA', namedCurve: 'P-256' };
  const pubOnly = (jwk) => ({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y });

  // ---------- kimlik ----------
  async function generateIdentity() {
    const e = await subtle().generateKey(EC, true, ['deriveBits']);
    const s = await subtle().generateKey(SIG, true, ['sign', 'verify']);
    return {
      v: 1,
      enc: { pub: pubOnly(await subtle().exportKey('jwk', e.publicKey)), priv: await subtle().exportKey('jwk', e.privateKey) },
      sig: { pub: pubOnly(await subtle().exportKey('jwk', s.publicKey)), priv: await subtle().exportKey('jwk', s.privateKey) },
      created: Date.now(),
    };
  }
  const publicPart = (id) => ({ enc: id.enc.pub, sig: id.sig.pub });

  async function sign(identity, text) {
    const k = await subtle().importKey('jwk', identity.sig.priv, SIG, false, ['sign']);
    return b64url(await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, k, enc.encode(text)));
  }
  async function verify(sigPub, text, signature) {
    try {
      const k = await subtle().importKey('jwk', pubOnly(sigPub), SIG, false, ['verify']);
      return await subtle().verify({ name: 'ECDSA', hash: 'SHA-256' }, k, unb64url(signature), enc.encode(text));
    } catch { return false; }
  }

  // ---------- simetrik ----------
  const aesKey = (raw, usage) => subtle().importKey('raw', raw, { name: 'AES-GCM' }, false, usage);
  async function hkdfKey(secret, info, usage) {
    const base = await subtle().importKey('raw', secret, 'HKDF', false, ['deriveKey']);
    return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: enc.encode(info) }, base,
      { name: 'AES-GCM', length: 256 }, false, usage);
  }
  async function aesSeal(key, plain, aad) {
    const iv = random(12);
    const data = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, plain);
    return { iv: b64url(iv), data: b64url(data) };
  }
  async function aesOpen(key, box, aad) {
    return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: unb64url(box.iv), additionalData: enc.encode(aad) }, key, unb64url(box.data)));
  }

  // ---------- açık anahtara kilitleme ----------
  async function seal(recipientEncPub, bytes, aad) {
    const eph = await subtle().generateKey(EC, true, ['deriveBits']);
    const pub = await subtle().importKey('jwk', pubOnly(recipientEncPub), EC, false, []);
    const shared = new Uint8Array(await subtle().deriveBits({ name: 'ECDH', public: pub }, eph.privateKey, 256));
    const epk = pubOnly(await subtle().exportKey('jwk', eph.publicKey));
    const key = await hkdfKey(shared, 'bitig-seal-v1|' + epk.x + '|' + epk.y, ['encrypt']);
    return JSON.stringify({ v: 1, epk, ...(await aesSeal(key, bytes, aad)) });
  }
  async function open(identity, sealed, aad) {
    const s = JSON.parse(sealed);
    if (s.v !== 1) throw new Error('biçim');
    const priv = await subtle().importKey('jwk', identity.enc.priv, EC, false, ['deriveBits']);
    const epk = await subtle().importKey('jwk', pubOnly(s.epk), EC, false, []);
    const shared = new Uint8Array(await subtle().deriveBits({ name: 'ECDH', public: epk }, priv, 256));
    const key = await hkdfKey(shared, 'bitig-seal-v1|' + s.epk.x + '|' + s.epk.y, ['decrypt']);
    return aesOpen(key, s, aad);
  }

  // ---------- ortak alan ----------
  const newSpaceKey = () => random(32);
  const keyAad = (c) => `bitig-space-key|${c.spaceId}|${c.accountId}|${c.keyVersion}`;
  const wrapSpaceKey = (memberEncPub, spaceKey, ctx) => seal(memberEncPub, spaceKey, keyAad(ctx));
  const unwrapSpaceKey = (identity, wrapped, ctx) => open(identity, wrapped, keyAad(ctx));

  const recordAad = (c) => `bitig-record|${c.spaceId}|${c.itemId}|${c.kind}|${c.keyVersion}`;
  async function encryptRecord(spaceKey, ctx, obj) {
    return JSON.stringify(await aesSeal(await aesKey(spaceKey, ['encrypt']), enc.encode(JSON.stringify(obj)), recordAad(ctx)));
  }
  async function decryptRecord(spaceKey, ctx, cipher) {
    return JSON.parse(dec.decode(await aesOpen(await aesKey(spaceKey, ['decrypt']), JSON.parse(cipher), recordAad(ctx))));
  }

  // Ortak eklerin dosyası: alan anahtarıyla şifreli, hangi anahtar sürümüyle şifrelendiği zarfta yazılı
  const fileAad = (spaceId, fileId, keyVersion) => `bitig-file|${spaceId}|${fileId}|${keyVersion}`;
  async function encryptFile(spaceKey, spaceId, fileId, keyVersion, bytes) {
    return JSON.stringify({ v: 1, kv: keyVersion, ...(await aesSeal(await aesKey(spaceKey, ['encrypt']), bytes, fileAad(spaceId, fileId, keyVersion))) });
  }
  const fileKeyVersion = (envelope) => JSON.parse(envelope).kv;
  async function decryptFile(spaceKey, spaceId, fileId, envelope) {
    const e = JSON.parse(envelope);
    return aesOpen(await aesKey(spaceKey, ['decrypt']), e, fileAad(spaceId, fileId, e.kv));
  }

  const metaAad = (spaceId, keyVersion) => `bitig-space-meta|${spaceId}|${keyVersion}`;
  async function encryptMeta(spaceKey, spaceId, keyVersion, meta) {
    return JSON.stringify(await aesSeal(await aesKey(spaceKey, ['encrypt']), enc.encode(JSON.stringify(meta)), metaAad(spaceId, keyVersion)));
  }
  async function decryptMeta(spaceKey, spaceId, keyVersion, cipher) {
    return JSON.parse(dec.decode(await aesOpen(await aesKey(spaceKey, ['decrypt']), JSON.parse(cipher), metaAad(spaceId, keyVersion))));
  }

  // ---------- davet ----------
  // Sır yalnızca bağlantının # sonrasında durur; sunucuya giden kutu sırsız açılamaz.
  const newInviteSecret = () => random(32);
  async function encryptInvite(secret, inviteId, payload) {
    const key = await hkdfKey(secret, 'bitig-invite-v1|' + inviteId, ['encrypt']);
    return JSON.stringify(await aesSeal(key, enc.encode(JSON.stringify(payload)), 'bitig-invite|' + inviteId));
  }
  async function decryptInvite(secret, inviteId, blob) {
    const key = await hkdfKey(secret, 'bitig-invite-v1|' + inviteId, ['decrypt']);
    return JSON.parse(dec.decode(await aesOpen(key, JSON.parse(blob), 'bitig-invite|' + inviteId)));
  }
  const inviteLink = (base, inviteId, secret) => `${base}#davet=${inviteId}.${b64url(secret)}`;
  function parseInviteLink(link) {
    const m = String(link).match(/#davet=([0-9a-zA-Z-]{8,64})\.([A-Za-z0-9_-]{40,})$/);
    if (!m) return null;
    try { const secret = unb64url(m[2]); return secret.length === 32 ? { inviteId: m[1], secret } : null; } catch { return null; }
  }

  // ---------- güvenlik kodu ----------
  // Açık anahtarların parmak izi: 4 grup × 4 rakam. Üye onaylanırken iki cihazda aynı görünmeli.
  async function safetyCode(pub) {
    const h = new Uint8Array(await subtle().digest('SHA-256', enc.encode(JSON.stringify([pubOnly(pub.enc), pubOnly(pub.sig)]))));
    const groups = [];
    for (let i = 0; i < 4; i++) groups.push(String(((h[i * 3] << 16) | (h[i * 3 + 1] << 8) | h[i * 3 + 2]) % 10000).padStart(4, '0'));
    return groups.join(' ');
  }

  return {
    b64url, unb64url, generateIdentity, publicPart, sign, verify, seal, open,
    newSpaceKey, wrapSpaceKey, unwrapSpaceKey, encryptRecord, decryptRecord, encryptMeta, decryptMeta, encryptFile, decryptFile, fileKeyVersion,
    newInviteSecret, encryptInvite, decryptInvite, inviteLink, parseInviteLink, safetyCode,
  };
});
