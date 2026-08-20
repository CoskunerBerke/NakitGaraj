/**
 * backfill_body_type.ts
 *
 * canonicalBodyType alanini, YALNIZCA acik (explicit) metin sinyalinden
 * turetilen kasa tipiyle doldurur.
 *
 * Kurallar:
 *  - Idempotent: tekrar calistirmak ayni sonucu verir.
 *  - YALNIZCA canonicalBodyType yazilir; baska hicbir canonical alana dokunulmaz.
 *  - Sinyal yoksa alan '' (UNKNOWN) BIRAKILIR; tahmin/uydurma yapilmaz.
 *  - Kaynak onceligi: model/kategori metni > ilan basligi (satici pazarlama
 *    dili model sinyalini ezemez).
 *
 * Kullanim:
 *   npx ts-node src/scripts/backfill_body_type.ts [--dry-run]
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { deriveBodyTypeFromSources } from '../evaluation/listing-attributes';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const prisma = new PrismaClient();

  // DB yedegi varligini dogrula (yeni yedek almadan yazma yok)
  const prismaDir = path.join(__dirname, '..', '..', 'prisma');
  const backups = fs.readdirSync(prismaDir).filter((f) => /bak|backup/i.test(f));
  if (backups.length === 0) {
    throw new Error('DB yedegi bulunamadi; backfill iptal. Once yedek alin.');
  }
  console.log(`✓ ${backups.length} DB yedeği mevcut (örn. ${backups[backups.length - 1]})`);

  const rows = (await prisma.$queryRawUnsafe(
    `SELECT id, canonicalModel md, rawModel rm, rawTitle t, canonicalBodyType cur FROM RawVehicleListing`,
  )) as any[];

  let toSet = 0, alreadySet = 0, unknown = 0, wouldChange = 0;
  const updates: Array<{ id: string; body: string }> = [];

  for (const r of rows) {
    const body = deriveBodyTypeFromSources(`${r.md || ''} ${r.rm || ''}`, r.t || '');
    if (!body) { unknown++; continue; }
    if (r.cur === body) { alreadySet++; continue; }
    if (r.cur && r.cur !== body) wouldChange++;
    updates.push({ id: String(r.id), body });
    toSet++;
  }

  console.log(`toplam=${rows.length} yazılacak=${toSet} zatenAynı=${alreadySet} UNKNOWN bırakılan=${unknown} değişecek(mevcut dolu)=${wouldChange}`);

  if (dryRun) {
    console.log('[--dry-run] Veritabanı değiştirilmedi.');
    await prisma.$disconnect();
    return;
  }

  // Grup bazli toplu UPDATE (body basina tek sorgu yerine chunk'li)
  const byBody = new Map<string, string[]>();
  for (const u of updates) {
    if (!byBody.has(u.body)) byBody.set(u.body, []);
    byBody.get(u.body)!.push(u.id);
  }
  for (const [body, ids] of byBody) {
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      await prisma.rawVehicleListing.updateMany({
        where: { id: { in: chunk } },
        data: { canonicalBodyType: body },
      });
    }
    console.log(`  ${body}: ${ids.length} kayıt`);
  }

  const after = (await prisma.$queryRawUnsafe(
    `SELECT canonicalBodyType b, COUNT(*) c FROM RawVehicleListing WHERE canonicalBodyType<>'' GROUP BY 1 ORDER BY c DESC`,
  )) as any[];
  console.log('\nSONUÇ DAĞILIMI:', after.map((x) => `${x.b}=${Number(x.c)}`).join('  '));
  await prisma.$disconnect();
  console.log('✓ TAMAMLANDI (yalnızca canonicalBodyType yazıldı).');
}

main().catch((e) => { console.error('HATA:', e); process.exit(1); });
