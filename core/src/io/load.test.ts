import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { FIXTURES, loadFixtureBrand, loadFixtureSeries, PROFILES } from '../test-support.ts';
import { ValidationFailure } from '../validation/issues.ts';
import { loadPlatformPresetsFile, loadStyleFile, resolveResource } from './load.ts';

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function copyFixtures(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'motion-core-'));
  temps.push(dir);
  cpSync(FIXTURES, dir, { recursive: true });
  return dir;
}

function failureCodes(fn: () => unknown): string[] {
  try {
    fn();
  } catch (error) {
    if (error instanceof ValidationFailure) return error.issues.map((i) => i.code);
    throw error;
  }
  return [];
}

describe('chargement des documents', () => {
  it('résout pack: et lib: depuis les racines fournies par l’appelant', () => {
    expect(resolveResource('pack:a/b.ttf', '/pack', {})).toBe(path.join('/pack', 'a/b.ttf'));
    expect(resolveResource('lib:c.ttf', '/pack', { libraryRoot: '/lib' })).toBe(path.join('/lib', 'c.ttf'));
    expect(() => resolveResource('lib:c.ttf', '/pack', {})).toThrowError(/aucune bibliothèque/);
  });

  it('charge marque et série avec les styles qu’elles désignent', () => {
    expect(loadFixtureBrand().style.id).toBe('fixture_ink');
    const series = loadFixtureSeries();
    expect(series.style.id).toBe('fixture_signal');
    expect(series.brand).toBeNull();
    expect(loadPlatformPresetsFile(path.join(FIXTURES, 'platforms.json')).version).toBe('0.1.0');
  });

  it('refuse une police altérée ou absente', () => {
    const dir = copyFixtures();
    const library = { libraryRoot: path.join(dir, 'fonts') };
    writeFileSync(path.join(dir, 'fonts', 'playfair-display-latin-900.ttf'), 'pas une police');
    expect(failureCodes(() => loadStyleFile(path.join(dir, 'profiles', 'fixture_ink.style.json'), library))).toEqual([
      'pack.hash_mismatch',
    ]);
    rmSync(path.join(dir, 'fonts', 'ibm-plex-mono-latin-700.ttf'));
    expect(failureCodes(() => loadStyleFile(path.join(dir, 'profiles', 'fixture_signal.style.json'), library))).toEqual([
      'pack.missing_file',
    ]);
  });

  it('refuse un style sans bibliothèque quand il en référence une', () => {
    expect(failureCodes(() => loadStyleFile(path.join(PROFILES, 'fixture_ink.style.json')))).toEqual([
      'pack.missing_file',
      'pack.missing_file',
    ]);
  });
});
