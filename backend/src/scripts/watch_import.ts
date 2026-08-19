import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

if (process.env.NODE_ENV === 'production') {
  console.error('❌ HATA: Watcher production ortamında çalıştırılamaz (NODE_ENV=production)!');
  process.exit(1);
}

const envSourceDir = process.env.SAHIBINDEN_HTML_DIR;
const SOURCE_DIR = envSourceDir && envSourceDir.trim() !== '' 
  ? envSourceDir 
  : 'C:\\Users\\berke\\OneDrive\\Masaüstü\\sahibindne ilan';

console.log(`\n====================================================================`);
console.log(`  SAHİBİNDEN HTML DOSYA İZLEYİCİ (FILE WATCHER)`);
console.log(`  Klasör: ${SOURCE_DIR}`);
console.log(`  Debounce: 5 Saniye | Stabilite Şartı: 3 Saniye`);
console.log(`====================================================================\n`);

if (!fs.existsSync(SOURCE_DIR)) {
  console.error(`❌ İzlenecek klasör bulunamadı: ${SOURCE_DIR}`);
  process.exit(1);
}

let debounceTimer: NodeJS.Timeout | null = null;
let isProcessing = false;

function triggerImport() {
  if (isProcessing) {
    console.log(`[WATCHER] Zaten devam eden bir aktarım var, beklemeye alındı...`);
    return;
  }
  isProcessing = true;
  console.log(`\n[WATCHER] 5 saniyelik sessizlik süresi tamamlandı. Artımlı aktarım başlatılıyor...`);

  const child = spawn('npx', ['ts-node', 'src/scripts/rebuild_raw_listings_v3.ts'], {
    cwd: path.resolve(__dirname, '../../'),
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, SAHIBINDEN_HTML_DIR: SOURCE_DIR }
  });

  child.on('close', (code) => {
    isProcessing = false;
    console.log(`\n[WATCHER] Aktarım bitti (Exit Code: ${code}). Yeni değişiklikler izleniyor...\n`);
  });
}

fs.watch(SOURCE_DIR, { recursive: true }, (eventType, filename) => {
  if (!filename || (!filename.endsWith('.html') && !filename.endsWith('.htm'))) return;
  if (filename.includes('_files')) return;

  console.log(`[WATCHER ETKİNLİK] ${eventType}: ${filename} (5s debounce başlatıldı)`);

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    triggerImport();
  }, 5000);
});

console.log(`✓ İzleyici aktif. HTML dosyası eklendiğinde veya değiştirildiğinde otomatik aktarım çalışacaktır.\n`);
