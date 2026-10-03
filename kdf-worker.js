// Ana şifre/PIN anahtar türetmesini (scrypt) arka planda yapar: hızlı ve ekranı dondurmaz.
importScripts('vendor/scrypt.js');

self.onmessage = (e) => {
  const { id, pwd, salt, N, r, p } = e.data;
  try {
    const key = self.scrypt.syncScrypt(pwd, salt, N, r, p, 32);
    self.postMessage({ id, key }, [key.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
