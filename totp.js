// 2FA kodları (TOTP, RFC 6238 — Google Authenticator ile aynı). Kod bu cihazda üretilir; hiçbir yere gitmez.
// Anahtar: "otpauth://totp/…?secret=…" adresi ya da Base32 gizli anahtar (boşluklu/küçük harf olabilir).
// Bilgisayar, telefon ve Node testleri aynı kodu kullanır.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KasaTotp = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  function base32Decode(s) {
    const clean = String(s || '').toUpperCase().replace(/[\s=_-]/g, '');
    if (!clean || /[^A-Z2-7]/.test(clean)) return null;
    let bits = 0;
    let value = 0;
    const out = [];
    for (const c of clean) {
      value = (value << 5) | B32.indexOf(c);
      bits += 5;
      if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
    }
    return out.length ? new Uint8Array(out) : null;
  }

  const ALGOS = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' };

  // Girilen metni çöz: { secret (Base32), digits, period, algorithm, issuer, account } ya da null
  function parse(input) {
    const s = String(input || '').trim();
    if (!s) return null;
    if (/^otpauth:\/\//i.test(s)) {
      let u;
      try { u = new URL(s); } catch { return null; }
      if (u.host.toLowerCase() !== 'totp') return null; // HOTP (sayaçlı) desteklenmiyor
      const q = u.searchParams;
      const secret = (q.get('secret') || '').replace(/\s/g, '').toUpperCase();
      if (!base32Decode(secret)) return null;
      const label = decodeURIComponent(u.pathname.replace(/^\//, ''));
      const [li, la] = label.includes(':') ? label.split(/:(.*)/s) : ['', label];
      const algorithm = (q.get('algorithm') || 'SHA1').toUpperCase().replace('-', '');
      const digits = Number(q.get('digits') || 6);
      const period = Number(q.get('period') || 30);
      if (!ALGOS[algorithm] || ![6, 7, 8].includes(digits) || !(period > 0 && period <= 300)) return null;
      return { secret, digits, period, algorithm, issuer: q.get('issuer') || li.trim(), account: (la || '').trim() };
    }
    const secret = s.replace(/[\s=_-]/g, '').toUpperCase();
    if (secret.length < 16 || !base32Decode(secret)) return null; // 80 bitten kısa anahtar büyük ihtimalle yanlış
    return { secret, digits: 6, period: 30, algorithm: 'SHA1', issuer: '', account: '' };
  }

  const keyCache = new Map();
  async function hmacKey(secret, algorithm) {
    const k = algorithm + ':' + secret;
    if (!keyCache.has(k)) {
      keyCache.set(k, crypto.subtle.importKey('raw', base32Decode(secret), { name: 'HMAC', hash: ALGOS[algorithm] }, false, ['sign']));
    }
    return keyCache.get(k);
  }

  // { code: "123456", remaining: saniye, period } — ya da anahtar geçersizse null
  async function generate(input, now = Date.now()) {
    const p = typeof input === 'string' ? parse(input) : input;
    if (!p) return null;
    const t = Math.floor(now / 1000);
    const counter = Math.floor(t / p.period);
    const msg = new Uint8Array(8);
    let c = counter;
    for (let i = 7; i >= 0; i--) { msg[i] = c & 0xff; c = Math.floor(c / 256); }
    const h = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(p.secret, p.algorithm), msg));
    const o = h[h.length - 1] & 0x0f;
    const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
    const code = String(bin % 10 ** p.digits).padStart(p.digits, '0');
    return { code, remaining: p.period - (t % p.period), period: p.period, counter };
  }

  // "123456" → "123 456" (okunaklı)
  const pretty = (code) => (code.length === 6 ? code.slice(0, 3) + ' ' + code.slice(3) : code.length === 8 ? code.slice(0, 4) + ' ' + code.slice(4) : code);

  return { parse, generate, pretty, base32Decode };
});
