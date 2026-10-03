// Hem arayüzde hem ana süreçte kullanılan ortak kurallar:
// site/alan adı eşleştirme, tekrar (duplicate) anahtarı ve metin içinde giriş bilgisi bulma.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KasaCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Karşılaştırma için katlama: I/ı/İ/i farkını yok sayar ("ALIV" = "aliv", "İzmir" = "izmir").
  const lower = (s) => String(s || '').trim().toLowerCase().normalize('NFKD').replace(/̇/g, '').replace(/ı/g, 'i').normalize('NFC');

  // ---------- alan adları ----------
  const SECOND_LEVEL = new Set([
    'com.tr', 'net.tr', 'org.tr', 'gov.tr', 'edu.tr', 'gen.tr', 'av.tr', 'bel.tr', 'k12.tr', 'web.tr', 'biz.tr',
    'co.uk', 'org.uk', 'ac.uk', 'com.au', 'co.jp', 'com.br', 'co.nz', 'co.za', 'com.cn', 'co.in',
  ]);
  const DOMAIN_RE = /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i;

  function hostOf(s) {
    s = String(s || '').trim();
    if (!s || /\s/.test(s)) return '';
    try {
      const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : 'https://' + s);
      if (!/^https?:$/.test(u.protocol)) return '';
      const h = u.hostname.toLowerCase();
      return DOMAIN_RE.test(h) || h === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(h) ? h : '';
    } catch { return ''; }
  }

  function baseDomain(host) {
    host = String(host || '').toLowerCase().replace(/^www\./, '');
    if (!host || /^\d+\.\d+\.\d+\.\d+$/.test(host) || !host.includes('.')) return host;
    const parts = host.split('.');
    const n = SECOND_LEVEL.has(parts.slice(-2).join('.')) ? 3 : 2;
    return parts.slice(-n).join('.');
  }

  // Bir şifre kaydının hangi siteye ait olduğu: önce adres, sonra alan adına benzeyen başlık.
  function entryHost(p) {
    return hostOf(p.url) || (DOMAIN_RE.test(String(p.title || '').trim()) ? hostOf(p.title) : '');
  }

  function matchesUrl(p, pageUrl) {
    const a = entryHost(p);
    const b = hostOf(pageUrl);
    return !!a && !!b && baseDomain(a) === baseDomain(b);
  }

  // ---------- tekrar kontrolü ----------
  const siteKey = (p) => baseDomain(entryHost(p)) || lower(p.title);
  const accountKey = (p) => siteKey(p) + '|' + lower(p.username);
  const sameAccount = (a, b) => accountKey(a) === accountKey(b);

  // Basit, kalıcı parmak izi (göz ardı edilen bulguları hatırlamak için; veri zaten şifreli kasada).
  function fingerprint(...parts) {
    let h = 0x811c9dc5;
    for (const ch of parts.join('\u0000')) {
      h ^= ch.codePointAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16);
  }

  // ---------- metin içinde giriş bilgisi bulma ----------
  const LABELS = {
    pass: 'şifresi|şifre|sifresi|sifre|parolası|parola|password|passwd|pass|pwd|pw|pin',
    user: 'kullanıcı\\s*adı|kullanici\\s*adi|kullanıcı|kullanici|k\\.\\s*adı|username|user\\s*name|user|login|e-?posta|e-?mail|email|mail|hesap',
    site: 'web\\s*sitesi|site|url|adres|link|panel',
  };
  const SEP = '\\s*(?:\\([^)]{0,20}\\))?\\s*(?::|=|->|=>|→)\\s*';
  const LABEL_RE = new RegExp(`(?<![\\p{L}\\p{N}])(${Object.values(LABELS).join('|')})${SEP}`, 'giu');
  const KIND_RE = Object.fromEntries(Object.entries(LABELS).map(([k, v]) => [k, new RegExp(`^(?:${v})$`, 'iu')]));
  const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>"')]+/i;
  const DOMAIN_IN_TEXT = /(?<![@\w.-])((?:[a-z0-9-]+\.)+(?:com|net|org|io|dev|app|co|me|info|biz|gov|edu|tr|uk|de|ai)(?:\.[a-z]{2})?)(?![\w-])/i;
  const EMAIL_RE = /[^\s@:;,/|]+@[^\s@:;,/|]+\.[a-z]{2,}/i;
  // "Netflix: ali@x.com / Sifre123" ya da "ali@x.com | Sifre123"
  const PAIR_RE = /^\s*(?:([^:@]{1,40}):\s*)?([^\s@:;,/|]+@[^\s@:;,/|]+\.[a-z]{2,})\s*(?:\/|\||;|,|\t|\s-\s|\s{2,})\s*(\S{4,})\s*$/i;

  // "****" ya da "•••• (Bitig’de)" gibi gizlenmiş değerler şifre sayılmaz.
  const looksLikePassword = (s) => s.length >= 4 && s.length <= 128 && !/^https?:/i.test(s)
    && !/\s{2,}/.test(s) && !/^[•*·.]{3,}/.test(s);

  function siteFromLine(line) {
    const u = line.match(URL_IN_TEXT);
    if (u) return u[0];
    const d = line.replace(EMAIL_RE, ' ').match(DOMAIN_IN_TEXT);
    return d ? d[1] : '';
  }

  function cleanValue(v) {
    return v.trim().replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '').replace(/[,;]+$/, '').trim();
  }

  // Metindeki giriş bilgilerini bulur: [{ title, site, username, password }]
  function detectCredentials(text) {
    const found = [];
    let cur = null;
    let heading = '';

    const start = () => { cur = { title: heading, site: '', username: '', password: '' }; };
    const finish = () => {
      if (cur && cur.password) {
        if (!cur.site) cur.site = siteFromLine(cur.title);
        found.push(cur);
      }
      cur = null;
    };

    for (const rawLine of String(text || '').split(/\r?\n/)) {
      const line = rawLine.replace(/^\s*(?:[•\-*>#]+|\d+[.)])\s*/, '');
      if (!line.trim()) { finish(); heading = ''; continue; }

      const labels = [...line.matchAll(LABEL_RE)];
      if (!labels.length) {
        const pair = line.match(PAIR_RE);
        if (pair && looksLikePassword(pair[3])) {
          finish(); start();
          if (pair[1]) { cur.title = pair[1].trim(); cur.site = siteFromLine(pair[1]); }
          cur.username = pair[2];
          cur.password = pair[3];
          continue;
        }
        // etiketsiz satır: yeni bir başlık ya da site adresi olabilir
        if (cur && cur.password) finish();
        const site = siteFromLine(line);
        if (cur && !cur.site && site) { cur.site = site; continue; }
        if (line.trim().length <= 60) heading = line.trim().replace(/[:\-–—]+$/, '').trim();
        continue;
      }

      // "github.com kullanıcı: x şifre: y" — etiketten önceki kısım başlık/site olabilir
      const prefix = line.slice(0, labels[0].index).trim().replace(/[:\-–—|]+$/, '').trim();
      if (prefix && prefix.length <= 60) {
        if (cur && cur.password) finish();
        if (!cur) start();
        if (!cur.title) cur.title = prefix;
        if (!cur.site) cur.site = siteFromLine(prefix);
      }

      labels.forEach((m, i) => {
        const end = i + 1 < labels.length ? labels[i + 1].index : line.length;
        const value = cleanValue(line.slice(m.index + m[0].length, end));
        if (!value) return;
        const kind = Object.keys(KIND_RE).find((k) => KIND_RE[k].test(m[1].replace(/\s+/g, ' ')));
        if (!cur) start();
        if (kind === 'pass') {
          if (cur.password) { finish(); start(); }
          if (looksLikePassword(value)) cur.password = value.split(/\s+/).length > 3 ? value.split(/\s+/)[0] : value;
        } else if (kind === 'user') {
          if (cur.username && cur.password) { finish(); start(); }
          cur.username = value;
        } else if (kind === 'site') {
          if (cur.site && cur.password) { finish(); start(); }
          cur.site = siteFromLine(value) || value;
        }
      });
    }
    finish();
    return found;
  }

  return {
    lower, hostOf, baseDomain, entryHost, matchesUrl,
    siteKey, accountKey, sameAccount, fingerprint, detectCredentials,
  };
});
