/**
 * DEMO FIYAT KANITI — REGRESYON.
 *
 * Sabitlenen hata: demo fiyati yalnizca yayinlanan piyasa dosyasindan
 * uretiyordu. O dosya haftalik taramanin o ana kadar ziyaret ettigi
 * hedeflerden olusur ve tarama alfabetiktir. `opel/corsa/1-5-td/eco` —
 * korpusta 20 gecerli ilani olan bir arac — yil alani kapali halde "yeterli
 * guncel emsal bulunamadi" diyordu, cunku tarama `1-3-cdti`de durmustu.
 *
 * Kanit artik canli motorla AYNI iki kaynaktan gelir: hiyerarsi atamalari
 * (korpus/DB) taban, haftalik yayin ustune. Buradaki testler o birlesimi ve
 * suzgecleri sabitler.
 */
import {
  isDamagedRow,
  isUsableObservation,
  leafTestOf,
  mergeEvidence,
  type EvidenceRow,
  type ReleaseArtifact,
} from './demo-evidence';

const NODES = [
  { id: 'opel', parentId: null },
  { id: 'opel/corsa', parentId: 'opel' },
  { id: 'opel/corsa/1-5-td', parentId: 'opel/corsa' },
  { id: 'opel/corsa/1-5-td/eco', parentId: 'opel/corsa/1-5-td' },
  { id: 'opel/corsa/1-3-cdti', parentId: 'opel/corsa' },
  { id: 'opel/corsa/1-3-cdti/enjoy', parentId: 'opel/corsa/1-3-cdti' },
];
const isLeaf = leafTestOf(NODES);

const row = (
  id: string,
  over: Partial<EvidenceRow> = {},
): EvidenceRow => ({
  id,
  title: 'Temiz arac',
  damaged: 0,
  year: 2000,
  mileage: 250_000,
  price: 225_000,
  scrapedAt: Date.UTC(2026, 8, 7),
  ...over,
});

const assign = (map: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(map).map(([id, nodeId]) => [
      id,
      { nodeId, evidence: 'PAGE_EXACT' as const },
    ]),
  );

