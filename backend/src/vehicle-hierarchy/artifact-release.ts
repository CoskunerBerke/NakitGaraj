/** Versioned hierarchy bundle publication with an atomic current pointer. */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { artifactToTree, HierarchyArtifact } from './hierarchy-source';
import { hierarchyVersionOf } from '../market-refresh/weekly/hierarchy-gate';

export const HIERARCHY_POINTER_VERSION = 'vehicle-hierarchy-pointer-v1';
export const HIERARCHY_RECEIPT_VERSION = 'vehicle-hierarchy-validation-v1';
const REQUIRED_PASS_STEPS = [
  'hierarchy:build',
  'listings:build',
  'coverage:manifest',
  'corpus:validate',
];

export interface HierarchyValidationReceipt {
  version: typeof HIERARCHY_RECEIPT_VERSION;
  hierarchyVersion: string;
  validatedAt: string;
  gate: 'PASS';
  steps: Array<{ name: string; exitCode: number | null }>;
}

interface HierarchyPointer {
  version: typeof HIERARCHY_POINTER_VERSION;
  release: string;
  hierarchyVersion: string;
  publishedAt: string;
}

function writeAtomic(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const fd = fs.openSync(tmp, 'wx');
  try {
    fs.writeFileSync(fd, value, 'utf-8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, filePath);
}

export function hierarchyArtifactRoot(packageRoot: string): string {
  return path.join(packageRoot, 'data', 'vehicle-hierarchy');
}

export function activeHierarchyReleaseDir(packageRoot: string): string | null {
  const root = hierarchyArtifactRoot(packageRoot);
  const pointerFile = path.join(root, 'current.json');
  if (!fs.existsSync(pointerFile)) return null;
  const pointer = JSON.parse(
    fs.readFileSync(pointerFile, 'utf-8'),
  ) as HierarchyPointer;
  if (
    pointer.version !== HIERARCHY_POINTER_VERSION ||
    !/^[a-zA-Z0-9._-]+$/.test(pointer.release)
  ) {
    throw new Error(`Invalid hierarchy release pointer at ${pointerFile}`);
  }
  const releaseDir = path.join(root, 'versions', pointer.release);
  if (!fs.existsSync(path.join(releaseDir, 'hierarchy.json'))) {
    throw new Error(
      `Hierarchy pointer references missing release ${releaseDir}`,
    );
  }
  return releaseDir;
}

export function publishHierarchyStage(input: {
  packageRoot: string;
  stageDir: string;
  validatedAt: string;
  steps: Array<{ name: string; exitCode: number | null }>;
}): { hierarchyVersion: string; releaseDir: string } {
  for (const requiredStep of REQUIRED_PASS_STEPS) {
    const result = input.steps.find((step) => step.name === requiredStep);
    if (!result || result.exitCode !== 0) {
      throw new Error(
        `Staged hierarchy cannot publish: ${requiredStep} did not pass with exit 0`,
      );
    }
  }
  const required = [
    'hierarchy.json',
    'listing-assignments.json',
    'page-coverage.json',
    'missing-category-pages.json',
  ];
  for (const name of required) {
    if (!fs.existsSync(path.join(input.stageDir, name))) {
      throw new Error(`Staged hierarchy bundle is missing ${name}`);
    }
  }
  const hierarchy = JSON.parse(
    fs.readFileSync(path.join(input.stageDir, 'hierarchy.json'), 'utf-8'),
  ) as HierarchyArtifact;
  const hierarchyVersion = hierarchyVersionOf(artifactToTree(hierarchy));
  const receipt: HierarchyValidationReceipt = {
    version: HIERARCHY_RECEIPT_VERSION,
    hierarchyVersion,
    validatedAt: input.validatedAt,
    gate: 'PASS',
    steps: input.steps,
  };
  writeAtomic(
    path.join(input.stageDir, 'validation-receipt.json'),
    JSON.stringify(receipt),
  );

  const root = hierarchyArtifactRoot(input.packageRoot);
  const release = `${input.validatedAt.replace(/[:.]/g, '-')}-${hierarchyVersion.slice(0, 12)}`;
  const releaseDir = path.join(root, 'versions', release);
  fs.mkdirSync(path.dirname(releaseDir), { recursive: true });
  if (fs.existsSync(releaseDir)) {
    throw new Error(`Hierarchy release already exists: ${releaseDir}`);
  }
  fs.renameSync(input.stageDir, releaseDir);
  const pointer: HierarchyPointer = {
    version: HIERARCHY_POINTER_VERSION,
    release,
    hierarchyVersion,
    publishedAt: input.validatedAt,
  };
  writeAtomic(path.join(root, 'current.json'), JSON.stringify(pointer));
  return { hierarchyVersion, releaseDir };
}

export function loadActiveHierarchyReceipt(
  packageRoot: string,
): HierarchyValidationReceipt | null {
  const releaseDir = activeHierarchyReleaseDir(packageRoot);
  if (!releaseDir) return null;
  const receiptFile = path.join(releaseDir, 'validation-receipt.json');
  if (!fs.existsSync(receiptFile)) return null;
  const receipt = JSON.parse(
    fs.readFileSync(receiptFile, 'utf-8'),
  ) as HierarchyValidationReceipt;
  if (
    receipt.version !== HIERARCHY_RECEIPT_VERSION ||
    receipt.gate !== 'PASS'
  ) {
    throw new Error(`Invalid hierarchy validation receipt at ${receiptFile}`);
  }
  return receipt;
}
