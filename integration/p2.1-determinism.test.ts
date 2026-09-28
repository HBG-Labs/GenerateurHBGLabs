import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { canonicalCreativeJson, hashCreativeDocument, validateCreativePlan } from '@motion-engine/creative-core';
import { canonicalJson, hashDocument } from '@motion-engine/core';
import { describe, expect, it } from 'vitest';

import { CREATIVE_CORE, WORKSPACE, readJson } from './support.ts';

function childFingerprint() {
  const script = path.join(WORKSPACE, 'scripts', 'p2.1-fingerprint.ts');
  const fixture = path.join(CREATIVE_CORE, 'fixtures', 'hypothetical.creative-plan.json');
  return spawnSync(process.execPath, ['--experimental-strip-types', script, fixture], {
    cwd: WORKSPACE,
    encoding: 'utf8',
    timeout: 60_000,
  });
}

describe('déterminisme P2.1', () => {
  it('produit le même fingerprint dans deux processus Node séparés', () => {
    const left = childFingerprint();
    const right = childFingerprint();
    expect(left.status, left.stderr).toBe(0);
    expect(right.status, right.stderr).toBe(0);
    expect(left.stdout).toBe(right.stdout);
    expect(JSON.parse(left.stdout)).toEqual(expect.objectContaining({ canonical_sha256: expect.stringMatching(/^[0-9a-f]{64}$/) }));
  });

  it('reste compatible avec les règles canoniques certifiées de P1', () => {
    const cases: unknown[] = [
      { z: 1, a: { y: undefined, x: 'Électricité' }, list: [2, 1] },
      readJson('creative-core/fixtures/minimal.creative-plan.json'),
    ];
    for (const value of cases) {
      expect(canonicalCreativeJson(value)).toBe(canonicalJson(value));
      expect(hashCreativeDocument(value)).toBe(hashDocument(value));
    }
  });

  it('garde diagnostics, IDs et hash stables après sérialisation JSON', () => {
    const input = readJson('creative-core/fixtures/invalid.creative-plan.json');
    const first = validateCreativePlan(input);
    const second = validateCreativePlan(JSON.parse(JSON.stringify(input)) as unknown);
    expect(first.report).toEqual(second.report);
    expect(first.canonical_sha256).toBe(second.canonical_sha256);
  });
});
