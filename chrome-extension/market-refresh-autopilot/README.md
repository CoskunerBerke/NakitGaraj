# Market Refresh Autopilot (Chrome MV3)

Aylık pazar tazelemesini **ve** yapısal kategori toplamayı **kendi giriş yapmış
Chrome'unuzda** yürütür. Uzantı yalnızca gezinir ve okur; tüm dayanıklı durum
(checkpoint, staging, tekilleştirme, bölümleme, kategori kimliği, tamamlanma
sözleşmesi) `127.0.0.1` üzerindeki yerel köprüde yaşar.

## 0) Yapı toplayıcı (`--mode structure`) — kategori sayfalarını korpusa topla

Amaç: Sahibinden kategori ağacını (marka → seri → gövde → motor → paket …,
derinlik sabit değil) **ham HTML** olarak `sahibindne ilan` korpusuna eklemek.
Uzantı sayfayı **ayrıştırmaz**: `document.documentElement.outerHTML`'i olduğu
gibi köprüye verir. Köprü, elle kaydedilmiş korpusu okuyan **aynı** ayrıştırıcıyı
(`vehicle-hierarchy/page-classification`) çalıştırır:

```
HAM HTML TOPLA → KAYDET → MEVCUT AYRIŞTIRICI → BREADCRUMB + MENÜ
→ DOĞRUDAN ÇOCUKLAR KUYRUĞA → CHECKPOINT → (N sayfada bir) YENİDEN KUR + DOĞRULA
```

Kurallar:

| Kural | Davranış |
| --- | --- |
| Kimlik | Dosya adı değil, sayfanın **kendi breadcrumb'ı**. Yönlendirme (üst/alakasız sayfa) `REDIRECT_MISMATCH`, korpusa **yazılmaz** |
| Mevcut korpus | Ayrıştırıcının okuyabildiği sayfa varsa **istek gönderilmez**; menüsü diskten okunur, çocukları kuyruğa girer |
| Giriş / 2FA / engel / CAPTCHA | **Atlatma yok.** Koşu `ACCESS_RESTRICTED` ile durur, checkpoint yazılır, hedef kaybolmaz; Chrome'da elle düzeltip **Devam et** |
| Bilinmeyen kayıt biçimi | Koşu `ERROR` ile **hemen** durur, sayfa `evidence/quarantine/` altına alınır. Önce ayrıştırıcı düzeltilir, sonra Devam et |
| Checkpoint | Her başarılı sayfadan sonra. PC/Chrome/köprü yeniden başlasa da ilerleme kaybolmaz; START, checkpoint varsa **devam eder** (kopya hedef üretmez) |
| Tempo | Köprü her adımla jitter'lı bekleme gönderir (`--pace-ms 5000 --jitter 0.4` → 3–7 s). Tek sekme, paralellik yok |
| Yeniden kurma | `--rebuild-every 50`: 50 kayıttan sonra `hierarchy:build → listings:build → coverage:manifest → corpus:validate`. Kapı düşerse koşu durur |
| Kökler | CLI'dan (`--roots`), uzantıdan **değil**. Varsayılan site kökü `/kategori/otomobil` → tüm markalar; marka adı hiçbir yerde sabit değil |
| Sonuç sayfaları | Yapı modu **sayfalama yapmaz**; hiyerarşi tamamlanmadan piyasa derinliği toplanmaz |

