import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { planCreativeStory } from '@motion-engine/creative-core';
import { describe, expect, it } from 'vitest';

import { CREATIVE_CORE, WORKSPACE, readJson } from './support.ts';

function fingerprint() {
  const script = path.join(WORKSPACE, 'scripts', 'p2.2-fingerprint.ts');
  const fixture = path.join(CREATIVE_CORE, 'fixtures', 'planner', 'hypothetical-30s.planner-input.json');
  return spawnSync(process.execPath, ['--experimental-strip-types', script, fixture], {
    cwd: WORKSPACE,
    encoding: 'utf8',
    timeout: 60_000,
  });
}

describe('déterminisme P2.2', () => {
  it('produit beats, scènes, durées, IDs et hashes identiques dans deux processus', () => {
    const left = fingerprint();
    const right = fingerprint();
    expect(left.status, left.stderr).toBe(0);
    expect(right.status, right.stderr).toBe(0);
    expect(left.stdout).toBe(right.stdout);
    const parsed = JSON.parse(left.stdout) as Record<string, unknown>;
    expect(parsed).toEqual(
      expect.objectContaining({
        planner_input_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        registry_fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
        creative_plan_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        planning_report_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
  });

  it('préserve strictement la sortie après un aller-retour JSON', () => {
    const input = readJson('creative-core/fixtures/planner/explainer-30s.planner-input.json');
    expect(planCreativeStory(input)).toEqual(planCreativeStory(JSON.parse(JSON.stringify(input)) as unknown));
  });
});
