'use client';

/**
 * ARAC SECIM EKRANI — kaynak kategori agacini birebir izleyen sihirbaz.
 *
 * Mevcut degerleme sayfasi hala katalog UUID'leriyle (marka/model/versiyon/
 * paket) calisiyor. Bu ekran, kaynagin GERCEK agacini hicbir ara seviyeyi
 * atlamadan yuruyen secim akisidir ve dogrudan hiyerarsi API'sini kullanir.
 */
import { useState } from 'react';
import VehicleHierarchyWizard, { HierarchyNode } from '@/components/VehicleHierarchyWizard';

export default function AracSecimiPage() {
  const [leaf, setLeaf] = useState<HierarchyNode | null>(null);
  const [path, setPath] = useState<HierarchyNode[]>([]);

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-10 px-4">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-6">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Araç Seçimi</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Her adımda yalnızca seçtiğiniz kategorinin doğrudan alt seçenekleri gösterilir.
          </p>
        </header>

        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <VehicleHierarchyWizard
            onChange={(p) => {
              setPath(p);
              setLeaf(null);
            }}
            onComplete={(node) => setLeaf(node)}
          />
        </section>

        {leaf && (
          <section
            className="mt-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
            data-testid="vh-result"
          >
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
              Seçilen araç
            </h2>
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Tam yol</dt>
                <dd className="text-right text-zinc-800 dark:text-zinc-100">{leaf.fullPath}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Hiyerarşi kimliği</dt>
                <dd className="text-right font-mono text-[11px] text-zinc-800 dark:text-zinc-100">
                  {leaf.id}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Seviye sayısı</dt>
                <dd className="text-right text-zinc-800 dark:text-zinc-100">{path.length}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Gözlenen ilan</dt>
                <dd className="text-right tabular-nums text-zinc-800 dark:text-zinc-100">
                  {leaf.resultCount ?? 0}
                </dd>
              </div>
            </dl>
          </section>
        )}
      </div>
    </main>
  );
}
