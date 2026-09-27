import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { ResolvedStyle } from './contracts/resolved-style.ts';
import { loadBrandFile, loadSeriesFile, loadStyleFile } from './io/load.ts';
import type { LoadedBrand, LoadedSeries } from './io/load.ts';
import { resolveStyle } from './style/resolve-style.ts';
import type { ResolveStyleInput } from './style/resolve-style.ts';
import { formatIssues } from './validation/issues.ts';

// Les tests du cœur n'utilisent que ses fixtures neutres : aucun exemple,
// aucune marque réelle, aucun pack externe.
export const CORE_ROOT = path.resolve(import.meta.dirname, '..');
export const FIXTURES = path.join(CORE_ROOT, 'test-fixtures');
export const PROFILES = path.join(FIXTURES, 'profiles');
export const FIXTURE_LIBRARY = { libraryRoot: path.join(FIXTURES, 'fonts') };

export type Json = Record<string, any>;

export function readFixture(relative: string): Json {
  return JSON.parse(readFileSync(path.join(FIXTURES, relative), 'utf8')) as Json;
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export const loadInk = () => loadStyleFile(path.join(PROFILES, 'fixture_ink.style.json'), FIXTURE_LIBRARY);
export const loadSignal = () => loadStyleFile(path.join(PROFILES, 'fixture_signal.style.json'), FIXTURE_LIBRARY);
export const loadFixtureBrand = (): LoadedBrand => loadBrandFile(path.join(PROFILES, 'fixture_brand.brand.json'), FIXTURE_LIBRARY);
export const loadFixtureSeries = (): LoadedSeries => loadSeriesFile(path.join(PROFILES, 'fixture_series.series.json'), FIXTURE_LIBRARY);

export function mustResolve(input: ResolveStyleInput): ResolvedStyle {
  const result = resolveStyle(input);
  if (!result.ok) throw new Error(`Résolution refusée :\n${formatIssues(result.issues)}`);
  return result.value;
}

export const resolvedInk = () => mustResolve({ style: loadInk() });
export const resolvedSignal = () => mustResolve({ style: loadSignal() });

export function codes(result: { ok: boolean; issues?: { code: string; severity?: string }[] }): string[] {
  return result.ok ? [] : (result.issues ?? []).filter((i) => i.severity !== 'warning').map((i) => i.code);
}

/** Render Plan minimal et cohérent, pour les tests de validation et de manifeste. */
export function minimalPlan(): Json {
  return {
    schema: 'render-plan',
    schema_version: '0.1.0',
    spec: { spec_id: 'moon_question', revision: 1, sha256: 'a'.repeat(64) },
    style: { mode: 'creative', sha256: 'b'.repeat(64) },
    compiler_version: '0.1.0',
    canvas: { width: 1080, height: 1920, fps: 30, duration_frames: 60 },
    fonts: [{ id: 'display_900', css_name: 'fixture-ink-serif', weight: 900, style: 'normal', file: 'lib:playfair-display-latin-900.ttf', sha256: 'c'.repeat(64) }],
    assets: [],
    scenes: [
      {
        id: 'sc_question',
        from: 0,
        to: 60,
        background: '#101820',
        nodes: [
          {
            id: 'tx_question',
            type: 'text',
            box: { x: 120, y: 760, w: 840, h: 320 },
            origin: { x: 0, y: 0 },
            opacity: 1,
            align: 'start',
            lines: [
              {
                runs: [{ id: 'r_setup', text: 'Et si la Lune', font: 'display_900', weight: 900, size: 150, tracking_px: 0, color: '#EFE6D2' }],
                top: 0,
                height: 153,
                measured_width: null,
              },
            ],
            tracks: [{ property: 'opacity', keys: [{ frame: 0, value: 0 }, { frame: 10, value: 1 }], source: 'bh_question_in' }],
          },
        ],
      },
    ],
  };
}
