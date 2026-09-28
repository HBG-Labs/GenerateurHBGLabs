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
    schema_version: '0.3.0',
    spec: { spec_id: 'moon_question', revision: 1, sha256: 'a'.repeat(64) },
    style: { mode: 'creative', sha256: 'b'.repeat(64) },
    compiler_version: '0.4.0',
    canvas: { width: 1080, height: 1920, fps: 30, duration_frames: 60 },
    safe_zone: { x: 120, y: 200, w: 840, h: 1500 },
    requirements: { capabilities: ['OPACITY', 'TEXT'], fingerprint: 'e'.repeat(64) },
    provenance: {
      timing_source: 'explicit_duration',
      behavior_registry_fingerprint: 'd'.repeat(64),
      text_engine: {
        name: 'harfbuzzjs',
        package_version: '1.6.2',
        native_version: '14.5.0',
        shaping_configuration: { direction: 'auto', kerning: true, ligatures: true, cluster_level: 'monotone_graphemes' },
      },
    },
    fonts: [{
      id: 'display_900', css_name: 'fixture-ink-serif', weight: 900, style: 'normal',
      file: 'lib:playfair-display-latin-900.ttf', sha256: 'c'.repeat(64), axes: {}, supported_axes: {}, substituted_for: null,
    }],
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
            transform: { translate_x: 0, translate_y: 0, scale: 1, rotate: 0 },
            must_be_safe: true,
            align: 'start',
            lines: [
              {
                runs: [{
                  id: 'r_setup', source_run: 'r_setup', source_text: 'Et si la Lune', formatted_text: 'Et si la Lune',
                  text: 'Et si la Lune', font: 'display_900', weight: 900, size: 150, tracking_px: 0,
                  color: '#EFE6D2', role: 'base', measured_width: 820, glyphs: [],
                }],
                top: 0,
                height: 153,
                measured_width: 820,
                ascent: 115,
                descent: 30,
                line_gap: 8,
                baseline: 115,
              },
            ],
            tracks: [{ id: 'track_question', property: 'opacity', keys: [{ frame: 0, value: 0 }, { frame: 10, value: 1 }], source: 'bh_question_in' }],
          },
        ],
        transition_out: null,
      },
    ],
    preflight: { status: 'pass', issues: [], checks: { fonts: 1, assets: 0, text_nodes: 1, safe_nodes: 1, contrast_pairs: 1 } },
  };
}
