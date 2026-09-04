import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { auditHierarchy } from './hierarchy-audit';
import { HIERARCHY_ARTIFACT_VERSION } from './hierarchy-source';
import {
  activeHierarchyReleaseDir,
  loadActiveHierarchyReceipt,
  publishHierarchyStage,
} from './artifact-release';
import { testTree } from '../market-refresh/weekly/__fixtures__/tree';

describe('hierarchy staged release', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-hierarchy-release-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const passSteps = [
    'hierarchy:build',
    'listings:build',
    'coverage:manifest',
    'corpus:validate',
  ].map((name) => ({ name, exitCode: 0 }));

  function stage(name: string, complete = true): string {
    const stageDir = path.join(dir, 'stage', name);
    fs.mkdirSync(stageDir, { recursive: true });
    const tree = testTree();
    fs.writeFileSync(
      path.join(stageDir, 'hierarchy.json'),
      JSON.stringify({
        version: HIERARCHY_ARTIFACT_VERSION,
        builtAt: '2026-09-04T00:00:00Z',
        nodes: [...tree.nodes.values()],
        rootIds: tree.rootIds,
        unresolved: [],
        audit: auditHierarchy(tree),
      }),
    );
    if (complete) {
      for (const file of [
        'listing-assignments.json',
        'page-coverage.json',
        'missing-category-pages.json',
      ]) {
        fs.writeFileSync(path.join(stageDir, file), '{}');
      }
    }
    return stageDir;
  }

  test('failed candidate leaves the active release unchanged', () => {
    const first = publishHierarchyStage({
      packageRoot: dir,
      stageDir: stage('good'),
      validatedAt: '2026-09-04T00:00:00Z',
      steps: passSteps,
    });
    expect(activeHierarchyReleaseDir(dir)).toBe(first.releaseDir);
    const pointerFile = path.join(
      dir,
      'data',
      'vehicle-hierarchy',
      'current.json',
    );
    const pointerBefore = fs.readFileSync(pointerFile, 'utf-8');
    expect(() =>
      publishHierarchyStage({
        packageRoot: dir,
        stageDir: stage('bad', false),
        validatedAt: '2026-09-05T00:00:00Z',
        steps: passSteps,
      }),
    ).toThrow('missing listing-assignments.json');
    expect(fs.readFileSync(pointerFile, 'utf-8')).toBe(pointerBefore);
    expect(loadActiveHierarchyReceipt(dir)).toMatchObject({ gate: 'PASS' });
  });

  test('refuses a complete bundle unless every required gate exited zero', () => {
    expect(() =>
      publishHierarchyStage({
        packageRoot: dir,
        stageDir: stage('ungated'),
        validatedAt: '2026-09-04T00:00:00Z',
        steps: passSteps.filter((step) => step.name !== 'corpus:validate'),
      }),
    ).toThrow('corpus:validate did not pass with exit 0');
    expect(activeHierarchyReleaseDir(dir)).toBeNull();
  });
});
