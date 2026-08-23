import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CacheService } from '../cache.service';
import {
  BODY_TYPE_LABELS,
  CANONICAL_BODY_TYPES,
  deriveBodyType,
  explicitEngineSignature,
  foldTurkish,
  isEngineCompatible,
  modelNameMatches,
  splitVariantString,
} from '../evaluation/listing-attributes';
import { PRICING_LIMITS } from '../evaluation/pricing-config';

/**
 * Musteriye SUNULAMAYACAK kadar bozuk model adi mi?
 *
 * Yalnizca ayristirma artigi olan adlar elenir: sayfa basligi kalintilari
 * ("... sahibinden.com'da", "Fiyatlari", "Modelleri", ".html"), kod cozme
 * bozulmasi tasiyan tokenlar ve hic harf/rakam icermeyen adlar.
 *
 * MODEL ADININ SONUNDAKI "-<rakam>" ARTIK ELENMEZ. O desen sayfa numarasi
 * ("... - 10") icin yazilmisti, ama gercek model kimliginin parcasi olabilir:
 *   Saab 9-3 · Saab 9-5 · Proton Gen-2
 * Olculen (final korpus, 841 marka/model): bu desen yalniz bu UC gercek modeli
 * yakaliyordu, tek bir sayfa-numarasi artigi bile yakalamiyordu. Sayfa numarasi
 * temizligi zaten ICE AKTARIMDA ve yalniz SAYFA BASLIGI yolunda yapilir
 * (listing-attributes: cleanPageTitle vs cleanRowModel).
 *
 * Kalici `canonicalModel` degeri artik gercek arac modelidir; okuma katmani
 * ice aktarim temizligini TEKRARLAMAZ.
 */
export function isUnusableModelName(name: string): boolean {
  const raw = String(name ?? '');
  const t = foldTurkish(raw);
  if (!t.trim()) return true;
  // "sahibind" (kirpilmis "sahibinden") de sayfa basligi kalintisidir.
  if (t.includes('sahibind') || t.includes('fiyatlar') || t.includes('modelleri')) return true;
  if (t.includes('.html')) return true;
  if (/[─-▟�]/.test(raw)) return true;
  // Hic harf/rakam tasimayan ad (orn. "_ -") gercek bir model degildir.
  if (!/[a-z0-9]/.test(t)) return true;

  // SAYFA BASLIGI KALINTI SINIFI (olculdu, asagida).
  //
  // Sahibinden sayfa basligi "<Model> 2.El Arabalar ve Satılık Sıfır Km
  // Otomobil ..." bicimindedir. Eski bir katalog tohumlama yolu bu basligi
  // farkli noktalardan kirparak Model SATIRLARI uretmis:
  //   "500e 2.El Arabalar ve S"
  //   "500e 2.El Arabalar ve Satılık Sıfır Km Otomobil"
  //   "500e ve"            (baslik "ve" baglacindan hemen sonra kirpilmis)
  //   "Qute RE 60 ve"
  // Ham ilan verisi (RawVehicleListing.canonicalModel) TEMIZDIR: ayni
  // araclar orada dogru adla durur (Abarth -> "500e", Bajaj -> "Qute RE 60").
  //
  // Olculen (382 katalog Model adi + 841 gozlenen marka/model cifti):
  // asagidaki imzalar TAM OLARAK bu 4 katalog artigini yakalar; gozlenen
  // veride 0 isabet, mesru kayip 0 (Saab 9-3/9-5, Proton Gen-2, 500e,
  // Qute RE 60 dahil hicbiri takilmaz).
  if (t.includes('2.el') || t.includes('satilik') || t.includes('sifir km') || t.includes('arabalar')) {
    return true;
  }

  // Kirpilmis baglac artigi: COK tokenli adin SON tokeni YALIN "ve"/"&" ise.
  // Bu, yukaridaki baslik sinifinin baglactan hemen sonra kirpilmis halidir.
  // Genel bir "ve ile biten kelime" yasagi DEGILDIR: token esitligi arandigi
  // icin "Evoque" gibi -ve/-e ile biten adlar ya da tek tokenli adlar
  // etkilenmez. Hicbir gercek arac modeli yalin bir baglacla bitmez.
  const tokens = t.trim().split(/\s+/);
  const last = tokens[tokens.length - 1];
  if (tokens.length > 1 && (last === 've' || last === '&')) return true;

  return false;
}

/**
 * Ad, TEK BASINA bir kasa etiketi mi? ("Coupe", "Sedan", "Cabrio", ...)
 *
 * Kasa adi tek basina model OLMAYABILIR ama OLABILIR de: ayni katalogda hem
 * Abarth "Coupe" (artik: 500e'nin donanimi model sanilmis, ham veride 0 ilan)
 * hem Fiat "Coupe" (GERCEK tarihi model, ham veride 8 ilan) var. Bu yuzden bu
 * yardimci tek basina eleme YAPMAZ; okuma katmani gercek ilan destegiyle
 * birlikte karar verir (bkz. getModels). Ada bakip "Coupe'yi sil" demek
 * Fiat'in gercek modelini yok ederdi.
 */
export function isBodyTypeOnlyModelName(name: string): boolean {
  const t = foldTurkish(String(name ?? '')).trim();
  return Object.values(BODY_TYPE_LABELS).some((label) => foldTurkish(label) === t);
}

