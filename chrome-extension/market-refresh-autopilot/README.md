# Market Refresh Autopilot (Chrome MV3)

Aylık pazar tazelemesini **kendi giriş yapmış Chrome'unuzda** yürütür. Uzantı yalnızca
gezinir ve okur; tüm dayanıklı durum (checkpoint, staging, tekilleştirme, bölümleme,
tamamlanma sözleşmesi) `127.0.0.1` üzerindeki yerel köprüde yaşar.

## Ne YAPMAZ

- Erişim kontrolünü atlatmaz: CAPTCHA çözme, stealth eklenti, parmak izi sahteciliği,
  proxy/hesap rotasyonu **yoktur**.
- Giriş/SMS otomasyonu yapmaz. Bunlar **manuel** işlerdir.
- Hesap bilgisi saklamaz.
- Üretim JWT/admin kimliğini kullanmaz; koşuya özel yerel bir yetenek jetonu vardır.
- Satılabilir uygulamaya veya snapshot DB'sine yazmaz.

## 1) Köprüyü başlat

```bash
cd backend && npm run market:autopilot:bridge -- --port 8791 --window 02:00-10:00
```

İlk deneme için referans yüklemesini atlayabilirsiniz (her kart `NEW` sayılır):

```bash
cd backend && npm run market:autopilot:bridge -- --port 8791 --reference off
```

Başlangıç çıktısı bağlanma adresini, koşu dizinini ve **jeton dosyasının yolunu**
yazar. Jetonun kendisi normal günlüğe **yazılmaz**; dosyadan kopyalanır.

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
| Audi A4 / BMW / başka marka | Kuyruğa **hiç girmez**, sebebiyle `outOfScope` listesine yazılır |
| Audi A3 altındaki alt kategoriler | >1000 kuralı gerektiriyorsa **özyineleme devam eder** |
| Sayfa 4 | **Üretilmez**; gönderilse bile reddedilir |
| Sonuç sayısı okunamazsa | `UNKNOWN_COUNT` → koşu **DURUR** (`ERROR`), hiçbir şey tahmin edilmez |
| Alt kategori yapısı okunamazsa | `UNKNOWN_CATEGORY_STRUCTURE` → koşu **DURUR** |
| Snapshot DB | **Salt okunur**; gözlemler yalnızca staging JSONL'e yazılır |
| Koşu tam mı | Kapsamlı koşu tanımı gereği **HAYIR** — aylık tazeleme sayılamaz |

`--reference off` eklerseniz snapshot hiç açılmaz ve her kart `NEW` sayılır;
seçici doğrulaması için bu da yeterlidir.

## 2) Uzantıyı yükle

1. Chrome'da `chrome://extensions` adresini açın
2. Sağ üstten **Geliştirici modu**'nu açın
3. **Paketlenmemiş öğe yükle**'ye basın
4. Şu klasörü seçin:
   `C:\dev\NakitGaraj-market-refresh\chrome-extension\market-refresh-autopilot`

Chrome Web Store gerekmez.

## 3) Eşleştir ve başlat

1. Uzantı panelini açın, köprü adresini (`http://127.0.0.1:8791`) ve
   `bridge-token.txt` içeriğini yapıştırıp **Kaydet**'e basın
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
| `COMPLETE` | Kuyruk bitti (koşunun *tam* olup olmadığı ayrı gösterilir) |
| `ERROR` | Köprü/gezinme hatası; sessiz yeniden deneme yapılmaz |

**Koşu tam mı** alanı yalnızca şu durumda `EVET` olur: tüm bölümler tamamlandı,
bölünemeyen aşırı büyük düğüm yok, bloke/başarısız iş yok.

## Yetkiler neden bunlar

| Yetki | Sebep |
| --- | --- |
| `storage` | Köprü adresi/jetonu ve koşu bayrağı |
| `scripting` | Kaynak sekmesine gözlem betiğini enjekte etmek |
| `tabs` | Tek adanmış kaynak sekmesini yönetmek |
| `alarms` | MV3 servis çalışanı öldürülürse döngüyü ayağa kaldırmak |
| `https://www.sahibinden.com/*` | Kaynağı okumak |
| `http://127.0.0.1/*` | Yerel köprü |

Geniş `<all_urls>` veya `activeTab` istenmez.
