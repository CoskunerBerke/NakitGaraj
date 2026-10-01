# NakitGaraj - Sunucuya Taşıma ve Canlıya Alma Kılavuzu (Production Deployment Guide)

Bu kılavuz, yerel bilgisayarınızda çalışan NakitGaraj projesini (Frontend ve Backend) bir Linux VPS sunucusuna (Ubuntu 22.04/24.04 vb.) nasıl taşıyacağınızı, FileZilla ile yükleme yaparken nelere dikkat etmeniz gerektiğini ve sunucu üzerinde PM2 ve Nginx ile projeyi nasıl yayına alacağınızı adım adım açıklamaktadır.

---

## 📁 1. Projeyi Dosya Transferine (FileZilla) Hazırlama

Sunucuya yükleme yaparken gereksiz ve ağır dosyaları (örneğin binlerce ufak dosyadan oluşan `node_modules` klasörlerini) **kesinlikle yüklememelisiniz**. Bunlar sunucu üzerinde komutla kurulacaktır.

### FileZilla'da Sunucuya **YÜKLENMEYECEK** Klasörler (Yoksayılacaklar):
*   `node_modules` (Hem frontend hem backend içindeki)
*   `.next` (Frontend içindeki Next.js derleme klasörü - sunucuda sıfırdan derlenecek)
*   `dist` (Backend derleme klasörü - sunucuda derlenecek)
*   `.git` veya IDE dosyaları (örneğin `.vscode`)

### Yüklenecek Dosya Yapısı:
Proje ana dizinindeki tüm dosyaları (`ecosystem.config.js` dahil) ve `frontend`, `backend` klasörlerini (yukarıdaki klasörleri hariç tutarak) FileZilla ile sunucunuzdaki `/var/www/nakitgaraj` klasörüne yükleyin.

---

## ⚙️ 2. Sunucu Kurulumu (İlk Kurulum)

Sunucunuza SSH (Putty veya Terminal) ile bağlandıktan sonra gerekli araçları kurun:

```bash
# 1. Paket listelerini güncelle ve Node.js & NPM'i kur (Node.js 22 önerilir; en az 20.19 veya 22.13,
#    çünkü backend bağımlılığı jsdom 29 daha eski sürümlerde çalışmaz)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential

# 2. PM2 (Process Manager) kur (Arka planda servislerin sürekli çalışmasını sağlar)
sudo npm install --global pm2

# 3. Nginx Web Sunucusunu kur
sudo apt-get install -y nginx
```

---

## 🚀 3. Projenin Sunucuda Derlenmesi (Build)

FileZilla ile yüklediğiniz dizine terminalden gidin:

```bash
cd /var/www/nakitgaraj

# --- BACKEND KURULUMU ---
cd backend
cp .env.example .env           # Ardından .env içinde JWT_SECRET ve ADMIN_PASSWORD değerlerini doldurun
                               # (JWT_SECRET üretmek için: openssl rand -hex 32)
                               # JWT_SECRET yoksa veya "change-me" gibi örnek değerse backend production'da başlamaz;
                               # depo geçmişinde görünen eski JWT anahtarlarıyla hiçbir ortamda başlamaz.
                               # ADMIN_PASSWORD yoksa seed hata verir.
                               # CORS_ORIGIN boşsa production'da başka sitelerden gelen (cross-origin) tarayıcı
                               # istekleri reddedilir; site API'ye aynı alan adından (Nginx /api) ulaştığı için
                               # bu yeterlidir. API'yi başka bir alan adı çağıracaksa virgülle ayırarak yazın,
                               # örn. CORS_ORIGIN=https://tasit.nakitgaraj.com
                               # NODE_ENV=production değerini PM2 (ecosystem.config.js) verir.
npm install --production=false # Geliştirici paketlerini de kur ki derleyebilsin
npx prisma generate            # Prisma istemcisini oluştur
npx prisma db push             # SQLite dev.db veri tabanını oluştur ve şemayı bas
npx prisma db seed             # Başlangıç markalarını, modellerini ve admini içeri aktar
npm run build                  # NestJS kodunu dist/ klasörüne derle
cd ..

# --- FRONTEND KURULUMU ---
cd frontend
npm install
NEXT_PUBLIC_API_URL=/api npm run build   # Next.js uygulamasını production için derle
                               # NEXT_PUBLIC_API_URL=/api: tarayıcı API'ye Nginx üzerinden (aynı alan adı, HTTPS)
                               # ulaşır. Verilmezse http://<alan-adı>:3001/api kullanılır; HTTPS sitede tarayıcı
                               # bu isteği "mixed content" olarak engeller, CORS_ORIGIN boşsa backend de reddeder.
                               # Değer derleme sırasında gömülür.
cd ..
```

---

## ⚡ 4. PM2 İle Servisleri Arka Planda Başlatma

Proje ana dizinindeyken (`/var/www/nakitgaraj`) aşağıdaki komutla hem frontend hem de backend uygulamasını tek seferde PM2 servisi olarak başlatın:

```bash
pm2 start ecosystem.config.js
```

### Yararlı PM2 Komutları:
*   `pm2 status` : Çalışan servisleri listeler.
*   `pm2 logs` : Hataları ve logları canlı izlemenizi sağlar.
*   `pm2 restart all` : Her iki servisi de yeniden başlatır. Süreçlerin ortam değişkenlerini değiştirmez (aşağıya bakın).
*   `pm2 save` ve `pm2 startup` : Sunucu resetlendiğinde servislerin otomatik açılmasını sağlar.

