/**
 * AGACI KUR VE DENETLE — SALT OKUNUR.
 *
 *   npm run hierarchy:build
 *
 * Mevcut `RawVehicleListing.sourceFile` alanindan kategori agacini turetir,
 * denetim raporunu basar ve artefakti diske yazar. HICBIR tabloya yazmaz,
 * hicbir kayit silmez, kaynaga hicbir istek gondermez.
 */
import { auditHierarchy, summarizeAudit } from './hierarchy-audit';
import {
  artifactToTree,
  attachNavEvidence,
  buildArtifact,
  loadObservations,
  saveArtifact,
} from './hierarchy-source';
import { findByPath } from './hierarchy-tree';

/** Sunum oncesi zorunlu regresyon: gercek Sahibinden zinciri. */
const REQUIRED_CHAIN = ['Audi', 'A3', 'A3 Sportback', '35 TFSI', 'Advanced'];

export async function main(): Promise<void> {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const { observations, knownMakes, skipped } = await loadObservations(prisma as any);
    console.log(
      `[hierarchy] observed categories: ${observations.length} ` +
        `(skipped non-category pages: ${skipped}), known makes: ${knownMakes.length}`,
    );

    /**
     * YAPRAK KANITI: kaydedilen sayfanin KENDI kategori menusu.
     *
     * Bu adim olmadan "cocugunu toplamadik" ile "cocugu yok" ayirt edilemez
     * ve ust kategoriler yaprak sanilip karisik havuzlariyla fiyatlanir.
     */
    const evidence = attachNavEvidence(observations);
    console.log(
      `[hierarchy] nav evidence: ${evidence.withEvidence} page(s) read, ` +
        `${evidence.terminal} terminal, ${evidence.declaredChildren} declared child categories, ` +
        `${evidence.withPath} with exact breadcrumb path, ${evidence.unreadable} without evidence`,
    );

    const artifact = buildArtifact(observations, knownMakes);
    const tree = artifactToTree(artifact);
    const report = auditHierarchy(tree);

    console.log('[hierarchy] ' + summarizeAudit(report).split('\n').join('\n[hierarchy] '));

    // Zorunlu zincir adim adim yurunebiliyor mu.
    console.log('[hierarchy] required chain: ' + REQUIRED_CHAIN.join(' > '));
    let cursor = findByPath(tree, [REQUIRED_CHAIN[0]]);
    for (let i = 1; i <= REQUIRED_CHAIN.length && cursor; i += 1) {
      const marker = cursor.isLeaf ? 'LEAF' : `${cursor.childIds.length} child(ren)`;
      console.log(
        `[hierarchy]   ${'  '.repeat(i - 1)}${cursor.name}  [${marker}]  ` +
          `own=${cursor.ownListingCount} total=${cursor.totalListingCount}`,
      );
      if (i === REQUIRED_CHAIN.length) break;
      const next: any = cursor.childIds
        .map((id) => tree.nodes.get(id)!)
        .find((n) => n.name === REQUIRED_CHAIN[i]);
      cursor = next ?? null;
    }
    const leaf = findByPath(tree, REQUIRED_CHAIN);
    console.log(
      `[hierarchy] required chain resolved: ${Boolean(leaf)}` +
        (leaf ? ` id=${leaf.id} isLeaf=${leaf.isLeaf} listings=${leaf.ownListingCount}` : ''),
    );

    const savedTo = saveArtifact(artifact);
    console.log(`[hierarchy] artifact written: ${savedTo}`);

    const hard = report.findings.filter((f) => f.kind !== 'UNRESOLVED_CATEGORY');
    if (hard.length > 0) {
      console.log('[hierarchy] HARD FINDINGS (reported, nothing deleted):');
      for (const f of hard.slice(0, 20)) console.log(`[hierarchy]   ${f.kind}: ${f.detail}`);
      if (hard.length > 20) console.log(`[hierarchy]   ... and ${hard.length - 20} more`);
    }
    if (artifact.unresolved.length > 0) {
      console.log(
        `[hierarchy] unresolved category strings (left out of the tree): ${artifact.unresolved.length}`,
      );
      for (const u of artifact.unresolved.slice(0, 10)) console.log(`[hierarchy]   ${u}`);
    }
  } finally {
    await (prisma as any).$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[hierarchy] failed:', err?.message || err);
    process.exit(1);
  });
}