Komutlar (PowerShell; Git Bash'te başa `MSYS_NO_PATHCONV=1` ekleyin):

```bash
# 1) Kuru koşu — kaynağa istek YOK; kuyruk korpusa karşı açılır ve yazdırılır
cd backend; npm run market:autopilot:bridge -- --mode structure --run-id smoke-a3-sedan --roots /audi-a3-a3-sedan --dry-run

# 2) Sınırlı duman koşusu — en fazla 3 sayfa çekilir
cd backend; npm run market:autopilot:bridge -- --mode structure --run-id smoke-a3-sedan --roots /audi-a3-a3-sedan --max-pages 3

# 3) Tam yapısal koşu — site kökünden, tüm markalar, devam edilebilir
cd backend; npm run market:autopilot:bridge -- --mode structure --run-id structure-2026-09
```

Sonra: uzantıyı `chrome://extensions` → **Yeniden yükle**, normal Chrome'da
Sahibinden'e giriş yapıldığını doğrulayın, uzantı panelinde köprü adresini
kaydedip **Koşuyu başlat**'a bir kez basın. Panel `Yapı toplayıcı` kartında
tamamlanan/kuyruk/kaydedilen/yeni düğüm/son başarı/durma sebebini gösterir.

### Köprü "BAĞLI DEĞİL" ve köprü günlüğünde `403 (missing extension marker)`

Kaynak dosyalar doğru olsa bile Chrome, uzantının **servis çalışanını** kendi
önbelleğinden eski haliyle koşturabilir (panel diskten taze gelir, servis
çalışanı gelmez). Eski servis çalışanı `x-autopilot-token` gönderir, isareti
göndermez → köprü 403 der. Kontrol ve çözüm:

1. Panelde **Yüklü kod** satırı `uzantı v1.1.0 · istemci v2` demeli. Boş ya da
   farklıysa servis çalışanı eski.
2. `chrome://extensions` → uzantı kartında **Service worker** bağlantısına
   tıklayın; konsolda `[autopilot] service worker loaded: extension v1.1.0,
   bridge client v2 ...` satırı görünmeli.
3. Görünmüyorsa: Chrome'u **tamamen** kapatın (sağ alttaki tepsi simgesinden de
   "Çıkış"), yeniden açın, `chrome://extensions` → **Yeniden yükle**. Manifest
   sürümü 1.1.0'a yükseltildiği için Chrome servis çalışanını yeniden kaydeder.
4. Köprü günlüğü artık 403'te hangi başlıkların geldiğini yazar
   (`headers=...`): `x-autopilot-token` görüyorsanız hâlâ eski kod koşuyor;
   `x-nakitgaraj-extension` görüyorsanız sorun başka yerdedir.

Derleme adımı **yoktur**: Chrome doğrudan bu klasördeki kaynak dosyaları yükler.
Tüm köprü istekleri `bridge-client.js` üzerinden gider; `background.js`'de
`fetch` çağrısı yoktur.

