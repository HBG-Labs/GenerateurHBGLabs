import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WORKSPACE } from './support.ts';

function fingerprint(): string {
  return execFileSync(process.execPath, ['--experimental-strip-types', path.join(WORKSPACE, 'scripts', 'p2.3-fingerprint.ts')], {
    cwd: WORKSPACE,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  }).trim();
}

describe('P2.3 — déterminisme multi-processus', () => {
  it('produit les mêmes MotionSpecs, provenances, diagnostics et plans P1', () => {
    const first = fingerprint();
    const second = fingerprint();
    expect(first).toBe(second);
    const parsed = JSON.parse(first);
    expect(parsed.creative_plan_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.signal.render_plan_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.nocturne.render_plan_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.signal.render_plan_sha256).not.toBe(parsed.nocturne.render_plan_sha256);
  }, 30_000);
});
