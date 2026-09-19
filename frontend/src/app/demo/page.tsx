'use client';

/**
 * DEMO — BACKEND'SIZ, GERCEK VERIYLE.
 *
 * Vercel'de tek basina calisir. `public/demo-market.json` icinde her (havuz,
 * yil) icin GERCEK fiyat motorunun urettigi FMV vardir; bu sayfa yalnizca
 * kilometre duzeltmesini ve musteriye donuk fiyat formullerini uygular
 * (`lib/demo-pricing.ts`). Yani gosterilen sayilar motorun kendi sayilaridir.
 *
 * Secim zinciri sabit derinlikte DEGILDIR ve mantigi `lib/demo-selection.ts`
 * icinde, arayuzden bagimsiz sinanabilir halde durur.
 *
 * DROPDOWN'LAR KATALOGDAN GELIR, FIYAT HAVUZLARINDAN DEGIL. Fiyat havuzu
 * haftalik taramanin nereye kadar geldigini yansitir; secim agaci onu
 * yansitmamalidir. Havuzu olmayan arac secilebilir kalir ve fiyat yerine
 * nedeni gosterilir.
 *
 * HAREKET: tamami CSS (`globals.css` -> "DEMO — HAREKET KATMANI"). Tek
 * istisna fiyat sayaci; o da tek bir requestAnimationFrame dongusudur
 * (`lib/use-count-up.ts`). Sayfaya animasyon icin ek bagimlilik girmez ve
 * hareket yalnizca transform/opacity uzerinden yapilir.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  Check,
  Handshake,
  Info,
  Loader2,
  Search,
  TrendingUp,
  AlertTriangle,
  Database,
  Clock,
} from 'lucide-react';
import { quote, hasEnoughEvidence, formatTL, DemoQuote } from '../../lib/demo-pricing';
import { useCountUp } from '../../lib/use-count-up';
import {
  applyChoice,
  availabilityOf,
  buildCatalog,
  buildChain,
  headingFor,
  labelPathOf,
  resolvePool,
  yearEvidenceOf,
  yearsOf,
  type CatalogNode,
  type DemoData,
} from '../../lib/demo-selection';

/**
 * Guven tonu. Kirmizi marka rengidir, "kotu" anlamina gelmez; bu yuzden
 * trafik isigi yerine mevcut paletten iki ton kullanilir: guclu kanit
 * icin olumlu yesil, zayif kanit ve uzman kontrolu icin uyari kehribari.
 */
const confidenceTone = (pct: number, needsReview: boolean): string => {
  if (needsReview || pct < 70) return '#d97706';
  if (pct < 80) return '#f59e0b';
  return '#047857';
};

