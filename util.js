// Ortak yardımcılar: DOM, tarih/saat biçimleri, bildirim, şifre üretici.
'use strict';

const $ = (s) => document.querySelector(s);

const K = window.KasaCore;

const COLORS = {
  blue: '#3b6fe0', green: '#2e9d62', orange: '#e07b2e', purple: '#8b5cf6',
  red: '#d0453a', teal: '#139a9a', gray: '#7a808c',
};

// ---------- yardımcılar ----------
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const uid = () => crypto.randomUUID();

const pad = (n) => String(n).padStart(2, '0');

const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const todayStr = () => localDate(new Date());

const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return localDate(d); };

const lower = K.lower;

const cleanErr = (e) => String(e?.message || e).replace(/^.*Error: /, '');

function fmtDate(s) {
  return new Date(s + 'T00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

function fmtDateTime(s) {
  return new Date(s).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtAgo(ms) {
  const d = new Date(ms);
  return localDate(d) === todayStr()
    ? d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

// Zaman damgası: kısa (listelerde) ve uzun (ayrıntıda) biçim
function fmtStamp(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const day = localDate(d);
  if (day === todayStr()) return `Bugün ${time}`;
  if (day === addDays(-1)) return `Dün ${time}`;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }) + ' ' + time;
}

function fmtFull(ms) {
  return ms ? new Date(ms).toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit' }) : '—';
}

function stampTitle(x) {
  return [x.created && 'Oluşturuldu: ' + fmtFull(x.created), x.updated && 'Son değişiklik: ' + fmtFull(x.updated)].filter(Boolean).join('\n');
}

function stampChip(x, ms = x.updated, prefix = '🕒 ') {
  return ms ? h('span', { class: 'chip stamp', title: stampTitle(x) }, prefix + fmtStamp(ms)) : null;
}

// Kısa bildirim. action verilirse ({ label, fn }) yanında düğme çıkar ve daha uzun kalır (ör. "Geri al").
function toast(msg, action = null) {
  const t = $('#toast');
  t.replaceChildren(...[h('span', null, msg), action && h('button', {
    class: 'toast-action', type: 'button',
    onclick: () => { t.hidden = true; action.fn(); },
  }, action.label)].filter(Boolean));
  t.classList.toggle('with-action', !!action);
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, action ? 7000 : 2200);
}

function generatePassword(len = 20) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*-_=+?';
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join('');
}

const section = (title, count, ...extra) =>
  h('div', { class: 'section-title' }, title, count != null && h('span', { class: 'count' }, `(${count})`),
    h('span', { class: 'spacer' }), ...extra);

const empty = (icon, text) => h('div', { class: 'empty' }, h('b', null, icon), text);
