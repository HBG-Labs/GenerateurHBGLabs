import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WORKSPACE } from './support.ts';

function fingerprint(): string {
  return execFileSync(process.execPath, ['--experimental-strip-types', path.join(WORKSPACE, 'scripts', 'p1.7-fingerprint.ts')], {
    cwd: WORKSPACE,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  }).trim();
}

describe('P1.7 — déterminisme multi-processus', () => {
  it('reproduit les états critiques et les hashes dans deux processus Node', () => {
    const first = fingerprint();
    const second = fingerprint();
    expect(first).toBe(second);
    const value = JSON.parse(first) as Record<string, unknown>;
    expect(value['render_plan']).toMatch(/^[0-9a-f]{64}$/u);
    expect(value['dynamic_runs']).toBeInstanceOf(Array);
  }, 30_000);
});
