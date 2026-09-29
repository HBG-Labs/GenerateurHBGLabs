import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WORKSPACE } from './support.ts';

function fingerprint(): string {
  return execFileSync(process.execPath, ['--experimental-strip-types', path.join(WORKSPACE, 'scripts', 'p3.3a-fingerprint.ts')], {
    cwd: WORKSPACE, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  }).trim();
}

describe('P3.3A — déterminisme multi-processus et replay', () => {
  it('rejoue VisualDirectionPlan → VisualPlan → MotionSpec → RenderPlan à l’identique', () => {
    const first = fingerprint();
    const second = fingerprint();
    expect(first).toBe(second);
    const value = JSON.parse(first) as Record<string, unknown>;
    for (const key of ['director', 'direction_plan', 'decision_trace', 'visual_plan', 'motion_spec', 'render_plan']) expect(value[key]).toMatch(/^[0-9a-f]{64}$/u);
  }, 60_000);
});
