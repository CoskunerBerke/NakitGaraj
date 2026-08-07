import * as fs from 'fs';
import * as path from 'path';
import { JSDOM } from 'jsdom';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Map of canonical brand names and folder names
const BRAND_NAMES = [
  'Abarth', 'Aion', 'Alfa Romeo', 'Alpine', 'Anadol', 'Arora', 'Aston Martin',
  'Audi', 'BMW', 'BYD', 'Bajaj', 'Bentley', 'Buick', 'Cadillac', 'Chery',
  'Chevrolet', 'Chrysler', 'Citroen', 'Cupra', 'DS Automobiles', 'Dacia',
  'Daewoo', 'Daihatsu', 'Dodge', 'Eagle', 'Ferrari', 'Fiat', 'Ford', 'Geely',
  'Honda', 'Hyundai', 'Infiniti', 'Isuzu', 'Jaguar', 'Jeep', 'Kia', 'Lada',
  'Lamborghini', 'Lancia', 'Land Rover', 'Lexus', 'Lincoln', 'Lotus',
  'Maserati', 'Mazda', 'Mercedes-Benz', 'Mini', 'Mitsubishi', 'Nissan',
  'Opel', 'Peugeot', 'Porsche', 'Renault', 'Rolls-Royce', 'Rover', 'Saab',
  'Seat', 'Skoda', 'Smart', 'Subaru', 'Suzuki', 'Tesla', 'Tofaş', 'Toyota',
  'Volkswagen', 'Volvo'
];

function detectBrandFromFile(filePath: string, folderName: string): string {
  const fileName = path.basename(filePath).toLowerCase();
  
  // Check filename first
  for (const b of BRAND_NAMES) {
    const bLower = b.toLowerCase();
    if (fileName.startsWith(bLower + ' ') || fileName.includes(bLower + ' ')) {
      return b;
    }
  }

  // Quick HTML header peek (read first 5000 bytes) if filename is ambiguous
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(5000);
    fs.readSync(fd, buffer, 0, 5000, 0);
    fs.closeSync(fd);
    const content = buffer.toString('utf8');

    for (const b of BRAND_NAMES) {
      if (content.includes(`"${b}"`) || content.includes(`'${b}'`) || content.toLowerCase().includes(b.toLowerCase())) {
        return b;
      }
    }
  } catch (e) {}

  return folderName;
}

async function organizeFolders(rootDir: string) {
  console.log(`\n====================================================================`);
  console.log(`  1. DİZİN VE DOSYA ORGANİZASYONU BAŞLATILDI`);
  console.log(`  (Yanlış klasördeki ilanlar doğru markalara taşınıyor)`);
  console.log(`====================================================================\n`);

  const items = fs.readdirSync(rootDir, { withFileTypes: true });
  const brandDirs = items.filter(i => i.isDirectory()).map(i => i.name);

  let movedCount = 0;
  let deletedDuplicateCount = 0;

  for (const brandFolder of brandDirs) {
    const brandDirPath = path.join(rootDir, brandFolder);
    const files = fs.readdirSync(brandDirPath).filter(f => f.toLowerCase().endsWith('.html'));

    for (const file of files) {
      const filePath = path.join(brandDirPath, file);
      const targetBrand = detectBrandFromFile(filePath, brandFolder);

      if (targetBrand.toLowerCase() !== brandFolder.toLowerCase()) {
        // Move to target brand folder
        const targetDirPath = path.join(rootDir, targetBrand);
        if (!fs.existsSync(targetDirPath)) {
          fs.mkdirSync(targetDirPath, { recursive: true });
        }

        const targetFilePath = path.join(targetDirPath, file);
        if (fs.existsSync(targetFilePath)) {
          // Duplicate file already exists in target folder → delete duplicate
          fs.unlinkSync(filePath);
          deletedDuplicateCount++;
          console.log(`  ❌ Mukerrer dosya silindi: [${brandFolder}/${file}] -> [${targetBrand}/${file}] zeten var.`);
        } else {
          fs.renameSync(filePath, targetFilePath);
          movedCount++;
          console.log(`  📦 Dosya doğru klasörüne taşındı: [${brandFolder}/${file}]  ===>  [${targetBrand}/${file}]`);
        }
      }
    }
  }

  console.log(`\n✓ Dosya Organizasyonu Tamamlandı: ${movedCount} dosya doğru klasörüne taşındı, ${deletedDuplicateCount} mükerrer dosya temizlendi.\n`);
}

organizeFolders('C:\\Users\\berke\\OneDrive\\Masaüstü\\sahibindne ilan')
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
