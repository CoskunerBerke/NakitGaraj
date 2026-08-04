const { PrismaClient } = require('@prisma/client');
const http = require('http');
const prisma = new PrismaClient();

async function main() {
  const spec = await prisma.vehicleSpecification.findFirst({
    where: {
      manufacturer: { name: { contains: 'Fiat' } },
      model: { name: { contains: 'Egea' } },
      year: 2023,
      package: { name: { contains: 'Easy' } }
    }
  });

  const testEval = (desiredPrice) => {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        year: 2023,
        manufacturerId: spec.manufacturerId,
        modelId: spec.modelId,
        variantId: spec.variantId,
        packageId: spec.packageId,
        bodyTypeId: spec.bodyTypeId,
        fuelTypeId: spec.fuelTypeId,
        transmissionTypeId: spec.transmissionTypeId,
        mileage: 110000,
        color: 'Gri',
        damageStatus: 'NO',
        licensePlate: '34ABC123',
        firstName: 'Test',
        lastName: 'Musteri',
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

  console.log("=== FIAT EGEA 1.3 EASY (2023, 110.000 KM) REAL API TEST ===");

  const res1 = await testEval(3000000); // Customer typed 3 Million TL
  console.log("\n1. Kullanıcı 3.000.000 ₺ girdiğinde:");
  console.log(" - Piyasa Satış Değeri (Piyasa Ortalama):", res1.results?.fairMarketValue?.toLocaleString('tr-TR'), "₺");
  console.log(" - Anında Nakit Alım Teklifimiz:", res1.results?.finalOfferedPrice?.toLocaleString('tr-TR'), "₺");
  console.log(" - Dükkan Konsinye Teklifimiz:", res1.results?.finalConsignmentPrice?.toLocaleString('tr-TR'), "₺");
  console.log(" - Net Galeri Kârımız (Nakit Alımda):", res1.results?.guaranteedProfit?.toLocaleString('tr-TR'), "₺");

  const res2 = await testEval(1200000); // Customer typed 1.2 Million TL
  console.log("\n2. Kullanıcı 1.200.000 ₺ girdiğinde:");
  console.log(" - Piyasa Satış Değeri (Piyasa Ortalama):", res2.results?.fairMarketValue?.toLocaleString('tr-TR'), "₺");
  console.log(" - Anında Nakit Alım Teklifimiz:", res2.results?.finalOfferedPrice?.toLocaleString('tr-TR'), "₺");
  console.log(" - Dükkan Konsinye Teklifimiz:", res2.results?.finalConsignmentPrice?.toLocaleString('tr-TR'), "₺");
  console.log(" - Net Galeri Kârımız (Nakit Alımda):", res2.results?.guaranteedProfit?.toLocaleString('tr-TR'), "₺");
}

main().catch(console.error).finally(() => prisma.$disconnect());
