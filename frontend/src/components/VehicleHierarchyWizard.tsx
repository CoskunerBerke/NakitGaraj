'use client';

/**
 * ARAC SECIM SIHIRBAZI — KAYNAK AGACINI BIREBIR IZLER.
 *
 * SABIT ADIM YOKTUR. Bilesen hicbir yerde "marka/seri/model/motor/paket"
 * diye bes asama varsaymaz; yalnizca su donguyu calistirir:
 *
 *   currentNode = kok
 *   while currentNode.hasChildren:
 *       currentNode'un DOGRUDAN cocuklarini sor
 *       currentNode = secilen cocuk
 *   currentNode.isLeaf -> secim tamam
 *
 * Derinlik veriden gelir: gercek datasette 2 ile 7 seviye arasinda degisir.
 *
 * FAIL-CLOSED: cocuk listesi yuklenemezse dugum YAPRAK SAYILMAZ. "Bilinmiyor"
 * ile "yaprak" ayni sey degildir; karistirmak kullaniciya ust seviyenin
 * (yanlis) piyasa sonucunu gostermek olurdu.
 */
import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';

export interface HierarchyNode {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  fullPath: string;
  pathSegments: string[];
  resultCount: number | null;
  totalCount: number;
  hasChildren: boolean;
  isLeaf: boolean;
  derived: boolean;
}

/** Adim durumu — UNKNOWN asla LEAF ile birlestirilmez. */
type StepState = 'LOADING' | 'HAS_CHILDREN' | 'LEAF' | 'ERROR';

/**
 * Soru basligi. Semantik tip KESIN bilinmedigi icin derinlige gore nazik bir
 * tahmin yapilir; tahmin tutmazsa dugum ATLANMAZ, yalnizca genel baslik
 * kullanilir. Dogru gezinme, guzel baslikta yenilir.
 */
function questionFor(depth: number, parentName: string | null): string {
  switch (depth) {
    case 0:
      return 'Aracınızın markası nedir?';
    case 1:
      return 'Hangi seri?';
    case 2:
      return 'Hangi model / gövde?';
    case 3:
      return 'Hangi motor / versiyon?';
    case 4:
      return 'Hangi paket / donanım?';
    default:
      return parentName ? `${parentName} için bir sonraki seçeneği seçin` : 'Bir sonraki seçeneği seçin';
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || `İstek başarısız (${response.status})`);
  }
  return response.json();
}

export interface VehicleHierarchyWizardProps {
  /** Yaprağa ulasildiginda cagrilir. */
  onComplete?: (leaf: HierarchyNode, path: HierarchyNode[]) => void;
  /** Her secim degisiminde cagrilir (yaprak olmasa da). */
  onChange?: (path: HierarchyNode[]) => void;
}

