/**
 * HAFIF YAPI KAPISI — UCUZ, BELLEK ICI, SIK.
 *
 * Tam yeniden kurma (agac + atama + kapsama + korpus dogrulama) olculdu:
 * structure-2026-09 kosusunda 131 kez calisti, ortalama 192 s, toplam ~7 saat
 * (aktif surenin %37'si). Bu kapi onun YERINE GECMEZ; onu SEYREKLESTIRIR.
 *
 * Her N kabul edilmis sayfadan sonra yalnizca oturumun KENDI kanitini denetler
 * (hedef tablosu: breadcrumb, ebeveyn iliskisi, slug soyu, kesin yol
 * tekilligi, kaynak dosya tekilligi, menu tutarliligi, bloke hedef). Hicbir
 * dosya okunmaz, hicbir ilan atamasi kurulmaz; 10 bin hedefte milisaniyeler.
 *
 * Dusen kapi kosuyu DURDURUR: yanlis ebeveynli ya da cift kesin yollu bir
 * sayfa dalgasi yuzlerce sayfaya yayilmadan yakalanir. Gecen kapi YAYIN
 * DEGILDIR — yayin daima tam kapidan gecer.
 */
import type { StructureTarget } from './structure-session';
import { isStrictDescendantSlug } from '../../vehicle-hierarchy/nav-children';

export type LightGateFindingKind =
  | 'BAD_BREADCRUMB'
  | 'OWN_PATH_MISMATCH'
  | 'WRONG_PARENT'
  | 'NOT_DESCENDANT_SLUG'
  | 'DUPLICATE_EXACT_PATH'
  | 'CONFLICTING_SOURCE'
  | 'NAV_INCONSISTENT'
  | 'BLOCKED_TARGET';

export interface LightGateFinding {
  kind: LightGateFindingKind;
  key: string;
  detail: string;
}

export interface LightGateReport {
  ok: boolean;
  checkedAt: string;
  /** COMPLETE hedef sayisi (kaydedilen + korpustan karsilanan). */
  targetsChecked: number;
  /** Son hafif kapidan bu yana kabul edilen sayfa sayisi. */
  waveSize: number;
  findings: LightGateFinding[];
  durationMs: number;
}

const SEP = '\u0000';

