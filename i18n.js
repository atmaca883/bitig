// Dil desteği (Türkçe / English). Bilgisayar arayüzü, ana süreç, telefon ve tarayıcı eklentisi aynı dosyayı kullanır.
// Anahtar Türkçe metnin kendisidir; İngilizce karşılık aşağıdaki sözlükten gelir. Sözlükte olmayan metin Türkçe kalır.
// Yer tutucular: {0}, {1}… — İngilizcede tekil/çoğul için değer [tekil, çoğul] olabilir ({0} sayısına göre seçilir).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.KasaI18n = api;
    root._t = (s, ...a) => api.t(s, ...a);
    // Sayfa betikleri gövdenin sonunda yüklenir: sabit HTML hazır, hemen çevir
    if (typeof document !== 'undefined' && document.body && !root.chrome?.runtime?.id) api.applyStatic(document.body);
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EN = {
    // ---- genel
    'Bugün {0}': 'Today {0}', 'Dün {0}': 'Yesterday {0}', 'Oluşturuldu: ': 'Created: ', 'Son değişiklik: ': 'Last changed: ',
    'Bugün': 'Today', 'Yarın': 'Tomorrow', 'Vazgeç': 'Cancel', 'Tamam': 'OK', 'Kaydet': 'Save', 'Sil': 'Delete', 'Kapat': 'Close',
    'Düzenle': 'Edit', 'Kopyala': 'Copy', 'Değiştir': 'Change', 'Kaldır': 'Remove', 'Oluştur': 'Create', 'Hayır': 'No',
    'Güncelle': 'Update', 'Geri': 'Back', 'Geri al': 'Undo', 'Göster': 'Show', 'Aç': 'Open', 'Kilitli': 'Locked',
    'Görev': 'Task', 'Not': 'Note', 'Şifre': 'Password', 'Proje': 'Project',
    'Görevler': 'Tasks', 'Notlar': 'Notes', 'Şifreler': 'Passwords', 'Projeler': 'Projects',
    'Hiç': 'Never', 'Kapalı': 'Off', 'Başlıksız': 'Untitled', 'Başlıksız not': 'Untitled note', 'Boş not': 'Empty note',
    'Tamamlandı': 'Completed', '✓ Tamamlandı': '✓ Completed', 'Açılıyor…': 'Opening…', 'Tekrar dene': 'Try again', 'yakında': 'soon',

    // ---- kilit ekranı
    'Tekrar hoş geldin': 'Welcome back', 'Kasanı oluştur': 'Create your vault',
    'Devam etmek için ana şifreni gir.': 'Enter your master password to continue.',
    'Tüm verilerin bu ana şifreyle şifrelenip bu bilgisayarda saklanacak.': 'All your data will be encrypted with this master password and stored on this computer.',
    'Kilidi aç': 'Unlock', 'Kasayı oluştur': 'Create vault', 'Kasayı aç': 'Open vault',
    'Ana şifre': 'Master password', 'Ana şifre (tekrar)': 'Master password (again)',
    'Ana şifre en az 8 karakter olmalı.': 'The master password must be at least 8 characters.',
    'Şifreler aynı değil.': 'The passwords don’t match.', 'Yeni şifreler aynı değil.': 'The new passwords don’t match.',
    'Ana şifre yanlış.': 'Wrong master password.', 'Mevcut ana şifre yanlış.': 'The current master password is wrong.',
    'Ana şifremi unuttum': 'I forgot my master password', 'Yedekten geri yükle': 'Restore from backup',
    '🔒 Uçtan uca şifreli · verilerin yalnızca senin cihazlarında açılır': '🔒 End-to-end encrypted · your data only opens on your devices',
    'Bu şifre hiçbir yere kaydedilmez. Unutursan kasayı sadece birazdan vereceğim': 'This password is never stored anywhere. If you forget it, you can only open your vault with the',
    'kurtarma anahtarı': 'recovery key', 'ile açabilirsin.': 'I’m about to give you.',
    'Devam etmek için PIN\'ini gir.': 'Enter your PIN to continue.', 'Ana şifreyle aç': 'Open with master password',
    '“bitig” Göktürk yazısıyla: yazıt, kitap': '“bitig” in Old Turkic script: inscription, book',
    'Kurtarma anahtarın yok': 'You have no recovery key',
    'Ana şifreni unutursan kasayı açmanın tek yolu bu. Bir dakikanı alır.': 'If you forget your master password, this is the only way to open your vault. It takes a minute.',
    'Şimdi oluştur': 'Create now',
    'Bitig oluşturulurken verilen kurtarma anahtarını ve yeni ana şifreni gir.': 'Enter the recovery key you got when you created Bitig, and your new master password.',
    'Kurtarma anahtarı (XXXX-XXXX-…)': 'Recovery key (XXXX-XXXX-…)', 'Yeni ana şifre': 'New master password', 'Yeni ana şifre (tekrar)': 'New master password (again)',
    'Bitig açıldı, yeni ana şifren kaydedildi': 'Bitig is open; your new master password is saved',
    'Şu anki kasa silinmez, “vault-onceki-…” adıyla saklanır. Yüklenen yedeği, o yedeğin ana şifresiyle açacaksın.': 'Your current vault isn’t deleted; it’s kept as “vault-onceki-…”. You’ll open the restored backup with that backup’s master password.',
    'Yedek seç': 'Choose backup', 'Yedek yüklendi. Bu yedeğin ana şifresiyle aç.': 'Backup restored. Open it with that backup’s master password.',
    'PIN 5 kez yanlış girildi. Güvenlik için ana şifre gerekiyor.': 'Wrong PIN 5 times. Your master password is required for security.',
    'Yanlış PIN · {0} deneme kaldı': ['Wrong PIN · {0} try left', 'Wrong PIN · {0} tries left'],
    'Bilgisayar uyku moduna geçtiği için kasa kilitlendi.': 'Locked because the computer went to sleep.',
    'Bilgisayar kilitlendiği için kasa da kilitlendi.': 'Locked because the computer was locked.',
    'Bitig kilitlendi.': 'Bitig is locked.', 'Bitig kilitli.': 'Bitig is locked.', 'Bitig kilitli': 'Bitig is locked',
    '{0} dakika işlem yapılmadığı için kilitlendi.': ['Locked after {0} minute of inactivity.', 'Locked after {0} minutes of inactivity.'],
    '{0} dakikadan uzun süre uzak kaldığın için kilitlendi.': ['Locked because you were away for more than {0} minute.', 'Locked because you were away for more than {0} minutes.'],
    'Ana şifreni gir.': 'Enter your master password.',

    // ---- kurtarma anahtarı penceresi
    '🛟 Kurtarma anahtarın': '🛟 Your recovery key', 'Kasan hazır. ': 'Your vault is ready. ',
    'Ana şifreni unutursan kasayı sadece bu anahtarla açabilirsin. Kâğıda yaz ve güvenli bir yerde sakla; bu bilgisayarda bir dosyaya kaydetme.': 'If you forget your master password, this key is the only way to open your vault. Write it on paper and keep it somewhere safe; don’t save it in a file on this computer.',
    'Kopyalandı · 30 sn sonra panodan silinecek': 'Copied · will be cleared from the clipboard in 30 s',
    'Bu anahtarı güvenli bir yere yazdım': 'I’ve written this key down somewhere safe',
    'Yeni kurtarma anahtarı': 'New recovery key', 'Kurtarma anahtarı oluştur': 'Create recovery key',
    'Eski anahtar geçersiz olacak. ': 'The old key will stop working. ', 'Onaylamak için ana şifreni gir.': 'Enter your master password to confirm.',

    // ---- PIN ve ana şifre
    'PIN\'i değiştir': 'Change PIN', 'Hızlı kilit PIN\'i belirle': 'Set a quick-lock PIN',
    'Kilitlenince ana şifre yerine 4 haneli PIN istenir. 5 yanlış denemede ana şifre gerekir. Onaylamak için ana şifreni de gir.': 'When locked, a 4-digit PIN is asked instead of the master password. After 5 wrong tries the master password is required. Enter your master password to confirm.',
    'Yeni PIN (4 rakam)': 'New PIN (4 digits)', 'Yeni PIN (tekrar)': 'New PIN (again)', 'PIN 4 rakam olmalı.': 'The PIN must be 4 digits.',
    'PIN\'ler aynı değil.': 'The PINs don’t match.', 'Bu PIN çok kolay tahmin edilir; başka bir tane seç.': 'That PIN is too easy to guess; pick another one.',
    'PIN kaydedildi · 🔒 artık PIN ile kilitler': 'PIN saved · 🔒 now locks with your PIN', 'PIN\'i kaldır': 'Remove PIN',
    'Kilitlenince yeniden ana şifre istenir. Onaylamak için ana şifreni gir.': 'The master password will be asked again when locked. Enter your master password to confirm.',
    'PIN kaldırıldı': 'PIN removed', 'Ana şifreyi değiştir': 'Change master password', 'Mevcut ana şifre': 'Current master password',
    'Yeni ana şifre en az 8 karakter olmalı.': 'The new master password must be at least 8 characters.', 'Ana şifre değiştirildi': 'Master password changed',

    // ---- satırlar ve listeler
    'Çöp kutusuna taşı': 'Move to trash', 'Kullanıcı adını kopyala': 'Copy username', 'Kullanıcı adı kopyalandı': 'Username copied',
    'Şifreyi kopyala': 'Copy password', 'Şifre kopyalandı · 30 sn sonra panodan silinecek': 'Password copied · will be cleared from the clipboard in 30 s',
    'Şifre kopyalandı · 30 sn sonra silinecek': 'Password copied · will be cleared in 30 s', 'Adresi aç': 'Open address',
    '{0} açık görev · {1} not · {2} şifre': '{0} open tasks · {1} notes · {2} passwords',
    'Bu görev zaten var': 'This task already exists', '“{0}” açık görevler arasında zaten duruyor.': '“{0}” is already among your open tasks.',
    'Yine de ekle': 'Add anyway', 'Yine de kaydet': 'Save anyway',

    // ---- görünümler
    'Genişlet': 'Expand', 'Küçült': 'Collapse', 'Kartı kapat (Kartları düzenle’den geri açılır)': 'Hide card (bring it back from Edit cards)',
    '⚙ Kartları düzenle': '⚙ Edit cards', 'Henüz şifre yok. ＋ ile ekle.': 'No passwords yet. Add one with ＋.',
    'Henüz not yok. ＋ ile ekle.': 'No notes yet. Add one with ＋.', '＋ Hızlı görev ekle… (Enter)': '＋ Quick add a task… (Enter)',
    'Açık': 'Open', 'Açık görev yok.': 'No open tasks.', 'Henüz proje yok. ＋ ile ekle.': 'No projects yet. Add one with ＋.',
    '🗑 Çöp kutusu{0}': '🗑 Trash{0}', 'Projelere dön': 'Back to projects', '📅 Oluşturuldu: ': '📅 Created: ',
    '+ {0} tamamlanmış görev': ['+ {0} completed task', '+ {0} completed tasks'],
    'Her şey temiz: tekrarlı kayıt ya da notlarda unutulmuş şifre yok.': 'All clean: no duplicates and no passwords left in notes.',
    'Notlarda unutulmuş şifreler': 'Passwords left in notes', 'Giriş': 'Login', 'Şifrelere aktar': 'Move to passwords',
    'Göz ardı et': 'Ignore', 'Tekrarlı şifre kayıtları': 'Duplicate password entries',
    'Şifreler farklı: birleştirince en son güncellenen şifre korunur.': 'The passwords differ: merging keeps the most recently updated one.',
    'Birleştir': 'Merge', 'Fazlaları sil ({0})': 'Delete extras ({0})', 'Tekrarlı görevler': 'Duplicate tasks', 'Tekrarlı notlar': 'Duplicate notes',
    'Aynı şifreyi kullanan hesaplar': 'Accounts sharing the same password',
    'Bir site ele geçirilirse aynı şifreli diğer hesaplar da risk altına girer. Bunların şifresini değiştirmen önerilir.': 'If one site is breached, other accounts with the same password are at risk too. Consider changing them.',
    'Kontrol uyarısı': 'Check-up alert', 'Tekrarlı kayıtlar ya da notlarda unutulmuş şifreler': 'Duplicates or passwords left in notes',
    'Hızlı görev ekleme': 'Quick task', '＋ Bugün için hızlı görev… (Enter)': '＋ Quick task for today… (Enter)',
    'Gecikmiş': 'Overdue', 'Bugün için görev yok 🎉': 'No tasks for today 🎉', 'Önümüzdeki 7 gün': 'Next 7 days',
    'Yaklaşan hatırlatmalar': 'Upcoming reminders', 'Son notlar': 'Recent notes', 'Son eklenen şifreler': 'Recently added passwords',
    'Bugün tamamlananlar': 'Completed today', '“{0}” kartı kapatıldı': '“{0}” card hidden',
    'Bugün ekranında hangi kartların görüneceğini ve sırasını seç. Boş kartlar zaten kendiliğinden gizlenir.': 'Choose which cards appear on the Today screen and in what order. Empty cards hide themselves.',
    'Yukarı': 'Up', 'Aşağı': 'Down', 'Varsayılana dön': 'Reset to default', '☀ Bugün kartları': '☀ Today cards',
    '{0} kayıt birleştirildi · fazlaları çöp kutusunda': '{0} entries merged · extras are in the trash', 'Çöp kutusu': 'Trash',
    '{0} tekrar çöp kutusuna taşındı': ['{0} duplicate moved to the trash', '{0} duplicates moved to the trash'], 'Geri alındı': 'Undone',
    '“{0}” için sonuç yok.': 'No results for “{0}”.', 'Tüm projeler': 'All projects', 'Projesiz': 'No project', '— Projesiz —': '— No project —',
    'Her şeyde ara…  (Ctrl+K)': 'Search everything…  (Ctrl+K)', 'Projeye göre süz': 'Filter by project', 'Yeni ekle': 'Add new',

    // ---- takvim
    'Önceki ay': 'Previous month', 'Sonraki ay': 'Next month', 'Takvimi aç': 'Show calendar', 'Takvimi küçült': 'Collapse calendar',
    'Pt': 'Mo', 'Sa': 'Tu', 'Ça': 'We', 'Pe': 'Th', 'Cu': 'Fr', 'Ct': 'Sa', 'Pz': 'Su',
    'Gün görünümünü kapat': 'Close day view', '＋ Bu güne görev ekle… (Enter)': '＋ Add a task for this day… (Enter)',
    'Son tarihi bu gün': 'Due this day', 'Bu gün tamamlanan': 'Completed this day', 'Notlar · eklenen / değişen': 'Notes · added / changed',
    'Şifreler · eklenen / değişen': 'Passwords · added / changed', 'Bu gün açılan projeler': 'Projects started this day',
    'Bu günde kayıt yok. Yukarıdan görev ekleyebilirsin.': 'Nothing on this day. You can add a task above.',
    'Sürükleyerek boyutlandır': 'Drag to resize',

    // ---- çöp kutusu
    '“{0}” çöp kutusuna taşındı': '“{0}” moved to the trash', '“{0}” geri yüklendi': '“{0}” restored',
    'Kalıcı olarak silinsin mi?': 'Delete permanently?', 'Kalıcı sil': 'Delete forever', 'Kalıcı olarak silindi': 'Deleted permanently',
    'Çöp kutusu boşaltılsın mı?': 'Empty the trash?',
    '{0} kayıt kalıcı olarak silinecek ve geri getirilemeyecek.': ['{0} item will be deleted permanently and can’t be recovered.', '{0} items will be deleted permanently and can’t be recovered.'],
    'Boşalt': 'Empty', 'Çöp kutusu boşaltıldı': 'Trash emptied', '🗑 Çöp kutusu': '🗑 Trash',
    'Silinen kayıtlar {0} gün burada kalır, sonra kalıcı olarak silinir.': 'Deleted items stay here for {0} days, then they’re deleted permanently.',
    'Çöp kutusu boş.': 'The trash is empty.', '{0} · silindi {1} · {2} gün kaldı': ['{0} · deleted {1} · {2} day left', '{0} · deleted {1} · {2} days left', 2],
    'Geri yükle': 'Restore',

    // ---- düzenleme
    'Yeni görev': 'New task', 'Ne yapılacak?': 'What needs doing?', 'Son tarih': 'Due date', 'Hatırlat': 'Remind me',
    'Yeni şifre': 'New password', 'Başlık': 'Title', 'Örn. Hosting paneli': 'e.g. Hosting panel', 'Kullanıcı adı / e-posta': 'Username / email',
    'Adres': 'Address', 'Yeni not': 'New note', 'İçerik': 'Content', 'Yeni proje': 'New project', 'Proje adı': 'Project name',
    'Örn. Web sitesi': 'e.g. Website', 'Renk': 'Color', 'Göster / gizle': 'Show / hide', 'Güçlü şifre üret': 'Generate a strong password',
    'Oluşturuldu': 'Created', 'Son değişiklik': 'Last changed', 'Şifre son değişti': 'Password last changed', 'Son hareket': 'Last activity',
    'bu özellikten önce eklendi': 'added before this feature', 'Bu hesap zaten kayıtlı': 'This account is already saved',
    'kullanıcı adı yok': 'no username', '“{0}” · {1} aynı site ve kullanıcı adıyla kayıtlı.': '“{0}” · {1} is already saved for the same site and username.',
    'Ayrı kaydet': 'Save separately', 'Mevcut kaydı güncelle': 'Update the existing entry', 'Mevcut kayıt güncellendi': 'Existing entry updated',
    'Benzer bir not var': 'A similar note exists', '“{0}” aynı başlığa ya da içeriğe sahip.': '“{0}” has the same title or content.',
    'Mevcut notu aç': 'Open the existing note', 'Bu isimde bir proje zaten var': 'A project with this name already exists',
    '“{0}” boş olamaz': '“{0}” can’t be empty', 'Kaydedildi': 'Saved', 'Kaydedilemedi: ': 'Could not save: ', 'Silindi': 'Deleted',
    // bilgisayarda buluttan katıl
    'Başka cihazda Bitig’im var': 'I already use Bitig on another device',
    'Diğer cihazın eşitlediği klasörü seç': 'Choose the folder your other device syncs to',
    'Önce kasanın bulunduğu yeri seç.': 'First choose where your vault is.', 'Buluttaki Bitig açılamadı.': 'Couldn’t open the Bitig in the cloud.',
    'Başka cihazdaki Bitig’e katıl': 'Join Bitig from another device',
    'Telefonda ya da başka bir bilgisayarda Bitig kullanıyorsan, orada seçili olan yeri seç (o cihazda eşitleme açık olmalı). Sonra ana şifrenle kasana katılırsın.':
      'If you use Bitig on a phone or another computer, choose the place selected there (sync must be on for that device). Then you join your vault with your master password.',
    'Orada Bitig bulunamadı. Diğer cihazda eşitlemenin açık ve aynı yerin seçili olduğundan emin ol.': 'No Bitig found there. Make sure sync is on for the other device and the same place is selected.',
    '{0} içinde {1} cihazın kasası var. Ana şifreni gir.': ['{0} has a vault from {1} device. Enter your master password.', '{0} has vaults from {1} devices. Enter your master password.', 1],
    'Bitig bu bilgisayara kuruldu ✓': 'Bitig was set up on this computer ✓',
    'Bitig’e hoş geldin. Şifrelerini, notlarını ve görevlerini burada tut; hepsi ana şifrenle şifrelenir.\n\n• ＋ ile yeni kayıt ekle.\n• Ayarlar → Verileri taşı ile başka yerden şifrelerini aktar.\n• Bilgisayarda da kullanmak istersen: atmaca883.github.io/bitig/indir':
      'Welcome to Bitig. Keep your passwords, notes and tasks here; everything is encrypted with your master password.\n\n• Add new items with ＋.\n• Bring passwords from elsewhere with Settings → Move your data.\n• To use it on a computer too: atmaca883.github.io/bitig/indir',
    'Bu bulutta zaten bir Bitig var; ona katıl.': 'There’s already a Bitig in this cloud; join it instead.',
    'Bulutta Bitig bulunamadı.': 'No Bitig found in the cloud.',
    'Burada henüz Bitig yok. Yeni başlıyorsan şimdi oluştur. Bilgisayarda zaten kullanıyorsan orada Ayarlar → Cihazlar arası eşitleme’yi aç ve aynı bulutu seç, sonra “Tekrar dene”.':
      'There’s no Bitig here yet. If you’re starting fresh, create one now. If you already use it on a computer, turn on Settings → Sync across devices there and choose the same cloud, then “Try again”.',
    'Yeni Bitig oluştur': 'Create a new Bitig', 'Yeni Bitig': 'New Bitig', 'Oluşturuluyor…': 'Creating…',
    'Tüm verilerin bu ana şifreyle şifrelenir. Ana şifre hiçbir yere kaydedilmez; unutursan birazdan vereceğim kurtarma anahtarıyla açabilirsin.':
      'All your data is encrypted with this master password. It isn’t stored anywhere; if you forget it, you can open your vault with the recovery key you’ll get next.',
    'Bitig bu telefonda oluşturuldu ✓': 'Bitig was created on this phone ✓',
    'Bitig verilerini senin bulutunda (Dropbox ya da OneDrive) şifreli olarak saklar; bulut içini göremez. Bilgisayardaki Bitig de aynı buluttan eşitlenir.':
      'Bitig keeps your data encrypted in your own cloud (Dropbox or OneDrive); the cloud can’t see inside. Bitig on your computer syncs from the same cloud.',
    'Aşağıdan bir bulut seç ve hesabınla bağlan.': 'Choose a cloud below and sign in.',
    'Bitig zaten varsa ana şifrenle aç; yoksa yeni oluştur.': 'If you already have a Bitig, open it with your master password; otherwise create a new one.',
    'Değişiklik diğer cihazlara da eşitlenir': 'The change syncs to your other devices',
    'Ana şifreni unutursan kasayı bununla açarsın': 'If you forget your master password, this opens your vault',
    'PIN ve Face ID bu telefona özeldir.': 'PIN and Face ID are specific to this phone.',
    'Telefona kur': 'Set up on phone', 'QR kodu telefonun kamerasıyla okut': 'Scan the QR code with your phone’s camera', 'QR göster': 'Show QR',
    'Telefonunun kamerasıyla bu kodu okut.': 'Scan this code with your phone’s camera.',
    'Açılan sayfada Bitig’i ana ekrana ekle (sayfa nasıl yapılacağını gösterir).': 'On the page that opens, add Bitig to your home screen (the page shows you how).',
    'Ana ekrandaki Bitig’i aç, {0} seçeneğini seç ve ana şifreni gir.': 'Open Bitig from your home screen, choose {0} and enter your master password.',
    'Ana ekrandaki Bitig’i aç, bilgisayardaki bulutun aynısını seç ve ana şifreni gir.': 'Open Bitig from your home screen, choose the same cloud as on your computer and enter your master password.',
    'Not: Telefonun verilerini alabilmesi için önce burada “Eşitleme”yi açıp bir bulut seç.': 'Note: for the phone to get your data, first turn on “Sync” here and choose a cloud.',
    '✓ Yüklendi. Şimdi ana ekrandaki Bitig simgesinden aç.': '✓ Installed. Now open Bitig from your home screen.',
    'Alttaki Paylaş düğmesine dokun (yukarı ok çıkan kare).': 'Tap the Share button at the bottom (the square with an up arrow).',
    'Listeden “Ana Ekrana Ekle”yi seç.': 'Choose “Add to Home Screen” from the list.',
    '“Web Uygulaması olarak aç” açık kalsın, “Ekle”ye dokun.': 'Keep “Open as Web App” on and tap “Add”.',
    'Ana ekrandaki Bitig simgesinden aç.': 'Open Bitig from its home screen icon.',
    'iPhone’da ana ekrana ekleme Safari’den yapılır. Bu sayfayı Safari’de aç.': 'On iPhone, adding to the home screen is done from Safari. Open this page in Safari.',
    'Sağ üstteki ⋮ menüsüne dokun.': 'Tap the ⋮ menu at the top right.',
    '“Ana ekrana ekle” ya da “Uygulamayı yükle”yi seç.': 'Choose “Add to Home screen” or “Install app”.',
    'Önce ana ekrana ekle': 'First, add it to your home screen',
    'Bitig telefonda uygulama gibi çalışır: ana ekrandan açılır, internetsiz de açılır. Kurulumu ana ekrandaki Bitig’de yap.': 'On your phone Bitig works like an app: it opens from the home screen, even offline. Do the setup in the home-screen Bitig.',
    'Bitig’i yükle': 'Install Bitig', 'Adresi kopyala': 'Copy address', 'Adres kopyalandı; Safari’ye yapıştır': 'Address copied; paste it into Safari',
    'Tarayıcıda devam et': 'Continue in the browser',
    '2FA anahtarı (isteğe bağlı)': '2FA key (optional)', 'Anahtar ya da QR kod': 'Key or QR code',
    'Şu anki kod: {0} · {1} sn': 'Current code: {0} · {1}s', '⚠ Geçersiz anahtar': '⚠ Invalid key', 'QR koddan ekle': 'Add from QR code',
    '2FA anahtarı geçersiz; sitenin verdiği anahtarı ya da QR kodu kontrol et.': 'The 2FA key is invalid; check the key or QR code the site gave you.',
    '2FA kodunu kopyala': 'Copy 2FA code', '2FA kodu kopyalandı · {0} sn geçerli': '2FA code copied · valid for {0}s',
    'QR kodu çerçevenin içine getir': 'Fit the QR code inside the frame',
    'Kameraya erişilemedi. Ayarlar’dan kamera iznini aç ya da “Fotoğraftan” seçeneğini kullan.': 'Couldn’t access the camera. Allow camera access in Settings or use “From photo”.',
    'Görüntüde QR kod bulunamadı.': 'No QR code found in the image.',
    'Bu, Google Authenticator’ın toplu aktarma kodu; şimdilik desteklenmiyor. Sitenin kendi 2FA QR kodunu kullan.': 'This is a Google Authenticator bulk-transfer code; it isn’t supported yet. Use the site’s own 2FA QR code.',
    'Bu QR kod bir 2FA anahtarı değil.': 'This QR code isn’t a 2FA key.', '✓ 2FA anahtarı eklendi': '✓ 2FA key added',
    'QR koddan 2FA ekle': 'Add 2FA from a QR code',
    'Sitenin gösterdiği 2FA QR kodunu kamerayla tara ya da ekran görüntüsünden seç.': 'Scan the site’s 2FA QR code with the camera, or pick it from a screenshot.',
    'Sitenin gösterdiği QR kodun ekran görüntüsünü al (Win+Shift+S), sonra “Panodan oku”ya bas. Ya da kayıtlı bir görüntü dosyası seç.': 'Take a screenshot of the site’s QR code (Win+Shift+S), then press “Read clipboard”. Or choose a saved image file.',
    'Fotoğraftan': 'From photo', 'Görüntü dosyası': 'Image file', 'Kamerayla tara': 'Scan with camera', 'Panodan oku': 'Read clipboard',
    'Panoda görüntü yok. Önce QR kodun ekran görüntüsünü al (Win+Shift+S).': 'No image on the clipboard. First take a screenshot of the QR code (Win+Shift+S).',
    'QR okunamadı: ': 'Couldn’t read the QR code: ',
    'Sızıntı servisine ulaşılamadı (': 'Couldn’t reach the breach service (',
    'Çok zayıf': 'Very weak', 'Zayıf': 'Weak', 'Orta': 'Fair', 'Güçlü': 'Strong', 'Çok güçlü': 'Very strong',
    'bu şifre {0} başka kayıtta da var': ['this password is also used in {0} other item', 'this password is also used in {0} other items', 0],
    'Şifre sağlığı': 'Password health', 'Son sızıntı kontrolü: {0}': 'Last breach check: {0}',
    'Sızıntı kontrolü hiç yapılmadı.': 'No breach check has been run yet.', 'Sızıntı kontrolü yap': 'Check for breaches',
    'Sızıntılarda görülen şifreler': 'Passwords found in breaches',
    'Bu şifreler bilinen veri sızıntılarında görüldü; saldırganlar ilk bunları dener. Hemen değiştir.': 'These passwords appeared in known data breaches; attackers try them first. Change them now.',
    'Zayıf şifreler': 'Weak passwords',
    'Kısa, yaygın ya da tahmin edilebilir. Değiştirirken 🎲 ile güçlü şifre üretebilirsin.': 'Short, common or guessable. When you change them, 🎲 generates a strong password.',
    'Bir yıldan uzun süredir değişmeyenler': 'Not changed for over a year',
    'Önemli hesaplarda (e-posta, banka) şifreyi ara sıra yenilemek iyi olur.': 'For important accounts (email, bank) it’s good to renew the password now and then.',
    '{0} konu kontrol bekliyor': ['{0} item needs attention', '{0} items need attention', 0],
    'Sızmış şifreler, tekrarlı kayıtlar ya da notlarda unutulmuş şifreler': 'Breached passwords, duplicates or passwords left in notes',
    '{0} kez veri sızıntılarında görüldü': ['Seen {0} time in data breaches', 'Seen {0} times in data breaches', 0],
    '⚠ Sızmış': '⚠ Breached', 'Aynı şifre {0} başka kayıtta da var': ['The same password is in {0} other item', 'The same password is in {0} other items', 0],
    'Tekrar ×{0}': 'Reused ×{0}', '{0} sızmış': '{0} breached', '{0} zayıf': '{0} weak', '{0} tekrar': '{0} reused', '{0} eski': '{0} old',
    'Sorun yok · sızıntı kontrolü yapılmadı': 'No issues · breach check not run yet', '✓ Sorun yok': '✓ No issues',
    'Sızıntı kontrolü': 'Breach check',
    'Şifrelerin, bilinen veri sızıntılarındaki milyarlarca şifreyle karşılaştırılır (Have I Been Pwned). Şifrenin kendisi ya da tam parmak izi gönderilmez: yalnızca parmak izinin ilk 5 karakteri gider, eşleştirme bu cihazda yapılır.':
      'Your passwords are compared with billions of passwords from known data breaches (Have I Been Pwned). Neither the password nor its full fingerprint is sent: only the first 5 characters of the fingerprint leave this device, and matching happens here.',
    'Kontrol et': 'Check', 'Kontrol ediliyor… %{0}': 'Checking… {0}%',
    '⚠ {0} şifre sızıntılarda görüldü': ['⚠ {0} password was found in breaches', '⚠ {0} passwords were found in breaches', 0],
    '✓ Hiçbir şifre sızıntılarda görülmedi': '✓ None of your passwords were found in breaches',
    'Sızıntı kontrolü yapılamadı: ': 'Couldn’t run the breach check: ',
    // içe aktarma
    'Dışa aktar': 'Export', 'Dışa aktarılan dosyayı kaydet': 'Save the exported file',
    'Şifreli yedek: yalnızca Bitig ve ana şifrenle açılır; saklamak için en güvenlisi. CSV: şifreler başka bir uygulamaya taşımak için (Chrome, Bitwarden, 1Password…). JSON: notlar, görevler ve projeler dahil her şey. CSV ve JSON açık metindir.':
      'Encrypted backup: opens only with Bitig and your master password; the safest way to keep a copy. CSV: passwords, to move them to another app (Chrome, Bitwarden, 1Password…). JSON: everything, including notes, tasks and projects. CSV and JSON are plain text.',
    'Şifreli yedek': 'Encrypted backup', 'Her şey (JSON)': 'Everything (JSON)', 'Şifreler (CSV)': 'Passwords (CSV)',
    'Şifreli yedek kaydedildi': 'Encrypted backup saved', 'Ana şifreni gir': 'Enter your master password',
    'Bu dosyada şifrelerin açık metin olarak yer alır. Kimseyle paylaşma; işin bitince sil.': 'This file contains your passwords in plain text. Don’t share it; delete it when you’re done.',
    '✓ {0} şifre dışa aktarıldı: {1}': ['✓ {0} password exported: {1}', '✓ {0} passwords exported: {1}', 0],
    '✓ Tüm veriler dışa aktarıldı: {0}': '✓ All data exported: {0}',
    'Şifreli yedek, şifreler (CSV) ya da her şey (JSON)': 'Encrypted backup, passwords (CSV) or everything (JSON)',
    'İçe aktarılacak CSV dosyasını seç': 'Choose the CSV file to import', 'Dosya çok büyük (20 MB üstü).': 'The file is too large (over 20 MB).',
    'Şifrelerini başka yerden aktar': 'Bring your passwords from elsewhere',
    'Chrome, Edge, Safari, Bitwarden, 1Password… şifrelerini tek seferde Bitig’e al.': 'Move your Chrome, Edge, Safari, Bitwarden, 1Password… passwords into Bitig in one go.',
    'İçe aktar': 'Import', 'Nasıl?': 'How?', 'Verileri taşı': 'Move your data', 'Başka yerden içe aktar': 'Import from elsewhere',
    'Ayarlar → Otomatik doldurma ve şifreler → Google Şifre Yöneticisi → Ayarlar → Şifreleri dışa aktar': 'Settings → Autofill and passwords → Google Password Manager → Settings → Export passwords',
    'Ayarlar → Profiller → Şifreler → ⋯ → Şifreleri dışa aktar': 'Settings → Profiles → Passwords → ⋯ → Export passwords',
    'Menü → Şifreler → ⋯ → Girişleri dışa aktar': 'Menu → Passwords → ⋯ → Export logins',
    'Mac: Dosya → Dışa aktar → Şifreler. iPhone: Ayarlar → Şifreler → ⋯ → Dışa aktar': 'Mac: File → Export → Passwords. iPhone: Settings → Passwords → ⋯ → Export',
    'Kasa → Araçlar → Kasayı dışa aktar → .csv': 'Vault → Tools → Export vault → .csv', 'Dosya → Dışa aktar → CSV': 'File → Export → CSV',
    'Hesap seçenekleri / Dosya → Dışa aktar → CSV': 'Account options / File → Export → CSV',
    'Şifreleri nasıl dışa aktarırım?': 'How do I export my passwords?',
    'Dışa aktarılan dosyada şifreler açık metin olarak durur; içe aktardıktan sonra silmeyi unutma.': 'The exported file holds your passwords in plain text; remember to delete it after importing.',
    'Bu dosyada şifre bulunamadı': 'No passwords found in this file',
    'Şifre sütunu olan bir CSV dosyası seç (Chrome, Edge, Firefox, Safari, Bitwarden, 1Password, LastPass, KeePass).': 'Choose a CSV file with a password column (Chrome, Edge, Firefox, Safari, Bitwarden, 1Password, LastPass, KeePass).',
    '{0} şifre yeni': ['{0} new password', '{0} new passwords', 0], '{0} şifre zaten kayıtlı (aynısı)': ['{0} password already saved (identical)', '{0} passwords already saved (identical)', 0],
    '{0} hesap kayıtlı ama şifresi farklı': ['{0} account saved with a different password', '{0} accounts saved with a different password', 0], '{0} güvenli not': ['{0} secure note', '{0} secure notes', 0],
    '{0} satır atlandı (şifresi yok)': ['{0} row skipped (no password)', '{0} rows skipped (no password)', 0], '{0}: {1} kayıt bulundu': ['{0}: {1} item found', '{0}: {1} items found', 1],
    'Farklı olanları da güncelle': 'Also update the different ones', '✓ {0} şifre, {1} not içe aktarıldı': '✓ Imported · passwords: {0} · notes: {1}',
    'CSV dosyası silinsin mi?': 'Delete the CSV file?',
    '“{0}” dosyasında şifrelerin açık metin olarak duruyor. Hepsi Bitig’e şifreli olarak aktarıldı; dosyayı silmen önerilir.': '“{0}” holds your passwords in plain text. They are now encrypted in Bitig; deleting the file is recommended.',
    'Sakla': 'Keep', 'Dosyayı sil': 'Delete file', '✓ Dosya silindi': '✓ File deleted', 'Dosya silinemedi; kendin sil.': 'Couldn’t delete the file; please delete it yourself.',
    'Dosyayı silmeyi unutma': 'Remember to delete the file',
    '“{0}” dosyasında şifrelerin açık metin olarak duruyor. Dosyalar uygulamasından silmeni öneririz.': '“{0}” holds your passwords in plain text. We recommend deleting it in the Files app.',
    'Chrome, Edge, Firefox, Safari, Bitwarden, 1Password, LastPass, KeePass (CSV)': 'Chrome, Edge, Firefox, Safari, Bitwarden, 1Password, LastPass, KeePass (CSV)',
    // takvim görünümü
    'Denetleniyor…': 'Checking…', '✓ Bitig güncel (sürüm {0})': '✓ Bitig is up to date (version {0})', 'Yeni sürüm bulundu: {0}': 'New version found: {0}', 'Denetlendi': 'Checked', '✓ Güncel': '✓ Up to date', 'son denetim ': 'last checked ',
    'Sürüm {0} indiriliyor… %{1}': 'Downloading version {0}… {1}%', 'Sürüm {0} hazır · yeniden başlatınca kurulur': 'Version {0} is ready · installs when you restart',
    'Sürüm {0} çıktı': 'Version {0} is out', 'Kuruluyor…': 'Installing…', '⚠ Denetlenemedi: ': '⚠ Couldn’t check: ',
    'Yeniden başlat': 'Restart', 'İndir': 'Download', 'Denetle': 'Check', 'Güncellemeler': 'Updates', 'Bitig {0}': 'Bitig {0}',
    'Otomatik denetle': 'Check automatically', 'Yeni sürüm arka planda iner; yeniden başlatınca kurulur': 'New versions download in the background and install when you restart',
    'Yeni sürüm çıkınca haber verir': 'Lets you know when a new version is out',
    'Bitig {0} hazır': 'Bitig {0} is ready', 'Bitig {0} çıktı': 'Bitig {0} is out',
    'Yeniden başlatınca kurulur; verilerin olduğu gibi kalır.': 'It installs when you restart; your data stays as it is.',
    'İndirme sayfasından yeni sürümü indirip kurabilirsin.': 'Download and install the new version from the download page.',
    'Şimdi yeniden başlat': 'Restart now', 'Mac açılışında başlat': 'Start when the Mac starts',
    'Önceki hafta': 'Previous week', 'Sonraki hafta': 'Next week', 'Tüm ayı göster': 'Show the whole month',
    'Yalnızca bu haftayı göster': 'Show only this week', 'Ay': 'Month', 'Hafta': 'Week',
    // Face ID / parmak izi
    'Windows Hello bekleniyor…': 'Waiting for Windows Hello…',
    'Windows Hello onayı verilmedi.': 'Windows Hello was not confirmed.',
    'Bu bilgisayardaki Windows Hello anahtarı bulunamadı. Ana şifrenle aç ve Windows Hello’yu yeniden kur.': 'The Windows Hello key on this computer wasn’t found. Open with your master password and set up Windows Hello again.',
    'Bu bilgisayarda Windows Hello kurulu değil (Ayarlar → Hesaplar → Oturum açma seçenekleri).': 'Windows Hello isn’t set up on this computer (Settings → Accounts → Sign-in options).',
    'Windows Hello zamanında yanıt vermedi.': 'Windows Hello didn’t respond in time.',
    'Windows Hello kullanılamadı: ': 'Couldn’t use Windows Hello: ',
    'Windows Hello ile açma kurulu değil.': 'Windows Hello unlock isn’t set up.',
    'Windows Hello anahtarı bu kasayı açamadı. Ana şifrenle aç ve Windows Hello’yu ayarlardan yeniden kur.': 'The Windows Hello key couldn’t open this vault. Open with your master password and set up Windows Hello again in Settings.',
    'Kapalı · yüz, parmak izi ya da Windows PIN’inle aç': 'Off · open with your face, fingerprint or Windows PIN',
    'Kurmak için önce ana şifreni gir. Sonra Windows Hello onayı istenir. Anahtar yalnızca bu bilgisayarda saklanır; ana şifren her zaman çalışmaya devam eder.': 'To set it up, enter your master password first. Windows Hello will then ask for confirmation. The key is stored only on this computer; your master password always keeps working.',
    'Parmak izi': 'Fingerprint', 'Cihaz kilidi': 'Device unlock',
    '{0} onayı verilmedi.': '{0} was not confirmed.',
    'Bu cihaz {0} ile anahtar saklamayı desteklemiyor.': 'This device can’t store a key with {0}.',
    'Bu cihazda zaten bir Bitig anahtarı var; tekrar dene.': 'This device already has a Bitig key; try again.',
    '{0} anahtarı bu kasayı açamadı. Ana şifrenle aç, sonra Ayarlar’dan {0} ile açmayı yeniden kur.': 'The {0} key couldn’t open this vault. Open it with your master password, then set up {0} again in Settings.',
    'Önce ana şifreni gir.': 'Enter your master password first.',
    '{0} ile açma kurulu değil.': '{0} unlock isn’t set up.',
    '{0} ile aç': 'Unlock with {0}', '{0} ile aç ya da ana şifreni gir.': 'Unlock with {0} or enter your master password.',
    'Son adım: bir kez daha onayla': 'Last step: confirm once more', 'Son adım: bir kez daha onayla.': 'Last step: confirm once more.',
    '✓ {0} ile açma kuruldu': '✓ {0} unlock is set up',
    '✓ Açık · Bitig kilit ekranında {0} ile açılır': '✓ On · Bitig unlocks with {0} on the lock screen',
    '{0} ile açma kapatılsın mı?': 'Turn off {0} unlock?',
    'Bundan sonra Bitig’i ana şifrenle açarsın. İstediğin zaman yeniden kurabilirsin.': 'From now on you’ll open Bitig with your master password. You can set it up again any time.',
    '{0} ile açma kapatıldı': '{0} unlock turned off',
    'Şifre doğru. Şimdi {0} onayını ver.': 'Password is correct. Now confirm with {0}.', 'Şimdi kur': 'Set up now',
    'Onayla': 'Confirm', 'Kapalı · Bitig’i ana şifre yazmadan, {0} ile aç': 'Off · open Bitig with {0} instead of typing your master password',
    'Kurmak için önce ana şifreni gir. Anahtar yalnızca bu telefonda saklanır; ana şifren her zaman çalışmaya devam eder.': 'To set it up, enter your master password first. The key is stored only on this phone; your master password always keeps working.',
    'Devam': 'Continue', 'Kur': 'Set up',
    '{0} açıkken kullanılmaz': 'Not used while {0} is on',
    '{0} ile açmak ister misin?': 'Unlock with {0}?', 'Her seferinde ana şifre yazmadan, {0} ile açılır.': 'Open it with {0} instead of typing your master password each time.',
    'Sonra': 'Later',
    // görünüm
    'Görünüm ve dil': 'Appearance and language', 'Tema': 'Theme', 'Açık ya da koyu görünüm': 'Light or dark appearance',
    'Otomatik (cihaz ayarı)': 'Automatic (device setting)', 'Koyu': 'Dark', 'Açık': 'Light',
    'Her şeyde ara…': 'Search everything…', ' · gönderilmeyi bekleyen değişiklik var': ' · changes waiting to be sent',
    // OneDrive ve genel bulut metinleri
    ' (bu cihaz)': ' (this device)',
    'Bu sürümde {0} bağlantısı tanımlı değil.': 'This version has no {0} connection configured.',
    'Bitig {0} hesabına bağlandı': 'Bitig is connected to {0}',
    '{0} izni verilmedi.': '{0} permission was not granted.',
    '{0} numaralı port kullanımda; {1} girişi başlatılamadı.': 'Port {0} is in use; couldn’t start the {1} sign-in.',
    '5 dakika içinde {0} girişi tamamlanmadı.': 'The {0} sign-in wasn’t completed within 5 minutes.',
    'OneDrive bağlantısı sona erdi; yeniden bağlanman gerekiyor.': 'The OneDrive connection has expired; you need to reconnect.',
    'OneDrive oturumu alınamadı: ': 'Couldn’t sign in to OneDrive: ',
    'OneDrive’a bağlı değil.': 'Not connected to OneDrive.',
    'OneDrive klasörü okunamadı': 'Couldn’t read the OneDrive folder',
    'OneDrive’dan okunamadı': 'Couldn’t read from OneDrive',
    'OneDrive’a yazılamadı': 'Couldn’t write to OneDrive',
    'OneDrive’dan silinemedi': 'Couldn’t delete from OneDrive',
    'Tarayıcıda {0} bekleniyor…': 'Waiting for {0} in the browser…',
    'Tarayıcıda {0} açıldı; izin verince buraya döner': '{0} opened in your browser; it comes back here once you allow access',
    '✓ {0} hesabına bağlandı': '✓ Connected to {0}',
    '{0} hesabına bağlanılamadı: ': 'Couldn’t connect to {0}: ',
    'Bu sürümde {0} bağlantısı henüz etkin değil.': 'The {0} connection isn’t enabled in this version yet.',
    'Bitig, {0} hesabında sadece kendine ait “Uygulamalar/Bitig” klasörünü kullanır; diğer dosyalarını göremez.': 'Bitig only uses its own “Apps/Bitig” folder in your {0}; it can’t see your other files.',
    '{0} hesabına bağlan': 'Connect to {0}',
    '⚠ {0} bağlantısı sona erdi': '⚠ The {0} connection has expired',
    'Bağlı {0} hesabı': 'Connected {0} account',
    '{0} bağlantısı kesilsin mi?': 'Disconnect {0}?',
    'Bu bilgisayar {0} ile eşitlemeyi bırakır. {0} içindeki şifreli dosyalar silinmez.': 'This computer stops syncing with {0}. The encrypted files in {0} are not deleted.',
    'Eşitleme klasörü (OneDrive, Google Drive, iCloud ya da Dropbox masaüstü programının klasörü)': 'Sync folder (the folder of the OneDrive, Google Drive, iCloud or Dropbox desktop app)',
    'Telefonda Bitig’i kurarken {0} seçeneğini seç. Her cihaz kendi şifreli dosyasını yazar; {0} içeriği göremez.': 'When setting up Bitig on your phone, choose {0}. Each device writes its own encrypted file; {0} can’t read the contents.',
    'Klasör yolu yalnızca bilgisayarlar arasında çalışır. Telefonla eşitlemek için şunlardan birini seç: {0}.': 'A folder only syncs between computers. To sync with your phone, choose one of these: {0}.',
    '{0} girişi doğrulanamadı; tekrar dene.': 'Couldn’t verify the {0} sign-in; try again.',

    // ---- notlarda şifre, tarayıcıdan girişler
    'Not içinden': 'From a note', '“{0}” içinde {1} giriş bilgisi buldum': ['I found {1} login in “{0}”', 'I found {1} logins in “{0}”', 1],
    ' — Şifrelere kaydedilsin mi?': ' — save to Passwords?', '“{0}” notundan aktarıldı.': 'Moved from the note “{0}”.',
    ', {0} güncellendi': ', {0} updated', '{0} yeni şifre kaydedildi{1}': ['{0} new password saved{1}', '{0} new passwords saved{1}'],
    '{0} şifresi değişmiş görünüyor': 'The password for {0} seems to have changed', '(kullanıcı adı yok)': '(no username)',
    '{0} · Kayıtlı şifre yenisiyle güncellensin mi?': '{0} · Update the saved password?', 'Şifre güncellendi': 'Password updated',
    '{0} için giriş kaydedilsin mi?': 'Save the login for {0}?', 'Şifre kaydedildi': 'Password saved',
    'Tarayıcıdan {0} yeni giriş bekliyor. Kaydetmek için kilidi aç.': ['{0} new login from the browser is waiting. Unlock to save it.', '{0} new logins from the browser are waiting. Unlock to save them.'],
    'Kaydet + nottan gizle': 'Save + hide from note', 'Aktar + nottan gizle': 'Move + hide from note', 'Kaydet ': 'Save ',

    // ---- ayarlar
    'Güvenlik': 'Security', 'Kurtarma anahtarı': 'Recovery key', '✓ Var · {0} oluşturuldu': '✓ Set · created {0}',
    '⚠ Yok — ana şifreni unutursan veriler kurtarılamaz': '⚠ None — if you forget your master password, your data can’t be recovered',
    'Yenisini oluştur': 'Create a new one', 'Kasayı açan şifre': 'The password that opens your vault',
    'Hızlı kilit PIN\'i': 'Quick-lock PIN', 'Hızlı kilit PIN’i': 'Quick-lock PIN',
    '✓ Var · kilitlenince 4 haneli PIN istenir': '✓ Set · a 4-digit PIN is asked when locked',
    'Yok · kilitlenince ana şifre istenir': 'None · the master password is asked when locked', 'PIN belirle': 'Set PIN',
    'Otomatik kilit': 'Auto-lock', 'Bu süre boyunca işlem yapılmazsa kilitlenir': 'Locks after this much inactivity',
    '{0} dakika sonra kilitlenecek': ['Will lock after {0} minute', 'Will lock after {0} minutes'], 'Otomatik kilit kapalı': 'Auto-lock is off',
    '1 dakika': '1 minute', '5 dakika': '5 minutes', '10 dakika': '10 minutes', '15 dakika': '15 minutes', '30 dakika': '30 minutes', '1 saat': '1 hour',
    'Win+L ile bilgisayarı kilitleyince Bitig de kilitlenir (PIN varsa PIN ister). Bilgisayar uyku moduna geçince her zaman ana şifre gerekir. ': 'When you lock the computer with Win+L, Bitig locks too (asking for the PIN if set). After sleep the master password is always required. ',
    'Kopyalanan şifreler Windows pano geçmişine (Win+V) ve bulut panosuna alınmaz, 30 saniye sonra panodan silinir.': 'Copied passwords stay out of Windows clipboard history (Win+V) and the cloud clipboard, and are cleared after 30 seconds.',
    'Yedekleme': 'Backup', 'Otomatik yedek': 'Automatic backup', 'Son yedek: ': 'Last backup: ', 'Henüz yedek alınmadı': 'No backup yet',
    'Yedek klasörü': 'Backup folder', 'Klasörü aç': 'Open folder', 'Yedek alındı': 'Backup done', 'Yedek alınamadı: ': 'Backup failed: ',
    'Şimdi yedekle': 'Back up now', 'Yedek kaydedildi': 'Backup saved', 'Farklı yere kaydet…': 'Save elsewhere…',
    'Her değişiklikten sonra “kasa-son.enc” güncellenir, her gün tarihli bir kopya alınır (son 14 gün saklanır). ': 'After every change “kasa-son.enc” is updated, and a dated copy is made each day (the last 14 days are kept). ',
    'Yedekler şifrelidir, OneDrive’da durmaları güvenlidir. Geri yüklemek için kilit ekranındaki “Yedekten geri yükle”yi kullan.': 'Backups are encrypted, so keeping them in OneDrive is safe. To restore, use “Restore from backup” on the lock screen.',
    'Başlangıç': 'Startup', 'Windows açılışında başlat': 'Start with Windows', 'Oturum açınca kenarda şerit olarak başlar': 'Starts as a strip at the screen edge when you sign in',
    'Açılışta başlayacak': 'Will start with Windows', 'Açılışta başlamayacak': 'Won’t start with Windows', 'Hakkında': 'About',
    'Electron {0} · Veri klasörü: {1}': 'Electron {0} · Data folder: {1}', 'Bitig {0} · Electron {1} · Veri klasörü: {2}': 'Bitig {0} · Electron {1} · Data folder: {2}', 'Dil': 'Language', 'Uygulamanın dili': 'App language',
    'Otomatik (sistem dili)': 'Automatic (system language)', 'Dil değişti; uygulama yeniden açılıyor…': 'Language changed; reopening the app…',
    '⚙ Ayarlar': '⚙ Settings', 'Ayarlar ve yedek': 'Settings & backup',

    // ---- tarayıcı bağlantısı
    'Son kullanım: ': 'Last used: ', 'Bağlantı kaldırılsın mı?': 'Remove this connection?', '{0} artık Bitig’e erişemeyecek.': '{0} will no longer be able to reach Bitig.',
    'Henüz bağlı tarayıcı yok.': 'No connected browsers yet.', '● Bağlantı servisi çalışıyor (port {0})': '● Connection service is running (port {0})',
    '✕ Servis çalışmıyor: {0}': '✕ Service isn’t running: {0}', 'Bağlı tarayıcılar': 'Connected browsers', 'Yeni tarayıcı bağla': 'Connect a new browser',
    'Chrome’da adres çubuğuna ': 'In Chrome’s address bar, type ', ' yaz.': '.', 'Sağ üstten ': 'Turn on ', 'Geliştirici modu': 'Developer mode',
    '’nu aç.': ' (top right).', 'Paketlenmemiş öğe yükle': 'Load unpacked', ' klasörünü seç. ': ' folder. ', ' → ': ' → and choose the ',
    'Chrome’un sağ üstündeki yapboz (🧩) menüsünden ': 'From the puzzle (🧩) menu at Chrome’s top right, pin ',
    'Bitig Bağlantısı': 'Bitig Connector', '’nı sabitle, mavi Bitig simgesine tıkla ve aşağıdaki kodu gir.': ', click the blue Bitig icon and enter the code below.',
    '{0}:{1} içinde gir': 'enter within {0}:{1}', 'Süre doldu, yeni kod al': 'Expired, get a new code', 'Eşleştirme kodu al': 'Get pairing code',
    'Eklenti sadece bu bilgisayardaki Bitig’e bağlanır. Bitig kilitliyken hiçbir bilgi vermez; şifreler yalnızca kaydedildikleri sitede, sen tıklayınca doldurulur.': 'The extension only connects to Bitig on this computer. It reveals nothing while Bitig is locked; passwords are filled only on the site they were saved for, and only when you click.',
    '🌐 Tarayıcı bağlantısı': '🌐 Browser connection', 'Tarayıcı bağlantısı': 'Browser connection', '✓ {0} bağlandı': '✓ {0} connected', 'Klasörü aç ': 'Open folder ',

    // ---- eşitleme
    'Kapalı · telefon ve diğer bilgisayarlarla eşitlemek için aç': 'Off · turn on to sync with your phone and other computers',
    'Son eşitleme: ': 'Last sync: ', 'Eşitleniyor…': 'Syncing…', 'Son kayıt: ': 'Last saved: ', 'Henüz kaydetmedi': 'Hasn’t saved yet',
    'Cihaz listeden çıkarılsın mı?': 'Remove this device from the list?',
    '“{0}” cihazının eşitleme dosyası silinir. O cihaz Bitig’i yeniden açarsa tekrar görünür. Kaybolan bir cihazdaki veriler zaten o cihaza inmiş olabilir; böyle bir durumda önemli şifrelerini değiştir.': 'The sync file of “{0}” will be deleted. If that device opens Bitig again, it will reappear. Data may already be on a lost device; in that case, change your important passwords.',
    'Çıkar': 'Remove', 'Eşitlendi': 'Synced', 'Şimdi eşitle': 'Sync now', 'Tarayıcıda Dropbox bekleniyor…': 'Waiting for Dropbox in your browser…',
    'Tarayıcıda Dropbox açıldı; izin verince buraya döner': 'Dropbox opened in your browser; it’ll come back here once you allow it',
    '✓ Dropbox’a bağlandı': '✓ Connected to Dropbox', 'Dropbox’a bağlanılamadı: ': 'Couldn’t connect to Dropbox: ',
    'Bu sürümde Dropbox bağlantısı henüz etkin değil.': 'Dropbox isn’t enabled in this version yet.', '⚠ Dropbox bağlantısı sona erdi': '⚠ The Dropbox connection has ended',
    'Bağlı Dropbox hesabı': 'Connected Dropbox account', ' · Uygulamalar/Bitig klasörü': ' · Apps/Bitig folder', 'Yeniden bağlan': 'Reconnect',
    'Dropbox bağlantısı kesilsin mi?': 'Disconnect Dropbox?', 'Bu bilgisayar Dropbox’la eşitlemeyi bırakır. Dropbox’taki şifreli dosyalar silinmez.': 'This computer will stop syncing with Dropbox. The encrypted files in Dropbox aren’t deleted.',
    'Bağlantıyı kes': 'Disconnect', 'Bitig, Dropbox’ında sadece kendine ait “Uygulamalar/Bitig” klasörünü kullanır; diğer dosyalarını göremez.': 'Bitig only uses its own “Apps/Bitig” folder in your Dropbox; it can’t see your other files.',
    'Dropbox’a bağlan': 'Connect to Dropbox', 'Eşitleme klasörü (OneDrive, Google Drive ya da Dropbox masaüstü programının klasörü)': 'Sync folder (a OneDrive, Google Drive or Dropbox desktop folder)',
    'Cihazlar arası eşitleme': 'Sync across devices', 'Eşitleme': 'Sync', 'Eşitleme açıldı': 'Sync turned on', 'Eşitleme kapatıldı': 'Sync turned off',
    'Eşitleme yeri': 'Sync location', 'Klasör': 'Folder', 'Bu cihazın adı': 'This device’s name', 'Cihaz adı': 'Device name',
    'Diğer cihazlarda bu adla görünür.': 'Other devices will see it with this name.', 'Ör. Ev bilgisayarı': 'e.g. Home PC', 'Bir ad yaz.': 'Enter a name.',
    'Açınca kasan şifreli olarak buluta da yazılır; telefonun ve diğer bilgisayarların değişiklikleri buradan birleşir.': 'When on, your vault is also written to the cloud, encrypted; changes from your phone and other computers are merged from there.',
    'Henüz başka cihaz yok. ': 'No other devices yet. ',
    'Telefonda Bitig’i kurarken Dropbox’ı seç. Her cihaz kendi şifreli dosyasını yazar; Dropbox içeriği göremez.': 'Choose Dropbox when you set up Bitig on your phone. Each device writes its own encrypted file; Dropbox can’t see the contents.',
    'Klasör yolu yalnızca bilgisayarlar arasında çalışır. Telefonla eşitlemek için Dropbox’ı seç.': 'The folder option only works between computers. To sync with your phone, choose Dropbox.',
    '⟳ {0}: {1} değişiklik geldi': ['⟳ {0}: {1} change received', '⟳ {0}: {1} changes received', 1],
    '⟳ Diğer cihazlardan {0} değişiklik geldi': ['⟳ {0} change from your other devices', '⟳ {0} changes from your other devices'],
    'Bilinmeyen cihaz': 'Unknown device', 'Okunamadı: başka bir kasaya ait ya da henüz tam yüklenmemiş': 'Can’t read: belongs to another vault or isn’t fully uploaded yet',
    'Okunamadı: başka bir kasaya ait ya da henüz tam inmemiş': 'Can’t read: belongs to another vault or isn’t fully downloaded yet',
    'Yüklenemedi: ': 'Upload failed: ', 'İnternet yok · değişiklikler bağlantı gelince gönderilecek': 'No internet · changes will be sent when you’re back online',
    'Klasör okunamadı: ': 'Can’t read the folder: ',

    // ---- üst çubuk, pencere
    'Her zaman üstte: açık': 'Always on top: on', 'Her zaman üstte: kapalı': 'Always on top: off', 'Her zaman üstte': 'Always on top',
    'Kilitle': 'Lock', 'Şerit hâline küçült': 'Collapse to a strip', 'Paneli aç (Ctrl+Shift+Space)': 'Open the panel (Ctrl+Shift+Space)', 'Sürükle': 'Drag',

    // ---- Dropbox
    'Dropbox bağlantısı sona erdi; yeniden bağlanman gerekiyor.': 'The Dropbox connection has ended; you need to reconnect.',
    'Dropbox oturumu alınamadı: ': 'Couldn’t sign in to Dropbox: ', 'Dropbox’a bağlı değil.': 'Not connected to Dropbox.',
    'Dropbox’tan okunamadı (': 'Couldn’t read from Dropbox (', 'Dropbox’a yazılamadı (': 'Couldn’t write to Dropbox (',
    'Dropbox izni verilmedi.': 'Dropbox permission wasn’t granted.', 'Dropbox girişi doğrulanamadı; tekrar dene.': 'The Dropbox sign-in couldn’t be verified; try again.',
    'Bu sürümde Dropbox uygulama anahtarı tanımlı değil.': 'This version has no Dropbox app key.', 'Bitig Dropbox’a bağlandı': 'Bitig is connected to Dropbox',
    'Bu sekmeyi kapatıp Bitig’e dönebilirsin.': 'You can close this tab and go back to Bitig.', 'Bağlantı kurulamadı': 'Couldn’t connect',
    'Bitig’e dönüp tekrar dene.': 'Go back to Bitig and try again.', '{0} numaralı port kullanımda; Dropbox girişi başlatılamadı.': 'Port {0} is in use; couldn’t start the Dropbox sign-in.',
    '5 dakika içinde Dropbox girişi tamamlanmadı.': 'The Dropbox sign-in wasn’t completed within 5 minutes.',

    // ---- telefon
    'Bulut bağlantısı yenilendi. Ana şifrenle aç.': 'Cloud connection renewed. Open with your master password.', 'Ana şifreni mi unuttun?': 'Forgot your master password?',
    'Bilgisayardaki Bitig’de kilit ekranındaki “Ana şifremi unuttum” ile kurtarma anahtarını kullanıp yeni ana şifre belirle. Telefon yeni şifreyi eşitlemeyle otomatik alır; sonra burada yeni şifreyle açarsın.': 'On your computer, use “I forgot my master password” on Bitig’s lock screen with your recovery key to set a new master password. Your phone picks it up through sync; then open it here with the new password.',
    'Bu telefona kur': 'Set up on this phone', 'Telefon, bilgisayarındaki Bitig ile bulut üzerinden eşitlenir. Veriler şifreli gider; bulut içini göremez.': 'Your phone syncs with Bitig on your computer through the cloud. Data travels encrypted; the cloud can’t see inside.',
    'Bilgisayardaki Bitig’de ': 'In Bitig on your computer, turn on ', 'Ayarlar → Cihazlar arası eşitleme': 'Settings → Sync across devices', '’yi aç.': '.',
    'Aşağıdan aynı bulutu seç ve hesabınla bağlan.': 'Choose the same cloud below and sign in.', '{0} bağlandı': '{0} connected',
    'Ama burada henüz Bitig yok. Bilgisayardaki Bitig’de Ayarlar → Cihazlar arası eşitleme’yi açtığından ve aynı bulutun seçili olduğundan emin ol.': 'But there’s no Bitig here yet. Make sure Settings → Sync across devices is on in Bitig on your computer, with the same cloud selected.',
    'Başka bulut seç': 'Choose another cloud', 'Bitig bulundu': 'Bitig found',
    '{0} içinde {1} cihazın kasası var. Bilgisayardaki ana şifreni gir.': ['{0} has the vault of {1} device. Enter the master password from your computer.', '{0} has vaults from {1} devices. Enter the master password from your computer.', 1],
    'Bitig bu telefona kuruldu ✓': 'Bitig is set up on this phone ✓', '⚠ Bağlantı sona erdi; yeniden bağlanman gerekiyor': '⚠ The connection has ended; you need to reconnect',
    ' · gönderilmeyi bekleyen değişiklik var': ' · changes waiting to be sent', 'Son eşitleme: {0}{1}': 'Last sync: {0}{1}',
    'Uygulamadan çıkınca da bu süre sayılır': 'Time away from the app counts too',
    'PIN bu telefona özeldir. Ana şifre, kurtarma anahtarı ve yedekler bilgisayardaki Bitig’den yönetilir.': 'The PIN is specific to this phone. The master password, recovery key and backups are managed from Bitig on your computer.',
    'Ör. iPhone’um': 'e.g. My iPhone', 'Bu telefon': 'This phone', 'Bitig’i bu telefondan kaldır': 'Remove Bitig from this phone',
    'Bu telefondaki şifreli kopya silinir. Bilgisayardaki ve buluttaki kasan etkilenmez.': 'The encrypted copy on this phone is deleted. Your vault on the computer and in the cloud isn’t affected.',
    'Bu telefondan kaldırılsın mı?': 'Remove from this phone?', 'Yeniden kurmak için bulut hesabın ve ana şifren gerekecek.': 'You’ll need your cloud account and master password to set it up again.',
    'Bitig bu telefondan kaldırıldı.': 'Bitig was removed from this phone.', 'Android telefon': 'Android phone', 'Bu telefon (şifreli)': 'This phone (encrypted)',
    'Bulutta Bitig bulunamadı. Bilgisayardaki Bitig’de Ayarlar → Cihazlar arası eşitleme’yi aç.': 'No Bitig found in the cloud. In Bitig on your computer, turn on Settings → Sync across devices.',
    '{0} bilgisayardaki Bitig’den yapılır; telefon değişikliği eşitlemeyle otomatik alır.': '{0} is done from Bitig on your computer; the phone picks up the change through sync.',
    'Yeni kasa oluşturmak': 'Creating a new vault', 'Kurtarma anahtarıyla yeni ana şifre belirlemek': 'Setting a new master password with the recovery key',
    'Ana şifreyi değiştirmek': 'Changing the master password', 'Kurtarma anahtarı oluşturmak': 'Creating a recovery key', 'Yedekten geri yüklemek': 'Restoring from a backup',
    'Geliştirme klasörü (test)': 'Development folder (test)', 'Geliştirme klasörüne ulaşılamadı': 'Couldn’t reach the development folder',
    'Liste alınamadı (': 'Couldn’t list files (', 'Okunamadı (': 'Couldn’t read (', 'Yazılamadı (': 'Couldn’t write (',
    ' bağlantısı bir sonraki aşamada gelecek.': ' support is coming in a later version.',

    // ---- ana süreç
    'Örnek Proje': 'Sample project', 'Örnek hosting paneli': 'Sample hosting panel', 'Hoş geldin 👋': 'Welcome 👋',
    'Bu panel ekranın kenarında durur.\n\n• Üst çubuktan tutup sürükle, kenara yaklaştırınca yapışır.\n• Ortada bırakırsan orada kalır.\n• ⟩ düğmesiyle şerit hâline küçült.\n• Ctrl+Shift+Space ile her yerden aç/kapat.': 'This panel lives at the edge of your screen.\n\n• Drag it by the top bar; near an edge it snaps.\n• Drop it in the middle and it stays there.\n• Collapse it to a strip with ⟩.\n• Open/close it from anywhere with Ctrl+Shift+Space.',
    'Bitig uygulamasını dene': 'Try out Bitig', 'Bitig zaten var.': 'Bitig already exists.', 'Kurtarma anahtarı yanlış.': 'Wrong recovery key.', 'Bu kasada kurtarma anahtarı yok.': 'This vault has no recovery key.',
    'Eşitleme klasörünü seç (OneDrive içinde olmalı)': 'Choose the sync folder (should be inside OneDrive)', 'Geri yüklenecek Bitig yedeğini seç': 'Choose the Bitig backup to restore',
    'Bitig yedeği': 'Bitig backup', 'Seçilen dosya bir Bitig yedeği değil.': 'The selected file isn’t a Bitig backup.', 'Henüz kasa yok.': 'There’s no vault yet.',
    'Yedek klasörünü seç': 'Choose the backup folder', 'Şifreli yedeği kaydet': 'Save the encrypted backup', '⏰ Hatırlatma': '⏰ Reminder',
    'Kod süresi doldu. Panelden yeni kod al.': 'The code expired. Get a new one from the panel.', 'Çok fazla hatalı deneme. Yeni kod al.': 'Too many wrong tries. Get a new code.',
    'Kod yanlış.': 'Wrong code.', 'Tarayıcı': 'Browser', 'Bu kayıt bu siteye ait değil.': 'This entry doesn’t belong to this site.',
    '{0} numaralı port kullanımda.': 'Port {0} is in use.',

    // ---- tarayıcı eklentisi
    'Bağlantıyı kaldır': 'Remove connection', 'Bitig uygulaması açık değil.': 'The Bitig app isn’t running.', 'Bitig panelinde ': 'In the Bitig panel, press ',
    ' düğmesine bas, ': ', choose ', ' de ve çıkan kodu buraya yaz.': ' and type the code here.', 'Bağlan': 'Connect',
    'Masaüstündeki Bitig’i başlat, sonra tekrar dene.': 'Start Bitig on your desktop, then try again.', 'Paneli açıp ana şifreni gir.': 'Open the panel and enter your master password.',
    '{0} için kayıtlı hesap yok.': 'No saved accounts for {0}.', 'Bu sayfa için kayıtlı hesap yok.': 'No saved accounts for this page.',
    'Bu sitede giriş yaptığında Bitig paneli kaydetmeyi önerecek.': 'When you sign in on this site, the Bitig panel will offer to save it.',
    '{0} için kayıtlı hesaplar': 'Saved accounts for {0}', 'Bu sayfada doldurulacak şifre alanı bulunamadı.': 'No password field to fill on this page.',
    'Bitig: {0} kayıtlı hesap': ['Bitig: {0} saved account', 'Bitig: {0} saved accounts'], 'Bitig kilitli. Masaüstündeki panelden kilidi aç.': 'Bitig is locked. Unlock it from the desktop panel.',
    'Doldur': 'Fill', 'Bağlanıyor…': 'Connecting…', '🔒 Bitig kilitli.': '🔒 Bitig is locked.', '↻ Tekrar dene': '↻ Try again',
  };

  const DICTS = { en: EN };
  let current = null;

  function detect() {
    try {
      const saved = typeof localStorage !== 'undefined' && localStorage.getItem('bitig.lang');
      if (saved === 'tr' || saved === 'en') return saved;
    } catch {}
    const nav = (typeof navigator !== 'undefined' && (navigator.language || '')) || '';
    return /^tr/i.test(nav) ? 'tr' : 'en';
  }

  const lang = () => (current ||= detect());
  const setLang = (l) => { current = l === 'tr' || l === 'en' ? l : detect(); return current; };

  const fill = (s, args) => s.replace(/\{(\d+)\}/g, (m, i) => (args[i] !== undefined ? String(args[i]) : m));

  // Çeviri: _t('“{0}” geri yüklendi', ad)
  function translate(l, s, ...args) {
    if (typeof s !== 'string') return s;
    let out = s;
    if (l !== 'tr') {
      const v = DICTS[l]?.[s];
      if (Array.isArray(v)) out = Number(args[v[2] ?? 0]) === 1 ? v[0] : v[1]; // [tekil, çoğul, sayının yeri]
      else if (typeof v === 'string') out = v;
    }
    return args.length ? fill(out, args) : out;
  }

  // Sayfadaki sabit (HTML) metinleri ve title/placeholder niteliklerini çevir — kullanıcı verisi içermeyen ilk yükleme için
  function applyStatic(rootEl) {
    if (lang() === 'tr' || !rootEl) return;
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const raw = n.nodeValue;
      const key = raw.trim();
      if (key && EN[key] && typeof EN[key] === 'string') n.nodeValue = raw.replace(key, EN[key]);
    }
    for (const el of rootEl.querySelectorAll('[title],[placeholder],[aria-label]')) {
      for (const a of ['title', 'placeholder', 'aria-label']) {
        const v = el.getAttribute(a);
        if (v && typeof EN[v] === 'string') el.setAttribute(a, EN[v]);
      }
    }
    document.documentElement.lang = lang();
  }

  return {
    lang, setLang, detect,
    t: (s, ...a) => translate(lang(), s, ...a),
    tl: translate, // belirli bir dil için (ana süreç)
    locale: () => (lang() === 'tr' ? 'tr-TR' : 'en-GB'),
    applyStatic,
    EN,
  };
});
