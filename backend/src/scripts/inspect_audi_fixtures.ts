import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';

function inspectFile(filePath: string) {
  const html = fs.readFileSync(filePath, 'utf-8');
  const $ = cheerio.load(html);

  console.log(`\n========================================`);
  console.log(`FILE: ${path.basename(filePath)}`);
  console.log(`========================================`);

  // Meta tags
  console.log('Title:', $('title').text().trim());
  console.log('Canonical:', $('link[rel="canonical"]').attr('href'));
  console.log('Cr_category meta:', $('meta[name="cr_category"]').attr('content') || $('meta[property="cr_category"]').attr('content'));

  // Look for cr_category in script tags
  let scriptCategory = '';
  $('script').each((_, el) => {
    const text = $(el).html() || '';
    if (text.includes('cr_category') || text.includes('category')) {
      const match = text.match(/['"]cr_category['"]\s*:\s*['"]([^'"]+)['"]/i) || text.match(/['"]category['"]\s*:\s*['"]([^'"]+)['"]/i);
      if (match) scriptCategory = match[1];
    }
  });
  console.log('Script Category:', scriptCategory);

  // Breadcrumbs
  const breadcrumbs: string[] = [];
  $('.breadcrumb li, ul.breadcrumb li, div.breadcrumb li, .search-breadcrumb li').each((_, el) => {
    breadcrumbs.push($(el).text().trim().replace(/\s+/g, ' '));
  });
  console.log('Breadcrumbs:', breadcrumbs);

  // Table rows
  const tableRows: any[] = [];
  $('#searchResultsTable tbody tr.searchResultsItem').slice(0, 5).each((_, el) => {
    const $row = $(el);
    const modelCell = $row.find('td.searchResultsAttributeValue, td.searchResultsTagAttributeValue').text().trim().replace(/\s+/g, ' ');
    const titleCell = $row.find('td.searchResultsTitleValue').text().trim().replace(/\s+/g, ' ');
    const yearCell = $row.find('td:nth-child(4)').text().trim();
    const kmCell = $row.find('td:nth-child(5)').text().trim();
    const priceCell = $row.find('td.searchResultsPriceValue').text().trim();

    tableRows.push({
      modelCell,
      titleCell,
      yearCell,
      kmCell,
      priceCell
    });
  });

  console.log('Sample Table Rows (first 5):', JSON.stringify(tableRows, null, 2));
}

const baseDir = 'C:\\Users\\berke\\OneDrive\\Masaüstü\\sahibindne ilan\\Audi';
inspectFile(path.join(baseDir, "Audi A1 Fiyatları & Modelleri sahibinden.com'da.html"));
inspectFile(path.join(baseDir, "Audi 100 Serisi Fiyatları & Modelleri sahibinden.com'da.html"));
