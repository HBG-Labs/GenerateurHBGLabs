import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { CORE, WORKSPACE } from './support.ts';

// Preuve que core/ fonctionne SANS le reste de l'espace de travail : on le
// copie seul dans un dossier temporaire (sans examples/, packs/, integration/)
// et on y exécute réellement son typecheck et ses tests.

const sandbox = mkdtempSync(path.join(tmpdir(), 'motion-core-isolated-'));
const isolatedCore = path.join(sandbox, 'core');

afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

function run(args: string[]) {
  const result = spawnSync(process.execPath, args, { cwd: isolatedCore, encoding: 'utf8', timeout: 240_000 });
  return { status: result.status, output: `${result.stdout ?? ''}\n${result.stderr ?? ''}` };
}

describe('isolement du cœur', () => {
  it('prépare une copie de core/ seule', () => {
    cpSync(CORE, isolatedCore, {
      recursive: true,
      filter: (source) => !source.split(path.sep).includes('node_modules'),
    });
    // Seules les dépendances npm sont rendues disponibles, par lien.
    symlinkSync(path.join(WORKSPACE, 'node_modules'), path.join(isolatedCore, 'node_modules'), 'junction');
    expect(readdirSync(sandbox)).toEqual(['core']);
    for (const absent of ['examples', 'packs', 'integration']) {
      expect(existsSync(path.join(sandbox, absent))).toBe(false);
    }
  });

  it('le typecheck du cœur isolé passe', () => {
    const tsc = path.join(WORKSPACE, 'node_modules', 'typescript', 'bin', 'tsc');
    const result = run([tsc, '--noEmit', '-p', 'tsconfig.json']);
    expect(result.status, result.output).toBe(0);
  }, 240_000);

  it('les tests du cœur isolé passent', () => {
    const vitest = path.join(WORKSPACE, 'node_modules', 'vitest', 'vitest.mjs');
    const result = run([vitest, 'run', '--reporter=dot']);
    expect(result.status, result.output).toBe(0);
    expect(result.output).toMatch(/Tests\s+\d+ passed/);
    expect(result.output).not.toMatch(/failed/);
  }, 240_000);
});