export default function DemoPage() {
  const [data, setData] = useState<DemoData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** Secilen dugum kimlikleri, koktan asagi: ["audi","audi/a3","audi/a3/a3-sedan", ...] */
  const [selection, setSelection] = useState<string[]>([]);
  const [year, setYear] = useState('');
  const [km, setKm] = useState('');

  /**
   * SON DOKUNULAN ALAN — yalnizca gorsel geri bildirim icin.
   *
   * Secim mantigiyla ilgisi YOKTUR: hangi alanin kisa accent halkasini
   * oynatacagini soyler, secimi ne kurar ne degistirir. Bu yuzden `selection`
   * ile birlestirilmedi; fiyat katmanina hicbir sekilde girmez.
   *
   * `-1` yil alanini temsil eder (zincirin disinda, derinligi yok).
   */
  const [pulsedDepth, setPulsedDepth] = useState<number | null>(null);
  useEffect(() => {
    if (pulsedDepth === null) return;
    const timer = setTimeout(() => setPulsedDepth(null), 620);
    return () => clearTimeout(timer);
  }, [pulsedDepth]);

  useEffect(() => {
    fetch('/demo-market.json')
      .then((r) => {
        if (!r.ok) throw new Error(`Veri yüklenemedi (${r.status})`);
        return r.json() as Promise<DemoData>;
      })
      .then(setData)
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  const catalog = useMemo(
    () => (data ? buildCatalog(data) : { roots: [], byId: new Map() }),
    [data],
  );
  const chain = useMemo(
    () => buildChain(catalog, selection),
    [catalog, selection],
  );
  const pool = useMemo(
    () => (data ? resolvePool(data, selection) : null),
    [data, selection],
  );
  const years = useMemo(() => yearsOf(pool), [pool]);
  const labelPath = useMemo(
    () => labelPathOf(catalog, selection),
    [catalog, selection],
  );
  /** 'INCOMPLETE' | 'PRICEABLE' | 'NO_PRICE_DATA' */
  const availability = useMemo(
    () => (data ? availabilityOf(catalog, data, selection) : 'INCOMPLETE'),
    [catalog, data, selection],
  );

  /**
   * Ust secim degisince yil KOR RESETLENMEZ: secili yil yeni havuzda da
   * varsa korunur, yoksa yok sayilir. Durum temizlemek yerine TURETILIR;
   * bir effect icinden setState cagirmak zincirleme render uretir.
   */
  const activeYear = useMemo(
    () => (pool && year && pool.years[year] ? year : ''),
    [pool, year],
  );

  const result: DemoQuote | null = useMemo(() => {
    if (!pool || !activeYear) return null;
    const row = pool.years[activeYear];
    if (!row) return null;

    const evidence = yearEvidenceOf(row);
    if (
      !hasEnoughEvidence(
        evidence.directComparables,
        evidence.borrowedComparables,
      )
    ) {
      return null;
    }

    const mileageKm = Number(km.replace(/\D/g, '')) || evidence.kmPoints[1];
    return quote({
      kmPoints: evidence.kmPoints,
      fmvPoints: evidence.fmvPoints,
      mileageKm,
      directComparables: evidence.directComparables,
      borrowedComparables: evidence.borrowedComparables,
      effectiveComparables: evidence.effectiveComparables,
      engineConfidencePct: evidence.engineConfidencePct,
      dispersion: evidence.dispersion,
      engineManualCode: evidence.engineManualCode,
    });
  }, [pool, activeYear, km]);

  const yearRow = pool && activeYear ? pool.years[activeYear] : null;

  /**
   * Sayilar yerinden ziplamaz, yeni degere sayarak gider. Fiyat ortadan
   * kalkarsa (gecersiz secim) bolum komple kalkar ve sayac bir sonraki
   * gosterimde bastan baslar; yani eski fiyat yeni araca hic takilmaz.
   */
  const shownMarketValue = useCountUp(result?.fairMarketValue ?? 0);
  const shownCashOffer = useCountUp(result?.cashOffer ?? 0);
  const shownConsignmentNet = useCountUp(result?.customerConsignmentNet ?? 0);

  /**
   * ILERLEME — TURETILIR, SAKLANMAZ.
   *
   * Adim sayisi markadan markaya degisir (Alfa Romeo'da 4, Audi'de 6), bu
   * yuzden sabit bir "1/6" yazmak yanlis olurdu.
   *
   * Toplam, GORUNEN zincirden de okunamaz: zincir bir sonraki seviyeyi ancak
   * secim yapilinca acar, yani payda ilerledikce BUYUR ve cubuk adim
   * attiginiz anda GERI CEKILIRDI (1/2 = %50 iken 1/3 = %33). Bunun yerine o
   * ana kadarki secimin altindaki EN DERIN yol olculur: payda ya sabit kalir
   * ya da kisa bir dala girildiginde kucululur, dolayisiyla oran yalnizca
   * ileri gider.
   *
   * Kilometre sayilmaz: zorunlu degildir, bos birakilirsa o yilin medyani
   * kullanilir.
   */
  const deepestDepth = useMemo(() => {
    const deepest = (nodes: CatalogNode[], depth: number): number =>
      nodes.reduce(
        (max, node) =>
          Math.max(
            max,
            node.children.length === 0
              ? depth + 1
              : deepest(node.children, depth + 1),
          ),
        depth,
      );
    const scope = selection.length
      ? catalog.byId.get(selection[selection.length - 1])?.children ?? []
      : catalog.roots;
    return scope.length === 0 ? selection.length : deepest(scope, selection.length);
  }, [catalog, selection]);

  /** Zincir + yil. En az bir adim daima vardir. */
  const totalSteps = Math.max(1, deepestDepth) + 1;
  const completedSteps = Math.min(
    totalSteps,
    selection.filter(Boolean).length + (activeYear ? 1 : 0),
  );

  if (loadError) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="demo-fade max-w-md text-center">
          <AlertTriangle className="mx-auto mb-3 text-[#a30022]" size={32} />
          <p className="text-sm text-[var(--text-secondary)]">{loadError}</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-[#a30022]" size={28} />
      </main>
    );
  }

  const selectClass =
    'demo-select w-full rounded-lg border border-[var(--border-gray)] bg-[var(--card-bg)] px-3 py-2.5 text-sm outline-none disabled:opacity-40';
  const inputClass =
    'demo-input w-full rounded-lg border border-[var(--border-gray)] bg-[var(--card-bg)] px-3 py-2.5 text-sm outline-none disabled:opacity-40';

  return (
    <main className="demo-page min-h-screen px-4 py-10 md:py-14">
      <div className="mx-auto max-w-5xl">
        {/*
          Ogeler okuma sirasiyla girer: once ne baktigini soyleyen rozet ve
          baslik, sonra ne yapacagini soyleyen aciklama, en son yapacagi yer
          olan kart. Gecikmeler yalnizca opacity/transform'u erteler; icerik
          ilk karede hazirdir, yani kimse bekletilmez.
        */}
        <header className="mb-8">
          <div className="demo-rise inline-flex items-center gap-2 rounded-full bg-[#a30022]/10 px-3 py-1 text-xs font-medium text-[#a30022]">
            <Database size={13} />
            Canlı piyasa verisi
          </div>
          <h1 className="demo-rise demo-delay-1 mt-3 text-[2rem] font-semibold leading-[1.1] tracking-tight md:text-[2.75rem]">
            Aracınız ne eder?
          </h1>
          <p className="demo-rise demo-delay-2 mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
            {formatTL(data.catalogLeafCount)} araç donanımının tamamı seçilebilir;{' '}
            {formatTL(data.poolCount)} tanesi için {formatTL(data.listingCount)} gerçek
            ilandan türetilmiş güncel fiyat var. Aracınızı seçin; nakit alım
            teklifini ve konsinye ile eline geçecek tutarı anında görün.
          </p>
        </header>

        <section className="demo-rise demo-delay-3 rounded-2xl border border-[var(--border-gray)] bg-[var(--card-bg)] p-5 shadow-[0_1px_2px_rgba(15,17,21,0.04),0_12px_32px_-24px_rgba(15,17,21,0.25)] md:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Search size={16} className="text-[#a30022]" />
              Araç seçimi
            </div>
            <span className="text-xs tabular-nums text-[var(--text-secondary)]">
              {completedSteps} / {totalSteps}
            </span>
          </div>

          {/*
            Sihirbaza cevrilmedi: tek sayfadaki form aynen duruyor, ustune
            yalnizca "neredeyim" sorusunu yanitlayan bir sac teli eklendi.
          */}
          <div
            className="demo-progress-track mb-5"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={totalSteps}
            aria-valuenow={completedSteps}
            aria-label="Araç seçimi ilerlemesi"
          >
            <div
              className="demo-progress-fill"
              style={{
                width: `${Math.round((completedSteps / Math.max(1, totalSteps)) * 100)}%`,
              }}
            />
          </div>

          <div className="demo-fields grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {chain.map(({ depth, options, value }) => (
              // Anahtar SECENEK KUMESINI tasir: ust secim degisip bu alanin
              // secenekleri yenilendiginde alan kisa bir tazelenme animasyonu
              // oynatir. Ayni seviyede secim yapmak seti degistirmedigi icin
              // kullanici kendi sectigi alanda hicbir hareket gormez.
              <label
                className={`demo-refresh block${
                  pulsedDepth === depth ? ' demo-pulse' : ''
                }`}
                key={`${depth}:${options.map((o) => o.id).join('|')}`}
              >
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
                  {headingFor(data, selection, depth)}
                  {value && (
                    // Secildigini soyleyen tek isaret; renk tasimaz, yalnizca
                    // "bu adim tamam" der.
                    <Check size={12} className="text-[#a30022]" aria-hidden />
                  )}
                </span>
                <select
                  className={selectClass}
                  data-filled={value ? 'true' : 'false'}
                  value={value}
                  onChange={(e) => {
                    setPulsedDepth(depth);
                    setSelection((previous) =>
                      applyChoice(catalog, previous, depth, e.target.value),
                    );
                  }}
                >
                  <option value="">Seçiniz</option>
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label
              className={`demo-refresh block${
                pulsedDepth === -1 ? ' demo-pulse' : ''
              }`}
              key={`yil:${selection.join('/')}`}
            >
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
                Yıl
                {activeYear && (
                  <Check size={12} className="text-[#a30022]" aria-hidden />
                )}
              </span>
              <select
                className={selectClass}
                data-filled={activeYear ? 'true' : 'false'}
                value={activeYear}
                disabled={!pool}
                onChange={(e) => {
                  setPulsedDepth(-1);
                  setYear(e.target.value);
                }}
              >
                <option value="">Seçiniz</option>
                {years.map((y) => (
                  <option key={y} value={String(y)}>
                    {y} ({pool?.years[String(y)][6]} ilan)
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                Kilometre{' '}
                {yearRow ? (
                  // Varsayilan kilometre yil degisince degisir; sessizce
                  // yer degistirmesin diye yumusak girer. Kullanicinin
                  // YAZDIGI deger buradan etkilenmez.
                  <span
                    className="demo-fade font-normal opacity-60"
                    key={yearRow[1]}
                  >
                    — boş bırakılırsa {formatTL(yearRow[1])} km varsayılır
                  </span>
                ) : null}
              </span>
              <input
                className={inputClass}
                inputMode="numeric"
                placeholder={yearRow ? formatTL(yearRow[1]) : 'örn. 120.000'}
                value={km}
                disabled={!year}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '');
                  setKm(digits ? formatTL(Number(digits)) : '');
                }}
              />
            </label>
          </div>

          {availability === 'PRICEABLE' && pool && (
            <p
              className="demo-fade mt-4 border-t border-[var(--border-gray)] pt-3 text-xs text-[var(--text-secondary)]"
              key={selection.join('/')}
            >
              Fiyat havuzu:{' '}
              <span className="font-medium text-[var(--foreground)]">
                {labelPath.join(' › ')}
              </span>{' '}
              — {formatTL(pool.n)} emsal ilan
            </p>
          )}
        </section>

        {/*
          ARAC VAR, FIYAT YOK.

          Kaynakta var olan ama guncel emsal kaniti bulunmayan arac GIZLENMEZ.
          Eskiden dropdown yalnizca fiyat havuzlarindan kuruldugu icin bu
          araclar hic gorunmuyordu ve kullanici kendi arabasini bulamiyordu —
          sanki hic yokmus gibi. Artik secilebilir, ve neden fiyat
          gosterilmedigi aciklanir.
        */}
        {/*
          IKI DURUM AYRI GORUNUR.

          "Fiyat yok" ile "fiyat var ama uzman baksin" ayni kehribar kutuda
          gosteriliyordu; kullanici ikisini ayirt edemiyordu. Fiyatin HIC
          olmadigi durum artik notr/bilgilendirici bir kutudur — bir sey ters
          gitmedi, elimizde emsal yok. Uyari rengi, fiyatin EKRANDA OLDUGU ama
          uzman onayi istendigi duruma birakildi (asagida).

          Metinler ve kosullar degismedi; yalnizca sunum ayrildi.
        */}
        {availability === 'NO_PRICE_DATA' && (
          <div className="demo-rise mt-5 flex items-start gap-3 rounded-xl border border-[var(--border-gray)] bg-[var(--accent-gray)] p-4 text-sm">
            <Info
              size={18}
              className="mt-0.5 shrink-0 text-[var(--text-secondary)]"
            />
            <div>
              <p className="font-medium text-[var(--foreground)]">
                {labelPath.join(' › ')}
              </p>
              <p className="mt-1 leading-relaxed text-[var(--text-secondary)]">
                Bu araç için fiyat hesaplamak için yeterli güncel emsal
                bulunamadı. Yanlış bir fiyat göstermektense göstermiyoruz —
                aracınız uzmanımız tarafından değerlendirilecektir.
              </p>
            </div>
          </div>
        )}

        {pool && activeYear && !result && (
          <div className="demo-rise mt-5 flex items-start gap-3 rounded-xl border border-[var(--border-gray)] bg-[var(--accent-gray)] p-4 text-sm">
            <Info
              size={18}
              className="mt-0.5 shrink-0 text-[var(--text-secondary)]"
            />
            <p className="leading-relaxed text-[var(--text-secondary)]">
              Bu yıl için yeterli emsal yok. Yanlış bir fiyat göstermektense fiyat
              göstermiyoruz — bu araç manuel değerlendirmeye gider.
            </p>
          </div>
        )}

        {result && (
          /*
            Bolum, fiyat OLUSTUGUNDA monte olur ve bir kez iceri girer;
            sonraki secimlerde yerinde kalir ki sayilar eski degerden
            yenisine SAYARAK gitsin. Arac gecersizlesirse (marka degisimi)
            `result` null olur, bolum ayni karede kalkar: yanlis araca
            takili eski fiyat ekranda kalmaz.
          */
          <section className="demo-result mt-5 space-y-4">
            <div className="demo-card rounded-2xl border border-[var(--border-gray)] bg-[var(--card-bg)] p-5 shadow-[0_1px_2px_rgba(15,17,21,0.04),0_12px_32px_-24px_rgba(15,17,21,0.25)] md:p-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                    Tahmini piyasa değeri
                  </div>
                  <div className="mt-1 text-[2.25rem] font-semibold leading-none tracking-tight tabular-nums md:text-[2.75rem]">
                    {formatTL(shownMarketValue)}{' '}
                    <span className="text-xl font-normal opacity-50">TL</span>
                  </div>
                  <div className="mt-1.5 text-xs text-[var(--text-secondary)]">
                    Emsal merkezi, girilen kilometreye göre düzeltilmiş
                  </div>
                </div>

                {/* Kanit bloku sayidan AYRI, biraz gecikmeli girer. */}
                <div className="demo-fade demo-delay-2 text-xs text-[var(--text-secondary)] sm:text-right">
                  <div className="flex items-center gap-1.5 sm:justify-end">
                    <TrendingUp size={13} className="shrink-0" />
                    {/*
                      Turkcede sayidan sonra cogul eki GELMEZ: "1 gerçek emsal",
                      "20 gerçek emsal". Ayrim tekil/cogulda degil, kanitin
                      DOGRUDAN mi yoksa yakin yildan mi geldigindedir.
                    */}
                    <span className="font-medium text-[var(--foreground)]">
                      {formatTL(result.directComparables)} gerçek emsal
                    </span>
                  </div>
                  {result.borrowedComparables > 0 && (
                    <div className="mt-1 sm:pr-[18px]">
                      + {formatTL(result.borrowedComparables)} yakın yıl emsali
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-2 sm:justify-end">
                    <span>Güven: %{result.confidencePct}</span>
                    <span
                      className="demo-confidence-track"
                      role="img"
                      aria-label={`Veri güveni yüzde ${result.confidencePct}`}
                    >
                      <span
                        className="demo-confidence-fill block"
                        style={{
                          width: `${Math.max(6, Math.min(100, result.confidencePct))}%`,
                          backgroundColor: confidenceTone(
                            result.confidencePct,
                            result.requiresManualApproval,
                          ),
                        }}
                      />
                    </span>
                  </div>
                </div>
              </div>

              {result.mileageAdjustment !== 0 && (
                <p className="demo-fade demo-delay-2 mt-3 text-xs text-[var(--text-secondary)]">
                  Kilometre düzeltmesi:{' '}
                  <strong className={result.mileageAdjustment > 0 ? 'text-emerald-700' : 'text-[#a30022]'}>
                    {result.mileageAdjustment > 0 ? '+' : ''}
                    {formatTL(result.mileageAdjustment)} TL
                  </strong>{' '}
                  (bu yılın ortalaması {formatTL(result.referenceMedianMileage)} km)
                </p>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="demo-rise demo-delay-1 demo-card rounded-2xl border-2 border-[var(--border-gray)] bg-[var(--card-bg)] p-5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Banknote size={17} className="text-[var(--text-secondary)]" />
                  Nakit alım — bugün
                </div>
                <div className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
                  {formatTL(shownCashOffer)}{' '}
                  <span className="text-base font-normal opacity-60">TL</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                  Aracınız aynı gün devredilir, ödeme peşin yapılır. Satış riski,
                  ekspertiz, ilan ve bekleme maliyeti bize aittir.
                </p>
              </div>

              <div className="demo-rise demo-delay-2 demo-card demo-card-accent rounded-2xl border-2 border-[#a30022] bg-[#a30022]/[0.03] p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#a30022]">
                    <Handshake size={17} />
                    Konsinye — elinize geçecek
                  </div>
                  <span className="demo-pop demo-delay-3 rounded-full bg-[#a30022] px-2 py-0.5 text-[10px] font-semibold text-white">
                    +{formatTL(result.consignmentAdvantage)} TL
                  </span>
                </div>
                <div className="mt-3 text-3xl font-semibold tracking-tight tabular-nums text-[#a30022]">
                  {formatTL(shownConsignmentNet)}{' '}
                  <span className="text-base font-normal opacity-60">TL</span>
                </div>

                {/*
                  HESAP ACIK YAZILIR. Net tutar BEKLENEN SATIS'tan komisyon
                  dusulerek bulunur, ilan fiyatindan degil; ilan fiyati pazarlik
                  payi tasidigi icin her zaman daha yuksektir. Ikisi yan yana
                  yazilip beklenen satis gizlendiginde kart "ilan - komisyon"
                  gibi okunuyor ve rakamlar tutmuyordu.
                */}
                <dl className="demo-fade demo-delay-3 mt-3 space-y-1.5 text-xs text-[var(--text-secondary)]">
                  <div className="flex justify-between">
                    <dt>İlan fiyatı</dt>
                    <dd className="font-medium tabular-nums">
                      {formatTL(result.consignmentListingPrice)} TL
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Beklenen satış</dt>
                    <dd className="font-medium tabular-nums">
                      {formatTL(result.expectedSalePrice)} TL
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Komisyonumuz</dt>
                    <dd className="font-medium tabular-nums">
                      − {formatTL(result.consignmentCommission)} TL
                    </dd>
                  </div>
                  <div className="flex justify-between border-t border-[#a30022]/20 pt-1.5 text-[var(--text-primary)]">
                    <dt className="font-medium">Elinize geçecek</dt>
                    <dd className="font-semibold tabular-nums">
                      {formatTL(result.customerConsignmentNet)} TL
                    </dd>
                  </div>
                  <div className="flex justify-between pt-0.5">
                    <dt className="flex items-center gap-1">
                      <Clock size={11} /> Tahmini satış
                    </dt>
                    <dd className="font-medium">
                      {result.estimatedDaysToSellMin}–{result.estimatedDaysToSellMax} gün
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            {result.requiresManualApproval && (
              // Fiyat EKRANDA KALIR; uyari altina bilgilendirme olarak girer.
              // Hata ekrani degil, "bu araca uzman baksin" notudur. Kehribar
              // tonu KIRMIZI ALARMA cevrilmez: burada ters giden bir sey yok,
              // yalnizca sayinin arkasindaki kanit ince.
              <div className="demo-rise demo-delay-3 flex items-start gap-3 rounded-xl border border-amber-300/50 bg-amber-50/70 p-4 text-sm dark:border-amber-500/25 dark:bg-amber-500/[0.07]">
                <AlertTriangle
                  size={18}
                  className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
                />
                <div>
                  <p className="font-medium text-amber-900 dark:text-amber-200">
                    Uzman kontrolü önerilir
                  </p>
                  <p className="mt-1 leading-relaxed text-amber-900/80 dark:text-amber-200/75">
                    {result.manualApprovalReason}
                  </p>
                </div>
              </div>
            )}

            <p className="demo-fade demo-delay-3 text-xs leading-relaxed text-[var(--text-secondary)]">
              İlan fiyatı pazarlık payı taşır; komisyon beklenen satış üzerinden
              alınır. Fiyatlar {formatTL(data.listingCount)} gerçek ilandan hesaplanır;
              aracın hasar/boya durumu ve ekspertiz sonucuna göre nihai teklif
              değişebilir. Veri tarihi:{' '}
              {new Date(data.generatedAt).toLocaleDateString('tr-TR')}.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
