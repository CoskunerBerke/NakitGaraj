'use client';

/**
 * DEMO — BACKEND'SIZ, GERCEK VERIYLE.
 *
 * Vercel'de tek basina calisir. `public/demo-market.json` icinde her (havuz,
 * yil) icin GERCEK fiyat motorunun urettigi FMV vardir; bu sayfa yalnizca
 * kilometre duzeltmesini ve musteriye donuk fiyat formullerini uygular
 * (`lib/demo-pricing.ts`). Yani gosterilen sayilar motorun kendi sayilaridir.
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

/** [km1, km2, km3, fmv1, fmv2, fmv3, ilan sayisi] — motorun km egrisi ornegi */
type YearRow = [number, number, number, number, number, number, number];

interface Pool {
  label: string;
  n: number;
  km: number;
  years: Record<string, YearRow>;
}

interface DemoData {
  generatedAt: string;
  hierarchyVersion: string;
  poolCount: number;
  listingCount: number;
  yearRowCount: number;
  tree: Record<string, Record<string, Record<string, string[]>>>;
  pools: Record<string, Pool>;
}

const slug = (value: string): string =>
  value
    .toLocaleLowerCase('tr')
    .replace(/ /g, '-')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');

export default function DemoPage() {
  const [data, setData] = useState<DemoData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [variant, setVariant] = useState('');
  const [trim, setTrim] = useState('');
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

  const makes = useMemo(
    () => (data ? Object.keys(data.tree).sort((a, b) => a.localeCompare(b, 'tr')) : []),
    [data],
  );
  const models = useMemo(
    () =>
      data && make && data.tree[make]
        ? Object.keys(data.tree[make]).sort((a, b) => a.localeCompare(b, 'tr'))
        : [],
    [data, make],
  );
  const variants = useMemo(
    () =>
      data && make && model && data.tree[make]?.[model]
        ? Object.keys(data.tree[make][model]).sort((a, b) => a.localeCompare(b, 'tr'))
        : [],
    [data, make, model],
  );
  const trims = useMemo(
    () =>
      data && make && model && variant && data.tree[make]?.[model]?.[variant]
        ? [...data.tree[make][model][variant]].sort((a, b) => a.localeCompare(b, 'tr'))
        : [],
    [data, make, model, variant],
  );

  /** Secimden havuz anahtarini kur; etikete gore dogrula. */
  const pool = useMemo(() => {
    if (!data || !make || !model || !variant || !trim) return null;
    const parts = [make, model, variant, trim]
      .filter((p) => p && p !== '-')
      .map(slug);
    const key = parts.join('/');
    if (data.pools[key]) return { key, pool: data.pools[key] };
    // Etiket eslesmesi: slug'lastirma kenar durumlarina karsi guvenlik agi.
    const wanted = [make, model, variant, trim].filter((p) => p && p !== '-').join(' / ');
    const found = Object.entries(data.pools).find(([, p]) => p.label === wanted);
    return found ? { key: found[0], pool: found[1] } : null;
  }, [data, make, model, variant, trim]);

  const years = useMemo(
    () =>
      pool
        ? Object.keys(pool.pool.years)
            .map(Number)
            .sort((a, b) => b - a)
        : [],
    [pool],
  );

  const result: DemoQuote | null = useMemo(() => {
    if (!pool || !year) return null;
    const row = pool.pool.years[year];
    if (!row) return null;
    const [k1, k2, k3, f1, f2, f3, yearCount] = row;
    if (!hasEnoughEvidence(yearCount)) return null;
    const mileageKm = Number(km.replace(/\D/g, '')) || k2;
    return quote({
      kmPoints: [k1, k2, k3],
      fmvPoints: [f1, f2, f3],
      mileageKm,
      yearListingCount: yearCount,
      poolListingCount: pool.pool.n,
    });
  }, [pool, year, km]);

  const yearRow = pool && year ? pool.pool.years[year] : null;

  const reset = (level: 'make' | 'model' | 'variant' | 'trim') => {
    if (level === 'make') {
      setModel('');
      setVariant('');
      setTrim('');
      setYear('');
    } else if (level === 'model') {
      setVariant('');
      setTrim('');
      setYear('');
    } else if (level === 'variant') {
      setTrim('');
      setYear('');
    } else {
      setYear('');
    }
  };

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

          <div className="grid gap-3 md:grid-cols-4">
            <label className="block">
              <span className="mb-1.5 block text-xs text-[var(--text-secondary)]">Marka</span>
              <select
                className={selectClass}
                value={make}
                onChange={(e) => {
                  setMake(e.target.value);
                  reset('make');
                }}
              >
                <option value="">Seçiniz</option>
                {makes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs text-[var(--text-secondary)]">Model</span>
              <select
                className={selectClass}
                value={model}
                disabled={!make}
                onChange={(e) => {
                  setModel(e.target.value);
                  reset('model');
                }}
              >
                <option value="">Seçiniz</option>
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs text-[var(--text-secondary)]">Motor</span>
              <select
                className={selectClass}
                value={variant}
                disabled={!model}
                onChange={(e) => {
                  setVariant(e.target.value);
                  reset('variant');
                }}
              >
                <option value="">Seçiniz</option>
                {variants.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs text-[var(--text-secondary)]">Paket</span>
              <select
                className={selectClass}
                value={trim}
                disabled={!variant}
                onChange={(e) => {
                  setTrim(e.target.value);
                  reset('trim');
                }}
              >
                <option value="">Seçiniz</option>
                {trims.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs text-[var(--text-secondary)]">Yıl</span>
              <select
                className={selectClass}
                value={year}
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
        </section>

        {pool && year && !result && (
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
                    {formatTL(result.matchedListingCount)} emsal ilan
                  </div>
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
                <dl className="mt-3 space-y-1.5 text-xs text-[var(--text-secondary)]">
                  <div className="flex justify-between">
                    <dt>İlan fiyatı</dt>
                    <dd className="font-medium">{formatTL(result.consignmentListingPrice)} TL</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Komisyonumuz</dt>
                    <dd className="font-medium">{formatTL(result.consignmentCommission)} TL</dd>
                  </div>
                  <div className="flex justify-between">
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
              Fiyatlar {formatTL(data.listingCount)} gerçek ilandan hesaplanır; aracın
              hasar/boya durumu ve ekspertiz sonucuna göre nihai teklif değişebilir.
              Veri tarihi: {new Date(data.generatedAt).toLocaleDateString('tr-TR')}.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