describe('kanit birlestirme', () => {
  it('yayin ulasmamis yaprak KORPUS/DB kanitindan fiyatlanabilir (ECO vakasi)', () => {
    const result = mergeEvidence({
      assignments: assign({ a: 'opel/corsa/1-5-td/eco', b: 'opel/corsa/1-5-td/eco' }),
      rows: [row('a'), row('b', { price: 245_000 })],
      // Tarama buraya HENUZ gelmedi: yayin bu yapragi hic tanimiyor.
      release: { pools: {}, assignments: {} },
      isLeaf,
    });

    expect(result.byNode.get('opel/corsa/1-5-td/eco')).toHaveLength(2);
    expect(result.fromDatabase).toBe(1);
    expect(result.fromRelease).toBe(0);
  });

  it('yayin kaniti olan yaprak eskisi gibi calisir', () => {
    const release: ReleaseArtifact = {
      pools: { 'opel/corsa/1-3-cdti/enjoy': ['w1'] },
      assignments: {
        w1: { sourceObservation: { year: 2015, mileage: 90_000, price: 480_000 } },
      },
    };
    const result = mergeEvidence({ assignments: {}, rows: [], release, isLeaf });

    expect(result.byNode.get('opel/corsa/1-3-cdti/enjoy')).toHaveLength(1);
    expect(result.fromRelease).toBe(1);
    expect(result.fromDatabase).toBe(0);
  });

  /**
   * Canli motorun onceligi: ayni ilan kimligi icin TAZE gozlem eski DB
   * anlik goruntusunu ezer (`emsal-matcher.service.ts`).
   */
  it('ayni ilan kimligi icin TAZE yayin gozlemi DB satirini ezer', () => {
    const result = mergeEvidence({
      assignments: assign({ a: 'opel/corsa/1-5-td/eco' }),
      rows: [row('a', { price: 225_000 })],
      release: {
        pools: { 'opel/corsa/1-5-td/eco': ['a'] },
        assignments: {
          a: {
            sourceObservation: {
              year: 2000,
              mileage: 250_000,
              price: 260_000,
              listingDate: '2026-09-17',
            },
          },
        },
      },
      isLeaf,
    });

    const pool = result.byNode.get('opel/corsa/1-5-td/eco')!;
    expect(pool).toHaveLength(1);
    expect(pool[0].price).toBe(260_000);
    expect(pool[0].listingDate).toBe('2026-09-17');
    expect(result.fromBoth).toBe(1);
  });

  /**
   * DAL SIZINTISI YOKTUR. Kanit dugum kimligine baglidir; kardes paket kendi
   * ilanlarini alir, otekinin havuzuna hicbir sey tasinmaz.
   */
  it('kardes dal kaniti birbirine karismaz', () => {
    const result = mergeEvidence({
      assignments: assign({
        a: 'opel/corsa/1-5-td/eco',
        b: 'opel/corsa/1-3-cdti/enjoy',
      }),
      rows: [row('a'), row('b', { price: 480_000, year: 2015 })],
      release: null,
      isLeaf,
    });

    expect(result.byNode.get('opel/corsa/1-5-td/eco')!.map((o) => o.price)).toEqual([225_000]);
    expect(result.byNode.get('opel/corsa/1-3-cdti/enjoy')!.map((o) => o.price)).toEqual([480_000]);
  });

  /**
   * Havuzlar YAPRAKTADIR. Cocugu olan dugume fiyat baglamak, kullanici
   * secimini bitirmeden fiyat gostermek olurdu.
   */
  it('ara dugume dusen kanit havuz olusturmaz', () => {
    const result = mergeEvidence({
      assignments: assign({ a: 'opel/corsa/1-5-td', b: 'opel/corsa' }),
      rows: [row('a'), row('b')],
      release: null,
      isLeaf,
    });
    expect([...result.byNode.keys()]).toEqual([]);
  });

  it('ayni ilan iki kez sayilmaz', () => {
    const result = mergeEvidence({
      assignments: assign({ a: 'opel/corsa/1-5-td/eco' }),
      rows: [row('a'), row('a')],
      release: null,
      isLeaf,
    });
    expect(result.byNode.get('opel/corsa/1-5-td/eco')).toHaveLength(1);
  });
});

describe('suzgecler motorun suzgecleridir', () => {
  const only = (r: EvidenceRow) =>
    mergeEvidence({
      assignments: assign({ [r.id]: 'opel/corsa/1-5-td/eco' }),
      rows: [r],
      release: null,
      isLeaf,
    }).byNode.get('opel/corsa/1-5-td/eco');

  it('baslikta hasar isareti olan ilan elenir', () => {
    expect(isDamagedRow(row('a', { title: 'Ağır hasar kayıtlı' }))).toBe(true);
    expect(only(row('a', { title: 'Ağır hasar kayıtlı' }))).toBeUndefined();
  });

  it('baslik yoksa saklanan hasar bayragi kullanilir', () => {
    expect(only(row('a', { title: null, damaged: 1 }))).toBeUndefined();
    expect(only(row('a', { title: null, damaged: 0 }))).toHaveLength(1);
  });

  it('akil disi fiyat elenir', () => {
    expect(only(row('a', { price: 1_000 }))).toBeUndefined();
    expect(only(row('a', { price: 900_000_000 }))).toBeUndefined();
  });

  it('kilometresi bilinmeyen ilan elenir', () => {
    expect(only(row('a', { mileage: null }))).toBeUndefined();
  });

  it('1980 oncesi model yili elenir', () => {
    expect(isUsableObservation({ year: 1975, mileage: 10, price: 100_000 })).toBe(false);
  });

  it('TEK gecerli ilan havuz kurmaya yeter', () => {
    expect(only(row('a'))).toHaveLength(1);
  });
});
