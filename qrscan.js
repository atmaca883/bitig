// QR kod okuma (2FA anahtarı eklemek için): panodaki görüntü (bilgisayar), görüntü dosyası ve kamera (telefon).
// Görüntü bu cihazda çözülür (jsQR); hiçbir yere gönderilmez.
'use strict';

// Görüntü/video karesinden QR metni (bulunamazsa null)
function decodeQr(source, w, h) {
  const max = 1400;
  const scale = Math.min(1, max / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, cw, ch);
  const img = ctx.getImageData(0, 0, cw, ch);
  return jsQR(img.data, cw, ch, { inversionAttempts: 'attemptBoth' })?.data || null;
}

async function decodeQrFromBlob(blob) {
  const bmp = await createImageBitmap(blob);
  try { return decodeQr(bmp, bmp.width, bmp.height); } finally { bmp.close?.(); }
}

function pickImageFile() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  const p = new Promise((resolve) => {
    inp.addEventListener('cancel', () => resolve(null));
    inp.addEventListener('change', () => resolve(inp.files?.[0] || null));
  });
  inp.click();
  return p;
}

// Telefon: arka kamerayla canlı tarama. Bulunca metni döndürür, vazgeçilirse null.
function cameraScan() {
  return new Promise((resolve) => {
    let stream = null;
    let done = false;
    const video = h('video', { playsinline: '', muted: '', autoplay: '' });
    const status = h('div', { class: 'qr-cam-status' }, _t('QR kodu çerçevenin içine getir'));
    const finish = (text) => {
      if (done) return;
      done = true;
      stream?.getTracks().forEach((t) => t.stop());
      overlay.remove();
      resolve(text);
    };
    const overlay = h('div', { class: 'qr-cam' },
      video, h('div', { class: 'qr-cam-frame' }), status,
      h('button', { class: 'mini qr-cam-close', type: 'button', onclick: () => finish(null) }, _t('Vazgeç')));
    document.body.append(overlay);
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        stream = s;
        video.srcObject = s;
        video.play().catch(() => {});
        const tick = () => {
          if (done) return;
          if (video.readyState >= 2 && video.videoWidth) {
            const text = decodeQr(video, video.videoWidth, video.videoHeight);
            if (text) return finish(text);
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      })
      .catch(() => { status.textContent = _t('Kameraya erişilemedi. Ayarlar’dan kamera iznini aç ya da “Fotoğraftan” seçeneğini kullan.'); });
  });
}

// QR'dan 2FA anahtarını düzenleyicideki alana yaz (başlık / kullanıcı adı boşsa onları da doldur)
function applyQrText(text, input) {
  if (!text) { toast(_t('Görüntüde QR kod bulunamadı.')); return; }
  if (KasaGAuth.isMigration(text)) { gauthApply(text); return; } // Google Authenticator toplu aktarma kodu
  const p = KasaTotp.parse(text);
  if (!p) { toast(_t('Bu QR kod bir 2FA anahtarı değil.')); return; }
  input.value = text;
  input.dispatchEvent(new Event('input'));
  const fill = (k, v) => { const el = $(`#sheetForm [data-k="${k}"]`); if (el && !el.value.trim() && v) el.value = v; };
  fill('title', p.issuer);
  fill('username', p.account);
  toast(_t('✓ 2FA anahtarı eklendi'));
}

// Seçilen yoldan QR metnini oku: undefined = vazgeçildi, null = görüntüde QR yok
async function readQr(choice) {
  try {
    if (choice === 'file') {
      const f = await pickImageFile();
      return f ? decodeQrFromBlob(f) : undefined;
    }
    if (choice === 'camera') return (await cameraScan()) ?? undefined;
    if (choice === 'clip') {
      const url = await kasa.readClipboardImage?.();
      if (!url) { toast(_t('Panoda görüntü yok. Önce QR kodun ekran görüntüsünü al (Win+Shift+S).')); return undefined; }
      // data: adresini fetch etmek sayfa güvenlik kuralına (CSP) takılır; elle çöz
      const bin = atob(url.slice(url.indexOf(',') + 1));
      const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
      return decodeQrFromBlob(new Blob([bytes], { type: 'image/png' }));
    }
  } catch (e) {
    toast(_t('QR okunamadı: ') + cleanErr(e));
  }
  return undefined;
}

async function scanQrInto(input) {
  const phone = document.body.classList.contains('phone');
  const choice = await ask(_t('QR koddan 2FA ekle'),
    phone ? _t('Sitenin gösterdiği 2FA QR kodunu kamerayla tara ya da ekran görüntüsünden seç.')
      : _t('Sitenin gösterdiği QR kodun ekran görüntüsünü al (Win+Shift+S), sonra “Panodan oku”ya bas. Ya da kayıtlı bir görüntü dosyası seç.'),
    [{ label: _t('Vazgeç'), value: null },
      { label: phone ? _t('Fotoğraftan') : _t('Görüntü dosyası'), value: 'file' },
      phone ? { label: _t('Kamerayla tara'), value: 'camera', primary: true } : { label: _t('Panodan oku'), value: 'clip', primary: true }]);
  if (!choice) return;
  const text = await readQr(choice);
  if (text !== undefined) applyQrText(text, input);
}

