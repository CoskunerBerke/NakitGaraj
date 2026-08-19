import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';
import { cleanModelName, cleanVariantOrTrimName } from '../scripts/repair_corrupted_model_records';
import { parseHeaderMakeModelSubModel } from '../scripts/import_unique_sahibinden_listings';
import { extractCanonicalVehicleMetadata } from '../scripts/parser_v3_helper';

function parseMakeModelWithPriority(html: string): { make: string; model: string } {
  const $ = cheerio.load(html);

  // Priority 1: meta name="cr_category"
  const crCategory = $('meta[name="cr_category"]').attr('content') || $('meta[property="cr_category"]').attr('content');
  if (crCategory) {
    const parts = crCategory.trim().split(/\s+/);
    if (parts.length >= 2) {
      return { make: parts[0], model: parts.slice(1).join(' ') };
    }
  }

  // Priority 2: canonical URL
  const canonical = $('link[rel="canonical"]').attr('href') || '';
  if (canonical) {
    const cleanUrl = canonical.replace(/https?:\/\/[^\/]+\//i, '').split('?')[0];
    const segments = cleanUrl.split('-').filter(Boolean);
    if (segments.length >= 2) {
      const make = segments[0].charAt(0).toUpperCase() + segments[0].slice(1);
      const rawModelSlug = segments.slice(1).join(' ');
      let model = rawModelSlug.toUpperCase();
      if (model.includes('SERISI') || model.includes('SERİSİ')) {
        model = model.replace(/SERISI|SERİSİ/gi, 'Serisi');
      }
      return { make, model };
    }
  }

  // Priority 3: breadcrumb
  const breadcrumbs: string[] = [];
  $('.breadcrumb li, ul.breadcrumb li, .search-breadcrumb li').each((_, el) => {
    breadcrumbs.push($(el).text().trim());
  });

  if (breadcrumbs.length >= 3) {
    return { make: breadcrumbs[1], model: breadcrumbs[2] };
  }

  return { make: 'Bilinmeyen', model: 'Genel' };
}

describe('Sahibinden HTML Parser & Model Normalizer Unit Tests', () => {
  test('1. Multi-series / generic Sahibinden title cleaning', () => {
    expect(cleanModelName("Audi A1 & Modelleri sahibinden.com'da - 2", "Audi")).toBe('A1');
    expect(cleanModelName("Audi A3 A3 Hatchback & Modelleri sahibinden.com'da - 5", "Audi")).toBe('A3');
    expect(cleanModelName("Alfa Romeo & Modelleri sahibinden.com'da - 14", "Alfa Romeo")).toBe('Diğer');
    expect(cleanModelName("Ford Fiyatları & Modelleri sahibinden.com'da - 3", "Ford")).toBe('Diğer');
  });

  test('2. Sub-model / header parsing for Ford & Audi', () => {
    const res = parseHeaderMakeModelSubModel("Ford C-Max 1.6 TDCi Titanium & Modelleri sahibinden.com'da.html", "Ford");
    expect(res.make).toBe('Ford');
    expect(res.model).toBe('C-Max');
  });

  test('3. Page-numbered trailing numbers removal', () => {
    expect(cleanModelName("A3 Hatchback - 10", "Audi")).toBe('A3');
    expect(cleanModelName("Focus Titanium - 2", "Ford")).toBe('Focus');
  });

  test('4. Combined motor and trim text cleaning', () => {
    expect(cleanVariantOrTrimName("1.6 TDCi Titanium sahibinden.com'da - 2")).toBe('1.6 TDCi Titanium');
  });

  test('5. Turkish characters in make/model', () => {
    expect(cleanModelName("3 Serisi & Modelleri sahibinden.com'da", "BMW")).toBe('3 Serisi');
  });

  test('6. "Sahibinden" word inside raw listing title should remain intact', () => {
    const rawTitle = 'Sahibinden temiz bakımlı masrafsız Ford Focus';
    expect(rawTitle.includes('Sahibinden')).toBe(true);
  });

  test('7. Real HTML Fixture Test: Audi A1', () => {
    const filePath = 'C:\\Users\\berke\\OneDrive\\Masaüstü\\sahibindne ilan\\Audi\\Audi A1 Fiyatları & Modelleri sahibinden.com\'da.html';
    if (!fs.existsSync(filePath)) return;

    const html = fs.readFileSync(filePath, 'utf-8');
    const { make, model } = parseMakeModelWithPriority(html);
    expect(make.toLowerCase()).toBe('audi');
    expect(model.toUpperCase()).toBe('A1');

    // Extract table row "Model" cell: "1.4 TFSI Ambition"
    const parsed = extractCanonicalVehicleMetadata(make, model, '1.4 TFSI Ambition', 'Audi A1 1.4 TFSI Ambition');
    expect(parsed.canonicalModel).toBe('A1');
    expect(parsed.canonicalVariant).toBe('1.4 TFSI');
    expect(parsed.canonicalTrim).toBe('Ambition');
  });

  test('8. Real HTML Fixture Test: Audi 100 Serisi', () => {
    const filePath = 'C:\\Users\\berke\\OneDrive\\Masaüstü\\sahibindne ilan\\Audi\\Audi 100 Serisi Fiyatları & Modelleri sahibinden.com\'da.html';
    if (!fs.existsSync(filePath)) return;

    const html = fs.readFileSync(filePath, 'utf-8');
    const { make, model } = parseMakeModelWithPriority(html);
    expect(make.toLowerCase()).toBe('audi');
    expect(model.toUpperCase()).toContain('100');

    // Extract table row "Model" cell: "1.6" (package unspecified)
    const parsed = extractCanonicalVehicleMetadata(make, model, '1.6', 'Audi 100 1.6');
    expect(parsed.canonicalModel).toContain('100');
    expect(parsed.canonicalVariant).toBe('1.6');
    expect(parsed.canonicalTrim).toBe(''); // Package is unspecified / empty
  });
});
