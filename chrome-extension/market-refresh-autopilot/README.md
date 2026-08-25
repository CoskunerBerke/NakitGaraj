# Market Refresh Autopilot (Chrome MV3)

Aylık pazar tazelemesini **kendi giriş yapmış Chrome'unuzda** yürütür. Uzantı yalnızca
gezinir ve okur; tüm dayanıklı durum (checkpoint, staging, tekilleştirme, bölümleme,
tamamlanma sözleşmesi) `127.0.0.1` üzerindeki yerel köprüde yaşar.

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
