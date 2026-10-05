// Bitig çevrimdışı önbelleği — sürüm 202610052009
const CACHE = 'kasa-202610052009';
const FILES = ["./","app.js","backend.js","biometric.js","brand.js","calendar.js","cloud-dropbox.js","cloud-onedrive.js","config.js","creds.js","crypto.js","dialogs.js","drive.js","editor.js","i18n.js","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","index.html","kasa-core.js","kdf-worker.js","lock.js","manifest.webmanifest","phone-ui.js","phone.css","rows.js","settings.js","state.js","store.js","style.css","sync-merge.js","theme.js","trash.js","util.js","vendor/scrypt-LICENSE.txt","vendor/scrypt.js","views.js"];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // bulut istekleri önbelleğe girmez
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
