'use client';

/**
 * ARAC SECIMI — ESKI NAKITGARAJ TASARIMIYLA, DEGISKEN DERINLIKLE.
 *
 * GORUNUM eski `/degerleme` katalog adimlarinin birebir dilidir: numarali
 * turuncu rozet, `rounded-2xl` kart, `glass-input` select, "Seçildi" rozeti,
 * kilitli kart durumu. VERI ise kaynagin gercek kategori agacindan gelir.
 *
 * SORULAR TEK TEK SORULUR. Ekranda yalnizca CEVAPLANMIS adimlar ve SIRADAKI
 * tek soru bulunur; ilerideki adimlar gosterilmez — zaten kac adim
 * kalacagi VERIDEN once bilinemez. Sabit 4/5/6 adim varsayimi YOKTUR.
 *
 * Bilesen SAF GORUNUMDUR: hicbir fetch/gezinme mantigi icermez, hepsi
 * `useVehicleHierarchy` icindedir.
 */
import { useState } from 'react';
import { CheckCircle, Search } from 'lucide-react';
import type { HierarchyNode, UseVehicleHierarchy } from '@/hooks/useVehicleHierarchy';

/**
 * Soru basligi yalnizca GOSTERIMDIR; hiyerarsi kimligini belirlemez.
 * Derinlik beklenenden fazlaysa dugum ATLANMAZ, genel baslik kullanilir.
 */
function questionFor(depth: number, parentName: string | null): string {
  switch (depth) {
    case 0:
      return 'Aracınızın Markası Nedir?';
    case 1:
      return 'Hangi Seri?';
    case 2:
      return 'Hangi Model / Gövde?';
    case 3:
      return 'Hangi Motor / Versiyon?';
    case 4:
      return 'Hangi Paket / Donanım?';
    default:
      return parentName ? `${parentName} İçin Alt Seçenek` : 'Bir Sonraki Seçenek';
  }
}

function hintFor(depth: number): string {
  switch (depth) {
    case 0:
      return 'Aracınızın markasını arayın veya aşağıdaki popüler markalardan birini seçin.';
    case 1:
      return 'Seçtiğiniz markanın serilerinden birini seçin.';
    default:
      return 'Yalnızca bir önceki seçiminizin alt seçenekleri gösterilir.';
  }
}

/** Eski tasarimin kart kabugu. */
const CARD =
  'flex flex-col gap-3 p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800';

export interface VehicleSelectionStepsProps {
  hierarchy: UseVehicleHierarchy;
}

