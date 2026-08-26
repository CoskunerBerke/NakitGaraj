'use client';

/**
 * ARAC SECIM DURUMU — BASSIZ (HEADLESS) TEK KAYNAK.
 *
 * Gezinme mantigi burada durur, GORUNUMDEN ayridir: hem eski NakitGaraj
 * kart/select tasarimi hem de gelistirme ekrani ayni hook'u kullanir. Ikinci
 * bir gezinme algoritmasi YOKTUR; boylece iki ekran birbirinden sapamaz.
 *
 * SABIT ADIM YOKTUR. Hicbir yerde "marka/seri/model/motor/paket" diye bes
 * asama varsayilmaz; yalnizca su dongu calisir:
 *
 *   currentNode = kok
 *   while currentNode.hasChildren:
 *       currentNode'un DOGRUDAN cocuklarini sor
 *       currentNode = secilen cocuk
 *   currentNode.isLeaf -> secim tamam
 *
 * Derinlik veriden gelir: gercek datasette 1 ile 7 seviye arasinda degisir.
 *
 * FAIL-CLOSED: cocuk listesi yuklenemezse dugum YAPRAK SAYILMAZ. "Bilinmiyor"
 * ile "yaprak" ayni sey degildir; karistirmak kullaniciya ust seviyenin
 * (yanlis) piyasa sonucunu gostermek olurdu.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api';

export interface HierarchyNode {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  fullPath: string;
  pathSegments: string[];
  /** Kaynakta gozlenen ilan sayisi. Yaprak kararini BELIRLEMEZ. */
  resultCount: number | null;
  totalCount: number;
  hasChildren: boolean;
  isLeaf: boolean;
  derived: boolean;
}

/** Adim durumu — UNKNOWN/ERROR asla LEAF ile birlestirilmez. */
export type HierarchyStepState = 'LOADING' | 'HAS_CHILDREN' | 'LEAF' | 'ERROR';

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || `İstek başarısız (${response.status})`);
  }
  return response.json();
}

export interface UseVehicleHierarchy {
  /** Kokten simdiye kadar SECILEN dugumler. Sabit alanlar yok, saf yol. */
  path: HierarchyNode[];
  /** Su an sorulan adimin secenekleri (yalnizca DOGRUDAN cocuklar). */
  options: HierarchyNode[];
  /**
   * Her SEVIYEDE sunulmus secenekler: `levels[i]`, i. sorunun siklari.
   *
   * Eski NakitGaraj tasarimi her adimi acik bir dropdown olarak gosterir ve
   * kullanici onceki bir adimi sonradan degistirebilir; bunun icin o
   * seviyenin KARDES listesi hala gerekli. Dizi uzunlugu veriden gelir,
   * sabit degildir.
   */
  levels: HierarchyNode[][];
  state: HierarchyStepState;
  error: string | null;
  /** Secim tamamlandiysa KESIN yaprak, aksi halde null. */
  leaf: HierarchyNode | null;
  /** Su anda uzerinde durulan dugum (hicbiri secilmediyse null). */
  current: HierarchyNode | null;
  /** Bir sonraki secenegi sec. */
  select: (node: HierarchyNode) => void;
  /**
   * `index`. adimin cevabini DEGISTIR: o adimdan sonraki tum secimler silinir.
   * Kullanici "35 TFSI"yi degistirdiginde "Advanced" hicbir yerde kalmamalidir.
   */
  selectAt: (index: number, node: HierarchyNode) => void;
  /** `index` kadar segment birakip GERI don; sonraki secimler silinir. */
  goTo: (index: number) => void;
  /** Tum secimi temizler. */
  reset: () => void;
  /** Hatali adimi yeniden dener. */
  retry: () => void;
}

export function useVehicleHierarchy(): UseVehicleHierarchy {
  const [path, setPath] = useState<HierarchyNode[]>([]);
  const [options, setOptions] = useState<HierarchyNode[]>([]);
  const [levels, setLevels] = useState<HierarchyNode[][]>([]);
  const [state, setState] = useState<HierarchyStepState>('LOADING');
  const [error, setError] = useState<string | null>(null);

  const current = path.length > 0 ? path[path.length - 1] : null;
  const depth = path.length;

  /**
   * Yarista kalan yanit, YENI adimin seceneklerinin uzerine yazmamali.
   * Kullanici hizli geri/ileri gittiginde eski istek sonra donebilir; her
   * istege sira numarasi verilir ve yalnizca EN SON istek yaziyor.
   */
  const requestRef = useRef(0);

  const load = useCallback(async (node: HierarchyNode | null, level: number) => {
    const ticket = (requestRef.current += 1);
    setState('LOADING');
    setError(null);
    try {
      const url = node
        ? `${API_BASE}/vehicle-hierarchy/children?parentId=${encodeURIComponent(node.id)}`
        : `${API_BASE}/vehicle-hierarchy/roots`;
      const children = await fetchJson<HierarchyNode[]>(url);
      if (ticket !== requestRef.current) return;
      setOptions(children);
      /**
       * Bu seviyenin siklarini sakla ve DAHA DERIN seviyeleri at: kullanici
       * ustteki bir adimi degistirdiginde alt seviyelerin eski siklari
       * ekranda kalmamalidir.
       */
      setLevels((prev) => {
        const next = prev.slice(0, level);
        next[level] = children;
        return next;
      });
      // Cocuk listesi BOS gelirse yaprak; ama HATA durumunda ASLA yaprak degil.
      setState(children.length > 0 ? 'HAS_CHILDREN' : 'LEAF');
    } catch (err) {
      if (ticket !== requestRef.current) return;
      setOptions([]);
      setLevels((prev) => prev.slice(0, level));
      setError(err instanceof Error ? err.message : 'Araç listesi yüklenemedi.');
      setState('ERROR');
    }
  }, []);

  useEffect(() => {
    void load(current, depth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, depth]);

  const select = useCallback(
    (node: HierarchyNode) => {
      if (state === 'LOADING') return; // yuklenirken eski secenege tiklanmasin
      setPath((prev) => [...prev, node]);
    },
    [state],
  );

  /**
   * Geri donuldugunde SONRAKI secimler tamamen silinir. Eski yaprak hicbir
   * yerde (ozet, istek govdesi) kalmamalidir; `leaf` de asagida yalnizca
   * yolun SONUNDAN turetildigi icin kendiliginden dusar.
   */
  const goTo = useCallback((index: number) => {
    setPath((prev) => (index >= prev.length ? prev : prev.slice(0, index)));
  }, []);

  /**
   * Onceki bir adimin cevabini degistir. Yol o noktadan KESILIR; boylece
   * "35 TFSI" degisince "Advanced" yolda, ozette ve istekte kalmaz.
   */
  const selectAt = useCallback((index: number, node: HierarchyNode) => {
    setPath((prev) => [...prev.slice(0, index), node]);
  }, []);

  const reset = useCallback(() => setPath([]), []);
  const retry = useCallback(() => void load(current, depth), [load, current, depth]);

  return {
    path,
    options,
    levels,
    state,
    error,
    leaf: state === 'LEAF' && current ? current : null,
    current,
    select,
    selectAt,
    goTo,
    reset,
    retry,
  };
}
