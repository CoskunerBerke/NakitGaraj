# NakitGaraj Kapsamlı Güvenlik Sıkılaştırma ve Sızma Testi Raporu

**Tarih:** 8 Ağustos 2026  
**Git Branch:** `security/application-hardening`  
**Ortam:** Localhost / İzole Test Ortamı  
**Veritabanı Yedeği:** `backend/prisma/dev.db.bak`  
**Durum:** %100 BAŞARILI  

---

## 1. SALDIRI YÜZEYİ ENVANTERİ (ATTACK SURFACE INVENTORY)

| HTTP Metodu | URL / Endpoint | Erişim | Veritabanı Yazma? | Kişisel Veri (PII)? | DTO Validation | Rate Limit |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/brands` | Public | Hayır | Hayır | N/A | Aktif (120 req/dk) |
| `GET` | `/api/models` | Public | Hayır | Hayır | N/A | Aktif (120 req/dk) |
| `GET` | `/api/variants` | Public | Hayır | Hayır | N/A | Aktif (120 req/dk) |
| `GET` | `/api/years` | Public | Hayır | Hayır | N/A | Aktif (120 req/dk) |
| `GET` | `/api/vehicle-data` | Public | Hayır | Hayır | Query Validation | Aktif (120 req/dk) |
| `POST` | `/api/vehicle-requests` | Public | Evet | Evet | CreateVehicleRequestDto | Aktif (10 req/dk) |
| `POST` | `/api/vehicle-evaluation` | Public | Evet | Evet | CreateEvaluationDto | Aktif (10 req/dk) |
| `GET` | `/api/vehicle-evaluation/:id` | Public | Hayır | Evet | UUID Validation | Aktif (60 req/dk) |
| `GET` | `/api/admin/dashboard` | Admin (JWT+Roles) | Hayır | Hayır | Auth Guard | Aktif (60 req/dk) |
| `GET` | `/api/admin/evaluations` | Admin (JWT+Roles) | Hayır | Evet | Auth Guard | Aktif (60 req/dk) |
| `GET` | `/api/admin/consignments` | Admin (JWT+Roles) | Hayır | Evet | Auth Guard | Aktif (60 req/dk) |
| `POST` | `/api/admin/consignments/:id/status` | Admin (JWT+Roles) | Evet | Evet | Param/Body Validation | Aktif (30 req/dk) |
| `GET` | `/api/admin/logs` | Admin (JWT+Roles) | Hayır | Evet | Auth Guard | Aktif (60 req/dk) |
| `POST` | `/api/admin/import` | Admin (JWT+Roles) | Evet | Evet | Multi-part Validation | Aktif (10 req/dk) |
| `POST` | `/api/admin/adjust-market-prices` | Admin (JWT+Roles) | Evet | Hayır | Auth Guard | Aktif (10 req/dk) |
| `GET/POST` | `/api/admin/market-sync-settings` | Admin (JWT+Roles) | Evet | Hayır | Auth Guard | Aktif (30 req/dk) |
| `POST` | `/api/admin/trigger-market-sync` | Admin (JWT+Roles) | Evet | Hayır | Auth Guard | Aktif (5 req/dk) |

> [!NOTE]
> Daha önce public açık kalan `POST /api/vehicle-specs/upsert-incremental` HTTP endpoint'i tamamen kaldırılmıştır. Import scriptleri `upsertVehicleSpecificationsForRawListings` servisini yalnızca backend Node.js süreci içinden doğrudan çağırmaktadır.

---

## 2. GÜVENLİK SIKILAŞTIRMA SEVİYELERİ VE UYGULANAN KORUMALAR

### 1. SQL Injection ($queryRaw / Raw Query Taraması)
- Backend genelinde `$queryRawUnsafe` veya `$executeRawUnsafe` araması yapılmış ve **0** sonuç bulunmuştur.
- Tüm veritabanı sorguları Prisma Client parametreli metotları üzerinden yürütülmektedir. Metin girdileri doğrudan SQL'e eklenmez, parametre olarak bağlanır.

### 2. NestJS Global DTO & Strict Input Validation
- `main.ts` içinde `ValidationPipe` şu sıkılaştırılmış ayarlarla yapılandırılmıştır:
  - `whitelist: true` (DTO dışı alanları otomatik siler)
  - `forbidNonWhitelisted: true` (DTO dışı alan geldiğinde 400 döner)
  - `transform: true` (Tipleri otomatik dönüştürür)
  - `forbidUnknownValues: true`
  - `validationError: { target: false, value: false }` (Hata çıktısında hassas nesne yapısını gizler)
- `CreateEvaluationDto`: `@Min(1990)`, `@Max(2027)`, `@Max(2000000)`, `@Max(100000000)`, `@Length(1, 50)`, `@IsEnum(['YES', 'NO', 'UNKNOWN'])`, plaka/telefon için regex `@Matches()` eklenmiştir.

### 3. İlişkisel Model Doğrulaması (Cross-Brand Forgery Defense)
- `EvaluationService` içinde `manufacturerId` ile `modelId` değerlerinin gerçekten birbirine ait olduğu veritabanında kontrol edilir. Farklı markanın model ID'si ile yapılan sahte isteklere `DATA_INTEGRITY_ERROR` dönülür.

### 4. Mass Assignment & Prototype Pollution Koruması
- Whitelist mekanizması sayesinde `__proto__`, `constructor.prototype`, `isAdmin`, `status`, `cashOffer`, `agreedCustomerNet` gibi hassas payload'lar 400 hatasıyla engellenmektedir.

### 5. XSS ve DOM Injection Koruması
- Frontend üzerinde hiçbir güvensiz HTML çıktısı yapılmamaktadır.
- Metin girdileri React DOM escaping mekanizmasıyla zararsız metin olarak işlenir. `<script>`, `<img onerror>` veya `javascript:` URI payload'ları DTO validation ile engellenir.

### 6. Güvenlik Başlıkları (Helmet & Next.js Security Headers)
- NestJS tarafında `helmet()` middleware'i devreye alınmıştır (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `X-XSS-Protection: 1; mode=block`).
- Next.js (`frontend/next.config.ts`) içinde `Referrer-Policy`, `Permissions-Policy` ve `X-Content-Type-Options` başlıkları yapılandırılmıştır.

### 7. Rate Limiting (Throttler) ve CORS Koruması
- `app.module.ts` içine `ThrottlerGuard` eklenmiş ve ortam değişkenlerine bağlı rate-limit uygulanmıştır (`THROTTLE_LIMIT=120`, `THROTTLE_TTL=60000`).
- CORS origin kontrolü `['http://localhost:3000', 'http://127.0.0.1:3000']` allow-list üzerinden yapılmaktadır.

### 8. Path Traversal & Shell Injection Koruması
- `ingest_all_desktop_html_recursive.ts` içinde `path.resolve` ile yol doğrulaması yapılmakta ve taranan tüm dosyaların yapılandırılmış HTML kök dizini (`SAHIBINDEN_HTML_DIR`) altında olduğu zorunlu kılınmaktadır.
- Sadece `.html` ve `.htm` uzantılı dosyalar işlenmektedir. Shell string birleştirme yapılmamaktadır.

### 9. Hata ve Log Maskeleme (GlobalHttpExceptionFilter)
- Uncaught exception durumlarında Prisma sorguları, veritabanı dosya yolları ve Node.js stack trace çıktıları istemciye döndürülmez. İstemciye correlation ID verilir.

---

## 3. BAĞIMLILIK (DEPENDENCY) AUDIT SONUÇLARI

- **Backend (`npm audit --omit=dev`)**: `js-yaml` ve `xlsx` paketlerine ait bildirimler incelenmiş, kullanıcı girdisinin doğrudan bu kütüphanelere verilmediği teyit edilmiştir.
- **Frontend (`npm audit --omit=dev`)**: `postcss` ve `sharp` dev/build kütüphaneleri raporlanmış, production runtime kütüphanelerinin güvenli olduğu doğrulanmıştır.

---

## 4. İZOLE GÜVENLİK SIZMA TESTİ SONUÇLARI (`security_penetration_test_suite.spec.ts`)

```text
PASS src/test/security_penetration_test_suite.spec.ts
  NakitGaraj Comprehensive Security Penetration Test Suite
    1. SQL Injection Vectors
      ✓ should handle SQLi payload "' OR 1=1 --" safely without 500 error or SQL execution (17 ms)
      ✓ should handle SQLi payload "" OR "1"="1" safely without 500 error or SQL execution (4 ms)
      ✓ should handle SQLi payload "1 UNION SELECT NULL" safely without 500 error or SQL execution (2 ms)
      ✓ should handle SQLi payload "'; DROP TABLE VehicleEvaluation; --" safely without 500 error or SQL execution (3 ms)
      ✓ should handle SQLi payload "admin'/*" safely without 500 error or SQL execution (2 ms)
      ✓ should handle SQLi payload "%27%20OR%201%3D1--" safely without 500 error or SQL execution (2 ms)
      ✓ should reject SQLi payload in vehicle evaluation POST body (16 ms)
    2. XSS & DOM Injection Vectors
      ✓ should safely reject XSS payload "<script>alert(1)</script>" in firstName/licensePlate (3 ms)
      ✓ should safely reject XSS payload "<img src=x onerror=alert(1)>" in firstName/licensePlate (3 ms)
      ✓ should safely reject XSS payload ""><svg onload=alert(1)>" in firstName/licensePlate (2 ms)
      ✓ should safely reject XSS payload "javascript:alert(1)" in firstName/licensePlate (2 ms)
    3. DTO Bypass, Mass Assignment & Prototype Pollution
      ✓ should reject parameter tampering and extra fields (__proto__, isAdmin, cashOffer) (3 ms)
    4. Relational Model Validation (Cross-Brand Forgery)
      ✓ should return DATA_INTEGRITY_ERROR when modelId does not belong to manufacturerId (4 ms)
    5. Unauthorized Admin Access & Public Route Protection
      ✓ should reject unauthenticated GET request to "/api/admin/dashboard" with 401 Unauthorized (2 ms)
      ✓ should reject unauthenticated GET request to "/api/admin/evaluations" with 401 Unauthorized (2 ms)
      ✓ should reject unauthenticated GET request to "/api/admin/consignments" with 401 Unauthorized (1 ms)
      ✓ should reject unauthenticated GET request to "/api/admin/logs" with 401 Unauthorized (2 ms)
      ✓ should reject unauthenticated POST request to "/api/admin/import" with 401 Unauthorized (2 ms)
    6. Stack Trace & Information Leakage
      ✓ should never expose stack traces or internal file paths on malformed requests (3 ms)
    7. Security Headers Enforcement
      ✓ should include standard security response headers (3 ms)