// ---------- Google Authenticator'dan aktarma ----------
// Google Authenticator: ☰ → Hesapları aktar → Hesapları dışa aktar. Çok hesap varsa birkaç QR kod gösterir.
async function gauthImport(more) {
  const phone = document.body.classList.contains('phone');
  const text = more ? _t('Google Authenticator’da “İleri”ye basıp sıradaki QR kodu ({0}/{1}) tara.', more.index + 1, more.size)
    : phone ? _t('Google Authenticator’da ☰ → Hesapları aktar → Hesapları dışa aktar’a dokun, hesapları seçip İleri’ye bas. Uygulama başka bir telefondaysa çıkan QR kodu bu telefonun kamerasıyla tara; bu telefondaysa ekran görüntüsünü alıp Fotoğraftan seç.')
      : _t('Telefonda Google Authenticator’ı aç: ☰ → Hesapları aktar → Hesapları dışa aktar, hesapları seçip İleri’ye bas. Çıkan QR kodu bilgisayarın kamerasına göster ya da fotoğrafını çekip bilgisayara at (Görüntü dosyası / Panodan oku).');
  const choice = await ask(more ? _t('Sıradaki QR kod') : _t('Google Authenticator’dan aktar'), text,
    [{ label: more ? _t('Bitir') : _t('Vazgeç'), value: null },
      { label: phone ? _t('Fotoğraftan') : _t('Görüntü dosyası'), value: 'file' },
      ...(phone ? [] : [{ label: _t('Panodan oku'), value: 'clip' }]),
      { label: _t('Kamerayla tara'), value: 'camera', primary: true }]);
  if (!choice) return;
  const qr = await readQr(choice);
  if (qr === undefined) return;
  if (!qr) { toast(_t('Görüntüde QR kod bulunamadı.')); return; }
  await gauthApply(qr);
}

async function gauthApply(text) {
  const d = KasaGAuth.decode(text);
  if (!d) { toast(_t('Bu QR kod bir Google Authenticator aktarma kodu değil.')); return; }
  const plan = d.accounts.map((a) => {
    const e = KasaGAuth.findEntry(a, db.passwords, K);
    const old = e?.totp ? KasaTotp.parse(e.totp) : null;
    return { a, e, url: KasaGAuth.toOtpauth(a), same: !!old && old.secret === a.secret, other: !!old && old.secret !== a.secret };
  });
  const attach = plan.filter((x) => x.e && !x.e.totp);
  const other = plan.filter((x) => x.other);
  const fresh = plan.filter((x) => !x.e);
  const same = plan.filter((x) => x.same).length;
  const lines = [
    attach.length && _t('{0} hesap kayıtlı şifresine eklenecek', attach.length),
    fresh.length && _t('{0} yeni kayıt', fresh.length),
    same && _t('{0} zaten kayıtlı', same),
    other.length && _t('{0} hesapta farklı bir 2FA anahtarı kayıtlı', other.length),
    d.skipped && _t('{0} hesap atlandı (sayaçlı ya da desteklenmeyen kod)', d.skipped),
  ].filter(Boolean);
  const multi = d.batch.size > 1;
  const choice = ask(
    multi ? _t('{0} hesap bulundu (QR {1}/{2})', d.accounts.length, d.batch.index + 1, d.batch.size) : _t('{0} hesap bulundu', d.accounts.length),
    lines.join(' · '),
    [{ label: _t('Vazgeç'), value: null },
      ...(other.length ? [{ label: _t('Farklı olanları da güncelle'), value: 'update' }] : []),
      { label: _t('Aktar'), value: 'add', primary: !!(attach.length || fresh.length || !other.length) }]);
  // hangi hesabın nereye gideceği
  const where = (x) => (x.same ? _t('zaten kayıtlı') : x.other ? _t('farklı anahtar: {0}', x.e.title) : x.e ? _t('→ {0}', x.e.title) : _t('yeni kayıt'));
  $('#dialog .dialog-card > p')?.after(h('div', { class: 'import-help gauth-list' },
    ...plan.map((x) => h('div', null, h('b', null, [x.a.issuer, x.a.account].filter(Boolean).join(' · ')), h('span', null, where(x))))));
  const c = await choice;
  if (!c) return;
  const now = Date.now();
  for (const x of attach) { x.e.totp = x.url; x.e.updated = now; }
  if (c === 'update') for (const x of other) { x.e.totp = x.url; x.e.updated = now; }
  for (const x of fresh) {
    db.passwords.push(newItem('password', {
      projectId: '', title: x.a.issuer || x.a.account, username: x.a.issuer ? x.a.account : '', password: '', totp: x.url,
    }));
  }
  persist();
  render();
  const n = attach.length + fresh.length + (c === 'update' ? other.length : 0);
  toast(_t('✓ {0} hesabın 2FA kodu aktarıldı', n));
  if (multi && d.batch.index + 1 < d.batch.size) await gauthImport({ index: d.batch.index + 1, size: d.batch.size });
  else if (n) {
    await ask(_t('Aktarma tamam'),
      _t('2FA kodların artık Bitig’de. Her şeyin geldiğini kontrol etmeden Google Authenticator’dan hesap silme.'),
      [{ label: _t('Tamam'), value: true, primary: true }]);
  }
}