export default function VehicleSelectionSteps({ hierarchy }: VehicleSelectionStepsProps) {
  const { path, levels, state, error, leaf, current, selectAt, retry } = hierarchy;

  /** Arama kutulari yalnizca gorunum yardimcisidir; secimi etkilemez. */
  const [search, setSearch] = useState<Record<number, string>>({});

  /**
   * Ekranda gorunecek adim sayisi: cevaplanmis adimlar + (varsa) SIRADAKI
   * soru. Agac bittiginde (yaprak) yeni soru eklenmez.
   *
   * Bu sayi VERIDEN gelir; sabit degildir.
   */
  const pendingStep = state === 'LEAF' ? -1 : path.length;
  const stepCount = state === 'LEAF' ? path.length : path.length + 1;

  return (
    <div className="flex flex-col gap-6" data-testid="vehicle-selection-steps">
      {Array.from({ length: stepCount }).map((_, index) => {
        const answered = path[index] ?? null;
        const isPending = index === pendingStep;
        const parentName = index > 0 ? path[index - 1]?.name ?? null : null;
        const optionsForLevel = levels[index] ?? [];
        const query = (search[index] ?? '').trim().toLocaleLowerCase('tr');
        const visible = query
          ? optionsForLevel.filter((o) => o.name.toLocaleLowerCase('tr').includes(query))
          : optionsForLevel;

        // Siradaki soru henuz yukleniyorsa iskelet goster (yaprak DEGIL).
        const loadingThisStep = isPending && state === 'LOADING';
        const erroredThisStep = isPending && state === 'ERROR';

        return (
          <div key={index} className={CARD} data-testid={`vehicle-step-${index}`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <span
                    className={`w-6 h-6 rounded-full text-xs font-extrabold flex items-center justify-center ${
                      answered || isPending
                        ? 'bg-brand-orange text-white'
                        : 'bg-zinc-300 dark:bg-zinc-700 text-zinc-500'
                    }`}
                  >
                    {index + 1}
                  </span>
                  {questionFor(index, parentName)}
                </h3>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {hintFor(index)}
                </p>
              </div>
              {answered && (
                <span className="text-xs font-bold text-emerald-500 flex items-center gap-1 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                  <CheckCircle className="w-3.5 h-3.5" /> Seçildi
                </span>
              )}
            </div>

            {erroredThisStep ? (
              /*
                HATA YAPRAK DEGILDIR. "Seçenek bulunamadı" deyip devam
                ettirmek, kullaniciya ust seviyenin yanlis fiyatini
                gostermek olurdu; bu yuzden adim acikca hatali kalir.
              */
              <div
                role="alert"
                data-testid={`vehicle-step-error-${index}`}
                className="rounded-xl border border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300"
              >
                <p className="font-semibold mb-1">Seçenekler yüklenemedi.</p>
                <p className="text-xs opacity-80">{error}</p>
                <button
                  type="button"
                  onClick={retry}
                  className="mt-3 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition"
                >
                  Tekrar Dene
                </button>
              </div>
            ) : loadingThisStep ? (
              <div
                className="h-[52px] rounded-xl bg-zinc-200/70 dark:bg-zinc-800 animate-pulse"
                data-testid={`vehicle-step-loading-${index}`}
              />
            ) : (
              <>
                {/*
                  HIZLI SECIM ROZETLERI — eski tasarimda "popüler markalar".
                  Ilk adimda ve secenek coksa gosterilir; yalnizca kisayoldur,
                  tam liste asagidaki select'tedir.
                */}
                {index === 0 && optionsForLevel.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {[...optionsForLevel]
                      .sort((a, b) => b.totalCount - a.totalCount)
                      .slice(0, 12)
                      .map((node) => {
                        const isSelected = answered?.id === node.id;
                        return (
                          <button
                            key={node.id}
                            type="button"
                            data-testid={`vehicle-quick-${node.name}`}
                            onClick={() => selectAt(index, node)}
                            className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                              isSelected
                                ? 'bg-brand-orange text-white border-brand-orange shadow-md shadow-brand-orange/20 scale-105'
                                : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-brand-orange/40 hover:text-brand-orange'
                            }`}
                          >
                            {node.name}
                          </button>
                        );
                      })}
                  </div>
                )}

                {/* Arama — eski tasarimda oldugu gibi liste uzunsa cikar. */}
                {optionsForLevel.length > 6 && (
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-zinc-400" />
                    <input
                      type="text"
                      value={search[index] ?? ''}
                      onChange={(e) => setSearch((prev) => ({ ...prev, [index]: e.target.value }))}
                      placeholder="Listede ara…"
                      data-testid={`vehicle-search-${index}`}
                      className="glass-input rounded-lg py-2 pl-9 pr-3 text-xs w-full"
                    />
                  </div>
                )}

                <select
                  data-testid={`vehicle-select-${index}`}
                  aria-label={questionFor(index, parentName)}
                  suppressHydrationWarning
                  value={answered?.id ?? ''}
                  onChange={(e) => {
                    const picked = optionsForLevel.find((o) => o.id === e.target.value);
                    // Bos secim = bu adimdan itibaren temizle.
                    if (!picked) {
                      hierarchy.goTo(index);
                      return;
                    }
                    selectAt(index, picked);
                  }}
                  className="glass-input rounded-xl p-3.5 text-sm w-full font-semibold"
                >
                  <option value="">
                    {`-- Seçiniz (${optionsForLevel.length} Seçenek) --`}
                  </option>
                  {visible.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.name}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        );
      })}

      {/*
        TAMAMLANDI ROZETI. `leaf` yalnizca agacin GERCEKTEN bittigi yerde
        dolar; LOADING/ERROR/ara dugum durumlarinda null kalir.
      */}
      {leaf && (
        <div
          data-testid="vehicle-selection-complete"
          className="flex items-center justify-between flex-wrap gap-2 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20"
        >
          <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4" /> Araç seçiminiz tamamlandı
          </span>
          {leaf.resultCount !== null && (
            <span className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 tabular-nums">
              Bu seçim için {leaf.resultCount.toLocaleString('tr-TR')} ilan gözlendi
            </span>
          )}
        </div>
      )}

      {/*
        Ara seviyede duruldugunda kullanici NEDEN devam edemedigini gormeli.
        Bu bir hata degil, eksik adimdir.
      */}
      {!leaf && state === 'HAS_CHILDREN' && path.length > 0 && (
        <p
          className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold"
          data-testid="vehicle-selection-incomplete"
        >
          Aracınızın seçimi henüz tamamlanmadı — {current?.name} için alt seçenek bekleniyor.
        </p>
      )}
    </div>
  );
}

export type { HierarchyNode };
