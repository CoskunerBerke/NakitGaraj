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
# 1. Paket listelerini güncelle ve Node.js & NPM'i kur (Node.js v20 önerilir)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
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
cp .env.example .env           # Ardından .env içinde JWT_SECRET, ADMIN_PASSWORD ve CORS_ORIGIN değerlerini doldurun
                               # (JWT_SECRET üretmek için: openssl rand -hex 32)
                               # JWT_SECRET yoksa veya "change-me" gibi örnek değerse backend production'da başlamaz;
                               # ADMIN_PASSWORD yoksa seed hata verir.
                               # CORS_ORIGIN=https://tasit.nakitgaraj.com (kendi alan adınız)
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
                               # bu isteği "mixed content" olarak engeller. Değer derleme sırasında gömülür.
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
*   `pm2 restart all` : Her iki servisi de yeniden başlatır.
*   `pm2 save` ve `pm2 startup` : Sunucu resetlendiğinde servislerin otomatik açılmasını sağlar.

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
*   Eski sürümlerde `ecosystem.config.js` içinde sabit bir `JWT_SECRET` vardı; o değeri kullandıysanız yenisiyle değiştirip `pm2 restart all` yapın (tüm oturumlar kapanır).
*   Port 3001'i dış dünyaya açmanız gerekmez; API'ye Nginx `/api` üzerinden erişilir.

Artık siteniz HTTPS protokollü, veri tabanı arkada güvenle çalışan ve PM2 ile 7/24 kapanmadan çalışan profesyonel bir canlı sunucu ortamına taşınmış durumdadır!
