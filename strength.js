// Şifre sağlığı: güç tahmini, tekrar / eskilik analizi ve sızıntı kontrolü (Have I Been Pwned, k-anonimlik).
// Sızıntı kontrolünde şifre ya da tam parmak izi hiçbir yere gitmez: SHA-1'in ilk 5 karakteri gönderilir,
// dönen yüzlerce sonek arasında eşleşme bu cihazda aranır. Bilgisayar, telefon ve Node testleri aynı kodu kullanır.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KasaStrength = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // En yaygın şifreler (küçük harf). Sonuna rakam/sembol eklenmiş halleri de yakalanır (galatasaray1905, sifre123!).
  const COMMON = new Set(`123456 1234567 12345678 123456789 1234567890 12345 1234 123 111111 000000 123123 654321 666666 121212
    112233 123321 159753 987654321 7777777 11111111 password passw0rd password1 qwerty qwerty123 qwertyuiop asdfgh asdfghjkl zxcvbnm
    1q2w3e4r 1qaz2wsx qazwsx abc123 abcdef iloveyou admin administrator root welcome letmein monkey dragon master login princess
    football baseball superman batman trustno1 sunshine shadow michael jennifer hello freedom whatever secret test test123 guest
    default changeme pass 123qwe qwe123 aa123456 a123456 asd123 zaq12wsx google facebook instagram
    sifre şifre parola sifrem şifrem gizli kullanici admin123 yonetici merhaba seviyorum seniseviyorum askim aşkım canim canım
    galatasaray fenerbahce fenerbahçe besiktas beşiktaş trabzonspor bursaspor gs1905 fb1907 bjk1903 ts1967 cimbom aslan
    istanbul ankara izmir antalya bursa turkiye türkiye turkey ataturk atatürk mustafa mehmet ahmet ali ayse ayşe fatma
    emre burak murat elif zeynep yusuf hasan huseyin hüseyin ibrahim osman kemal deniz ece gizem`.split(/\s+/).filter(Boolean));

  const SEQS = ['abcdefghijklmnopqrstuvwxyz', '0123456789', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'qwertzuiop', 'ğüşiöç'];

  const lower = (s) => String(s || '').toLocaleLowerCase('tr');

  // Tekrar ("aaaa") ve dizi ("1234", "abcd", "qwer") parçalarının uzunluğu: bunlar tahmini kolaylaştırır
  function patternChars(pw) {
    const s = lower(pw);
    let n = 0;
    for (let i = 0; i < s.length;) {
      let j = i + 1;
      while (j < s.length && s[j] === s[i]) j++; // tekrar
      if (j - i >= 3) { n += j - i; i = j; continue; }
      let k = i;
      const inc = (a, b) => SEQS.some((q) => { const x = q.indexOf(a); return x >= 0 && q[x + 1] === b; })
        || SEQS.some((q) => { const x = q.indexOf(b); return x >= 0 && q[x + 1] === a; });
      while (k + 1 < s.length && inc(s[k], s[k + 1])) k++;
      if (k - i + 1 >= 4) { n += k - i + 1; i = k + 1; continue; }
      i++;
    }
    return n;
  }

  const hostWords = (url) => {
    try {
      const h = new URL(/^[a-z][\w+.-]*:\/\//i.test(url) ? url : 'https://' + url).hostname.replace(/^www\./, '');
      return h.split('.').filter((w) => w.length >= 4 && !['com', 'net', 'org', 'gov'].includes(w));
    } catch { return []; }
  };

  // Puan: 0 çok zayıf · 1 zayıf · 2 orta · 3 güçlü · 4 çok güçlü
  function strength(pw, ctx = {}) {
    const p = String(pw || '');
    const reasons = [];
    if (!p) return { score: 0, reasons: ['empty'] };
    const l = lower(p);
    // Baştaki/sondaki rakam ve sembolleri at (Türkçe harfler harf sayılsın: \W yerine Unicode sınıfları)
    const base = l.replace(/[\p{N}\p{P}\p{S}\s_]+$/u, '').replace(/^[\p{N}\p{P}\p{S}\s_]+/u, '');
    if (COMMON.has(l) || (base.length >= 3 && COMMON.has(base)) || /^\d{1,8}$/.test(p)) {
      reasons.push('common');
      return { score: 0, reasons };
    }
    let set = 0;
    if (/[a-zçğıöşü]/.test(p)) set += 26;
    if (/[A-ZÇĞİÖŞÜ]/.test(p)) set += 26;
    if (/\d/.test(p)) set += 10;
    if (/[^\w\sçğıöşüÇĞİÖŞÜ]/.test(p) || /_/.test(p)) set += 33;
    if (/\s/.test(p)) set += 1;
    // Desen parçaları yarım sayılır; tarih (19xx/20xx) da tahmin edilebilir
    let eff = p.length - patternChars(p) / 2;
    if (/(19|20)\d{2}/.test(p)) eff -= 2;
    const personal = [ctx.username, ctx.title, ...hostWords(ctx.url || '')]
      .map((w) => lower(w).split('@')[0]).filter((w) => w && w.length >= 4);
    if (personal.some((w) => l.includes(w))) { eff -= 4; reasons.push('personal'); }
    const bits = Math.max(0, eff) * Math.log2(Math.max(set, 2));
    let score = bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
    if (p.length < 8) { score = Math.min(score, 1); reasons.push('short'); }
    if (set <= 10) reasons.push('digits');
    return { score, reasons };
  }

  const YEAR = 365 * 86_400_000;

  // Şifre listesinin sağlık analizi: id → { score, weak, reused, years, leaked }
  function analyze(passwords, now = Date.now()) {
    const byPw = new Map();
    for (const p of passwords) if (p.password) byPw.set(p.password, (byPw.get(p.password) || 0) + 1);
    const map = new Map();
    const sum = { weak: 0, reused: 0, old: 0, leaked: 0, unchecked: 0 };
    for (const p of passwords) {
      if (!p.password) continue;
      const s = strength(p.password, p);
      const changed = p.pwChanged || p.created || 0;
      const years = changed ? (now - changed) / YEAR : 0;
      const b = p.breach && p.breach.pw === changed ? p.breach : null; // şifre değiştiyse eski sonuç geçmez
      const r = { score: s.score, reasons: s.reasons, weak: s.score <= 1, reused: (byPw.get(p.password) || 1) - 1,
        old: years >= 1, years, leaked: b ? b.n : null };
      map.set(p.id, r);
      if (r.weak) sum.weak++;
      if (r.reused) sum.reused++;
      if (r.old) sum.old++;
      if (r.leaked) sum.leaked++;
      if (r.leaked === null) sum.unchecked++;
    }
    return { map, sum };
  }

  // ---------- sızıntı kontrolü ----------
  async function sha1Hex(text) {
    const d = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  // fetchRange(prefix) → "SONEK:SAYI\r\n…" metni. Her kayda breach = { n, at, pw } yazılır. Dönen: sızmış kayıt sayısı.
  async function checkBreaches(passwords, fetchRange, onProgress = () => {}) {
    const items = passwords.filter((p) => p.password);
    const hashes = await Promise.all(items.map((p) => sha1Hex(p.password)));
    const prefixes = [...new Set(hashes.map((h) => h.slice(0, 5)))];
    const ranges = new Map();
    let done = 0;
    const worker = async () => {
      while (prefixes.length) {
        const pre = prefixes.shift();
        const text = await fetchRange(pre);
        const m = new Map();
        for (const line of String(text).split(/\r?\n/)) {
          const [suf, n] = line.trim().split(':');
          if (suf && Number(n) > 0) m.set(suf.toUpperCase(), Number(n)); // dolgu satırları (0) sayılmaz
        }
        ranges.set(pre, m);
        onProgress(++done, done + prefixes.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, prefixes.length) }, worker));
    const now = Date.now();
    let leaked = 0;
    items.forEach((p, i) => {
      const n = ranges.get(hashes[i].slice(0, 5))?.get(hashes[i].slice(5)) || 0;
      p.breach = { n, at: now, pw: p.pwChanged || p.created || 0 };
      if (n) leaked++;
    });
    return leaked;
  }

  return { strength, analyze, checkBreaches, sha1Hex, COMMON };
});