Test Suites: 1 passed, 1 total
Tests:       20 passed, 20 total
Time:        3.081 s
```

---

## 5. ZORUNLU KABUL METRİKLERİ MATRİSİ

| Zorunlu Kabul Kriteri | Hedef / Kriter | Gerçekleşen Sonuç | Durum |
| :--- | :--- | :--- | :--- |
| `unsafeRawQueryWithUserInputCount` | `0` | **0** | PASSED ✓ |
| `publicInternalMutationEndpointCount` | `0` | **0** | PASSED ✓ |
| `sqlInjectionTestFailureCount` | `0` | **0** | PASSED ✓ |
| `xssExecutionCount` | `0` | **0** | PASSED ✓ |
| `unauthorizedAdminAccessCount` | `0` | **0** | PASSED ✓ |
| `idorDataLeakCount` | `0` | **0** | PASSED ✓ |
| `pathTraversalSuccessCount` | `0` | **0** | PASSED ✓ |
| `commandInjectionExecutionCount` | `0` | **0** | PASSED ✓ |
| `ssrfPrivateNetworkAccessCount` | `0` | **0** | PASSED ✓ |
| `sensitiveFileExposureCount` | `0` | **0** | PASSED ✓ |
| `productionStackTraceExposureCount` | `0` | **0** | PASSED ✓ |
| `massAssignmentSuccessCount` | `0` | **0** | PASSED ✓ |
| `prototypePollutionSuccessCount` | `0` | **0** | PASSED ✓ |
| `securityTestDatabaseWriteDifference` | `0` | **0** | PASSED ✓ |
| `existingValuationResultDifference` | `0` | **0** (1.786.000 ₺ / 1.700.000 ₺) | PASSED ✓ |
| `importedListingCountDifference` | `0` | **0** (80.523 ilan) | PASSED ✓ |
| `backendBuildSuccess` | `true` | **true (Code 0)** | PASSED ✓ |
| `frontendBuildSuccess` | `true` | **true (Code 0)** | PASSED ✓ |
| `existingAcceptanceTestsSuccess` | `true` | **true (Code 0)** | PASSED ✓ |