Koşu dizini `backend/data/market-refresh/autopilot/<run-id>/`:
`checkpoint.json` (atomik, checksum'lu), `report.json` (koşu raporu),
`captures.jsonl` (her yakalama), `evidence/{security,mismatch,quarantine,site-root}/`,
`rebuild-logs/`.

Yapı modu bayrakları: `--mode structure --run-id --roots --max-pages
--rebuild-every --no-rebuild --pace-ms --jitter --dry-run --port --window`.
`--scope-*` ve `--coverage-*` yalnızca piyasa modunda geçerlidir.

## Ne YAPMAZ

- Erişim kontrolünü atlatmaz: CAPTCHA çözme, stealth eklenti, parmak izi sahteciliği,
  proxy/hesap rotasyonu **yoktur**.
- Giriş/SMS otomasyonu yapmaz. Bunlar **manuel** işlerdir.
- Hesap bilgisi saklamaz.
- Üretim JWT/admin kimliğini kullanmaz.
- Satılabilir uygulamaya veya snapshot DB'sine yazmaz.

## Köprü güvenliği — jeton yok

Dönen yetenek jetonu **kaldırıldı**: tamamen yerel bu iş akışında yalnızca
sürtünme ve tekrarlanan 401 üretiyordu. Yerine dört katman var:

| Katman | Ne yapar |
| --- | --- |
| `127.0.0.1` bağlama | LAN'dan erişilemez. `0.0.0.0` asla |
| Geri döngü bağlantısı | Uzak istemci reddedilir |
| `Host` doğrulaması | DNS rebinding'i keser |
| Origin + `X-NakitGaraj-Extension: 1` | Web sayfalarını dışarıda tutar |

Son satır asıl korumadır: özel bir başlık, tarayıcıyı ön-kontrole (preflight)
zorlar; ön-kontrole yalnızca `chrome-extension://` kökenine izin verildiği için
sıradan bir web sayfası isteği **hiç gönderemez**. Başlık **gizli değildir** ve
kimlik doğrulaması değildir. Tüm yollarda zorunludur — basit bir cross-origin
GET ön-kontrolsüz gider ve `GET /autopilot/next` durum değiştirir.

> Dürüstlük notu: bu katmanların hiçbiri **aynı makinedeki başka bir yerel
> süreçten** korumaz; o süreç iki başlığı da gönderebilir. Köprü yalnızca siz
> başlattığınızda çalışır, yalnızca gitignore'lu bir staging dizinine yazar ve
> snapshot DB'sine hiçbir şekilde dokunmaz.

Eski koşu dizinlerinde kalan `bridge-token.txt` dosyaları artık işe yaramaz;
dilerseniz silebilirsiniz.

## 1) Köprüyü başlat

```bash
cd backend && npm run market:autopilot:bridge -- --port 8791 --window 02:00-10:00
```

İlk deneme için referans yüklemesini atlayabilirsiniz (her kart `NEW` sayılır):

```bash
cd backend && npm run market:autopilot:bridge -- --port 8791 --reference off
```

Başlangıç çıktısı bağlanma adresini ve koşu dizinini yazar. Kopyalanacak jeton
**yoktur**.

## 1b) İLK CANLI KOŞU: kapsam korumalı duman testi

İlk gerçek koşunun amacı iki kaynak seçici grubunu doğrulamaktır: **sonuç
sayısı** ve **alt kategori + sayısı**. Bu koşu tek modele kilitlenir ve
hedefin dışına çıkamaz.

PowerShell'den:

```bash
cd backend; npm run market:autopilot:bridge -- --port 8791 --run-id smoke-audi-a3 --scope-root /audi-a3 --scope-make Audi --scope-series A3 --max-result-pages 3 --require-child-structure --stop-on-unknown --makes Audi
```

Git Bash kullanıyorsanız komutun başına `MSYS_NO_PATHCONV=1` ekleyin — aksi
halde Git Bash `/audi-a3` argümanını bir Windows yoluna çevirir. (Köprü bunu
fark eder ve açık hata verir; sessizce yanlış kapsamla çalışmaz.) Alternatif:
`--scope-root https://www.sahibinden.com/audi-a3`.

**Kapsam uzantıdan değil köprüden verilir.** Uzantı güvenilmez bir istemcidir;
kapsamı genişletebilseydi koruma koruma olmazdı. Panelden yalnızca START'a
basılır ve açık sekme kapsam dışındaysa köprü başlatmayı reddeder.

Bu koşuda:

| Kural | Davranış |
| --- | --- |
| Audi A3 kökü (6.559 ilan) | `SPLIT_REQUIRED` — ilan sayfaları **gezilmez ve toplanmaz** |
| A3 Cabrio (101) / A3 Hatchback (366) | `COLLECTABLE_LEAF` — 50/sayfa ile toplanır |
| A3 Sedan (3.132) / A3 Sportback (2.960) | `SPLIT_REQUIRED` — bir seviye daha bölünür |
| Audi A4 / BMW / kırılım yolu / sayfalama | Alt soy değil: **çocuk sayılmaz** |
| Sayfa 4 | **Üretilmez**; gönderilse bile reddedilir |
| Sonuç sayısı okunamazsa | `UNKNOWN_COUNT` → koşu **DURUR** (`ERROR`), hiçbir şey tahmin edilmez |
| Alt kategori yapısı okunamazsa | `UNKNOWN_CATEGORY_STRUCTURE` → koşu **DURUR** |
| Sayfalar bildirilen sayımdan fazla ilan gösterirse | `REPORTED_COUNT_MISMATCH` → **hiçbir satır yazılmaz**, düğüm toplanmaz |
| Snapshot DB | **Salt okunur**; gözlemler yalnızca staging JSONL'e yazılır |
| Koşu tam mı | Kapsamlı koşu tanımı gereği **HAYIR** — aylık tazeleme sayılamaz |

`max-result-pages` **yalnızca uçtaki toplanabilir yapraklara** uygulanır. Aşırı
büyük bir ebeveyni sahte yaprağa çeviremez: düğümün büyüklüğü kaynağın bildirdiği
sayımdan gelir, duman testinin sayfa sınırından değil.

Üst satırdaki durum, `Koşu tam mı: HAYIR` iken **`COMPLETE` göstermez**;
`SMOKE_LIMIT_REACHED` (yalnızca sayfa sınırı kırptı) ya da `INCOMPLETE`
(bölünemeyen/bloke/güvenilmez düğüm var) gösterir.

> Not: ilk duman koşusunun (`autopilot-v1`) checkpoint'i artık **devam
> ettirilemez** — o koşu sayımı yanlış okuyordu. İkinci koşu için **yeni bir
> `--run-id`** kullanın.

`--reference off` eklerseniz snapshot hiç açılmaz ve her kart `NEW` sayılır;
seçici doğrulaması için bu da yeterlidir.

## 2) Uzantıyı yükle

1. Chrome'da `chrome://extensions` adresini açın
2. Sağ üstten **Geliştirici modu**'nu açın
3. **Paketlenmemiş öğe yükle**'ye basın
4. Şu klasörü seçin:
   `C:\dev\NakitGaraj-market-refresh\chrome-extension\market-refresh-autopilot`

Chrome Web Store gerekmez.

## 3) Bağlan ve başlat

1. Uzantı panelini açın, köprü adresini (`http://127.0.0.1:8791`) yazıp
   **Kaydet**'e basın. Panelde **Köprü: BAĞLI** görmelisiniz. Jeton yoktur
2. Normal Chrome'da kaynak siteye **elle giriş yapın** (gerekiyorsa SMS'i elle girin)
3. Toplanacak kategori sayfasını açın (örn. tek model denemesi için Audi A3)
4. Panelden **Aylık tazelemeyi başlat**'a basın