@Injectable()
export class VehicleService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  private async withRetry<T>(fn: () => Promise<T>, retries = 5, delay = 150): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (err: any) {
        if (i === retries - 1) throw err;
        if (err?.code === 'P1008' || err?.message?.includes('timed out') || err?.message?.includes('locked')) {
          await new Promise((r) => setTimeout(r, delay * (i + 1)));
        } else {
          throw err;
        }
      }
    }
    throw new Error('Database operation timed out');
  }

  async getBrands() {
    const DESKTOP_DIR = 'C:\\Users\\berke\\OneDrive\\Masaüstü\\sahibindne ilan';
    let validNames: string[] = [];
    try {
      const fs = require('fs');
      const path = require('path');
      if (fs.existsSync(DESKTOP_DIR)) {
        validNames = fs.readdirSync(DESKTOP_DIR).filter((d: string) => {
          const p = path.join(DESKTOP_DIR, d);
          return fs.statSync(p).isDirectory();
        });
      }
    } catch (e) {}

    const catalog = await this.withRetry(() =>
      this.prisma.manufacturer.findMany({
        where: validNames.length > 0 ? {
          name: {
            in: validNames,
          },
        } : undefined,
        orderBy: { name: 'asc' },
      }),
    );
    // Gercek ilani olan ama katalogda bulunmayan markalar kaybolmaz.
    const observed = await this.getObservedMakes();
    return this.mergeObserved(catalog, observed);
  }

  async getModels(brandId: string, year?: number) {
    const numYear = year ? Number(year) : null;
    // Gozlenen (gercek ilan) secenekleriyle birlestigi icin korpus surumu ile damgalanir.
    const cacheKey = await this.versionedKey(numYear ? `models:${brandId}:${numYear}` : `models:${brandId}:all`);
    const cached = await this.cache.get<any[]>(cacheKey);
    if (cached) return cached;

    let models: any[] = [];
    if (numYear) {
      const manufacturer = await this.prisma.manufacturer.findUnique({
        where: { id: brandId },
        select: { name: true }
      });

      const specs = await this.prisma.vehicleSpecification.findMany({
        where: { manufacturerId: brandId, year: numYear },
        select: { modelId: true }
      });
      const validModelIds = new Set(specs.map(s => s.modelId));

      if (manufacturer) {
        const rawListings = await this.prisma.rawVehicleListing.findMany({
          where: { canonicalMake: manufacturer.name, year: numYear },
          select: { canonicalModel: true }
        });
        const rawModelNames = Array.from(new Set(rawListings.map(r => r.canonicalModel).filter(Boolean)));
        if (rawModelNames.length > 0) {
          const matchingModels = await this.prisma.model.findMany({
            where: {
              manufacturerId: brandId,
              name: { in: rawModelNames }
            },
            select: { id: true }
          });
          matchingModels.forEach(m => validModelIds.add(m.id));
        }
      }

      if (validModelIds.size > 0) {
        models = await this.withRetry(() =>
          this.prisma.model.findMany({
            where: { manufacturerId: brandId, id: { in: Array.from(validModelIds) } },
            orderBy: { name: 'asc' },
          }),
        );
      } else {
        models = await this.withRetry(() =>
          this.prisma.model.findMany({
            where: { manufacturerId: brandId },
            orderBy: { name: 'asc' },
          }),
        );
      }
    } else {
      models = await this.withRetry(() =>
        this.prisma.model.findMany({
          where: { manufacturerId: brandId },
          orderBy: { name: 'asc' },
        }),
      );
    }

    // Ayristirma artigi tasiyan katalog adlari musteriye sunulmaz. Filtre
    // gozlenen katalogla AYNI yardimciyi kullanir: iki okuma yolunun ayrisip
    // farkli modelleri elemesi engellenmis olur.
    let filtered = models.filter((m) => !isUnusableModelName(m.name));

    // Gercek ilani olan ama katalogda Model kaydi bulunmayan modeller
    // (orn. 8.494 ilanlik Fiat Egea) musteri formunda kaybolmaz.
    const brand = await this.prisma.manufacturer.findUnique({
      where: { id: brandId }, select: { name: true },
    }).catch(() => null);
    const makeName = this.decodeObservedId(brandId) || brand?.name;

    let merged = filtered;
    if (makeName) {
      const observed = await this.getObservedModels({ make: makeName, year: numYear ?? undefined });

      // YIL PENCERESI DESTEGI: yil secildiyse model ancak o yilin +/-2
      // penceresinde gercek ilani varsa sunulur (degerleme bu pencereyi
      // kullanir). Olculen: "A3 Hatchback" 2023 icin sunuluyor ama tum
      // ilanlari 2005-2012 araligindaydi -> fiyatlanamayan yaprak.
      if (numYear) {
        const supported = await this.modelsWithSupportInWindow(makeName, numYear);
        filtered = filtered.filter((m) => supported.some((s) => this.modelMatchesTarget(s, String(m.name || ''))));
      }

      // KASA ADI TEK BASINA MODEL DEGILSE GIZLENIR — GERCEK ILAN DESTEGIYLE.
      //
      // Ayni tohumlama hatasi, donanim seviyesini model sanip "Coupe" adinda
      // katalog satiri da uretmis (Abarth: tek spec, ham veride model olarak
      // 0 ilan; "Coupe" orada 500e'nin DONANIMI). Ada bakarak eleme YAPILMAZ,
      // cunku ayni ad gercek model de olabilir: Fiat "Coupe" tarihi bir
      // modeldir ve ham veride 8 gercek ilani vardir.
      //
      // Kural bu yuzden veri gudumludur: kasa etiketiyle AYNI ada sahip
      // katalog modeli, o marka icin gozlenen (gercek ilan) modeller arasinda
      // YOKSA gizlenir. Olculen: tum katalogda adi tam kasa etiketi olan
      // yalniz 2 satir var — Abarth "Coupe" (0 ilan -> gizlenir) ve
      // Fiat "Coupe" (8 ilan -> kalir). Marka adi kodda GECMEZ.
      const observedNames = new Set(observed.map((o: any) => foldTurkish(String(o.value ?? ''))));
      filtered = filtered.filter(
        (m) => !(isBodyTypeOnlyModelName(m.name) && !observedNames.has(foldTurkish(m.name))),
      );

      merged = this.mergeObserved(filtered, observed);
    }

    await this.cache.set(cacheKey, merged, 3600);
    return merged;
  }

  async getVariants(modelId: string, brandId?: string, year?: number) {
    const numYear = year ? Number(year) : null;
    const cacheKey = await this.versionedKey(numYear && brandId ? `variants:${brandId}:${numYear}:${modelId}` : `variants:${modelId}`);
    const cached = await this.cache.get<any[]>(cacheKey);
    if (cached) return cached;

    let variants: any[] = [];
    if (numYear && brandId) {
      const specs = await this.prisma.vehicleSpecification.findMany({
        where: { manufacturerId: brandId, modelId: modelId, year: numYear },
        select: { variantId: true }
      });
      const validVariantIds = new Set(specs.map(s => s.variantId));

      if (validVariantIds.size > 0) {
        variants = await this.withRetry(() =>
          this.prisma.variant.findMany({
            where: { modelId: modelId, id: { in: Array.from(validVariantIds) } },
            orderBy: { name: 'asc' },
          }),
        );
      }
    }

    if (variants.length === 0) {
      variants = await this.withRetry(() =>
        this.prisma.variant.findMany({
          where: { modelId },
          orderBy: { name: 'asc' },
        }),
      );
    }

    // Gercek ilanlarda gorulen motorlar (katalog variant yoksa bile)
    const names = await this.resolveNames({ brandId, modelId });
    const observedEngines = names.make && names.model
      ? await this.getObservedEngines({ make: names.make, model: names.model, year: numYear ?? undefined })
      : [];

    // GOZLENEN ILISKI KAPISI (katalog sozlesmesi): bir motor/versiyon secenegi
    // ancak o marka+model ailesinin GERCEK ilanlarinda karsiligi varsa sunulur.
    // Olculen (26.607 uc yaprak): katalogdaki "Standart", "147 5 Kapi",
    // "Eco Elegance" gibi motor TASIMAYAN etiketler ile ailede hic gorulmeyen
    // motorlar, fiyatlanamayan 7.600+ sahte yaprak uretiyordu.
    if (names.make && names.model) {
      const family = await this.familyIdentities(names.make, names.model);
      const familyHasEngine = family.some((r) => Boolean(r.engine));
      variants = variants.filter((v) => {
        const name = String(v.name || '');
        const evidence = this.variantEngineEvidence(name);
        const body = deriveBodyType(name);
        if (evidence) {
          return family.some((r) => this.admissible(r, evidence, body, '', numYear));
        }
        // Motor tasimayan etiket yalnizca ailenin kendisi de motor kaniti
        // tasimiyorsa yer tutucu olarak kalir (orn. elektrikli tek versiyon).
        // Aile gercek motorlar iceriyorsa onlar sunulur; uydurma etiket degil.
        if (familyHasEngine) return false;
        return family.some((r) => this.admissible(r, '', body, '', numYear));
      });
    }
    variants = this.mergeObserved(variants, observedEngines);

    if (variants.length === 0) {
      variants = [{ id: 'UNKNOWN', name: 'UNKNOWN', modelId }];
    }

    await this.cache.set(cacheKey, variants, 3600);
    return variants;
  }

  async getPackages(variantId: string, modelId?: string, brandId?: string, year?: number) {
    const numYear = year ? Number(year) : null;
    const cacheKey = await this.versionedKey(numYear && brandId && modelId
      ? `packages:${brandId}:${numYear}:${modelId}:${variantId}`
      : `packages:${variantId}`);
    const cached = await this.cache.get<any[]>(cacheKey);
    if (cached) return cached;

    let packages: any[] = [];
    if (numYear && brandId && modelId) {
      const specs = await this.prisma.vehicleSpecification.findMany({
        where: { manufacturerId: brandId, modelId: modelId, variantId: variantId, year: numYear },
        select: { packageId: true }
      });
      const validPackageIds = new Set(specs.map(s => s.packageId).filter(Boolean) as string[]);

      packages = await this.withRetry(() =>
        this.prisma.package.findMany({
          where: { variantId: variantId, id: { in: Array.from(validPackageIds) } },
          orderBy: { name: 'asc' },
        }),
      );
    } else {
      packages = await this.withRetry(() =>
        this.prisma.package.findMany({
          where: { variantId },
          orderBy: { name: 'asc' },
        }),
      );
    }

    // Gercek ilanlarda gorulen paketler (katalog package yoksa bile).
    // GOZLENEN ILISKI KAPISI: paketler, secilen motorla BIRLIKTE gorulmus
    // ilanlardan gelir; modelin tum paketlerinin bagimsiz carpimi degil.
    // Onceki surum motor alani eslesmeyince modelin TUM paketlerine dusuyordu
    // (Audi A3 Sedan 35 TFSI icin 38 ilgisiz secenek).
    const pkgNames = await this.resolveNames({ brandId, modelId, variantId });
    const observedTrims = pkgNames.make && pkgNames.model
      ? await this.getObservedTrims({ make: pkgNames.make, model: pkgNames.model, engine: pkgNames.engine, year: numYear ?? undefined })
      : [];
    if (pkgNames.make && pkgNames.model) {
      const evidence = this.variantEngineEvidence(pkgNames.engine || '');
      if (!evidence) {
        // Motor bilinmiyorsa paket tek ayirt edicidir: katalog paketi ancak
        // gercek ilanlarda gorulen bir donanimla ORTUSUYORSA sunulur.
        const observedKeys = observedTrims.map((o) => foldTurkish(o.value));
        packages = packages.filter((pk) => {
          const name = foldTurkish(String(pk.name || ''));
          return observedKeys.some((k) => k === name || k.includes(name) || name.includes(k));
        });
      }
    }
    const mergedPackages = this.mergeObserved(packages, observedTrims);

    await this.cache.set(cacheKey, mergedPackages, 3600);
    return mergedPackages;
  }

  /**
   * MUSTERI ARAC KATALOGU — GERCEK ILAN VERISINDEN (salt-okunur)
   *
   * Tek gercek kaynak RawVehicleListing'dir: kullanicinin elle topladigi
   * Sahibinden sayfalarindan turetilen canonical marka/model/motor/paket/yil/
   * kasa degerleri. VehicleSpecification yalnizca teknik zenginlestirme
   * (hp/tork/motor hacmi) icin kullanilir; katalogda kayit olmamasi gercek bir
   * araci musteri formundan DUSUREMEZ.
   *
   * Olculen (bu surumden once): 443 gercek marka/model kombinasyonundan 151'i
   * (40.634 ilan, %22,7) katalog eksikligi yuzunden secilemiyordu — orn. 8.494
   * ilanlik Fiat Egea'nin katalogda hic Model kaydi yok.
   */

  /**
   * Model adi eslesmesi — SINIR (boundary) duyarli.
   * "A3" -> "A3 A3 Sportback" / "A3 Hatchback" eslesir (token siniri),
   * ancak alakasiz bir dizenin ICINDEKI "a3" eslesmez.
   * NOT: Bu kural yalnizca SECENEK KESFI icindir; emsal eslestiricinin
   * havuz kurali bilerek DEGISTIRILMEMISTIR (fiyat motoru donduruldu).
   */
  /** Degerleme motoruyla AYNI model kurali (listing-attributes.modelNameMatches). */
  private modelMatchesTarget(candidate: string, target: string): boolean {
    return modelNameMatches(candidate, target);
  }

  /**
   * Canonical model adini UI etiketine cevirir.
   *  - tekrar eden token'lari sadelestirir: "A3 A3 Sportback" -> "A3 Sportback"
   *  - sayfa basligi artiklarini atar: "190 Fiyatlari" -> "190"
   *
   * NOT: Kullanicinin kaydettigi bazi DOSYA ADLARI bozuk kodlanmis karakter
   * icerir ("Fiyatlar─▒"), bu da canonical model adina tasinmistir
   * (138 model adi / 15.820 ilan, tamami Mercedes-Benz). Etiket bu artiklari
   * karakter bozulmasindan BAGIMSIZ olarak temizler; eslestirmede kullanilan
   * canonical `value` degeri ise oldugu gibi korunur.
   */
  private displayModelLabel(canonical: string): string {
    const parts = (canonical || '').trim().split(/\s+/);
    const kept: string[] = [];
    for (const raw of parts) {
      const t = foldTurkish(raw);
      // basligin "Fiyatlari & Modelleri sahibinden.com'da" artigi
      if (/^fiyatlar/.test(t) || /^modell?eri$/.test(t) || /^&$/.test(t)) continue;
      if (/sahibinden/.test(t) || /\.html$/.test(t)) continue;
      // bozuk kodlanmis (metin olmayan) token
      if (/^[─-▟�]+$/.test(raw)) continue;
      if (kept.length && foldTurkish(kept[kept.length - 1]) === t) continue;
      kept.push(raw);
    }
    return (kept.join(' ') || canonical).trim();
  }

  /**
   * Gercek ilan verisinden gelen ancak katalogda karsiligi olmayan secenekler
   * "OBS:<canonical deger>" kimligiyle sunulur. Boylece mevcut sihirbaz akisi
   * (id tabanli) degismeden gercek araclar secilebilir hale gelir.
   */
  private static readonly OBS = 'OBS:';

  /**
   * KORPUS SURUMU — dinamik veri kaynagi icin onbellek gecerliligi.
   *
   * Kullanici yeni marka klasorleri ve HTML dosyalari eklemeye devam ediyor.
   * Gozlenen katalog uclarinda 1 saatlik TTL onbellek var; yeni bir marka
   * iceri aktarildiktan sonra musteri listelerinin bir saat boyunca eski
   * kalmamasi gerekir.
   *
   * Cozum: onbellek anahtarlari VERININ KENDISINDEN turetilen bir surumle
   * damgalanir (kayit sayisi + son satir kimligi). Rebuild tabloyu silip
   * yeniden kurdugu icin bu deger degisir ve tum gozlenen-katalog anahtarlari
   * dogal olarak gecersizlesir. Surum degeri kisa sureli (60 sn) onbellege
   * alinir; boylece her istekte tam tablo sorgusu yapilmaz.
   *
   * Basarisiz bir rebuild veritabanini degistirmediginde surum de degismez;
   * yani "yeni veri varmis gibi" gecersizlestirme olmaz.
   */
  private static readonly CORPUS_VERSION_KEY = 'observed:corpusVersion';
  private static readonly CORPUS_VERSION_TTL = 60;

  async getCorpusVersion(): Promise<string> {
    const cached = await this.cache.get<string>(VehicleService.CORPUS_VERSION_KEY);
    if (cached) return cached;
    let version = 'v0';
    try {
      const rows = (await this.prisma.$queryRawUnsafe(
        'SELECT COUNT(*) AS c, COALESCE(MAX(rowid), 0) AS m FROM RawVehicleListing',
      )) as any[];
      version = `${Number(rows?.[0]?.c ?? 0)}-${Number(rows?.[0]?.m ?? 0)}`;
    } catch {
      version = 'v0';
    }
    await this.cache.set(VehicleService.CORPUS_VERSION_KEY, version, VehicleService.CORPUS_VERSION_TTL);
    return version;
  }

  /** Korpus surumu ile damgalanmis onbellek anahtari. */
  private async versionedKey(suffix: string): Promise<string> {
    return `observed:${await this.getCorpusVersion()}:${suffix}`;
  }
  private decodeObservedId(id?: string): string | undefined {
    if (!id) return undefined;
    return id.startsWith(VehicleService.OBS) ? id.slice(VehicleService.OBS.length) : undefined;
  }
  private observedId(value: string): string {
    return VehicleService.OBS + value;
  }

  /** Katalog listesini gozlenen (gercek ilan) secenekleriyle birlestirir. */
  private mergeObserved(
    catalog: any[],
    observed: Array<{ value: string; displayLabel: string; listingCount: number }>,
  ) {
    const seen = new Set(catalog.map((c) => foldTurkish(String(c.name || ''))));
    const extras = observed
      .filter((o) => {
        const label = foldTurkish(o.displayLabel);
        const value = foldTurkish(o.value);
        return !seen.has(label) && !seen.has(value);
      })
      .map((o) => ({
        id: this.observedId(o.value),
        name: o.displayLabel,
        observed: true,
        listingCount: o.listingCount,
      }));
    return [...catalog, ...extras];
  }

  /**
   * GOZLENEN ILAN PENCERESI — FIYAT KOHORTUYLA AYNI KURAL.
   *
   * Sihirbaz, yalnizca GERCEKTEN fiyatlanabilir uclari sunmalidir. Fiyat
   * cekirdegi hedeften ESKI ilanlari emsal saymadigina gore (bkz.
   * emsal-matcher: tek yonlu yil kapisi), katalog kapisi da ayni pencereyi
   * kullanmalidir. Aksi halde sihirbaz, kaniti YALNIZCA daha eski model
   * yillarinda olan bir uc sunar ve o uc fiyatlanamaz.
   *
   * Olculen: pencere simetrikken (yil -/+2) 102 uc yaprak bu durumdaydi;
   * 102'sinin de HEAD'deki emsal kohortu %100 hedeften ESKI ilanlardan
   * olusuyordu — yani gosterilen fiyat, kurala gore kanit sayilmayan
   * verilerden uretilmisti. Uydurma fiyat yerine uc SUNULMAZ.
   */
  private observedWhere(params: { make?: string; year?: number }): any {
    const where: any = { parseStatus: 'VALID' };
    if (params.make) {
      where.OR = [{ rawMake: params.make }, { canonicalMake: params.make }];
    }
    if (params.year) {
      where.year = { gte: params.year, lte: params.year + 2 };
    }
    return where;
  }

  /** Katalog id'lerini canonical isimlere cevirir (id -> ad). */
  private async resolveNames(params: {
    brandId?: string; modelId?: string; variantId?: string;
  }): Promise<{ make?: string; model?: string; engine?: string }> {
    const obsMake = this.decodeObservedId(params.brandId);
    const obsModel = this.decodeObservedId(params.modelId);
    const obsEngine = this.decodeObservedId(params.variantId);
    if (obsMake || obsModel || obsEngine) {
      const rest = await this.resolveNames({
        brandId: obsMake ? undefined : params.brandId,
        modelId: obsModel ? undefined : params.modelId,
        variantId: obsEngine ? undefined : params.variantId,
      });
      return {
        make: obsMake || rest.make,
        model: obsModel || rest.model,
        engine: obsEngine || rest.engine,
      };
    }
    const [brand, model, variant] = await Promise.all([
      params.brandId
        ? this.prisma.manufacturer.findUnique({ where: { id: params.brandId }, select: { name: true } })
        : Promise.resolve(null),
      params.modelId
        ? this.prisma.model.findUnique({ where: { id: params.modelId }, select: { name: true } })
        : Promise.resolve(null),
      params.variantId && params.variantId !== 'UNKNOWN'
        ? this.prisma.variant.findUnique({ where: { id: params.variantId }, select: { name: true } })
        : Promise.resolve(null),
    ]);
    return { make: brand?.name, model: model?.name, engine: variant?.name };
  }

  /** GERCEK ilanlarda gorulen markalar. */
  /**
   * MUSTERIYE SUNULAN MARKA LISTESI — YALNIZ TAMAMLANABILIR MARKALAR.
   *
   * Sihirbaz zorunlu bir zincirdir: marka -> model -> ... Bir markanin
   * gorulen TUM model adlari ayristirma artigi ise (musteriye sunulamaz),
   * o marka secildiginde model listesi BOS gelir ve musteri CIKMAZA duser.
   * Olculen: `Nieve` markasinin tek model adi "_ -" (33 ilan) ve katalogda
   * hic Model kaydi yok; marka listede gorunuyor ama secilince devam
   * edilemiyordu.
   *
   * Kural GENELDIR ve marka adina bakmaz: bir marka, ancak EN AZ BIR
   * kullanilabilir gozlenen modeli varsa musteriye sunulur. Model
   * kullanilabilirlik testi, model listesinin kullandigi yardimcilarin
   * AYNISIDIR (displayModelLabel + isUnusableModelName); iki okuma yolunun
   * ayrisip farkli sonuc vermesi engellenir.
   *
   * KAYNAK VERI DEGISMEZ: hicbir ilan silinmez, DB yeniden yazilmaz.
   * Bu yuzden KAYNAK canonical marka sayisi ile MUSTERIYE SECILEBILIR marka
   * sayisi mesru olarak farkli olabilir.
   *
   * `listingCount` markanin TOPLAM ilan sayisidir (anlam degismedi);
   * kullanilabilirlik yalnizca DAHIL ETME olcutudur.
   */
  async getObservedMakes() {
    const cacheKey = await this.versionedKey('makes');
    const cached = await this.cache.get<any[]>(cacheKey);
    if (cached) return cached;

    const groups = await this.withRetry(() =>
      this.prisma.rawVehicleListing.groupBy({
        by: ['canonicalMake', 'canonicalModel'],
        where: { parseStatus: 'VALID' },
        _count: { _all: true },
      }),
    );
    const merged = new Map<
      string,
      { value: string; displayLabel: string; listingCount: number; hasUsableModel: boolean }
    >();
    for (const g of groups as any[]) {
      const raw = String(g.canonicalMake || '').trim();
      if (!raw) continue;
      const modelName = String(g.canonicalModel || '').trim();
      const usable = Boolean(modelName) && !isUnusableModelName(this.displayModelLabel(modelName));
      const key = foldTurkish(raw);
      const prev = merged.get(key);
      if (prev) {
        prev.listingCount += g._count._all;
        prev.hasUsableModel = prev.hasUsableModel || usable;
      } else {
        merged.set(key, {
          value: raw, displayLabel: raw, listingCount: g._count._all, hasUsableModel: usable,
        });
      }
    }
    const out = [...merged.values()]
      .filter((m) => m.hasUsableModel)
      .map(({ value, displayLabel, listingCount }) => ({ value, displayLabel, listingCount }))
      .sort((a, b) => b.listingCount - a.listingCount);
    await this.cache.set(cacheKey, out, 3600);
    return out;
  }

  /**
   * Bir markanin, verilen yilin +/-2 penceresinde GERCEK ilani olan
   * canonical model adlari (salt-okunur, onbellekli).
   */
  private async modelsWithSupportInWindow(make: string, year: number): Promise<string[]> {
    const cacheKey = await this.versionedKey(`modelwin:${foldTurkish(make)}:${year}`);
    const cached = await this.cache.get<string[]>(cacheKey);
    if (cached) return cached;
    const groups = await this.withRetry(() =>
      this.prisma.rawVehicleListing.groupBy({
        by: ['canonicalModel'],
        where: { ...this.observedWhere({ make, year }), price: { gt: 0 } },
        _count: { _all: true },
      }),
    );
    const out = (groups as any[]).map((g) => String(g.canonicalModel || '').trim()).filter(Boolean);
    await this.cache.set(cacheKey, out, 3600);
    return out;
  }

  /** Bir markanin GERCEK ilanlarda gorulen modelleri. */
  async getObservedModels(params: { make?: string; brandId?: string; year?: number }) {
    const make = params.make || (await this.resolveNames({ brandId: params.brandId })).make;
    if (!make) return [];
    // Yil verildiyse yalnizca o yilin +/-2 penceresinde ilani olan modeller
    // (degerlemenin kullandigi pencere); yil yoksa tum korpus.
    const cacheKey = await this.versionedKey(`models:${foldTurkish(make)}:${params.year || 'all'}`);
    const cached = await this.cache.get<any[]>(cacheKey);
    if (cached) return cached;

    const groups = await this.withRetry(() =>
      this.prisma.rawVehicleListing.groupBy({
        by: ['canonicalModel'],
        where: this.observedWhere({ make, year: params.year }),
        _count: { _all: true },
      }),
    );
    const merged = new Map<string, { value: string; displayLabel: string; listingCount: number }>();
    for (const g of groups as any[]) {
      const raw = String(g.canonicalModel || '').trim();
      if (!raw) continue;
      // Ayni canonical modelin farkli yazimlari tek secenekte toplanir; FARKLI
      // gercek modeller (A3 Sportback vs A3 Hatchback) BIRLESTIRILMEZ.
      const key = foldTurkish(this.displayModelLabel(raw));
      const prev = merged.get(key);
      if (prev) prev.listingCount += g._count._all;
      else merged.set(key, { value: raw, displayLabel: this.displayModelLabel(raw), listingCount: g._count._all });
    }
    // Ayristirma artigi tasiyan model adlari musteriye SUNULMAZ (sessizce
    // yanlis model uretmemek icin; katalog listesine uygulanan filtrenin aynisi).
    const out = [...merged.values()]
      .filter((m) => m.listingCount > 0 && !isUnusableModelName(m.displayLabel))
      .sort((a, b) => b.listingCount - a.listingCount || a.displayLabel.localeCompare(b.displayLabel, 'tr'));
    await this.cache.set(cacheKey, out, 3600);
    return out;
  }

  /** make + model icin GERCEK ilanlarda gorulen motor kodlari. */
  async getObservedEngines(params: { make?: string; brandId?: string; model?: string; modelId?: string; year?: number }) {
    const names = await this.resolveNames({ brandId: params.brandId, modelId: params.modelId });
    const make = params.make || names.make;
    const model = params.model || names.model;
    if (!make || !model) return [];
    const cacheKey = await this.versionedKey(`engines:${foldTurkish(make)}:${foldTurkish(model)}:${params.year || 'all'}`);
    const cached = await this.cache.get<any[]>(cacheKey);
    if (cached) return cached;

    // Yalnizca AYRI motor alani dolu ilanlar gozlenen motor secenegi uretir
    // (etiket icindeki imza katalog variantini destekler, ayri secenek olmaz).
    // Yil verildiyse DEGERLEMENIN kullandigi pencere uygulanir: hedef yil ve
    // daha yenisi (yil..yil+2). Daha eski yildaki motor kaydi, o yil icin
    // secenek URETEMEZ; aksi halde secenek gorunur ama fiyatlanamaz.
    // Olculen: Citroen C4 "1.5 BlueHDi" son 2023'te gorulmusken 2024
    // sihirbazinda sunuluyor ve fiyatsiz kaliyordu (12 ucun 12'si bu sinif).
    const family = await this.familyIdentities(make, model);
    const merged = new Map<string, { value: string; displayLabel: string; listingCount: number }>();
    for (const r of family) {
      if (!r.engineField) continue;
      if (params.year && (r.year < params.year || r.year - params.year > 2)) continue;
      const key = foldTurkish(r.engineField);
      const prev = merged.get(key);
      if (prev) prev.listingCount += r.n;
      else merged.set(key, { value: r.engineField, displayLabel: r.engineField, listingCount: r.n });
    }
    const out = [...merged.values()].sort((a, b) => b.listingCount - a.listingCount);
    await this.cache.set(cacheKey, out, 3600);
    return out;
  }

  /** make + model + motor icin GERCEK ilanlarda gorulen paketler. */
  async getObservedTrims(params: {
    make?: string; brandId?: string; model?: string; modelId?: string; engine?: string; variantId?: string; year?: number;
  }) {
    const names = await this.resolveNames({ brandId: params.brandId, modelId: params.modelId, variantId: params.variantId });
    const make = params.make || names.make;
    const model = params.model || names.model;
    const engine = params.engine || names.engine || '';
    if (!make || !model) return [];
    const cacheKey = await this.versionedKey(`trims:${foldTurkish(make)}:${foldTurkish(model)}:${foldTurkish(engine)}:${params.year || 'all'}`);
    const cached = await this.cache.get<any[]>(cacheKey);
    if (cached) return cached;

    // Paketler, secilen motorla BIRLIKTE gorulmus ilanlardan gelir. Motor
    // karsilastirmasi KANIT uzerinden yapilir (ayri alan YA DA etiketteki
    // acik imza) ve motor bilinmiyorsa model duzeyindeki donanimlar sunulur.
    // Onceki surumdeki "motor eslesmezse modelin TUM paketlerine dus" yolu
    // KALDIRILDI: hic gorulmemis motor+paket ciftleri uretiyordu.
    const evidence = this.variantEngineEvidence(engine);
    const body = deriveBodyType(engine);
    const family = await this.familyIdentities(make, model);
    const merged = new Map<string, { value: string; displayLabel: string; listingCount: number }>();
    for (const r of family) {
      if (!r.trim) continue;
      // Paket etiketi secilen motorla BIREBIR gorulmus olmali: "1.0 TCe"
      // secimine "0.9 TCe Joy" etiketi sunulmaz (degerleme gevsek uyumla
      // havuzlayabilir, ama secenek olarak yanlis kimliktir).
      if (!this.admissible(r, evidence, body, '', params.year, true)) continue;
      const key = foldTurkish(r.trim);
      const prev = merged.get(key);
      if (prev) prev.listingCount += r.n;
      else merged.set(key, { value: r.trim, displayLabel: r.trim, listingCount: r.n });
    }
    const out = [...merged.values()].sort((a, b) => b.listingCount - a.listingCount).slice(0, 60);
    await this.cache.set(cacheKey, out, 3600);
    return out;
  }

  /**
   * Bir marka+model ailesinin GERCEK ilan kimlikleri (salt-okunur, korpus
   * surumuyle onbellekli). Motor KANITI: ayri alan ya da donanim etiketindeki
   * acik imza; kasa: kalici alan ya da etiketteki acik kasa sozcugu.
   * Degerleme motoruyla (emsal-matcher) AYNI kanit tanimi kullanilir; boylece
   * sihirbazin sundugu her yaprak, degerlemenin kabul edecegi bir ilana dayanir.
   */
  private async familyIdentities(make: string, model: string): Promise<Array<{
    engineField: string; engine: string; trim: string; body: string; year: number; n: number;
  }>> {
    const cacheKey = await this.versionedKey(`family:${foldTurkish(make)}:${foldTurkish(model)}`);
    const cached = await this.cache.get<any[]>(cacheKey);
    if (cached) return cached;

    const groups = await this.withRetry(() =>
      this.prisma.rawVehicleListing.groupBy({
        by: ['canonicalModel', 'canonicalVariant', 'rawVariant', 'canonicalTrim', 'canonicalBodyType', 'year'],
        // Degerlemenin havuza ALMAYACAGI satirlar secenek de uretmez:
        // agir hasarli isaretli ve fiyat akil-sinir araligi disindaki ilanlar.
        where: {
          ...this.observedWhere({ make }),
          price: { gte: PRICING_LIMITS.priceSanityRange[0], lte: PRICING_LIMITS.priceSanityRange[1] },
          NOT: { isDamaged: true },
        },
        _count: { _all: true },
      }),
    );
    const out: Array<{ engineField: string; engine: string; trim: string; body: string; year: number; n: number }> = [];
    for (const g of groups as any[]) {
      if (!this.modelMatchesTarget(g.canonicalModel, model)) continue;
      const trim = String(g.canonicalTrim || '').trim();
      const engineField = String(g.canonicalVariant || g.rawVariant || '').trim();
      const engine = engineField || explicitEngineSignature(trim);
      const body = String(g.canonicalBodyType || '').trim() || deriveBodyType(trim);
      out.push({ engineField, engine, trim, body, year: Number(g.year) || 0, n: g._count._all });
    }
    await this.cache.set(cacheKey, out, 3600);
    return out;
  }

  /** Katalog variant etiketinin motor kaniti (alan ayrimi ya da acik imza). */
  private variantEngineEvidence(name: string): string {
    const label = String(name || '').trim();
    if (!label || label === 'UNKNOWN') return '';
    return splitVariantString(label).engineCode || explicitEngineSignature(label);
  }

  /**
   * Degerlemenin Seviye 3 kabul kurali (yakit/sanziman haric): bir ilan,
   * secilen motor kaniti / kasa / paket / yil ile celismiyorsa kabul edilir.
   * UNKNOWN celiski DEGILDIR: ilanin kasasi ya da motoru bilinmiyorsa elenmez;
   * yalnizca BILINEN ve FARKLI olan elenir. Motor bilinmiyorsa paket tek
   * ayirt edicidir ve ortusmesi gerekir.
   */
  private admissible(
    r: { engine: string; trim: string; body: string; year: number },
    evidence: string,
    body: string,
    pkg: string,
    year?: number | null,
    strictEngine = false,
  ): boolean {
    // FIYAT KOHORTUYLA AYNI PENCERE: hedeften ESKI ilan, degerlemenin kabul
    // ettigi bir kanit degildir; dolayisiyla bir SECENEGI de dogrulayamaz.
    // Bu fonksiyonun sozlesmesi (bkz. familyIdentities aciklamasi) sihirbazin
    // sundugu her yapragin, DEGERLEMENIN KABUL EDECEGI bir ilana dayanmasidir.
    if (year && (r.year < year || r.year - year > 2)) return false;
    if (body && r.body && r.body !== body) return false;
    if (evidence) {
      if (!r.engine) return false;
      if (!isEngineCompatible(evidence, r.engine, strictEngine)) return false;
    } else if (pkg) {
      const a = foldTurkish(r.trim), b = foldTurkish(pkg);
      if (!a) return false;
      if (!(a === b || a.includes(b) || b.includes(a))) return false;
    }
    return true;
  }

  /** make + model (+motor) icin GERCEK ilanlarda gorulen model yillari. */
  async getObservedYears(params: {
    make?: string; brandId?: string; model?: string; modelId?: string; engine?: string; variantId?: string;
  }) {
    const names = await this.resolveNames({ brandId: params.brandId, modelId: params.modelId, variantId: params.variantId });
    const make = params.make || names.make;
    const model = params.model || names.model;
    const engine = params.engine || names.engine;
    if (!make || !model) return [];

    const groups = await this.withRetry(() =>
      this.prisma.rawVehicleListing.groupBy({
        by: ['canonicalModel', 'canonicalVariant', 'year'],
        where: this.observedWhere({ make }),
        _count: { _all: true },
      }),
    );
    const merged = new Map<number, number>();
    for (const g of groups as any[]) {
      if (!this.modelMatchesTarget(g.canonicalModel, model)) continue;
      if (engine && foldTurkish(g.canonicalVariant || '') !== foldTurkish(engine)) continue;
      merged.set(g.year, (merged.get(g.year) || 0) + g._count._all);
    }
    return [...merged.entries()]
      .map(([value, listingCount]) => ({ value, displayLabel: String(value), listingCount }))
      .sort((a, b) => b.value - a.value);
  }

  /**
   * GOZLENEN kasa tipleri (salt-okunur).
   *
   * Katalogtaki VehicleSpecification.bodyType, ilan metninden turetilen
   * canonicalBodyType sozlugu ile ortusmez: BMW 4 Serisi katalogta
   * "Hatchback"/"Coupe" olarak durur ama gercek ilanlarda GRAN_COUPE / COUPE /
   * CABRIO gorunur; Audi A3/A5 katalogta "Hatchback", ilanlarda SPORTBACK'tir.
   * Bazi modellerde (orn. BMW 4 Serisi Cabrio) katalogta karsilik hic yoktur.
   */
  async getObservedBodyTypes(params: {
    brandId?: string; modelId?: string; variantId?: string; year?: number;
    make?: string; model?: string; engine?: string;
  }) {
    const names = await this.resolveNames({ brandId: params.brandId, modelId: params.modelId, variantId: params.variantId });
    const make = params.make || names.make;
    const model = params.model || names.model;
    const engine = params.engine || names.engine;
    if (!model) return [];

    const numYear = params.year ? Number(params.year) : null;
    const year = numYear && Number.isFinite(numYear) ? numYear : undefined;
    const cacheKey = await this.versionedKey(`bodies:${foldTurkish(make || '')}:${foldTurkish(model)}:${foldTurkish(engine || '')}:${year || '-'}`);
    const cached = await this.cache.get<any[]>(cacheKey);
    if (cached) return cached;

    const groups = await this.withRetry(() =>
      this.prisma.rawVehicleListing.groupBy({
        by: ['canonicalModel', 'canonicalVariant', 'canonicalBodyType'],
        where: { ...this.observedWhere({ make, year }), canonicalBodyType: { not: '' } },
        _count: { _all: true },
      }),
    );

    const count = (useEngine: boolean) => {
      const m = new Map<string, number>();
      for (const g of groups as any[]) {
        if (!this.modelMatchesTarget(g.canonicalModel, model)) continue;
        if (useEngine && engine && foldTurkish(g.canonicalVariant || '') !== foldTurkish(engine)) continue;
        const body = String(g.canonicalBodyType || '').trim();
        if (!(CANONICAL_BODY_TYPES as string[]).includes(body)) continue;
        m.set(body, (m.get(body) || 0) + g._count._all);
      }
      return m;
    };
    let counts = count(true);
    if (counts.size === 0 && engine) counts = count(false);

    const options = [...counts.entries()]
      .map(([value, listingCount]) => ({
        value,
        displayLabel: BODY_TYPE_LABELS[value as keyof typeof BODY_TYPE_LABELS],
        listingCount,
      }))
      .sort((a, b) => b.listingCount - a.listingCount);

    await this.cache.set(cacheKey, options, 3600);
    return options;
  }

  async getYears() {
    const years = [];
    for (let y = 2026; y >= 1970; y--) {
      years.push(y);
    }
    return years;
  }


  private static vehicleDataCache = new Map<string, { data: any; timestamp: number }>();

  /**
   * Target Invalidation for vehicleDataCache
   * Immediately clears cache entries for specific (manufacturerId, year, modelId)
   */
  public static clearVehicleDataCacheForGroup(manufacturerId: string, year: number, modelId: string) {
    let clearedCount = 0;
    const prefix = `${year}:${manufacturerId}:${modelId}:`;

    for (const key of VehicleService.vehicleDataCache.keys()) {
      if (key.startsWith(prefix)) {
        VehicleService.vehicleDataCache.delete(key);
        clearedCount++;
      }
    }

    if (clearedCount > 0) {
      console.log(`[CACHE INVALIDATION] Cleared ${clearedCount} vehicleDataCache entries for group: ${year}:${manufacturerId}:${modelId}`);
    }
    return clearedCount;
  }

  public clearVehicleDataCacheForGroupInstance(manufacturerId: string, year: number, modelId: string) {
    return VehicleService.clearVehicleDataCacheForGroup(manufacturerId, year, modelId);
  }

  /**
   * Upsert VehicleSpecification (and underlying Variant & Package) during incremental import.
   * Ensures new engines and trims are immediately written to VehicleSpecification DB table.
   * Also triggers targeted cache invalidation for (manufacturerId, year, modelId).
   */
  async upsertVehicleSpecificationsForRawListings(rawItems: {
    year: number;
    canonicalMake?: string | null;
    rawMake?: string | null;
    canonicalModel?: string | null;
    rawModel?: string | null;
    canonicalVariant?: string | null;
    rawVariant?: string | null;
    canonicalTrim?: string | null;
  }[]) {
    if (!rawItems || rawItems.length === 0) return { upsertedSpecsCount: 0, clearedCacheCount: 0 };

    // Group items by (make, model, year) to minimize DB lookups
    const grouped = new Map<string, {
      make: string;
      model: string;
      year: number;
      variantsAndTrims: Set<string>;
    }>();

    for (const item of rawItems) {
      const make = (item.canonicalMake || item.rawMake || '').trim();
      const model = (item.canonicalModel || item.rawModel || '').trim();
      const year = Number(item.year);
      const v = (item.canonicalVariant || item.rawVariant || '').replace(/\(\s*\d+\s*HP\s*\)/gi, '').trim();
      const t = (item.canonicalTrim || '').trim();

      if (!make || !model || !year || isNaN(year)) continue;

      const groupKey = `${make.toLowerCase()}:${model.toLowerCase()}:${year}`;
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, {
          make,
          model,
          year,
          variantsAndTrims: new Set(),
        });
      }
      const vtPair = `${v || 'Standart'}|||${t || 'Standart'}`;
      grouped.get(groupKey)!.variantsAndTrims.add(vtPair);
    }

    let upsertedSpecsCount = 0;
    let clearedCacheCount = 0;

    const HARDWARE_TRIMS_SET = new Set([
      'm sport', 'sport line', 'modern line', 'luxury line', 'premium',
      'standart', 'executive', 'advantage', 'comfort', 'comfortline', 'highline',
      'trendline', 'ambition', 'attraction', 'ambiente', 's line', 'joy', 'touch',
      'icon', 'titanium', 'style', 'dynamic', 'pop', 'popstar', 'lounge', 'urban',
      'easy', 'street', 'mirror', 'first edition m sport', 'first edition'
    ]);

    for (const group of grouped.values()) {
      const manufacturers = await this.prisma.manufacturer.findMany();
      const manufacturer = manufacturers.find(
        (m) => m.name.toLocaleLowerCase('tr-TR') === group.make.toLocaleLowerCase('tr-TR')
      );
      if (!manufacturer) continue;

      const cleanModelSearch = group.model.replace(/serisi/i, '').trim().toLocaleLowerCase('tr-TR');
      const models = await this.prisma.model.findMany({
        where: { manufacturerId: manufacturer.id },
      });
      const model = models.find(
        (m) => m.name.toLocaleLowerCase('tr-TR').includes(cleanModelSearch)
      );
      if (!model) continue;

      // Get default body, fuel, transmission, drive
      const defaultBody = await this.prisma.bodyType.findFirst();
      const defaultFuel = await this.prisma.fuelType.findFirst();
      const defaultTrans = await this.prisma.transmissionType.findFirst();
      const defaultDrive = await this.prisma.driveType.findFirst();

      if (!defaultBody || !defaultFuel || !defaultTrans || !defaultDrive) continue;

      for (const vtPair of group.variantsAndTrims) {
        const [rawEng, rawTrim] = vtPair.split('|||');

        let engineName = rawEng.trim();
        if (!engineName || HARDWARE_TRIMS_SET.has(engineName.toLocaleLowerCase('tr-TR'))) {
          engineName = 'Standart';
        }

        let trimName = rawTrim.trim();
        if (!trimName) trimName = 'Standart';

        // 1. Variant
        let variant = await this.prisma.variant.findFirst({
          where: { modelId: model.id, name: engineName },
        });
        if (!variant) {
          variant = await this.prisma.variant.create({
            data: {
              modelId: model.id,
              name: engineName,
              engineSize: 1600,
              horsepower: 0,
              torque: 0,
            },
          });
          console.log(`[INCREMENTAL SPEC UPSERT] Created Variant "${engineName}" for model "${model.name}"`);
        }

        // 2. Package
        let pkg = await this.prisma.package.findFirst({
          where: { variantId: variant.id, name: trimName },
        });
        if (!pkg) {
          pkg = await this.prisma.package.create({
            data: {
              variantId: variant.id,
              name: trimName,
            },
          });
          console.log(`[INCREMENTAL SPEC UPSERT] Created Package "${trimName}" for variant "${engineName}"`);
        }

        // 3. VehicleSpecification
        const specExists = await this.prisma.vehicleSpecification.findFirst({
          where: {
            year: group.year,
            manufacturerId: manufacturer.id,
            modelId: model.id,
            variantId: variant.id,
            packageId: pkg.id,
          },
        });

        if (!specExists) {
          await this.prisma.vehicleSpecification.create({
            data: {
              year: group.year,
              manufacturerId: manufacturer.id,
              modelId: model.id,
              variantId: variant.id,
              packageId: pkg.id,
              bodyTypeId: defaultBody.id,
              fuelTypeId: defaultFuel.id,
              transmissionTypeId: defaultTrans.id,
              driveTypeId: defaultDrive.id,
            },
          });
          upsertedSpecsCount++;
          console.log(`[INCREMENTAL SPEC UPSERT] Created VehicleSpecification for ${group.year} ${group.make} ${model.name} (${engineName} - ${trimName})`);
        }
      }

      // Immediately clear cache for this group if any new specs were added or to ensure fresh data
      const cleared = VehicleService.clearVehicleDataCacheForGroup(manufacturer.id, group.year, model.id);
      clearedCacheCount += cleared;
    }

    return { upsertedSpecsCount, clearedCacheCount };
  }

  async getVehicleData(query: {
    year: number;
    manufacturerId: string;
    modelId: string;
    variantId?: string;
    packageId?: string;
    bodyTypeId?: string;
    fuelTypeId?: string;
    transmissionTypeId?: string;
  }) {
    const startTime = Date.now();
    const cacheKey = `${query.year}:${query.manufacturerId}:${query.modelId}:${query.variantId || ''}:${query.packageId || ''}:${query.bodyTypeId || ''}:${query.fuelTypeId || ''}:${query.transmissionTypeId || ''}`;

    const cached = VehicleService.vehicleDataCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < 300000)) {
      console.log(`[PERF] getVehicleData CACHE HIT (${Date.now() - startTime} ms) key=${cacheKey}`);
      return cached.data;
    }

    const baseWhere = {
      year: Number(query.year),
      manufacturerId: query.manufacturerId,
      modelId: query.modelId,
    };

    const prismaStartTime = Date.now();
    const specs = await this.prisma.vehicleSpecification.findMany({
      where: baseWhere,
      select: {
        variantId: true,
        variant: { select: { id: true, name: true, engineSize: true, horsepower: true } },
        packageId: true,
        package: { select: { id: true, name: true } },
        bodyTypeId: true,
        bodyType: { select: { id: true, name: true } },
        fuelTypeId: true,
        fuelType: { select: { id: true, name: true } },
        transmissionTypeId: true,
        transmissionType: { select: { id: true, name: true } },
      },
    });
    const prismaQueryTime = Date.now() - prismaStartTime;

    const HARDWARE_TRIMS_SET = new Set([
      'm sport', 'sport line', 'modern line', 'luxury line', 'premium',
      'standart', 'executive', 'advantage', 'comfort', 'comfortline', 'highline',
      'trendline', 'ambition', 'attraction', 'ambiente', 's line', 'joy', 'touch',
      'icon', 'titanium', 'style', 'dynamic', 'pop', 'popstar', 'lounge', 'urban',
      'easy', 'street', 'mirror', 'first edition m sport', 'first edition'
    ]);

    const isValidName = (val?: string | null): boolean => {
      if (!val) return false;
      const clean = val.trim();
      if (clean === '' || clean === '-' || clean === '--' || clean.toLowerCase() === 'null' || clean.toLowerCase() === 'undefined') {
        return false;
      }
      return true;
    };

    // 1. Unique Variants (Engines)
    const variantsMap = new Map<string, any>();
    const normalizedVariantNames = new Set<string>();

    for (const spec of specs) {
      if (spec.variant && isValidName(spec.variant.name)) {
        const cleanName = spec.variant.name.replace(/\(\s*\d+\s*HP\s*\)/gi, '').trim();
        const normKey = cleanName.toLocaleLowerCase('tr-TR');
        if (!HARDWARE_TRIMS_SET.has(normKey) && !normalizedVariantNames.has(normKey)) {
          normalizedVariantNames.add(normKey);
          variantsMap.set(spec.variant.id, { ...spec.variant, name: cleanName });
        }
      }
    }

    // 2. Packages (Donanım Paketleri) - Deduplicated and filtered
    const packagesMap = new Map<string, any>();
    const normalizedPackageNames = new Set<string>();

    for (const spec of specs) {
      if (query.variantId && spec.variantId !== query.variantId) continue;
      if (spec.package && isValidName(spec.package.name)) {
        const cleanName = spec.package.name.trim();
        const normKey = cleanName.toLocaleLowerCase('tr-TR');
        if (!normalizedPackageNames.has(normKey)) {
          normalizedPackageNames.add(normKey);
          packagesMap.set(spec.package.id, { ...spec.package, name: cleanName });
        }
      }
    }

    // 3. Body Types (Kasa Tipleri)
    const bodiesMap = new Map<string, any>();
    const normalizedBodyNames = new Set<string>();

    for (const spec of specs) {
      if (query.variantId && spec.variantId !== query.variantId) continue;
      if (query.packageId && spec.packageId !== query.packageId) continue;

      if (spec.bodyType) {
        if (!isValidName(spec.bodyType.name)) {
          console.warn(`[WARN] INVALID_EMPTY_BODY_TYPE_LABEL for bodyTypeId: ${spec.bodyTypeId}`);
          continue;
        }
        const cleanName = spec.bodyType.name.trim();
        const normKey = cleanName.toLocaleLowerCase('tr-TR');
        if (!normalizedBodyNames.has(normKey)) {
          normalizedBodyNames.add(normKey);
          bodiesMap.set(spec.bodyType.id, { ...spec.bodyType, name: cleanName });
        }
      }
    }

    // 4. Fuel Types (Yakıt Tipleri)
    const fuelsMap = new Map<string, any>();
    const normalizedFuelNames = new Set<string>();

    for (const spec of specs) {
      if (query.variantId && spec.variantId !== query.variantId) continue;
      if (query.packageId && spec.packageId !== query.packageId) continue;
      if (query.bodyTypeId && spec.bodyTypeId !== query.bodyTypeId) continue;

      if (spec.fuelType) {
        if (!isValidName(spec.fuelType.name)) {
          console.warn(`[WARN] INVALID_EMPTY_FUEL_TYPE_LABEL for fuelTypeId: ${spec.fuelTypeId}`);
          continue;
        }
        const cleanName = spec.fuelType.name.trim();
        const normKey = cleanName.toLocaleLowerCase('tr-TR');
        if (!normalizedFuelNames.has(normKey)) {
          normalizedFuelNames.add(normKey);
          fuelsMap.set(spec.fuelType.id, { ...spec.fuelType, name: cleanName });
        }
      }
    }

    // 5. Transmissions
    const transmissionsMap = new Map<string, any>();
    const normalizedTransNames = new Set<string>();

    for (const spec of specs) {
      if (query.variantId && spec.variantId !== query.variantId) continue;
      if (query.packageId && spec.packageId !== query.packageId) continue;
      if (query.bodyTypeId && spec.bodyTypeId !== query.bodyTypeId) continue;
      if (query.fuelTypeId && spec.fuelTypeId !== query.fuelTypeId) continue;

      if (spec.transmissionType && isValidName(spec.transmissionType.name)) {
        const cleanName = spec.transmissionType.name.trim();
        const normKey = cleanName.toLocaleLowerCase('tr-TR');
        if (!normalizedTransNames.has(normKey)) {
          normalizedTransNames.add(normKey);
          transmissionsMap.set(spec.transmissionType.id, { ...spec.transmissionType, name: cleanName });
        }
      }
    }

    const uniqueVariants = Array.from(variantsMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'tr-TR'));
    const uniquePackages = Array.from(packagesMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'tr-TR'));
    const uniqueBodies = Array.from(bodiesMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'tr-TR'));
    const uniqueFuels = Array.from(fuelsMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'tr-TR'));
    const uniqueTransmissions = Array.from(transmissionsMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'tr-TR'));

    const jsonStartTime = Date.now();
    const result = {
      variants: uniqueVariants,
      packages: uniquePackages,
      bodyTypes: uniqueBodies,
      fuelTypes: uniqueFuels,
      transmissionTypes: uniqueTransmissions,
      autoPopulate: {
        variantId: uniqueVariants.length === 1 ? uniqueVariants[0].id : null,
        packageId: uniquePackages.length === 1 ? uniquePackages[0].id : null,
        bodyTypeId: uniqueBodies.length === 1 ? uniqueBodies[0].id : null,
        fuelTypeId: uniqueFuels.length === 1 ? uniqueFuels[0].id : null,
        transmissionTypeId: uniqueTransmissions.length === 1 ? uniqueTransmissions[0].id : null,
      },
    };
    const jsonConversionTime = Date.now() - jsonStartTime;
    const totalTime = Date.now() - startTime;

    console.log(`
--- VEHICLE DATA API PERFORMANCE METRICS ---
Cache Status: MISS
Prisma Query Time: ${prismaQueryTime} ms
JSON Conversion Time: ${jsonConversionTime} ms
Total API Response Time: ${totalTime} ms
Returned Variants Count: ${uniqueVariants.length}
Returned Packages Count: ${uniquePackages.length}
Returned Body Types Count: ${uniqueBodies.length}
Returned Fuel Types Count: ${uniqueFuels.length}
=============================================`);

    VehicleService.vehicleDataCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  }

  private async generateSpecsForModel(
    year: number,
    manufacturerId: string,
    modelId: string,
  ) {
    const manufacturer = await this.prisma.manufacturer.findUnique({
      where: { id: manufacturerId },
    });
    const model = await this.prisma.model.findUnique({
      where: { id: modelId },
    });

    if (!manufacturer || !model) return;

    const brandName = manufacturer.name;
    const modelName = model.name;
    const lowerBrand = brandName.toLowerCase();
    const lowerModel = modelName.toLowerCase().replace(/-/g, ' ');

    let basePrice2026 = 1550000; // default C-segment
    let floorPrice = 450000;
    let isPremium = false;
    let isExotic = false;
    let isEconomy = false;

    // Segment Pricing Base
    if (
      lowerBrand.includes('lamborghini') ||
      lowerBrand.includes('ferrari') ||
      lowerBrand.includes('bentley') ||
      lowerBrand.includes('rolls-royce') ||
      lowerBrand.includes('aston martin') ||
      lowerBrand.includes('mclaren')
    ) {
      basePrice2026 = 35000000;
      floorPrice = 12000000;
      isExotic = true;
    } else if (
      lowerBrand.includes('porsche') ||
      lowerBrand.includes('maserati') ||
      lowerModel.includes('r8') ||
      lowerModel.includes('amg gt')
    ) {
      basePrice2026 = 18000000;
      floorPrice = 6000000;
      isExotic = true;
    } else if (
      lowerModel.includes('s-class') || lowerModel.includes('s serisi') ||
      lowerModel.includes('7 series') || lowerModel.includes('7 serisi') || lowerModel.includes('i7') ||
      lowerModel.includes('eqs') || lowerModel.includes('ix') ||
      lowerModel.includes('a8') ||
      lowerModel.includes('panamera') ||
      lowerModel.includes('cayenne') ||
      lowerModel.includes('x7') ||
      lowerModel.includes('q8') ||
      lowerModel.includes('gls') ||
      lowerModel.includes('g-class') || lowerModel.includes('g serisi') || lowerModel.includes('g 63') ||
      (lowerBrand.includes('land rover') && lowerModel.includes('range rover') && !lowerModel.includes('evoque') && !lowerModel.includes('velar'))
    ) {
      basePrice2026 = 18500000;
      floorPrice = 6500000;
      isPremium = true;
    } else if (
      lowerModel.includes('e-class') || lowerModel.includes('e serisi') ||
      lowerModel.includes('5 series') || lowerModel.includes('5 serisi') ||
      lowerModel.includes('a6') ||
      lowerModel.includes('a7') ||
      lowerModel.includes('s90') ||
      lowerModel.includes('v90') ||
      lowerModel.includes('xc90') ||
      lowerModel.includes('x5') ||
      lowerModel.includes('x6') ||
      lowerModel.includes('q7') ||
      lowerModel.includes('gle') ||
      lowerModel.includes('glc coupe') ||
      lowerModel.includes('macan') ||
      lowerModel.includes('velar') ||
      lowerModel.includes('discovery')
    ) {
      basePrice2026 = 12500000;
      floorPrice = 3500000;
      isPremium = true;
    } else if (
      lowerBrand.includes('mercedes') ||
      lowerBrand.includes('bmw') ||
      lowerBrand.includes('audi') ||
      lowerBrand.includes('volvo') ||
      lowerBrand.includes('land rover') ||
      lowerBrand.includes('tesla') ||
      lowerBrand.includes('jaguar')
    ) {
      basePrice2026 = 4500000;
      floorPrice = 1600000;
      isPremium = true;
    } else if (
      lowerBrand.includes('fiat') ||
      (lowerBrand.includes('dacia') && !lowerModel.includes('duster') && !lowerModel.includes('jogger')) ||
      lowerBrand.includes('citroen') ||
      lowerBrand.includes('chevrolet') ||
      lowerModel.includes('clio') ||
      lowerModel.includes('i20') ||
      lowerModel.includes('corsa') ||
      lowerModel.includes('polo') ||
      lowerModel.includes('fiesta') ||
      lowerModel.includes('sandero')
    ) {
      basePrice2026 = 1400000;
      floorPrice = 400000;
      isEconomy = true;
    } else if (
      lowerModel.includes('passat') ||
      lowerModel.includes('superb') ||
      lowerModel.includes('insignia') ||
      lowerModel.includes('mondeo') ||
      lowerModel.includes('508') ||
      lowerModel.includes('talisman') ||
      lowerModel.includes('accord') ||
      lowerModel.includes('c5')
    ) {
      basePrice2026 = 2800000;
      floorPrice = 700000;
    }

    const age = Math.max(0, 2026 - year);
    const marketAvg = Math.round(
      floorPrice + (basePrice2026 - floorPrice) * Math.pow(0.88, age)
    );

    type VariantSeed = {
      name: string;
      engineSize: number;
      horsepower: number;
      torque: number;
      cylinders?: number;
      fuel: string;
      trans: string;
      body?: string;
      packages: string[];
    };

    let variantSpecs: VariantSeed[] = [];

    if (lowerBrand.includes('citroen')) {
      if (lowerModel.includes('elysée') || lowerModel.includes('elysee')) {
        variantSpecs = [
          { name: '1.2 PureTech', engineSize: 1199, horsepower: 82, torque: 118, fuel: 'Benzin', trans: 'Manuel', body: 'Sedan', packages: ['Live', 'Feel', 'Shine'] },
          { name: '1.5 BlueHDi', engineSize: 1499, horsepower: 100, torque: 250, fuel: 'Dizel', trans: 'Manuel', body: 'Sedan', packages: ['Feel', 'Feel Bold', 'Shine'] },
          { name: '1.6 HDi', engineSize: 1560, horsepower: 92, torque: 230, fuel: 'Dizel', trans: 'Manuel', body: 'Sedan', packages: ['Attraction', 'Confort', 'Exclusive'] },
        ];
      } else if (lowerModel.includes('c4 x') || lowerModel.includes('c4x')) {
        variantSpecs = [
          { name: '1.2 PureTech', engineSize: 1199, horsepower: 130, torque: 230, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['Feel', 'Feel Bold', 'Shine', 'Shine Bold', 'Max', 'Standart / Bilmiyorum'] },
          { name: '1.5 BlueHDi', engineSize: 1499, horsepower: 130, torque: 300, fuel: 'Dizel', trans: 'Otomatik', packages: ['Feel Bold', 'Shine', 'Shine Bold', 'Max', 'Standart / Bilmiyorum'] },
        ];
      } else if (lowerModel.includes('e-c4') || lowerModel.includes('ec4')) {
        variantSpecs = [
          { name: 'Elektrik (100 kW)', engineSize: 0, horsepower: 136, torque: 260, fuel: 'Elektrik', trans: 'Otomatik', body: lowerModel.includes('x') ? 'Sedan' : 'Hatchback', packages: ['Shine Bold'] },
          { name: 'Elektrik (115 kW)', engineSize: 0, horsepower: 156, torque: 260, fuel: 'Elektrik', trans: 'Otomatik', body: lowerModel.includes('x') ? 'Sedan' : 'Hatchback', packages: ['Max'] },
        ];
      } else if (lowerModel.includes('c4')) {
        variantSpecs = [
          { name: '1.2 PureTech', engineSize: 1199, horsepower: 130, torque: 230, fuel: 'Benzin', trans: 'Otomatik', body: 'Hatchback', packages: ['Feel', 'Feel Bold', 'Shine', 'Shine Bold'] },
          { name: '1.5 BlueHDi', engineSize: 1499, horsepower: 130, torque: 300, fuel: 'Dizel', trans: 'Otomatik', packages: ['Feel Bold', 'Shine', 'Shine Bold'] },
          { name: '1.6 HDi', engineSize: 1560, horsepower: 115, torque: 270, fuel: 'Dizel', trans: 'Manuel', body: 'Hatchback', packages: ['Confort', 'Exclusive'] },
          { name: '1.6 e-HDi', engineSize: 1560, horsepower: 115, torque: 270, fuel: 'Dizel', trans: 'Otomatik', packages: ['Confort', 'Exclusive'] },
        ];
      } else if (lowerModel.includes('c3')) {
        const body = lowerModel.includes('aircross') ? 'SUV' : 'Hatchback';
        variantSpecs = [
          { name: '1.2 PureTech', engineSize: 1199, horsepower: 83, torque: 118, fuel: 'Benzin', trans: 'Manuel', body, packages: ['Feel', 'Feel Bold', 'You', 'Max'] },
          { name: '1.2 PureTech EAT6', engineSize: 1199, horsepower: 110, torque: 205, fuel: 'Benzin', trans: 'Otomatik', body, packages: ['Feel Bold', 'Shine', 'Max'] },
          { name: '1.5 BlueHDi', engineSize: 1499, horsepower: 100, torque: 250, fuel: 'Dizel', trans: 'Manuel', body, packages: ['Feel', 'Feel Bold', 'Shine'] },
        ];
      } else if (lowerModel.includes('c5')) {
        variantSpecs = [
          { name: '1.5 BlueHDi', engineSize: 1499, horsepower: 130, torque: 300, fuel: 'Dizel', trans: 'Otomatik', body: 'SUV', packages: ['Feel Bold', 'Shine', 'Shine Bold'] },
          { name: '1.2 PureTech', engineSize: 1199, horsepower: 130, torque: 230, fuel: 'Benzin', trans: 'Otomatik', body: 'SUV', packages: ['Feel Bold', 'Shine'] },
          { name: '1.6 PureTech', engineSize: 1598, horsepower: 180, torque: 250, fuel: 'Benzin', trans: 'Otomatik', packages: ['Shine', 'Shine Bold'] },
        ];
      }
    } else if (lowerBrand.includes('peugeot')) {
      if (lowerModel.includes('508')) {
        variantSpecs = [
          { name: '1.5 BlueHDi', engineSize: 1499, horsepower: 130, torque: 300, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['Active Prime', 'Allure', 'GT Line', 'GT'] },
          { name: '1.6 PureTech', engineSize: 1598, horsepower: 180, torque: 250, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['Allure', 'GT Line', 'GT'] },
          { name: '1.6 Hybrid PSE', engineSize: 1598, horsepower: 360, torque: 520, fuel: 'Hibrit', trans: 'Otomatik', body: 'Sedan', packages: ['PSE', 'GT'] },
          { name: '2.0 BlueHDi', engineSize: 1997, horsepower: 180, torque: 400, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['Allure', 'GT'] },
        ];
      } else if (lowerModel.includes('3008') || lowerModel.includes('5008')) {
        variantSpecs = [
          { name: '1.5 BlueHDi', engineSize: 1499, horsepower: 130, torque: 300, fuel: 'Dizel', trans: 'Otomatik', body: 'SUV', packages: ['Active Prime', 'Allure', 'GT'] },
          { name: '1.2 PureTech', engineSize: 1199, horsepower: 130, torque: 230, fuel: 'Benzin', trans: 'Otomatik', body: 'SUV', packages: ['Active', 'Allure', 'GT'] },
          { name: '1.6 PureTech', engineSize: 1598, horsepower: 180, torque: 250, fuel: 'Benzin', trans: 'Otomatik', body: 'SUV', packages: ['Allure', 'GT'] },
        ];
      } else if (lowerModel.includes('208') || lowerModel.includes('2008') || lowerModel.includes('308')) {
        const body = lowerModel.includes('2008') ? 'SUV' : 'Hatchback';
        variantSpecs = [
          { name: '1.2 PureTech', engineSize: 1199, horsepower: 100, torque: 205, fuel: 'Benzin', trans: 'Manuel', body, packages: ['Active', 'Allure'] },
          { name: '1.2 PureTech EAT8', engineSize: 1199, horsepower: 130, torque: 230, fuel: 'Benzin', trans: 'Otomatik', body, packages: ['Allure', 'GT'] },
          { name: '1.5 BlueHDi', engineSize: 1499, horsepower: 130, torque: 300, fuel: 'Dizel', trans: 'Otomatik', body, packages: ['Active', 'Allure', 'GT'] },
        ];
      } else if (lowerModel.includes('301')) {
        variantSpecs = [
          { name: '1.5 BlueHDi', engineSize: 1499, horsepower: 100, torque: 250, fuel: 'Dizel', trans: 'Manuel', body: 'Sedan', packages: ['Active', 'Allure'] },
          { name: '1.6 HDi', engineSize: 1560, horsepower: 92, torque: 230, fuel: 'Dizel', trans: 'Manuel', body: 'Sedan', packages: ['Access', 'Active', 'Allure'] },
          { name: '1.2 VTi', engineSize: 1199, horsepower: 82, torque: 118, fuel: 'Benzin', trans: 'Manuel', body: 'Sedan', packages: ['Access', 'Active'] },
        ];
      }
    } else if (lowerBrand.includes('volkswagen')) {
      if (lowerModel.includes('passat') || lowerModel.includes('arteon')) {
        variantSpecs = [
          { name: '1.5 TSI', engineSize: 1498, horsepower: 150, torque: 250, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['Business', 'Elegance', 'R-Line'] },
          { name: '1.6 TDI', engineSize: 1598, horsepower: 120, torque: 250, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['Trendline', 'Comfortline', 'Highline'] },
          { name: '2.0 TDI', engineSize: 1968, horsepower: 150, torque: 360, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['Business', 'Elegance', 'Highline'] },
        ];
      } else if (lowerModel.includes('golf') || lowerModel.includes('t-roc') || lowerModel.includes('tiguan') || lowerModel.includes('polo')) {
        const body = lowerModel.includes('tiguan') || lowerModel.includes('t-roc') ? 'SUV' : 'Hatchback';
        variantSpecs = [
          { name: '1.0 TSI', engineSize: 999, horsepower: 110, torque: 200, fuel: 'Benzin', trans: 'Manuel', body, packages: ['Impression', 'Life'] },
          { name: '1.5 TSI / eTSI', engineSize: 1498, horsepower: 150, torque: 250, fuel: 'Benzin', trans: 'Otomatik', body, packages: ['Life', 'Style', 'R-Line'] },
          { name: '1.6 TDI / 2.0 TDI', engineSize: 1968, horsepower: 150, torque: 360, fuel: 'Dizel', trans: 'Otomatik', body, packages: ['Life', 'Style'] },
        ];
      }
    } else if (lowerBrand.includes('renault')) {
      if (lowerModel.includes('megane') || lowerModel.includes('talisman') || lowerModel.includes('austral')) {
        variantSpecs = [
          { name: '1.3 TCe', engineSize: 1332, horsepower: 140, torque: 240, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['Joy', 'Touch', 'Icon'] },
          { name: '1.5 Blue dCi', engineSize: 1461, horsepower: 115, torque: 270, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['Joy', 'Touch', 'Icon'] },
        ];
      } else if (lowerModel.includes('clio') || lowerModel.includes('captur')) {
        variantSpecs = [
          { name: '1.0 TCe', engineSize: 999, horsepower: 90, torque: 160, fuel: 'Benzin', trans: 'Otomatik', body: 'Hatchback', packages: ['Joy', 'Touch', 'Icon'] },
          { name: '1.5 Blue dCi', engineSize: 1461, horsepower: 85, torque: 220, fuel: 'Dizel', trans: 'Manuel', body: 'Hatchback', packages: ['Joy', 'Touch'] },
        ];
      }
    } else if (lowerBrand.includes('fiat')) {
      if (lowerModel.includes('egea')) {
        variantSpecs = [
          { name: '1.3 Multijet', engineSize: 1248, horsepower: 95, torque: 200, fuel: 'Dizel', trans: 'Manuel', body: 'Sedan', packages: ['Easy', 'Urban', 'Lounge'] },
          { name: '1.6 Multijet DCT', engineSize: 1598, horsepower: 130, torque: 320, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['Urban', 'Lounge'] },
          { name: '1.4 Fire', engineSize: 1368, horsepower: 95, torque: 127, fuel: 'Benzin', trans: 'Manuel', body: 'Sedan', packages: ['Easy', 'Urban', 'Lounge'] },
          { name: '1.5 T4 Hybrid', engineSize: 1469, horsepower: 130, torque: 240, fuel: 'Hibrit', trans: 'Otomatik', body: 'Sedan', packages: ['Urban', 'Lounge'] },
        ];
      }
    } else if (lowerBrand.includes('toyota')) {
      variantSpecs = [
        { name: '1.8 Hybrid', engineSize: 1798, horsepower: 140, torque: 185, fuel: 'Hibrit', trans: 'Otomatik', body: 'Sedan', packages: ['Dream', 'Flame', 'Passion'] },
        { name: '1.5 Vision / Dream', engineSize: 1490, horsepower: 125, torque: 153, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['Vision', 'Dream', 'Flame'] },
        { name: '1.4 D-4D', engineSize: 1364, horsepower: 90, torque: 205, fuel: 'Dizel', trans: 'Manuel', body: 'Sedan', packages: ['Life', 'Touch'] },
      ];
    } else if (lowerBrand.includes('bmw')) {
      if (lowerModel.includes('i7')) {
        variantSpecs = [
          { name: 'xDrive60 M Excellence', engineSize: 0, horsepower: 544, torque: 745, fuel: 'Elektrik', trans: 'Otomatik', body: 'Sedan', packages: ['M Excellence', 'Pure Excellence', 'M Sport', 'Standart / Bilmiyorum'] },
          { name: 'xDrive60 Pure Excellence', engineSize: 0, horsepower: 544, torque: 745, fuel: 'Elektrik', trans: 'Otomatik', body: 'Sedan', packages: ['Pure Excellence', 'M Excellence', 'Standart / Bilmiyorum'] },
          { name: 'M70 xDrive', engineSize: 0, horsepower: 659, torque: 1100, fuel: 'Elektrik', trans: 'Otomatik', body: 'Sedan', packages: ['M Performance', 'M Sport', 'Standart / Bilmiyorum'] },
          { name: 'eDrive50', engineSize: 0, horsepower: 455, torque: 650, fuel: 'Elektrik', trans: 'Otomatik', body: 'Sedan', packages: ['Pure Excellence', 'M Excellence', 'Standart / Bilmiyorum'] },
        ];
      } else if (lowerModel.includes('i5')) {
        variantSpecs = [
          { name: 'eDrive40 M Sport', engineSize: 0, horsepower: 340, torque: 430, fuel: 'Elektrik', trans: 'Otomatik', body: 'Sedan', packages: ['M Sport', 'Luxury Line', 'Standart / Bilmiyorum'] },
          { name: 'eDrive40 Touring', engineSize: 0, horsepower: 340, torque: 430, fuel: 'Elektrik', trans: 'Otomatik', body: 'Station Wagon', packages: ['M Sport', 'Standart / Bilmiyorum'] },
          { name: 'M60 xDrive', engineSize: 0, horsepower: 601, torque: 820, fuel: 'Elektrik', trans: 'Otomatik', body: 'Sedan', packages: ['M Performance', 'M Sport', 'Standart / Bilmiyorum'] },
        ];
      } else if (lowerModel.includes('i4')) {
        variantSpecs = [
          { name: 'eDrive40 M Sport', engineSize: 0, horsepower: 340, torque: 430, fuel: 'Elektrik', trans: 'Otomatik', body: 'Hatchback', packages: ['M Sport', 'Gran Coupe', 'Standart / Bilmiyorum'] },
          { name: 'eDrive35 M Sport', engineSize: 0, horsepower: 286, torque: 400, fuel: 'Elektrik', trans: 'Otomatik', body: 'Hatchback', packages: ['M Sport', 'Standart / Bilmiyorum'] },
          { name: 'M50', engineSize: 0, horsepower: 544, torque: 795, fuel: 'Elektrik', trans: 'Otomatik', body: 'Hatchback', packages: ['M Performance', 'M Sport', 'Standart / Bilmiyorum'] },
        ];
      } else if (lowerModel.includes('i8')) {
        variantSpecs = [
          { name: '1.5 Coupe', engineSize: 1499, horsepower: 374, torque: 570, fuel: 'Hibrit', trans: 'Otomatik', body: 'Coupe', packages: ['Coupe', 'Standart / Bilmiyorum'] },
          { name: '1.5 Roadster', engineSize: 1499, horsepower: 374, torque: 570, fuel: 'Hibrit', trans: 'Otomatik', body: 'Cabrio', packages: ['Roadster', 'Standart / Bilmiyorum'] },
        ];
      } else if (lowerModel.includes('ix1')) {
        variantSpecs = [
          { name: 'xDrive30 M Sport', engineSize: 0, horsepower: 313, torque: 494, fuel: 'Elektrik', trans: 'Otomatik', body: 'SUV', packages: ['M Sport', 'xLine', 'Standart / Bilmiyorum'] },
          { name: 'eDrive20 M Sport', engineSize: 0, horsepower: 204, torque: 250, fuel: 'Elektrik', trans: 'Otomatik', body: 'SUV', packages: ['M Sport', 'xLine', 'Standart / Bilmiyorum'] },
        ];
      } else if (lowerModel.includes('ix3')) {
        variantSpecs = [
          { name: 'Impressions', engineSize: 0, horsepower: 286, torque: 400, fuel: 'Elektrik', trans: 'Otomatik', body: 'SUV', packages: ['Impressions', 'M Sport', 'Standart / Bilmiyorum'] },
          { name: 'M Sport', engineSize: 0, horsepower: 286, torque: 400, fuel: 'Elektrik', trans: 'Otomatik', body: 'SUV', packages: ['M Sport', 'Impressions', 'Standart / Bilmiyorum'] },
        ];
      } else if (lowerModel.includes('ix')) {
        variantSpecs = [
          { name: 'xDrive40 First Edition', engineSize: 0, horsepower: 326, torque: 630, fuel: 'Elektrik', trans: 'Otomatik', body: 'SUV', packages: ['First Edition Sport', 'First Edition Essence', 'Standart / Bilmiyorum'] },
          { name: 'xDrive50', engineSize: 0, horsepower: 523, torque: 765, fuel: 'Elektrik', trans: 'Otomatik', body: 'SUV', packages: ['Sport', 'Essence', 'Standart / Bilmiyorum'] },
          { name: 'M60', engineSize: 0, horsepower: 619, torque: 1100, fuel: 'Elektrik', trans: 'Otomatik', body: 'SUV', packages: ['M Performance', 'Sport', 'Standart / Bilmiyorum'] },
        ];
      } else if (lowerModel.includes('3 serisi') || lowerModel === '3') {
        variantSpecs = [
          { name: '320i', engineSize: 1597, horsepower: 170, torque: 250, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['M Sport', 'Luxury Line', 'Sport Line', 'Modern Line', 'First Edition M Sport', 'Standart / Bilmiyorum'] },
          { name: '320d', engineSize: 1995, horsepower: 190, torque: 400, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['M Sport', 'Luxury Line', 'Sport Line', 'Standart / Bilmiyorum'] },
          { name: '320d xDrive', engineSize: 1995, horsepower: 190, torque: 400, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['M Sport', 'Luxury Line', 'Standart / Bilmiyorum'] },
          { name: '316i', engineSize: 1598, horsepower: 136, torque: 220, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['Comfort', 'Technology', 'M Sport', 'Standart / Bilmiyorum'] },
          { name: '318i', engineSize: 1499, horsepower: 136, torque: 220, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['Edition M Sport', 'Prestige', 'Standart / Bilmiyorum'] },
        ];
      } else if (lowerModel.includes('5 serisi') || lowerModel === '5') {
        variantSpecs = [
          { name: '520i', engineSize: 1597, horsepower: 170, torque: 250, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['M Sport', 'Luxury Line', 'Special Edition M Sport', 'Executive', 'Standart / Bilmiyorum'] },
          { name: '520d', engineSize: 1995, horsepower: 190, torque: 400, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['M Sport', 'Luxury Line', 'Executive', 'Standart / Bilmiyorum'] },
          { name: '520d xDrive', engineSize: 1995, horsepower: 190, torque: 400, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['M Sport', 'Luxury Line', 'Executive', 'Standart / Bilmiyorum'] },
          { name: '530i xDrive', engineSize: 1998, horsepower: 252, torque: 350, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['M Sport', 'Special Edition', 'Standart / Bilmiyorum'] },
        ];
      } else if (lowerModel.includes('7 serisi') || lowerModel === '7') {
        variantSpecs = [
          { name: '730ld xDrive', engineSize: 2993, horsepower: 265, torque: 620, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['Pure Excellence', 'M Sport', 'Excellence', 'Standart / Bilmiyorum'] },
          { name: '740ld xDrive', engineSize: 2993, horsepower: 320, torque: 680, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['Pure Excellence', 'M Sport', 'Standart / Bilmiyorum'] },
          { name: '740i', engineSize: 2998, horsepower: 381, torque: 540, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['Pure Excellence', 'M Sport', 'Standart / Bilmiyorum'] },
        ];
      } else if (lowerModel.includes('x5')) {
        variantSpecs = [
          { name: 'xDrive25d', engineSize: 1995, horsepower: 231, torque: 500, fuel: 'Dizel', trans: 'Otomatik', body: 'SUV', packages: ['xLine', 'M Sport', 'Standart / Bilmiyorum'] },
          { name: 'xDrive30d', engineSize: 2993, horsepower: 265, torque: 620, fuel: 'Dizel', trans: 'Otomatik', body: 'SUV', packages: ['xLine', 'M Sport', 'Standart / Bilmiyorum'] },
          { name: 'xDrive40i', engineSize: 2998, horsepower: 340, torque: 450, fuel: 'Benzin', trans: 'Otomatik', body: 'SUV', packages: ['M Sport', 'Standart / Bilmiyorum'] },
        ];
      } else {
        variantSpecs = [
          { name: `${modelName} M Sport`, engineSize: 1998, horsepower: 245, torque: 350, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['M Sport', 'Luxury Line', 'Standart / Bilmiyorum'] },
          { name: `${modelName} xDrive`, engineSize: 1995, horsepower: 190, torque: 400, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['M Sport', 'xLine', 'Standart / Bilmiyorum'] },
        ];
      }
    } else if (lowerBrand.includes('mercedes')) {
      if (lowerModel.includes('c serisi') || lowerModel.includes('c class') || lowerModel === 'c') {
        variantSpecs = [
          { name: 'C 180', engineSize: 1496, horsepower: 170, torque: 250, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['AMG Line', 'Avantgarde', 'Selection', 'Fascination', 'Style', 'Night Package', 'Standart / Bilmiyorum'] },
          { name: 'C 200 4MATIC', engineSize: 1496, horsepower: 204, torque: 300, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['AMG Line', 'Avantgarde', 'Standart / Bilmiyorum'] },
          { name: 'C 300', engineSize: 1999, horsepower: 258, torque: 400, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['AMG Line', 'Avantgarde', 'Standart / Bilmiyorum'] },
          { name: 'C 200 d', engineSize: 1598, horsepower: 160, torque: 360, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['AMG Line', 'Avantgarde', 'Style', 'Fascination', 'Standart / Bilmiyorum'] },
          { name: 'C 220 d', engineSize: 1993, horsepower: 200, torque: 440, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['AMG Line', 'Avantgarde', 'Standart / Bilmiyorum'] },
          { name: 'C 43 AMG', engineSize: 1991, horsepower: 408, torque: 500, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['AMG', 'Performance', 'Standart / Bilmiyorum'] },
          { name: 'C 63 AMG', engineSize: 3982, horsepower: 510, torque: 700, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['AMG S', 'Performance', 'Standart / Bilmiyorum'] },
          { name: 'C 63 S AMG', engineSize: 3982, horsepower: 680, torque: 1020, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['E Performance', 'F1 Edition', 'Standart / Bilmiyorum'] },
        ];
      } else if (lowerModel.includes('e serisi') || lowerModel.includes('e-class') || lowerModel === 'e') {
        variantSpecs = [
          { name: 'E 180', engineSize: 1595, horsepower: 156, torque: 250, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['AMG Line', 'Exclusive', 'Avantgarde', 'Edition 1', 'Standart / Bilmiyorum'] },
          { name: 'E 200 d', engineSize: 1598, horsepower: 160, torque: 360, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['AMG Line', 'Exclusive', 'Avantgarde', 'Standart / Bilmiyorum'] },
          { name: 'E 220 d 4MATIC', engineSize: 1993, horsepower: 200, torque: 440, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['AMG Line', 'Exclusive', 'Standart / Bilmiyorum'] },
        ];
      } else if (lowerModel.includes('s serisi') || lowerModel.includes('s-class') || lowerModel === 's') {
        variantSpecs = [
          { name: 'S 400 d 4MATIC', engineSize: 2925, horsepower: 330, torque: 700, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['AMG Line', 'Exclusive', 'Maybach', 'Standart / Bilmiyorum'] },
          { name: 'S 500 4MATIC', engineSize: 2999, horsepower: 435, torque: 520, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['AMG Line', 'Exclusive', 'Standart / Bilmiyorum'] },
        ];
      }
    } else if (lowerBrand.includes('dacia')) {
      if (lowerModel.includes('sandero')) {
        const body = lowerModel.includes('stepway') ? 'SUV' : 'Hatchback';
        variantSpecs = [
          { name: '1.2 16V', engineSize: 1149, horsepower: 75, torque: 107, fuel: 'Benzin', trans: 'Manuel', body, packages: ['Ambiance', 'Laureate', 'Standart / Bilmiyorum'] },
          { name: '0.9 TCe', engineSize: 898, horsepower: 90, torque: 140, fuel: 'Benzin', trans: 'Manuel', body, packages: ['Ambiance', 'Laureate', 'Stepway', 'Standart / Bilmiyorum'] },
          { name: '1.5 dCi', engineSize: 1461, horsepower: 90, torque: 220, fuel: 'Dizel', trans: 'Manuel', body, packages: ['Ambiance', 'Laureate', 'Stepway', 'Standart / Bilmiyorum'] },
          { name: '1.0 TCe', engineSize: 999, horsepower: 90, torque: 160, fuel: 'Benzin', trans: 'Otomatik', body, packages: ['Essential', 'Expression', 'Stepway', 'Standart / Bilmiyorum'] },
          { name: '1.0 ECO-G', engineSize: 999, horsepower: 100, torque: 170, fuel: 'LPG', trans: 'Manuel', body, packages: ['Essential', 'Expression', 'Stepway', 'Standart / Bilmiyorum'] },
        ];
      } else if (lowerModel.includes('duster')) {
        variantSpecs = [
          { name: '1.5 dCi 4x2', engineSize: 1461, horsepower: 110, torque: 260, fuel: 'Dizel', trans: 'Manuel', body: 'SUV', packages: ['Ambiance', 'Laureate', 'Comfort', 'Prestige'] },
          { name: '1.5 dCi 4x4', engineSize: 1461, horsepower: 110, torque: 260, fuel: 'Dizel', trans: 'Manuel', body: 'SUV', packages: ['Laureate', 'Prestige'] },
          { name: '1.3 TCe', engineSize: 1332, horsepower: 130, torque: 240, fuel: 'Benzin', trans: 'Otomatik', body: 'SUV', packages: ['Comfort', 'Prestige', 'Journey'] },
          { name: '1.6 16V', engineSize: 1598, horsepower: 114, torque: 156, fuel: 'Benzin', trans: 'Manuel', body: 'SUV', packages: ['Ambiance', 'Laureate'] },
          { name: '1.0 ECO-G', engineSize: 999, horsepower: 100, torque: 170, fuel: 'LPG', trans: 'Manuel', body: 'SUV', packages: ['Comfort', 'Prestige'] },
        ];
      } else if (lowerModel.includes('logan')) {
        variantSpecs = [
          { name: '1.2 16V', engineSize: 1149, horsepower: 75, torque: 107, fuel: 'Benzin', trans: 'Manuel', body: 'Sedan', packages: ['Ambiance', 'Laureate'] },
          { name: '1.5 dCi', engineSize: 1461, horsepower: 75, torque: 200, fuel: 'Dizel', trans: 'Manuel', body: 'Sedan', packages: ['Ambiance', 'Laureate'] },
          { name: '0.9 TCe', engineSize: 898, horsepower: 90, torque: 140, fuel: 'Benzin', trans: 'Manuel', body: 'Sedan', packages: ['Ambiance', 'Laureate'] },
        ];
      }
    } else if (lowerBrand.includes('opel')) {
      if (lowerModel.includes('astra')) {
        variantSpecs = [
          { name: '1.6 CDTI', engineSize: 1598, horsepower: 136, torque: 320, fuel: 'Dizel', trans: 'Otomatik', body: 'Hatchback', packages: ['Edition', 'Enjoy', 'Dynamic', 'Excellence', 'Cosmo'] },
          { name: '1.4 Turbo', engineSize: 1399, horsepower: 150, torque: 240, fuel: 'Benzin', trans: 'Otomatik', body: 'Hatchback', packages: ['Edition', 'Enjoy', 'Dynamic', 'Excellence'] },
          { name: '1.6 Twinport', engineSize: 1598, horsepower: 115, torque: 155, fuel: 'Benzin', trans: 'Manuel', body: 'Sedan', packages: ['Essentia', 'Edition', 'Cosmo'] },
          { name: '1.2 Turbo', engineSize: 1199, horsepower: 130, torque: 230, fuel: 'Benzin', trans: 'Otomatik', body: 'Hatchback', packages: ['Edition', 'GS', 'Ultimate'] },
        ];
      } else if (lowerModel.includes('corsa')) {
        variantSpecs = [
          { name: '1.2 Benzin', engineSize: 1199, horsepower: 75, torque: 118, fuel: 'Benzin', trans: 'Manuel', body: 'Hatchback', packages: ['Essentia', 'Edition'] },
          { name: '1.2 Turbo', engineSize: 1199, horsepower: 100, torque: 205, fuel: 'Benzin', trans: 'Otomatik', body: 'Hatchback', packages: ['Edition', 'GS', 'Ultimate'] },
          { name: '1.3 CDTI', engineSize: 1248, horsepower: 95, torque: 210, fuel: 'Dizel', trans: 'Manuel', body: 'Hatchback', packages: ['Essentia', 'Enjoy', 'Color Edition'] },
          { name: '1.4 Benzin', engineSize: 1398, horsepower: 90, torque: 130, fuel: 'Benzin', trans: 'Otomatik', body: 'Hatchback', packages: ['Enjoy', 'Color Edition'] },
        ];
      }
    } else if (lowerBrand.includes('nissan')) {
      if (lowerModel.includes('qashqai')) {
        variantSpecs = [
          { name: '1.5 dCi', engineSize: 1461, horsepower: 110, torque: 260, fuel: 'Dizel', trans: 'Manuel', body: 'SUV', packages: ['Visia', 'Tekna', 'Sky Pack', 'Platinum'] },
          { name: '1.2 DIG-T', engineSize: 1197, horsepower: 115, torque: 190, fuel: 'Benzin', trans: 'Otomatik', body: 'SUV', packages: ['Visia', 'Tekna', 'Sky Pack'] },
          { name: '1.3 DIG-T', engineSize: 1332, horsepower: 158, torque: 270, fuel: 'Benzin', trans: 'Otomatik', body: 'SUV', packages: ['Tekna', 'Sky Pack', 'Platinum Premium'] },
          { name: '1.6 dCi', engineSize: 1598, horsepower: 130, torque: 320, fuel: 'Dizel', trans: 'Otomatik', body: 'SUV', packages: ['Tekna', 'Sky Pack', 'Platinum'] },
        ];
      } else if (lowerModel.includes('juke')) {
        variantSpecs = [
          { name: '1.0 DIG-T', engineSize: 999, horsepower: 115, torque: 200, fuel: 'Benzin', trans: 'Otomatik', body: 'SUV', packages: ['Tekna', 'N-Connecta', 'N-Design'] },
          { name: '1.5 dCi', engineSize: 1461, horsepower: 110, torque: 260, fuel: 'Dizel', trans: 'Manuel', body: 'SUV', packages: ['Visia', 'Tekna', 'Special Edition'] },
          { name: '1.6 Benzin', engineSize: 1598, horsepower: 117, torque: 158, fuel: 'Benzin', trans: 'Otomatik', body: 'SUV', packages: ['Visia', 'Tekna'] },
        ];
      }
    } else if (lowerBrand.includes('audi')) {
      if (lowerModel.includes('a6')) {
        variantSpecs = [
          { name: '45 TFSI', engineSize: 1984, horsepower: 245, torque: 370, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['Quattro Advanced', 'Quattro Design', 'Quattro S Line', 'Quattro Sport', 'Advanced', 'Design', 'S Line', 'Sport', 'Standart / Bilmiyorum'] },
          { name: '40 TDI', engineSize: 1968, horsepower: 204, torque: 400, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['Quattro Advanced', 'Quattro Design', 'Quattro S Line', 'Quattro Sport', 'Advanced', 'Design', 'S Line', 'Sport', 'Standart / Bilmiyorum'] },
          { name: '50 TDI', engineSize: 2967, horsepower: 286, torque: 620, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['Quattro Design', 'Quattro S Line', 'Quattro Sport', 'Design', 'S Line', 'Standart / Bilmiyorum'] },
          { name: '55 TFSI', engineSize: 2995, horsepower: 340, torque: 500, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['Quattro Design', 'Quattro S Line', 'Quattro Sport', 'Design', 'S Line', 'Standart / Bilmiyorum'] },
          { name: '2.0 TDI', engineSize: 1968, horsepower: 190, torque: 400, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['Limousine', 'Avant', 'Ultra', 'Standart / Bilmiyorum'] },
          { name: '2.0 TFSI', engineSize: 1984, horsepower: 252, torque: 370, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['Limousine', 'Avant', 'Design', 'Sport', 'Standart / Bilmiyorum'] },
          { name: '3.0 TDI', engineSize: 2967, horsepower: 245, torque: 500, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['Quattro', 'Limousine', 'Avant', 'Standart / Bilmiyorum'] },
        ];
      } else if (lowerModel.includes('a4')) {
        variantSpecs = [
          { name: '40 TDI', engineSize: 1968, horsepower: 204, torque: 400, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['Quattro Advanced', 'Quattro Design', 'Quattro S Line', 'Quattro Sport', 'Advanced', 'Design', 'S Line', 'Sport', 'Standart / Bilmiyorum'] },
          { name: '40 TFSI', engineSize: 1984, horsepower: 204, torque: 320, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['Advanced', 'Design', 'S Line', 'Sport', 'Standart / Bilmiyorum'] },
          { name: '45 TFSI', engineSize: 1984, horsepower: 265, torque: 370, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['Quattro Advanced', 'Quattro S Line', 'Quattro Sport', 'Standart / Bilmiyorum'] },
          { name: '2.0 TDI', engineSize: 1968, horsepower: 190, torque: 400, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['Design', 'Sport', 'Dynamic', 'Standart / Bilmiyorum'] },
          { name: '1.4 TFSI', engineSize: 1395, horsepower: 150, torque: 250, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['Dynamic', 'Design', 'Sport', 'Standart / Bilmiyorum'] },
        ];
      } else if (lowerModel.includes('a5')) {
        variantSpecs = [
          { name: '40 TDI', engineSize: 1968, horsepower: 204, torque: 400, fuel: 'Dizel', trans: 'Otomatik', body: 'Hatchback', packages: ['Quattro Advanced', 'Quattro Design', 'Quattro S Line', 'Quattro Sport', 'Design', 'S Line', 'Standart / Bilmiyorum'] },
          { name: '40 TFSI', engineSize: 1984, horsepower: 204, torque: 320, fuel: 'Benzin', trans: 'Otomatik', body: 'Hatchback', packages: ['Design', 'S Line', 'Sport', 'Standart / Bilmiyorum'] },
          { name: '45 TFSI', engineSize: 1984, horsepower: 265, torque: 370, fuel: 'Benzin', trans: 'Otomatik', body: 'Hatchback', packages: ['Quattro Advanced', 'Quattro S Line', 'Quattro Sport', 'Standart / Bilmiyorum'] },
        ];
      } else if (lowerModel.includes('a3')) {
        variantSpecs = [
          { name: '35 TFSI', engineSize: 1498, horsepower: 150, torque: 250, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['Advanced', 'S Line', 'Design', 'Sport', 'Standart / Bilmiyorum'] },
          { name: '30 TFSI', engineSize: 999, horsepower: 110, torque: 200, fuel: 'Benzin', trans: 'Otomatik', body: 'Hatchback', packages: ['Advanced', 'Dynamic', 'Design', 'Standart / Bilmiyorum'] },
          { name: '1.6 TDI', engineSize: 1598, horsepower: 116, torque: 250, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['Dynamic', 'Design', 'Sport', 'Ambition', 'Standart / Bilmiyorum'] },
          { name: '1.4 TFSI', engineSize: 1395, horsepower: 150, torque: 250, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['Ambition', 'Ambiente', 'Attraction', 'Standart / Bilmiyorum'] },
        ];
      } else {
        variantSpecs = [
          { name: `${modelName} 45 TFSI`, engineSize: 1984, horsepower: 245, torque: 370, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['Quattro Advanced', 'Quattro Design', 'Quattro S Line', 'Advanced', 'S Line', 'Standart / Bilmiyorum'] },
          { name: `${modelName} 40 TDI`, engineSize: 1968, horsepower: 204, torque: 400, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['Quattro Advanced', 'Quattro Design', 'Quattro S Line', 'Advanced', 'S Line', 'Standart / Bilmiyorum'] },
        ];
      }
    } else if (lowerBrand.includes('togg')) {
      variantSpecs = [
        { name: 'V1 RWD Standart Menzil', engineSize: 0, horsepower: 218, torque: 350, fuel: 'Elektrik', trans: 'Otomatik', body: 'SUV', packages: ['V1'] },
        { name: 'V2 RWD Uzun Menzil', engineSize: 0, horsepower: 218, torque: 350, fuel: 'Elektrik', trans: 'Otomatik', body: 'SUV', packages: ['V2'] },
      ];
    } else if (lowerBrand.includes('tesla')) {
      variantSpecs = [
        { name: 'Standard Range RWD', engineSize: 0, horsepower: 283, torque: 420, fuel: 'Elektrik', trans: 'Otomatik', body: 'Sedan', packages: ['Standard'] },
        { name: 'Long Range AWD', engineSize: 0, horsepower: 441, torque: 493, fuel: 'Elektrik', trans: 'Otomatik', body: 'Sedan', packages: ['Long Range'] },
      ];
    }

    if (variantSpecs.length === 0) {
      if (isEconomy) {
        variantSpecs = [
          { name: '1.0 / 1.2 Benzin', engineSize: 1199, horsepower: 90, torque: 160, fuel: 'Benzin', trans: 'Manuel', body: 'Hatchback', packages: ['Standart', 'Comfort'] },
          { name: '1.4 / 1.5 Dizel', engineSize: 1461, horsepower: 95, torque: 220, fuel: 'Dizel', trans: 'Manuel', body: 'Hatchback', packages: ['Standart', 'Comfort'] },
        ];
      } else if (isPremium || isExotic) {
        variantSpecs = [
          { name: '2.0 Benzin Turbo', engineSize: 1998, horsepower: 200, torque: 320, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['Luxury', 'Sport'] },
          { name: '2.0 Dizel Turbo', engineSize: 1995, horsepower: 190, torque: 400, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['Luxury', 'Sport'] },
        ];
      } else {
        variantSpecs = [
          { name: '1.5 Dizel', engineSize: 1499, horsepower: 120, torque: 300, fuel: 'Dizel', trans: 'Otomatik', body: 'Sedan', packages: ['Standart', 'Comfort', 'Premium'] },
          { name: '1.6 Benzin Turbo', engineSize: 1598, horsepower: 150, torque: 240, fuel: 'Benzin', trans: 'Otomatik', body: 'Sedan', packages: ['Standart', 'Comfort', 'Premium'] },
        ];
      }
    }

    for (const vSpec of variantSpecs) {
      const variant = await this.prisma.variant.upsert({
        where: {
          modelId_name: {
            modelId: model.id,
            name: vSpec.name,
          },
        },
        update: {
          engineSize: vSpec.engineSize,
          horsepower: vSpec.horsepower,
          torque: vSpec.torque,
        },
        create: {
          name: vSpec.name,
          modelId: model.id,
          engineSize: vSpec.engineSize,
          horsepower: vSpec.horsepower,
          torque: vSpec.torque,
          cylinders: vSpec.cylinders || 4,
        },
      });

      const fuelType = await this.prisma.fuelType.upsert({
        where: { name: vSpec.fuel },
        update: {},
        create: { name: vSpec.fuel },
      });

      const transType = await this.prisma.transmissionType.upsert({
        where: { name: vSpec.trans },
        update: {},
        create: { name: vSpec.trans },
      });

      const defaultBody = vSpec.body || (isPremium || isExotic ? 'Sedan' : 'Hatchback');
      const bodyType = await this.prisma.bodyType.upsert({
        where: { name: defaultBody },
        update: {},
        create: { name: defaultBody },
      });

      const driveType = await this.prisma.driveType.upsert({
        where: { name: isPremium || isExotic ? 'Arkadan İtiş' : 'Önden Çekiş' },
        update: {},
        create: { name: isPremium || isExotic ? 'Arkadan İtiş' : 'Önden Çekiş' },
      });

      const packagesList = vSpec.packages && vSpec.packages.length > 0
        ? vSpec.packages
        : ['Standart', 'Comfort', 'Premium'];

      for (const pName of packagesList) {
        const pkg = await this.prisma.package.upsert({
          where: {
            variantId_name: {
              variantId: variant.id,
              name: pName,
            },
          },
          update: {},
          create: {
            name: pName,
            variantId: variant.id,
          },
        });

        const specPrice = pName.includes('GT') || pName.includes('Premium') || pName.includes('AMG') || pName.includes('M Sport') || pName.includes('Icon')
          ? Math.round(marketAvg * 1.15)
          : marketAvg;

        const spec = await this.prisma.vehicleSpecification.create({
          data: {
            year,
            manufacturerId: manufacturer.id,
            modelId: model.id,
            variantId: variant.id,
            packageId: pkg.id,
            bodyTypeId: bodyType.id,
            fuelTypeId: fuelType.id,
            transmissionTypeId: transType.id,
            driveTypeId: driveType.id,
            originalMSRP: specPrice * 1.2,
            popularityScore: isPremium || isEconomy ? 8.5 : 7.0,
            reliabilityScore: 8.0,
          },
        });

        await this.prisma.vehicleMarketPrice.create({
          data: {
            vehicleSpecificationId: spec.id,
            currentMarketAverage: specPrice,
            averageListingPrice: Math.round(specPrice * 1.03),
            minPrice: Math.round(specPrice * 0.92),
            maxPrice: Math.round(specPrice * 1.08),
            regionalPriceDifferences: JSON.stringify({
              Istanbul: 1.0,
              Ankara: 0.98,
              Izmir: 0.99,
            }),
            averageSellingTime: 18,
          },
        });
      }
    }
  }

  private async ensureMajorBrandsAndModelsSeeded() {
    const majorCatalog = [
      { brand: 'Alfa Romeo', models: ['147', '156', '159', 'Giulia', 'Giulietta', 'Mito', 'Stelvio', 'Tonale'] },
      { brand: 'Audi', models: ['A1', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'Q2', 'Q3', 'Q5', 'Q7', 'Q8', 'R8', 'TT'] },
      { brand: 'BMW', models: ['1 Series', '2 Series', '3 Series', '4 Series', '5 Series', '6 Series', '7 Series', '8 Series', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'Z4', 'i3', 'i4', 'i8', 'iX'] },
      { brand: 'Chery', models: ['Alia', 'Chance', 'Kimo', 'Omoda 5', 'Tiggo 3', 'Tiggo 4 Pro', 'Tiggo 7 Pro', 'Tiggo 8 Pro'] },
      { brand: 'Chevrolet', models: ['Aveo', 'Camaro', 'Captiva', 'Cruze', 'Epica', 'Kalos', 'Lacetti', 'Spark', 'Trax'] },
      { brand: 'Citroen', models: ['C-Elysee', 'C1', 'C2', 'C3', 'C3 Aircross', 'C3 Picasso', 'C4', 'C4 Aircross', 'C4 Cactus', 'C4 Picasso', 'C5', 'C5 Aircross', 'DS3', 'DS4', 'DS5', 'Saxo', 'Xsara'] },
      { brand: 'Cupra', models: ['Born', 'Formentor', 'Leon'] },
      { brand: 'Dacia', models: ['Duster', 'Jogger', 'Lodgy', 'Logan', 'Sandero', 'Solenza', 'Spring'] },
      { brand: 'Fiat', models: ['124 Spider', '500', '500L', '500X', 'Albea', 'Bravo', 'Doblo', 'Egea', 'Fiorino', 'Freemont', 'Idea', 'Linea', 'Marea', 'Palio', 'Panda', 'Punto', 'Siena', 'Stilo', 'Tempra', 'Tipo', 'Uno'] },
      { brand: 'Ford', models: ['B-Max', 'C-Max', 'Escort', 'Fiesta', 'Focus', 'Fusion', 'Galaxy', 'Ka', 'Kuga', 'Mondeo', 'Mustang', 'Puma', 'S-Max', 'Taunus'] },
      { brand: 'Honda', models: ['Accord', 'Civic', 'CR-V', 'City', 'HR-V', 'Jazz', 'Prelude', 'S2000'] },
      { brand: 'Hyundai', models: ['Accent', 'Accent Blue', 'Accent Era', 'Atos', 'Bayon', 'Coupe', 'Elantra', 'Getz', 'Genesis', 'i10', 'i20', 'i30', 'i40', 'Ioniq', 'Ioniq 5', 'Ioniq 6', 'Kona', 'Matrix', 'Santa Fe', 'Sonata', 'Tucson'] },
      { brand: 'Jaguar', models: ['F-Pace', 'F-Type', 'I-Pace', 'XE', 'XF', 'XJ'] },
      { brand: 'Jeep', models: ['Cherokee', 'Compass', 'Grand Cherokee', 'Patriot', 'Renegade', 'Wrangler'] },
      { brand: 'Kia', models: ['Ceed', 'Cerato', 'EV6', 'Niro', 'Picanto', 'Rio', 'Sorento', 'Soul', 'Sportage', 'Stinger', 'Stonic', 'Venga'] },
      { brand: 'Land Rover', models: ['Defender', 'Discovery', 'Discovery Sport', 'Freelander', 'Range Rover', 'Range Rover Evoque', 'Range Rover Sport', 'Range Rover Velar'] },
      { brand: 'Maserati', models: ['Ghibli', 'GranCabrio', 'GranTurismo', 'Grecale', 'Levante', 'Quattroporte'] },
      { brand: 'Mazda', models: ['2', '3', '5', '6', 'CX-3', 'CX-5', 'CX-9', 'MX-5', 'RX-8'] },
      { brand: 'Mercedes-Benz', models: ['A-Class', 'B-Class', 'C-Class', 'CL', 'CLA', 'CLK', 'CLS', 'E-Class', 'EQA', 'EQB', 'EQC', 'EQE', 'EQS', 'G-Class', 'GL', 'GLA', 'GLB', 'GLC', 'GLE', 'GLK', 'GLS', 'ML', 'S-Class', 'SL', 'SLC', 'SLK'] },
      { brand: 'MG', models: ['4', '5', 'E-HS', 'HS', 'Marvel R', 'ZS'] },
      { brand: 'Mini', models: ['Clubman', 'Cooper', 'Countryman', 'Paceman'] },
      { brand: 'Nissan', models: ['Almera', 'Juke', 'Micra', 'Note', 'Pathfinder', 'Primera', 'Pulsar', 'Qashqai', 'Sunny', 'X-Trail'] },
      { brand: 'Opel', models: ['Adam', 'Ampera', 'Antara', 'Astra', 'Cascada', 'Corsa', 'Crossland', 'Grandland', 'Insignia', 'Meriva', 'Mokka', 'Tigra', 'Vectra', 'Zafira'] },
      { brand: 'Peugeot', models: ['106', '107', '206', '207', '208', '301', '307', '308', '407', '508', '2008', '3008', '5008', 'RCZ'] },
      { brand: 'Porsche', models: ['718 Boxster', '718 Cayman', '911', 'Boxster', 'Cayenne', 'Cayman', 'Macan', 'Panamera', 'Taycan'] },
      { brand: 'Renault', models: ['Austral', 'Captur', 'Clio', 'Fluence', 'Kadjar', 'Koleos', 'Laguna', 'Latitude', 'Megane', 'Modus', 'Safrane', 'Scenic', 'Symbol', 'Talisman', 'Twingo', 'Zoe'] },
      { brand: 'Seat', models: ['Alhambra', 'Altea', 'Arona', 'Ateca', 'Cordoba', 'Ibiza', 'Leon', 'Tarraco', 'Toledo'] },
      { brand: 'Skoda', models: ['Fabia', 'Favorit', 'Felicia', 'Kamiq', 'Karoq', 'Kodiaq', 'Octavia', 'Rapid', 'Roomster', 'Scala', 'Superb', 'Yeti'] },
      { brand: 'Subaru', models: ['BRZ', 'Forester', 'Impreza', 'Legacy', 'Outback', 'XV'] },
      { brand: 'Suzuki', models: ['Alto', 'Baleno', 'Jimny', 'S-Cross', 'Splash', 'Swift', 'Vitara', 'Wagon R'] },
      { brand: 'Tesla', models: ['Model 3', 'Model S', 'Model X', 'Model Y'] },
      { brand: 'Togg', models: ['T10X'] },
      { brand: 'Toyota', models: ['Auris', 'Avensis', 'C-HR', 'Camry', 'Carina', 'Celica', 'Corolla', 'Corona', 'Cressida', 'GT86', 'Land Cruiser', 'MR2', 'Picnic', 'Prius', 'RAV4', 'Starlet', 'Supra', 'Tercel', 'Urban Cruiser', 'Verso', 'Yaris'] },
      { brand: 'Volvo', models: ['C30', 'C70', 'S40', 'S60', 'S80', 'S90', 'V40', 'V40 Cross Country', 'V60', 'V90', 'XC40', 'XC60', 'XC90'] },
      { brand: 'Volkswagen', models: ['Arteon', 'Bora', 'Beetle', 'Golf', 'ID.3', 'ID.4', 'Jetta', 'Lupo', 'Passat', 'Passat Variant', 'Polo', 'Scirocco', 'Sharan', 'T-Roc', 'Tiguan', 'Touareg', 'Touran'] }
    ];

    for (const item of majorCatalog) {
      const mfg = await this.prisma.manufacturer.upsert({
        where: { name: item.brand },
        update: {},
        create: { name: item.brand },
      });

      for (const mName of item.models) {
        await this.prisma.model.upsert({
          where: {
            manufacturerId_name: {
              manufacturerId: mfg.id,
              name: mName,
            },
          },
          update: {},
          create: {
            name: mName,
            manufacturerId: mfg.id,
          },
        });
      }
    }
  }

  async createVehicleRequest(data: {
    brand: string;
    model: string;
    year?: number;
    note?: string;
    phone?: string;
    email?: string;
  }) {
    return this.prisma.vehicleRequest.create({
      data: {
        brand: data.brand,
        model: data.model,
        year: data.year ? Number(data.year) : null,
        note: data.note || null,
        phone: data.phone || null,
        email: data.email || null,
      },
    });
  }

  async adjustMarketPrices(percentage: number, brandName?: string) {
    const multiplier = 1 + (percentage / 100);
    const whereCondition = brandName
      ? { manufacturer: { name: { equals: brandName } } }
      : {};

    const specs = await this.prisma.vehicleSpecification.findMany({
      where: whereCondition,
    });

    let count = 0;
    for (const spec of specs) {
      if (spec.originalMSRP && spec.originalMSRP > 0) {
        await this.prisma.vehicleSpecification.update({
          where: { id: spec.id },
          data: { originalMSRP: Math.round(spec.originalMSRP * multiplier) },
        });
        count++;
      }
    }
    return { success: true, count, percentage, brand: brandName || 'ALL' };
  }
}
