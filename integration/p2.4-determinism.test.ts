import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WORKSPACE } from './support.ts';

function fingerprint(): string {
  return execFileSync(process.execPath, ['--experimental-strip-types', path.join(WORKSPACE, 'scripts', 'p2.4-fingerprint.ts')], {
    cwd: WORKSPACE,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  }).trim();
}

describe('P2.4 — frontière de déterminisme multi-processus', () => {
  it('fige la sortie acceptée et reproduit exactement le pipeline en replay', () => {
    const first = fingerprint();
    const second = fingerprint();
    expect(first).toBe(second);
    const parsed = JSON.parse(first);
    expect(parsed.snapshot_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.motion_spec_sha256).toBe(parsed.replay_motion_spec_sha256);
    expect(parsed.render_plan_sha256).toBe(parsed.replay_render_plan_sha256);
  }, 30_000);
});
