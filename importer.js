// Başka yerlerden şifre/not içe aktarma (CSV). Bilgisayar ve telefon aynı kodu kullanır; Node testlerinde de çalışır.
// Desteklenen dışa aktarmalar: Chrome / Edge / Brave / Opera, Firefox, Safari / iCloud Anahtar Zinciri, Bitwarden,
// 1Password, LastPass, KeePass / KeePassXC; tanınmayan dosyada sütun adlarına bakılır.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KasaImport = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const _t = (s) => (typeof globalThis._t === 'function' ? globalThis._t(s) : s);

  // RFC 4180: tırnak içinde virgül, satır sonu ve "" (kaçış) olabilir. Ayraç ilk satırdan seçilir (Excel'de ; olabilir).
  function parseCSV(text) {
    let s = String(text || '').replace(/^﻿/, '');
    const firstLine = s.slice(0, s.search(/\r?\n|$/));
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let inQ = false;
    for (const c of firstLine) { if (c === '"') inQ = !inQ; else if (!inQ && c in counts) counts[c]++; }
    const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const sep = n > 0 ? best : ',';
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (quoted) {
        if (c === '"') {
          if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false;
        } else field += c;
      } else if (c === '"') {
        quoted = true;
      } else if (c === sep) {
        row.push(field); field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
    return rows;
  }

  const norm = (h) => String(h || '').trim().toLowerCase().replace(/[\s_-]+/g, '');

  // Sütun adı → alan. İlk eşleşen kazanır.
  const COLS = {
    title: ['name', 'title', 'başlık', 'baslik', 'account', 'site'],
    url: ['url', 'loginuri', 'website', 'uri', 'web', 'address', 'adres', 'urls', 'loginurl', 'hostname'],
    username: ['username', 'loginusername', 'user', 'login', 'email', 'e-mail', 'kullanıcıadı', 'kullaniciadi', 'userid'],
    password: ['password', 'loginpassword', 'pass', 'şifre', 'sifre', 'parola'],
    note: ['note', 'notes', 'extra', 'comments', 'comment', 'not', 'notlar'],
    totp: ['totp', 'logintotp', 'otpauth', 'onetimepassword', 'otp'],
    type: ['type'],
    folder: ['folder', 'group', 'grouping', 'tags'],
  };

  // Kaynağı tanı (yalnızca kullanıcıya bilgi için; eşleme sütun adlarıyla yapılır)
  function detectSource(h) {
    const has = (...k) => k.every((x) => h.includes(x));
    if (has('loginuri', 'loginusername', 'loginpassword')) return 'Bitwarden';
    if (has('url', 'username', 'password', 'httprealm')) return 'Firefox';
    if (has('url', 'username', 'password', 'extra', 'grouping')) return 'LastPass';
    if (has('group', 'title', 'username', 'password')) return 'KeePass';
    if (has('title', 'url', 'username', 'password', 'otpauth')) return 'Safari / iCloud';
    if (has('title', 'website', 'username', 'password') || has('onetimepassword')) return '1Password';
    if (has('name', 'url', 'username', 'password')) return 'Chrome / Edge';
    return '';
  }

  const hostOf = (url) => {
    try { return new URL(/^[a-z][\w+.-]*:\/\//i.test(url) ? url : 'https://' + url).hostname.replace(/^www\./, ''); } catch { return ''; }
  };

  // Satırları Bitig kayıtlarına çevir: { source, passwords, notes, skipped }
  function convert(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) return { source: '', passwords: [], notes: [], skipped: 0, error: 'empty' };
    const header = rows[0].map(norm);
    const idx = {};
    for (const [k, names] of Object.entries(COLS)) {
      const i = header.findIndex((h) => names.includes(h));
      if (i >= 0) idx[k] = i;
    }
    if (idx.password === undefined) return { source: '', passwords: [], notes: [], skipped: 0, error: 'nopassword' };
    const source = detectSource(header);
    const get = (r, k) => (idx[k] === undefined ? '' : String(r[idx[k]] ?? '').trim());
    const passwords = [];
    const notes = [];
    let skipped = 0;
    for (const r of rows.slice(1)) {
      const type = get(r, 'type').toLowerCase();
      let url = get(r, 'url');
      const title = get(r, 'title');
      const note = get(r, 'note');
      // Güvenli notlar: Bitwarden "note" türü, LastPass "http://sn"
      if (type === 'note' || type === 'securenote' || url === 'http://sn') {
        if (title || note) notes.push({ title: title || _t('Not'), body: note });
        else skipped++;
        continue;
      }
      const password = get(r, 'password');
      const username = get(r, 'username');
      if (!password) { skipped++; continue; }
      if (url && !/^[a-z][\w+.-]*:/i.test(url) && /\./.test(url)) url = 'https://' + url;
      const totp = get(r, 'totp');
      passwords.push({
        title: title || hostOf(url) || username || _t('Şifre'),
        url, username, password, note,
        ...(totp ? { totp } : {}),
      });
    }
    return { source, passwords, notes, skipped, error: '' };
  }

  // Excel "CSV" olarak kaydederken Türkçe Windows'ta Windows-1254 kullanır; UTF-8 bozuk çıkarsa onu dene
  function decode(bytes) {
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u[0] === 0xFF && u[1] === 0xFE) return new TextDecoder('utf-16le').decode(u.subarray(2));
    if (u[0] === 0xFE && u[1] === 0xFF) return new TextDecoder('utf-16be').decode(u.subarray(2));
    const t = new TextDecoder('utf-8').decode(u);
    if (!t.includes('\uFFFD')) return t;
    try { return new TextDecoder('windows-1254').decode(u); } catch { return t; }
  }

  return { parseCSV, convert, detectSource, hostOf, decode };
});