function fold(label: string): string {
  return String(label ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('tr');
}

function isFoldedPrefix(prefix: string[], chain: string[]): boolean {
  if (prefix.length >= chain.length) return false;
  return prefix.every((segment, index) => fold(segment) === fold(chain[index]));
}

export interface LightGateInput {
  targets: StructureTarget[];
  /** Site koku anahtari (breadcrumb'siz tek COMPLETE hedef). */
  siteRootKey: string;
  waveSize: number;
  now: () => number;
}

/**
 * Denetim, HER COMPLETE hedef uzerinde kosar (dalga degil): dalga kucuk olsa
 * da cift-yol ve ebeveyn iliskileri onceki hedeflere bakmayi gerektirir ve
 * maliyet zaten onemsizdir. Bulgular hedef anahtariyla raporlanir.
 */
export function runLightStructureGate(input: LightGateInput): LightGateReport {
  const started = input.now();
  const findings: LightGateFinding[] = [];
  const byKey = new Map<string, StructureTarget>();
  for (const target of input.targets) byKey.set(target.key, target);

  const exactPathOwner = new Map<string, string>();
  const savedFileOwner = new Map<string, string>();
  let checked = 0;

  for (const target of input.targets) {
    if (target.status === 'BLOCKED') {
      findings.push({
        kind: 'BLOCKED_TARGET',
        key: target.key,
        detail: `${target.outcome ?? 'BLOCKED'}: ${target.lastError ?? 'parser could not read the page'}`,
      });
      continue;
    }
    if (target.status !== 'COMPLETE') continue;
    checked += 1;
    const isSiteRoot = target.key === input.siteRootKey;
    const chain = target.breadcrumb;

    if (isSiteRoot) {
      if (chain && chain.length > 0) {
        findings.push({
          kind: 'BAD_BREADCRUMB',
          key: target.key,
          detail: `site root carries a vehicle breadcrumb "${chain.join(' / ')}"`,
        });
      }
      continue;
    }

    if (!chain || chain.length === 0) {
      findings.push({
        kind: 'BAD_BREADCRUMB',
        key: target.key,
        detail: `completed category has no breadcrumb chain (outcome ${target.outcome})`,
      });
      continue;
    }
    if (chain.some((label) => !fold(label))) {
      findings.push({
        kind: 'BAD_BREADCRUMB',
        key: target.key,
        detail: `breadcrumb has an empty label: ${JSON.stringify(chain)}`,
      });
    }
    if (target.depth !== null && target.depth !== chain.length) {
      findings.push({
        kind: 'BAD_BREADCRUMB',
        key: target.key,
        detail: `depth ${target.depth} != breadcrumb length ${chain.length}`,
      });
    }
    if (target.make !== null && fold(target.make) !== fold(chain[0])) {
      findings.push({
        kind: 'BAD_BREADCRUMB',
        key: target.key,
        detail: `make "${target.make}" != breadcrumb root "${chain[0]}"`,
      });
    }

    // Beklentiden sapan zincir ancak kayitli bir inceltme kanitiyla kabul edilebilir.
    if (
      target.expectedPath &&
      target.expectedPath.length > 0 &&
      !target.reconciledFrom &&
      !(
        target.expectedPath.length === chain.length &&
        target.expectedPath.every((segment, index) => fold(segment) === fold(chain[index]))
      )
    ) {
      findings.push({
        kind: 'WRONG_PARENT',
        key: target.key,
        detail:
          `breadcrumb "${chain.join(' / ')}" differs from the declared expectation ` +
          `"${target.expectedPath.join(' / ')}" without refinement evidence`,
      });
    }

    // Kendi yolu istenen anahtarla ayni olmali (eski checkpoint'te alan yoktur).
    if (target.ownPath !== undefined && target.ownPath !== null && target.ownPath !== target.key) {
      findings.push({
        kind: 'OWN_PATH_MISMATCH',
        key: target.key,
        detail: `page declares itself as ${target.ownPath}`,
      });
    }

    // Kesin yol tekilligi: iki FARKLI kaynak URL'i ayni tam yolu iddia edemez.
    const pathKey = chain.join(SEP);
    const priorOwner = exactPathOwner.get(pathKey);
    if (priorOwner && priorOwner !== target.key) {
      findings.push({
        kind: 'DUPLICATE_EXACT_PATH',
        key: target.key,
        detail: `"${chain.join(' / ')}" is also owned by ${priorOwner}`,
      });
    } else exactPathOwner.set(pathKey, target.key);

    // Kaynak dosya tekilligi: bir kaydedilmis dosya tek hedefe aittir.
    if (target.savedFile) {
      const fileOwner = savedFileOwner.get(target.savedFile);
      if (fileOwner && fileOwner !== target.key) {
        findings.push({
          kind: 'CONFLICTING_SOURCE',
          key: target.key,
          detail: `saved file is also claimed by ${fileOwner}`,
        });
      } else savedFileOwner.set(target.savedFile, target.key);
    }

    // Ebeveyn iliskisi: ebeveynin zinciri bu zincirin OZ onekidir; slug soyu tutar.
    if (target.parentKey) {
      const parent = byKey.get(target.parentKey);
      if (parent && parent.status === 'COMPLETE') {
        const parentIsRoot = parent.key === input.siteRootKey;
        const parentChain = parent.breadcrumb ?? [];
        if (parentIsRoot) {
          if (chain.length !== 1) {
            findings.push({
              kind: 'WRONG_PARENT',
              key: target.key,
              detail: `declared by the site root but breadcrumb has depth ${chain.length}`,
            });
          }
        } else if (!isFoldedPrefix(parentChain, chain)) {
          findings.push({
            kind: 'WRONG_PARENT',
            key: target.key,
            detail:
              `parent ${parent.key} chain "${parentChain.join(' / ')}" is not a prefix of ` +
              `"${chain.join(' / ')}"`,
          });
        }
        if (!parentIsRoot && !isStrictDescendantSlug(parent.slug, target.slug)) {
          findings.push({
            kind: 'NOT_DESCENDANT_SLUG',
            key: target.key,
            detail: `slug "${target.slug}" does not descend from parent slug "${parent.slug}"`,
          });
        }
      }
    }

    // Menu tutarliligi: kaydedilen sayfanin menusu okunmus ve terminal karari verilmis olmali.
    if (target.outcome === 'SAVED') {
      if (target.childrenDeclared === null || target.terminal === null) {
        findings.push({
          kind: 'NAV_INCONSISTENT',
          key: target.key,
          detail: 'saved page has no menu evidence (childrenDeclared/terminal unset)',
        });
      } else if (
        target.terminal &&
        (target.childrenDeclared > 0 || (target.deeperDeclared ?? 0) > 0)
      ) {
        findings.push({
          kind: 'NAV_INCONSISTENT',
          key: target.key,
          detail: 'terminal page declares children',
        });
      }
    }
  }

  return {
    ok: findings.length === 0,
    checkedAt: new Date(input.now()).toISOString(),
    targetsChecked: checked,
    waveSize: input.waveSize,
    findings,
    durationMs: Math.max(0, input.now() - started),
  };
}
