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
  if (/^otpauth-migration:/i.test(text)) {
    toast(_t('Bu, Google Authenticator’ın toplu aktarma kodu; şimdilik desteklenmiyor. Sitenin kendi 2FA QR kodunu kullan.'));
    return;
  }
  const p = KasaTotp.parse(text);
  if (!p) { toast(_t('Bu QR kod bir 2FA anahtarı değil.')); return; }
  input.value = text;
  input.dispatchEvent(new Event('input'));
  const fill = (k, v) => { const el = $(`#sheetForm [data-k="${k}"]`); if (el && !el.value.trim() && v) el.value = v; };
  fill('title', p.issuer);
  fill('username', p.account);
  toast(_t('✓ 2FA anahtarı eklendi'));
}

async function scanQrInto(input) {
  const phone = document.body.classList.contains('phone');
  const choice = await ask(_t('QR koddan 2FA ekle'),
    phone ? _t('Sitenin gösterdiği 2FA QR kodunu kamerayla tara ya da ekran görüntüsünden seç.')
      : _t('Sitenin gösterdiği QR kodun ekran görüntüsünü al (Win+Shift+S), sonra “Panodan oku”ya bas. Ya da kayıtlı bir görüntü dosyası seç.'),
    [{ label: _t('Vazgeç'), value: null },
      { label: phone ? _t('Fotoğraftan') : _t('Görüntü dosyası'), value: 'file' },
      phone ? { label: _t('Kamerayla tara'), value: 'camera', primary: true } : { label: _t('Panodan oku'), value: 'clip', primary: true }]);
  try {
    if (choice === 'file') {
      const f = await pickImageFile();
      if (f) applyQrText(await decodeQrFromBlob(f), input);
    } else if (choice === 'camera') {
      const text = await cameraScan();
      if (text) applyQrText(text, input);
    } else if (choice === 'clip') {
      const url = await kasa.readClipboardImage?.();
      if (!url) { toast(_t('Panoda görüntü yok. Önce QR kodun ekran görüntüsünü al (Win+Shift+S).')); return; }
      // data: adresini fetch etmek sayfa güvenlik kuralına (CSP) takılır; elle çöz
      const bin = atob(url.slice(url.indexOf(',') + 1));
      const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
      applyQrText(await decodeQrFromBlob(new Blob([bytes], { type: 'image/png' })), input);
    }
  } catch (e) {
    toast(_t('QR okunamadı: ') + cleanErr(e));
  }
}
