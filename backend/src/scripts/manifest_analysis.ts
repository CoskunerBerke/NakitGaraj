import * as fs from 'fs';

const manifest = JSON.parse(fs.readFileSync('data/import-state/sahibinden-import-manifest.json', 'utf8'));
const files = Object.entries(manifest.files || {}) as [string, any][];

let successCount = 0;
let errorCount = 0;
let emptyCount = 0;
let totalInserted = 0;
let totalRows = 0;
const statusDist: Record<string, number> = {};
const errorFiles: string[] = [];
const emptyFiles: string[] = [];

for (const [key, val] of files) {
  const status = val.status || 'UNKNOWN';
  statusDist[status] = (statusDist[status] || 0) + 1;
  
  if (status === 'SUCCESS') {
    successCount++;
    totalInserted += Math.max(0, val.insertedListingCount || 0);
    totalRows += val.extractedRowCount || 0;
  } else if (status === 'ERROR') {
    errorCount++;
    errorFiles.push(`${key}: ${val.errorMessage}`);
  } else if (val.extractedRowCount === 0) {
    emptyCount++;
    emptyFiles.push(key);
  }
}

console.log(JSON.stringify({
  totalManifestFiles: files.length,
  statusDistribution: statusDist,
  successCount,
  errorCount,
  totalExtractedRows: totalRows,
  totalInsertedListings: totalInserted,
  errorFilesSample: errorFiles.slice(0, 10),
  emptyFilesSample: emptyFiles.slice(0, 10),
}, null, 2));
