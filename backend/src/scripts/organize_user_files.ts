import * as fs from 'fs';
import * as path from 'path';

const targetDir = `C:\\Users\\berke\\OneDrive\\Masaüstü\\sahibindne ilan`;
const alfaDir = path.join(targetDir, 'Alfa Romeo');

if (!fs.existsSync(alfaDir)) {
  fs.mkdirSync(alfaDir, { recursive: true });
}

const files = fs.readdirSync(targetDir);

let deletedAudiCount = 0;
let movedAlfaCount = 0;

files.forEach((file) => {
  const fullPath = path.join(targetDir, file);
  if (file === 'Alfa Romeo') return;

  // If file/directory belongs to Audi -> delete
  if (file.toLowerCase().includes('audi')) {
    fs.rmSync(fullPath, { recursive: true, force: true });
    deletedAudiCount++;
  }
  // If file/directory belongs to Alfa Romeo -> move to Alfa Romeo folder
  else if (file.toLowerCase().includes('alfa romeo') || file.toLowerCase().includes('alfaromeo')) {
    const destPath = path.join(alfaDir, file);
    fs.renameSync(fullPath, destPath);
    movedAlfaCount++;
  }
});

console.log(`\n====================================================================`);
console.log(`  AUDİ DOSYALARI SİLİNDİ: ${deletedAudiCount} Öğe`);
console.log(`  ALFA ROMEO DOSYALARI TAŞINDI: ${movedAlfaCount} Öğe -> 'Alfa Romeo' Klasörüne`);
console.log(`====================================================================\n`);