### Eski Bir Kurulumu Güncelleme (Sabit JWT_SECRET)

Eski sürümlerde `ecosystem.config.js`, backend'e sabit bir `JWT_SECRET` veriyordu. Bu değer depo geçmişinde herkese açık olduğu için backend artık onunla başlamaz ("Rotate your JWT_SECRET" hatası verir). Sunucu böyle bir dosyayla başlatıldıysa `backend/.env` dosyasını düzenleyip `pm2 restart` yapmak yetmez:

*   PM2 bir süreci, ilk başlatıldığı ortam değişkenleriyle saklar. `pm2 restart` (`--update-env` ile de), süreç zaten varken `pm2 start ecosystem.config.js` ve sunucu yeniden açılınca `pm2 resurrect`, eski `JWT_SECRET` değerini silmez.
*   Süreç ortamındaki (PM2 ya da sunucu ortamı) `JWT_SECRET`, `backend/.env` içindeki değerin önüne geçer.

Bu durumda backend başlamaz ve PM2 onu sürekli yeniden başlatır. Yeni kodu yükleyip derledikten sonra proje ana dizininde:

```bash
cd /var/www/nakitgaraj
openssl rand -hex 32             # Çıkan değeri backend/.env içine JWT_SECRET=<değer> olarak yazın
printenv JWT_SECRET              # Eski değeri göstermemeli (normalde boştur): pm2 start, komutu çalıştırdığınız
                                 # shell'in ortamını da kopyalar. Eski değer görünüyorsa ~/.bashrc veya
                                 # /etc/environment gibi yerlerden kaldırıp yeni bir oturum açın.
pm2 delete nakitgaraj-backend && pm2 start ecosystem.config.js --only nakitgaraj-backend && pm2 save
pm2 status                       # Birkaç saniye sonra nakitgaraj-backend "online" olmalı ve ↺ (yeniden başlatma) sayısı 0 kalmalı
```

`pm2 save`, kayıtlı süreç listesini (`~/.pm2/dump.pm2`) yeni ortamla günceller; atlanırsa sunucu yeniden açıldığında `pm2 resurrect` eski `JWT_SECRET` değerini geri getirir. Bu adımlar eski dosyadaki `CORS_ORIGIN: 'http://localhost:3000'` değerini de PM2 ortamından kaldırır. Anahtar değiştiği için açık admin oturumları kapanır; yeniden giriş yapın.

---

## 🔒 5. Nginx Ters Proxy (Reverse Proxy) & SSL Kurulumu

Nginx, internetten gelen ziyaretçileri (Port 80/443) arka planda çalışan PM2 servislerine (Port 3000 ve Port 3001) yönlendirir.

### Nginx Konfigürasyonu Oluşturma:
```bash
sudo nano /etc/nginx/sites-available/nakitgaraj
```

Aşağıdaki şablonu yapıştırın (alan adınızı `tasit.nakitgaraj.com` yerine yazın):

```nginx
server {
    listen 80;
    server_name tasit.nakitgaraj.com; # Kendi domaininizi yazın

    # Next.js Frontend Yönlendirmesi
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # NestJS Backend API Yönlendirmesi
    location /api {
        proxy_pass http://localhost:3001/api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        # Gerçek istemci IP'si (giriş denemesi sınırı ve işlem kayıtları için)
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Konfigürasyonu Aktif Etme ve SSL (HTTPS) Kurulumu:
```bash
# Konfigürasyonu aktif et
sudo ln -s /etc/nginx/sites-available/nakitgaraj /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Ücretsiz SSL (Certbot Let's Encrypt) Kurulumu
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tasit.nakitgaraj.com # Domaininizi yazın
```

---

## 🔐 6. Güvenlik Kontrol Listesi

*   `backend/.env` dosyasını asla Git'e eklemeyin; `JWT_SECRET` için rastgele bir değer kullanın (`openssl rand -hex 32`).
*   Daha önce `Admin123!` / `ChangeMe123!` gibi varsayılan şifrelerle kurulum yaptıysanız admin şifresini panelden (Çalışanlar & Yetki) veya `ADMIN_PASSWORD` ile `npx prisma db seed` çalıştırarak değiştirin.
*   Eski sürümlerde `ecosystem.config.js` içinde sabit bir `JWT_SECRET`, auth modülünde de yedek bir değer vardı; ikisi de depo geçmişinde herkese açık. Backend artık bu iki değerden biriyle başlamaz ("Rotate your JWT_SECRET" hatası verir). Sunucunuzda hâlâ biri varsa `openssl rand -hex 32` ile yeni bir değer üretip `backend/.env` içine yazın ve backend'i PM2'de silip yeniden başlatın (`pm2 restart` yetmez, çünkü PM2 eski değeri saklar ve bu değer `backend/.env` içindekinin önüne geçer). Adımlar 4. bölümdeki "Eski Bir Kurulumu Güncelleme" başlığında (tüm oturumlar kapanır).
*   `CORS_ORIGIN` boşken production'da API başka sitelerden gelen tarayıcı isteklerine cevap vermez; yalnızca gerçekten gereken alan adlarını yazın.
*   Port 3001'i dış dünyaya açmanız gerekmez; API'ye Nginx `/api` üzerinden erişilir.

Artık siteniz HTTPS protokollü, veri tabanı arkada güvenle çalışan ve PM2 ile 7/24 kapanmadan çalışan profesyonel bir canlı sunucu ortamına taşınmış durumdadır!
