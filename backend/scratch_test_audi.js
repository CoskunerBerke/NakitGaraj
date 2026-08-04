const { PrismaClient } = require('@prisma/client');
const http = require('http');
const prisma = new PrismaClient();

async function main() {
  const spec = await prisma.vehicleSpecification.findFirst({
    where: {
      manufacturer: { name: { contains: 'Audi' } },
      model: { name: { contains: 'A3' } },
      year: 2025
    }
  });

  if (!spec) {
    console.log("Audi A3 spec not found for 2025");
    return;
  }

  const testEval = (desiredPrice) => {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        year: 2025,
        manufacturerId: spec.manufacturerId,
        modelId: spec.modelId,
        variantId: spec.variantId,
        packageId: spec.packageId,
        bodyTypeId: spec.bodyTypeId,
        fuelTypeId: spec.fuelTypeId,
        transmissionTypeId: spec.transmissionTypeId,
        mileage: 15000,
        color: 'Siyah',
        damageStatus: 'NO',
        licensePlate: '34ABC123',
        firstName: 'Berke',
        lastName: 'Yilmaz',
        phone: '05350379074',
        userDesiredPrice: desiredPrice,
        sellingTimeline: 'hemen'
      });

      const req = http.request('http://localhost:3001/api/vehicle-evaluation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(JSON.parse(body)));
      });

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  };

  console.log("=== 2025 AUDI A3 SEDAN (15.000 KM) LIVE EVALUATION TEST ===");

  const res1 = await testEval(10000000); // User entered 10 Million TL
  console.log("\nKullanıcı Fiyat İstediğinde (10.000.000 ₺):");
  console.log(" - Sahibinden Piyasa Satış Değeri (Piyasa Ortalama):", res1.results?.fairMarketValue?.toLocaleString('tr-TR'), "₺");
  console.log(" - Anında Nakit Alım Teklifimiz:", res1.results?.finalOfferedPrice?.toLocaleString('tr-TR'), "₺");
  console.log(" - Dükkan Konsinye Teklifimiz:", res1.results?.finalConsignmentPrice?.toLocaleString('tr-TR'), "₺");
  console.log(" - Net Galeri Kârımız (Nakit Alımda):", res1.results?.guaranteedProfit?.toLocaleString('tr-TR'), "₺");
}

main().catch(console.error).finally(() => prisma.$disconnect());
