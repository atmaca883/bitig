// Telefon: Face ID / Touch ID / parmak izi ile açma (WebAuthn geçiş anahtarı + PRF eklentisi).
// Geçiş anahtarı, cihazın biyometrik onayı olmadan üretilemeyen 32 baytlık bir sır verir (PRF).
// Kasanın veri anahtarı (DEK) bu sırdan türetilen anahtarla şifrelenip yalnızca bu telefonda saklanır.
// Böylece "Face ID" sadece bir kapı değildir: onay olmadan anahtar çözülemez. Uygulama kapanıp açılsa da çalışır.
// Sunucu yoktur; imza doğrulamaya gerek yok, güvenlik PRF sırrının kendisindedir.
// Telefon uygulamasında (Android/iPhone) aynı iş uygulamanın kendi eklentisiyle (BitigBio) yapılır: 32 baytlık sır
// Android Keystore'da / iPhone Keychain'de biyometrik onaya bağlı saklanır; yeni yüz/parmak izi eklenince geçersiz olur.
(function (root) {
  'use strict';

  const C = root.KasaCrypto;
  const enc = new TextEncoder();
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);

  const native = () => !!root.KasaNative?.isNative;
  const NB = () => root.Capacitor.Plugins.BitigBio;
  let nativeType = ''; // 'face' | 'touch' | 'fingerprint'
  if (native()) NB().status().then((s) => { nativeType = s.type || ''; }).catch(() => {});

  const label = () => {
    if (native()) {
      const ios = root.KasaNative.platform === 'ios';
      if (nativeType === 'touch') return 'Touch ID';
      if (nativeType === 'face') return ios ? 'Face ID' : _t('Yüz tanıma');
      return ios ? 'Face ID' : _t('Parmak izi');
    }
    return isIOS ? 'Face ID' : isAndroid ? _t('Parmak izi') : _t('Cihaz kilidi');
  };

  class Cancelled extends Error {
    constructor() { super(_t('{0} onayı verilmedi.', label())); this.cancelled = true; }
  }

  const b64url = (u8) => C.b64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64url = (s) => C.unb64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));

  // Uygulama eklentisi çağrısı: hata kodlarını kullanıcıya anlaşılır hatalara çevir
  async function nativeCall(fn) {
    try { return await fn(); } catch (e) {
      if (e?.code === 'cancelled') throw new Cancelled();
      if (e?.code === 'invalidated') throw new Error(_t('{0} kaydı değişti (yeni yüz ya da parmak izi eklendi). Ana şifrenle aç, sonra Ayarlar’dan {0} ile açmayı yeniden kur.', label()));
      throw e;
    }
  }

  // Bu cihaz biyometrik geçiş anahtarını ve PRF'yi destekliyor mu? (kesin cevap için kurulumda denenir)
  async function supported() {
    if (native()) {
      try { const s = await NB().status(); nativeType = s.type || ''; return !!s.available; } catch { return false; }
    }
    try {
      if (!root.PublicKeyCredential || !navigator.credentials?.create) return false;
      if (!(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) return false;
      if (PublicKeyCredential.getClientCapabilities) {
        const caps = await PublicKeyCredential.getClientCapabilities();
        if (caps && caps['extension:prf'] === false) return false;
      }
      return true;
    } catch { return false; }
  }

  // PRF sırrından AES anahtarı (HKDF ile; ham PRF çıktısı doğrudan kullanılmaz)
  async function wrapKeyFrom(prf) {
    const base = await crypto.subtle.importKey('raw', prf, 'HKDF', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('bitig-bio-v1'), info: enc.encode('dek-wrap') }, base, 256);
    return new Uint8Array(bits);
  }

  const rpId = () => location.hostname;

  async function getPrf(credId, salt) {
    let cred;
    try {
      cred = await navigator.credentials.get({
        publicKey: {
          challenge: C.random(32),
          rpId: rpId(),
          allowCredentials: [{ type: 'public-key', id: credId }],
          userVerification: 'required',
          timeout: 60_000,
          extensions: { prf: { eval: { first: salt } } },
        },
      });
    } catch (e) {
      if (e?.name === 'NotAllowedError' || e?.name === 'AbortError') throw new Cancelled();
      throw e;
    }
    const first = cred?.getClientExtensionResults?.().prf?.results?.first;
    if (!first) throw new Error(_t('Bu cihaz {0} ile anahtar saklamayı desteklemiyor.', label()));
    return new Uint8Array(first);
  }

  // Kurulum 1: geçiş anahtarı oluştur (dokunuşla çağrılmalı). Sır oluştururken geldiyse onu da döndürür.
  async function create(deviceName) {
    if (native()) { // sır burada üretilir, eklenti onu onaya bağlı saklar
      const prf = C.random(32);
      const r = await nativeCall(() => NB().protect({ secret: C.b64(prf), title: 'Bitig', cancel: _t('Vazgeç') }));
      return { native: true, enc: r.enc, prf };
    }
    const salt = C.random(32);
    let cred;
    try {
      cred = await navigator.credentials.create({
        publicKey: {
          challenge: C.random(32),
          rp: { id: rpId(), name: 'Bitig' },
          user: { id: C.random(16), name: 'Bitig · ' + (deviceName || 'telefon'), displayName: 'Bitig' },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
          timeout: 60_000,
          extensions: { prf: { eval: { first: salt } } },
        },
      });
    } catch (e) {
      if (e?.name === 'NotAllowedError' || e?.name === 'AbortError') throw new Cancelled();
      if (e?.name === 'InvalidStateError') throw new Error(_t('Bu cihazda zaten bir Bitig anahtarı var; tekrar dene.'));
      throw e;
    }
    const ext = cred.getClientExtensionResults?.() || {};
    if (ext.prf && ext.prf.enabled === false) throw new Error(_t('Bu cihaz {0} ile anahtar saklamayı desteklemiyor.', label()));
    return {
      credId: new Uint8Array(cred.rawId), salt,
      prf: ext.prf?.results?.first ? new Uint8Array(ext.prf.results.first) : null,
    };
  }

  // Kurulum 2 (gerekirse, yeni bir dokunuşla): sırrı bir kez doğrulatarak al
  const prfFor = (pending) => getPrf(pending.credId, pending.salt);

  // Kurulum 3: DEK'i sırdan türetilen anahtarla sarmala → bu telefonda saklanacak kayıt
  async function seal(dek, pending, prf) {
    const box = await C.seal(await wrapKeyFrom(prf), dek);
    if (pending.native) return { v: 2, native: true, enc: pending.enc, box, created: Date.now() };
    return { v: 1, credId: b64url(pending.credId), salt: b64url(pending.salt), box, created: Date.now() };
  }

  // Açma: onay al, sırrı üret, DEK'i çöz
  async function open(rec) {
    let prf;
    if (rec.native) {
      if (!native()) throw new Error(_t('Bu kayıt yalnızca telefon uygulamasında açılır.'));
      const r = await nativeCall(() => NB().reveal({ enc: rec.enc, title: 'Bitig', reason: _t('Bitig’i aç'), cancel: _t('Vazgeç') }));
      prf = C.unb64(r.secret);
    } else prf = await getPrf(unb64url(rec.credId), unb64url(rec.salt));
    try {
      return await C.open(await wrapKeyFrom(prf), rec.box);
    } catch {
      throw new Error(_t('{0} anahtarı bu kasayı açamadı. Ana şifrenle aç, sonra Ayarlar’dan {0} ile açmayı yeniden kur.', label()));
    }
  }

  // Kapatınca: uygulamadaki saklı sırrı da sil
  const forget = () => (native() ? NB().forget().catch(() => {}) : Promise.resolve());

  root.KasaBio = { label, supported, create, prfFor, seal, open, forget, isIOS, isAndroid };
})(self);