Açık olan kaynak sekmesinin adresi kök kategori olarak alınır. Bundan sonra sayfa
sayfa tıklamak gerekmez: uzantı kategori ağacını gezer, >1000 düğümleri böler,
<=1000 yaprakları 50 sonuç/sayfa ile sayfalar ve her sayfayı köprüye gönderir.

## Durumlar

| Durum | Anlamı |
| --- | --- |
| `IDLE` | Koşu yok |
| `RUNNING` | Gezinme sürüyor |
| `PAUSED` | Kullanıcı duraklattı; `Devam et` kaldığı yerden sürer |
| `ACCESS_RESTRICTED` | Erişim kısıtlandı. **Manuel müdahale gerekiyor**: oturumu elle düzeltin, sonra `Devam et` |
| `DEADLINE_REACHED` | Yürütme penceresi kapandı; bir sonraki pencerede `Devam et` |
| `COMPLETE` | Kuyruk bitti **ve koşu gerçekten tam**. Başka hiçbir durumda gösterilmez |
| `SMOKE_LIMIT_REACHED` | Kuyruk bitti; tek eksiklik duman testinin kasıtlı sayfa kırpması |
| `INCOMPLETE` | Kuyruk bitti ama bölünemeyen/bloke/güvenilmez düğüm var |
| `ERROR` | Köprü/gezinme hatası ya da güvenilmez kaynak okuması; sessiz yeniden deneme yapılmaz |

**Koşu tam mı** alanı yalnızca şu durumda `EVET` olur: tüm bölümler tamamlandı,
bölünemeyen aşırı büyük düğüm yok, bloke/başarısız iş yok.

## Yetkiler neden bunlar

| Yetki | Sebep |
| --- | --- |
| `storage` | Köprü adresi ve koşu bayrağı (kimlik bilgisi saklanmaz) |
| `scripting` | Kaynak sekmesine gözlem betiğini enjekte etmek |
| `tabs` | Tek adanmış kaynak sekmesini yönetmek |
| `alarms` | MV3 servis çalışanı öldürülürse döngüyü ayağa kaldırmak |
| `https://www.sahibinden.com/*` | Kaynağı okumak |
| `http://127.0.0.1/*` | Yerel köprü |

Geniş `<all_urls>` veya `activeTab` istenmez.