export default function VehicleHierarchyWizard({
  onComplete,
  onChange,
}: VehicleHierarchyWizardProps) {
  /** Kokten simdiye kadar SECILEN dugumler. Sabit alanlar yok, saf yol. */
  const [path, setPath] = useState<HierarchyNode[]>([]);
  const [options, setOptions] = useState<HierarchyNode[]>([]);
  const [state, setState] = useState<StepState>('LOADING');
  const [error, setError] = useState<string | null>(null);

  const current = path.length > 0 ? path[path.length - 1] : null;

  const load = useCallback(async (node: HierarchyNode | null) => {
    setState('LOADING');
    setError(null);
    try {
      const url = node
        ? `${API_BASE}/vehicle-hierarchy/children?parentId=${encodeURIComponent(node.id)}`
        : `${API_BASE}/vehicle-hierarchy/roots`;
      const children = await fetchJson<HierarchyNode[]>(url);
      setOptions(children);
      // Cocuk listesi BOS gelirse yaprak; ama hata durumunda ASLA yaprak degil.
      setState(children.length > 0 ? 'HAS_CHILDREN' : 'LEAF');
    } catch (err) {
      setOptions([]);
      setError(err instanceof Error ? err.message : 'Araç listesi yüklenemedi.');
      setState('ERROR');
    }
  }, []);

  useEffect(() => {
    void load(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  useEffect(() => {
    onChange?.(path);
    if (state === 'LEAF' && current) onComplete?.(current, path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, state]);

  const select = (node: HierarchyNode) => {
    if (state === 'LOADING') return; // yuklenirken eski secenege tiklanmasin
    setPath((prev) => [...prev, node]);
  };

  /** Breadcrumb'da geri donuldugunde SONRAKI secimler temizlenir. */
  const goTo = (index: number) => {
    if (state === 'LOADING') return;
    setPath((prev) => prev.slice(0, index));
  };

  const complete = state === 'LEAF' && current !== null;

  return (
    <div className="w-full" data-testid="vehicle-hierarchy-wizard">
      {/* ---------------------------------------------------------- breadcrumb */}
      <nav
        className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs mb-4"
        aria-label="Araç seçim yolu"
        data-testid="vh-breadcrumb"
      >
        <button
          type="button"
          onClick={() => goTo(0)}
          className="px-2 py-1 rounded-md text-zinc-500 hover:text-brand-orange hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
        >
          Başlangıç
        </button>
        {path.map((node, index) => (
          <span key={node.id} className="flex items-center gap-1.5">
            <span className="text-zinc-300 dark:text-zinc-600">›</span>
            <button
              type="button"
              onClick={() => goTo(index + 1)}
              data-testid={`vh-crumb-${index}`}
              className="px-2 py-1 rounded-md font-medium text-zinc-800 dark:text-zinc-100 hover:text-brand-orange hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            >
              {node.name}
            </button>
          </span>
        ))}
      </nav>

      {/* ------------------------------------------------------ secilenler ozeti */}
      {path.length > 0 && (
        <ul className="mb-4 space-y-1" data-testid="vh-selected">
          {path.map((node) => (
            <li key={node.id} className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              <span className="text-brand-orange font-bold">✓</span>
              <span>{node.name}</span>
            </li>
          ))}
        </ul>
      )}

      {/* -------------------------------------------------------------- durumlar */}
      {state === 'ERROR' && (
        <div
          role="alert"
          data-testid="vh-error"
          className="rounded-lg border border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300"
        >
          <p className="font-semibold mb-1">Araç ağacı yüklenemedi.</p>
          <p className="text-xs opacity-80">{error}</p>
          <button
            type="button"
            onClick={() => void load(current)}
            className="mt-3 px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition"
          >
            Tekrar dene
          </button>
        </div>
      )}

      {state === 'LOADING' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" data-testid="vh-loading">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-11 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
          ))}
        </div>
      )}

      {state === 'HAS_CHILDREN' && (
        <div data-testid="vh-step">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
            {questionFor(current ? current.depth + 1 : 0, current?.name ?? null)}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {options.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => select(node)}
                data-testid={`vh-option-${node.name}`}
                className="group flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-left hover:border-brand-orange hover:shadow-sm transition"
              >
                <span className="text-sm text-zinc-800 dark:text-zinc-100 truncate">
                  {node.name}
                </span>
                {/*
                  Sayim yalnizca BILGIDIR. Yaprak karari ya da isim BU DEGILDIR:
                  isim "Advanced", sayim 346 — "Advanced (346)" diye tek parca
                  yapilmaz.
                */}
                {node.totalCount > 0 && (
                  <span className="shrink-0 text-[11px] tabular-nums text-zinc-400 group-hover:text-brand-orange">
                    {node.totalCount.toLocaleString('tr-TR')}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {complete && (
        <div
          data-testid="vh-complete"
          className="rounded-lg border border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40 p-4"
        >
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
            Araç seçimi tamamlandı
          </p>
          <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300" data-testid="vh-full-path">
            {current!.fullPath}
          </p>
          {current!.resultCount !== null && (
            <p className="mt-2 text-xs text-emerald-700/80 dark:text-emerald-300/80">
              Bu seçim için {current!.resultCount.toLocaleString('tr-TR')} ilan gözlendi.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
