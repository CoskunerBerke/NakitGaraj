'use client';

/**
 * SAYI GECISI — fiyat aninda yer degistirmez.
 *
 * Secim degisince 3.035.000 TL'nin yerine bir anda 1.675.000 TL yazmak,
 * degerin DEGISTIGINI fark ettirmez ve ekran "zipliyor" hissi verir. Deger
 * kisa bir sayimla yeni degere tasinir.
 *
 * Kurallar:
 *   - ILK gosterimde sayim YOKTUR. Kart zaten iceri girerken animasyonlu;
 *     ustune sifirdan saymak gosterisli olurdu. Sayim yalnizca deger
 *     DEGISTIGINDE calisir.
 *   - `prefers-reduced-motion` aciksa deger dogrudan yazilir.
 *   - Durum AYNALANMAZ: gercek deger her zaman `value`, state yalnizca
 *     ucusta olan ara degeri tutar. Boylece effect govdesinde setState
 *     cagrilmaz ve zincirleme render olusmaz.
 *   - Tek bir requestAnimationFrame dongusu; harici animasyon kutuphanesi
 *     kullanilmaz.
 */
import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Sonda yavaslayan yumusak egri; basta hizli, sonda oturur. */
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/**
 * Gecisin belirli bir aninda gosterilecek deger. Zamanlama disari
 * alindigi icin egri, sinir degerleri ve yon (artan/azalan) arayuz
 * olmadan sinanabilir.
 */
export function countUpValue(
  from: number,
  to: number,
  progress: number,
): number {
  const t = Math.min(1, Math.max(0, progress));
  if (t >= 1) return to;
  return from + (to - from) * easeOutCubic(t);
}

export function useCountUp(value: number, durationMs = 520): number {
  /** null = sayim yok, gercek deger gosteriliyor. */
  const [animated, setAnimated] = useState<number | null>(null);
  const fromRef = useRef(value);
  const frameRef = useRef<number | null>(null);
  const firstRef = useRef(true);

  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      fromRef.current = value;
      return;
    }

    if (prefersReducedMotion() || !Number.isFinite(value)) {
      fromRef.current = value;
      return;
    }

    const from = fromRef.current;
    if (from === value) return;

    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      if (progress >= 1) {
        fromRef.current = value;
        frameRef.current = null;
        setAnimated(null);
        return;
      }
      const next = countUpValue(from, value, progress);
      // Bir sonraki gecis EKRANDAKI sayidan baslasin: hizli secim
      // degisimlerinde sayi geri sicramaz.
      fromRef.current = next;
      setAnimated(next);
      frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [value, durationMs]);

  return animated ?? value;
}
