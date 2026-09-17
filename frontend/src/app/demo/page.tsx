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
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  Handshake,
  Loader2,
  Search,
  TrendingUp,
  AlertTriangle,
  Database,
  Clock,
} from 'lucide-react';
import { quote, hasEnoughEvidence, formatTL, DemoQuote } from '../../lib/demo-pricing';
import {
  applyChoice,
  branchKeyIndex,
  buildChain,
  headingFor,
  poolEntries,
  resolvePool,
  yearEvidenceOf,
  yearsOf,
  type DemoData,
} from '../../lib/demo-selection';

export default function DemoPage() {
  const [data, setData] = useState<DemoData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** Secilen etiketler, koktan asagi: ["Audi","A3","A3 Sedan", ...] */
  const [selection, setSelection] = useState<string[]>([]);
  const [year, setYear] = useState('');
  const [km, setKm] = useState('');

  useEffect(() => {
    fetch('/demo-market.json')
      .then((r) => {
        if (!r.ok) throw new Error(`Veri yüklenemedi (${r.status})`);
        return r.json() as Promise<DemoData>;
      })
      .then(setData)
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  const entries = useMemo(() => (data ? poolEntries(data) : []), [data]);
  const branchKeys = useMemo(() => branchKeyIndex(entries), [entries]);
  const chain = useMemo(() => buildChain(entries, selection), [entries, selection]);
  const pool = useMemo(() => resolvePool(entries, selection), [entries, selection]);
  const years = useMemo(() => yearsOf(pool), [pool]);

  /**
   * Ust secim degisince yil KOR RESETLENMEZ: secili yil yeni havuzda da
   * varsa korunur, yoksa yok sayilir. Durum temizlemek yerine TURETILIR;
   * bir effect icinden setState cagirmak zincirleme render uretir.
   */
  const activeYear = useMemo(
    () => (pool && year && pool.pool.years[year] ? year : ''),
    [pool, year],
  );

  const result: DemoQuote | null = useMemo(() => {
    if (!pool || !activeYear) return null;
    const row = pool.pool.years[activeYear];
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
      poolListingCount: pool.pool.n,
    });
  }, [pool, activeYear, km]);

  const yearRow = pool && activeYear ? pool.pool.years[activeYear] : null;

  if (loadError) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center">
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
    'w-full rounded-lg border border-[var(--border-gray)] bg-[var(--card-bg)] px-3 py-2.5 text-sm outline-none transition focus:border-[#a30022] disabled:opacity-40';

  return (
    <main className="min-h-screen px-4 py-10 md:py-14">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#a30022]/10 px-3 py-1 text-xs font-medium text-[#a30022]">
            <Database size={13} />
            Canlı piyasa verisi
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Aracınız ne eder?
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
            {formatTL(data.listingCount)} gerçek ilandan türetilmiş{' '}
            {formatTL(data.poolCount)} araç havuzu. Aracınızı seçin; nakit alım teklifini
            ve konsinye ile eline geçecek tutarı anında görün.
          </p>
        </header>

        <section className="rounded-2xl border border-[var(--border-gray)] bg-[var(--card-bg)] p-5 shadow-sm md:p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium">
            <Search size={16} className="text-[#a30022]" />
            Araç seçimi
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {chain.map(({ depth, options, value }) => (
              <label className="block" key={depth}>
                <span className="mb-1.5 block text-xs text-[var(--text-secondary)]">
                  {headingFor(data, branchKeys, selection, depth)}
                </span>
                <select
                  className={selectClass}
                  value={value}
                  onChange={(e) =>
                    setSelection((previous) =>
                      applyChoice(entries, previous, depth, e.target.value),
                    )
                  }
                >
                  <option value="">Seçiniz</option>
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs text-[var(--text-secondary)]">Yıl</span>
              <select
                className={selectClass}
                value={activeYear}
                disabled={!pool}
                onChange={(e) => setYear(e.target.value)}
              >
                <option value="">Seçiniz</option>
                {years.map((y) => (
                  <option key={y} value={String(y)}>
                    {y} ({pool?.pool.years[String(y)][6]} ilan)
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs text-[var(--text-secondary)]">
                Kilometre{' '}
                {yearRow ? (
                  <span className="opacity-60">
                    — boş bırakılırsa {formatTL(yearRow[1])} km varsayılır
                  </span>
                ) : null}
              </span>
              <input
                className={selectClass}
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

          {pool && (
            <p className="mt-3 text-xs text-[var(--text-secondary)]">
              Fiyat havuzu:{' '}
              <span className="font-medium text-[var(--text-primary)]">
                {pool.pool.path.join(' › ')}
              </span>{' '}
              — {formatTL(pool.pool.n)} emsal ilan
            </p>
          )}
        </section>

        {pool && activeYear && !result && (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
            <p>
              Bu yıl için yeterli emsal yok. Yanlış bir fiyat göstermektense fiyat
              göstermiyoruz — bu araç manuel değerlendirmeye gider.
            </p>
          </div>
        )}

        {result && (
          <section className="mt-5 space-y-4">
            <div className="rounded-2xl border border-[var(--border-gray)] bg-[var(--card-bg)] p-5 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    Piyasa değeri (emsal merkezi)
                  </div>
                  <div className="mt-0.5 text-3xl font-semibold tracking-tight">
                    {formatTL(result.fairMarketValue)}{' '}
                    <span className="text-lg font-normal opacity-60">TL</span>
                  </div>
                </div>
                <div className="text-right text-xs text-[var(--text-secondary)]">
                  <div className="flex items-center justify-end gap-1.5">
                    <TrendingUp size={13} />
                    {formatTL(result.directComparables)} doğrudan emsal
                  </div>
                  {result.borrowedComparables > 0 && (
                    <div className="mt-0.5">
                      + {formatTL(result.borrowedComparables)} yakın yıl emsali
                    </div>
                  )}
                  <div className="mt-0.5">veri güveni %{result.confidencePct}</div>
                </div>
              </div>

              {result.mileageAdjustment !== 0 && (
                <p className="mt-3 text-xs text-[var(--text-secondary)]">
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
              <div className="rounded-2xl border-2 border-[var(--border-gray)] bg-[var(--card-bg)] p-5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Banknote size={17} className="text-[var(--text-secondary)]" />
                  Nakit alım — bugün
                </div>
                <div className="mt-3 text-3xl font-semibold tracking-tight">
                  {formatTL(result.cashOffer)}{' '}
                  <span className="text-base font-normal opacity-60">TL</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                  Aracınız aynı gün devredilir, ödeme peşin yapılır. Satış riski,
                  ekspertiz, ilan ve bekleme maliyeti bize aittir.
                </p>
              </div>

              <div className="rounded-2xl border-2 border-[#a30022] bg-[#a30022]/[0.03] p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#a30022]">
                    <Handshake size={17} />
                    Konsinye — elinize geçecek
                  </div>
                  <span className="rounded-full bg-[#a30022] px-2 py-0.5 text-[10px] font-semibold text-white">
                    +{formatTL(result.consignmentAdvantage)} TL
                  </span>
                </div>
                <div className="mt-3 text-3xl font-semibold tracking-tight text-[#a30022]">
                  {formatTL(result.customerConsignmentNet)}{' '}
                  <span className="text-base font-normal opacity-60">TL</span>
                </div>

                {/*
                  HESAP ACIK YAZILIR. Net tutar BEKLENEN SATIS'tan komisyon
                  dusulerek bulunur, ilan fiyatindan degil; ilan fiyati pazarlik
                  payi tasidigi icin her zaman daha yuksektir. Ikisi yan yana
                  yazilip beklenen satis gizlendiginde kart "ilan - komisyon"
                  gibi okunuyor ve rakamlar tutmuyordu.
                */}
                <dl className="mt-3 space-y-1.5 text-xs text-[var(--text-secondary)]">
                  <div className="flex justify-between">
                    <dt>İlan fiyatı</dt>
                    <dd className="font-medium">{formatTL(result.consignmentListingPrice)} TL</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Beklenen satış</dt>
                    <dd className="font-medium">{formatTL(result.expectedSalePrice)} TL</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Komisyonumuz</dt>
                    <dd className="font-medium">
                      − {formatTL(result.consignmentCommission)} TL
                    </dd>
                  </div>
                  <div className="flex justify-between border-t border-[#a30022]/20 pt-1.5 text-[var(--text-primary)]">
                    <dt className="font-medium">Elinize geçecek</dt>
                    <dd className="font-semibold">
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
              <div className="flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
                <p>{result.manualApprovalReason}</p>
              </div>
            )}

            <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
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
