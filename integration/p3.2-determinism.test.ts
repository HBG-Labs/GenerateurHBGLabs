import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WORKSPACE } from './support.ts';

function fingerprint(): string {
  return execFileSync(process.execPath, ['--experimental-strip-types', path.join(WORKSPACE, 'scripts', 'p3.2-fingerprint.ts')], {
    cwd: WORKSPACE, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  }).trim();
}

describe('P3.2 — déterminisme multi-processus', () => {
  it('rejoue VisualPlan → MotionSpec → RenderPlan et les états typographiques à l’identique', () => {
    const first = fingerprint();
    const second = fingerprint();
    expect(first).toBe(second);
    const value = JSON.parse(first) as Record<string, unknown>;
    expect(value['grammar']).toMatch(/^[0-9a-f]{64}$/u);
    expect(value['visual_plan']).toMatch(/^[0-9a-f]{64}$/u);
    expect(value['motion_spec']).toMatch(/^[0-9a-f]{64}$/u);
    expect(value['render_plan']).toMatch(/^[0-9a-f]{64}$/u);
    expect(value['dynamic_typography_critical_states']).not.toEqual([]);
  }, 45_000);
});
