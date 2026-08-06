import { PrismaClient } from '@prisma/client';
import { recalibrateAllSpecs } from '../recalibrate_all_vehicle_variants';

const prisma = new PrismaClient();

async function main() {
  console.log('');
  console.log('====================================================================');
  console.log('  NAKİTGARAJ - SAHİBİNDEN ARAÇ MODELİ VE FİYAT GÜNCELLEME SİSTEMİ');
  console.log('====================================================================');
  console.log('');
  console.log('Veritabanındaki tüm marka, model, alt model ve araç fiyatları taranıyor...');
  console.log('UYARI: Hiçbir araç veya müşteri verisi silinmez, veriler %100 korunur.');
  console.log('');

  const startTime = Date.now();
  await recalibrateAllSpecs(prisma);
  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('');
  console.log(`✅ GÜNCELLEME TAMAMLANDI! (${durationSec} saniye)`);
  console.log('Tüm araç modelleri ve alt paket fiyatları güncel Türkiye piyasasına işlendi.');
  console.log('====================================================================');
  console.log('');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Hata oluştu:', err);
  prisma.$disconnect();
  process.exit(1);
});
