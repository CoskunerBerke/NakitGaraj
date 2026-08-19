import * as path from 'path';
import * as fs from 'fs';
import * as cheerio from 'cheerio';

const SOURCE_DIR = 'C:\\Users\\berke\\OneDrive\\Masaüstü\\sahibindne ilan';

function findHtmlFiles(dir: string, list: string[] = []): string[] {
  if (!fs.existsSync(dir)) return list;
  for (const f of fs.readdirSync(dir)) {
    const fullP = path.join(dir, f);
    if (fs.statSync(fullP).isDirectory()) {
      if (!f.toLowerCase().endsWith('_files')) findHtmlFiles(fullP, list);
    } else if (f.toLowerCase().endsWith('.html') || f.toLowerCase().endsWith('.htm')) {
      list.push(fullP);
    }
  }
  return list;
}

const allFiles = findHtmlFiles(SOURCE_DIR);
console.log('Total HTML files found in SAHIBINDEN_HTML_DIR:', allFiles.length);

// Sample a few different brand files
const sampleFiles = allFiles.slice(0, 5);

for (const filePath of sampleFiles) {
  console.log('\n--- Inspecting File:', path.relative(SOURCE_DIR, filePath));
  const html = fs.readFileSync(filePath, 'utf8');
  const $ = cheerio.load(html);
  
  const headers: string[] = [];
  $('table th, table tr.searchResultsItem th').each((_, th) => {
    headers.push($(th).text().replace(/\s+/g, ' ').trim());
  });
  console.log('Table Headers:', headers);

  const sampleRows = $('tr[data-id]').slice(0, 3).toArray();
  sampleRows.forEach((row, i) => {
    const tds: string[] = [];
    $(row).find('td').each((_, td) => {
      tds.push($(td).text().replace(/\s+/g, ' ').trim());
    });
    console.log(`Row ${i+1} [data-id=${$(row).attr('data-id')}]:`, tds);
  });
}
