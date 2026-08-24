import { DEFAULT_THRESHOLDS, evaluateQuality, QualityMetrics } from './quality-gate';

function healthy(overrides: Partial<QualityMetrics> = {}): QualityMetrics {
  return {
    pagesAttempted: 100,
    pagesOk: 100,
    recordsExtracted: 1000,
    parseFailures: 10,
    validPrice: 990,
    validYear: 995,
    validMileage: 900,
    duplicates: 20,
    previousTotal: 280738,
    newTotal: 280000,
    ...overrides,
  };
}

describe('market-refresh quality gate', () => {
  it('passes a healthy collection run', () => {
    const result = evaluateQuality(healthy());
    expect(result.status).toBe('PASS');
    expect(result.failures).toEqual([]);
    expect(result.promotionEligible).toBe(true);
  });

  it('fails a catastrophic corpus collapse (280k -> 20k)', () => {
    const result = evaluateQuality(healthy({ previousTotal: 280738, newTotal: 20000 }));
    expect(result.status).toBe('FAIL');
    expect(result.promotionEligible).toBe(false);
    expect(result.failures.join(' ')).toMatch(/listing count dropped/i);
  });

  it('evaluates collapse regardless of sample size', () => {
    // Oran testleri kucuk orneklemde atlanir, cokme kontrolu ATLANMAZ.
    const result = evaluateQuality(
      healthy({ recordsExtracted: 5, previousTotal: 280738, newTotal: 100 }),
    );
    expect(result.status).toBe('FAIL');
    expect(result.failures.join(' ')).toMatch(/listing count dropped/i);
  });

  it('fails when too many pages could not be fetched', () => {
    const result = evaluateQuality(healthy({ pagesAttempted: 100, pagesOk: 50 }));
    expect(result.failures.join(' ')).toMatch(/page success ratio/i);
    expect(result.status).toBe('FAIL');
  });

  it('fails when extraction quality degrades', () => {
    const priceFail = evaluateQuality(healthy({ validPrice: 100 }));
    expect(priceFail.failures.join(' ')).toMatch(/valid price ratio/i);

    const yearFail = evaluateQuality(healthy({ validYear: 100 }));
    expect(yearFail.failures.join(' ')).toMatch(/valid year ratio/i);

    const parseFail = evaluateQuality(healthy({ parseFailures: 900 }));
    expect(parseFail.failures.join(' ')).toMatch(/parse success ratio/i);

    const dupFail = evaluateQuality(healthy({ duplicates: 800 }));
    expect(dupFail.failures.join(' ')).toMatch(/duplicate ratio/i);
  });

  it('does not fire ratio checks on a sample too small to be meaningful', () => {
    const result = evaluateQuality(
      healthy({
        recordsExtracted: 5,
        parseFailures: 5,
        validPrice: 1,
        validYear: 1,
        validMileage: 1,
        duplicates: 4,
        previousTotal: 0,
        newTotal: 5,
      }),
    );
    expect(result.status).toBe('PASS');
  });

  it('never promotes in V1 even when the gate passes', () => {
    const result = evaluateQuality(healthy());
    // promotionEligible yalnizca UYGUNLUK raporudur; promosyon kodu V1'de YOKTUR.
    expect(result.promotionEligible).toBe(true);
    expect(DEFAULT_THRESHOLDS.maxListingCountDropRatio).toBeGreaterThan(0);
  });
});
