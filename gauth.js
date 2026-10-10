// Google Authenticator'dan aktarma: "Hesapları aktar → Dışa aktar" ekranındaki QR kod
// (otpauth-migration://offline?data=…) çözülür. Kod bu cihazda çözülür; hiçbir yere gönderilmez.
// Bilgisayar, telefon ve Node testleri aynı kodu kullanır.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KasaGAuth = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  function base32(bytes) {
    let bits = 0;
    let value = 0;
    let out = '';
    for (const b of bytes) {
      value = (value << 8) | b;
      bits += 8;
      while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) out += B32[(value << (5 - bits)) & 31];
    return out;
  }

  function fromBase64(s) {
    const clean = s.replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, '');
    const bin = atob(clean + '==='.slice((clean.length + 3) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }

  // Küçük protobuf okuyucu: { alan numarası: [değerler] } (iç içe mesajlar ham bayt olarak kalır)
  function readMessage(buf) {
    const out = {};
    let i = 0;
    const varint = () => {
      let v = 0;
      let mul = 1;
      for (let n = 0; n < 10; n++) {
        if (i >= buf.length) throw new Error('kısa');
        const b = buf[i++];
        v += (b & 0x7f) * mul;
        if (!(b & 0x80)) return v;
        mul *= 128;
      }
      throw new Error('varint');
    };
    while (i < buf.length) {
      const key = varint();
      const field = Math.floor(key / 8);
      const wire = key & 7;
      let val;
      if (wire === 0) val = varint();
      else if (wire === 2) {
        const len = varint();
        if (i + len > buf.length) throw new Error('kısa');
        val = buf.subarray(i, i + len);
        i += len;
      } else if (wire === 1) { i += 8; continue; } else if (wire === 5) { i += 4; continue; } else throw new Error('wire');
      (out[field] ||= []).push(val);
    }
    return out;
  }

  const text = (b) => (b ? new TextDecoder().decode(b) : '');
  const ALGOS = { 0: 'SHA1', 1: 'SHA1', 2: 'SHA256', 3: 'SHA512' }; // 4 = MD5: desteklenmiyor
  const DIGITS = { 0: 6, 1: 6, 2: 8 };

  const isMigration = (s) => /^otpauth-migration:\/\//i.test(String(s || '').trim());

  // → { accounts: [{ secret, issuer, account, algorithm, digits }], skipped, batch: { index, size, id } } ya da null
  function decode(uri) {
    const s = String(uri || '').trim();
    if (!isMigration(s)) return null;
    let data;
    try { data = new URL(s).searchParams.get('data'); } catch { return null; }
    if (!data) return null;
    let msg;
    try { msg = readMessage(fromBase64(data)); } catch { return null; }
    if (!msg[1]) return null; // hiç hesap yok: bozuk ya da başka bir kod
    const accounts = [];
    let skipped = 0;
    for (const raw of msg[1] || []) {
      let p;
      try { p = readMessage(raw); } catch { skipped++; continue; }
      const secret = p[1]?.[0];
      const type = p[6]?.[0] ?? 2;
      const algorithm = ALGOS[p[4]?.[0] ?? 0];
      const digits = DIGITS[p[5]?.[0] ?? 0];
      // Sayaçlı (HOTP) ve MD5'li kodlar Bitig'de üretilmez
      if (!secret?.length || type === 1 || !algorithm || !digits) { skipped++; continue; }
      let name = text(p[2]?.[0]).trim();
      let issuer = text(p[3]?.[0]).trim();
      // Bazı hesaplarda ad "Sağlayıcı:hesap" biçiminde gelir
      const m = name.match(/^([^:]+):\s*(.+)$/);
      if (m && (!issuer || m[1].trim() === issuer)) { issuer ||= m[1].trim(); name = m[2].trim(); }
      accounts.push({ secret: base32(secret), issuer, account: name, algorithm, digits });
    }
    const size = msg[3]?.[0] || 1;
    return { accounts, skipped, batch: { index: msg[4]?.[0] || 0, size, id: msg[5]?.[0] || 0 } };
  }

  // Bitig'in sakladığı biçim: otpauth://totp/… adresi
  function toOtpauth(a) {
    const label = a.issuer ? `${encodeURIComponent(a.issuer)}:${encodeURIComponent(a.account)}` : encodeURIComponent(a.account || 'hesap');
    const q = new URLSearchParams({ secret: a.secret });
    if (a.issuer) q.set('issuer', a.issuer);
    if (a.algorithm !== 'SHA1') q.set('algorithm', a.algorithm);
    if (a.digits !== 6) q.set('digits', String(a.digits));
    return `otpauth://totp/${label}?${q}`;
  }

  // Sağlayıcı adı ("Google", "GitHub", "Microsoft 365") ile kayıtlı şifre eşleşir mi?
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
  function issuerMatches(issuer, p, core) {
    const n = norm(issuer);
    if (!n) return false;
    const host = core.baseDomain(core.entryHost(p));
    const name = norm(host.split('.')[0]);
    const title = norm(p.title);
    const first = norm(String(issuer).split(/[\s.(]/)[0]); // "Microsoft 365" → "microsoft"
    return (name && (name === n || name === first)) || title === n || (first.length >= 4 && title.startsWith(first));
  }

  // Aktarılan hesabı kasadaki bir şifre kaydıyla eşleştir (aynı sağlayıcı + aynı kullanıcı adı;
  // tek eşleşme varsa kullanıcı adı olmadan da)
  function findEntry(a, passwords, core) {
    const same = passwords.filter((p) => issuerMatches(a.issuer || a.account, p, core));
    const acc = String(a.account || '').toLowerCase();
    const exact = same.filter((p) => acc && String(p.username || '').toLowerCase() === acc);
    if (exact.length) return exact[0];
    const loose = same.filter((p) => !p.username || !acc);
    if (loose.length === 1) return loose[0];
    // o sağlayıcıda tek kayıt var ve henüz 2FA anahtarı yoksa (kullanıcı adı farklı yazılmış olabilir: "ali" / "ali@gmail.com")
    return same.length === 1 && !same[0].totp ? same[0] : null;
  }

  return { isMigration, decode, toOtpauth, findEntry, issuerMatches, base32 };
});
