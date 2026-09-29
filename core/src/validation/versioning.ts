import type { z } from 'zod';

import { BEHAVIOR_DEFINITION_SCHEMA, BEHAVIOR_DEFINITION_VERSION, BehaviorDefinitionSchema } from '../contracts/behavior.ts';
import type { BehaviorDefinition } from '../contracts/behavior.ts';
import { BRAND_PROFILE_SCHEMA, BRAND_PROFILE_VERSION, BrandMotionProfileSchema } from '../contracts/brand-profile.ts';
import type { BrandMotionProfile } from '../contracts/brand-profile.ts';
import { CREATIVE_INTENT_SCHEMA, CREATIVE_INTENT_VERSION, CreativeIntentSchema } from '../contracts/creative-intent.ts';
import type { CreativeIntent } from '../contracts/creative-intent.ts';
import { MANIFEST_SCHEMA, MANIFEST_VERSION, ReproducibilityManifestSchema } from '../contracts/manifest.ts';
import type { ReproducibilityManifest } from '../contracts/manifest.ts';
import { MOTION_SPEC_SCHEMA, MOTION_SPEC_VERSION, MotionSceneSpecSchema } from '../contracts/motion-spec.ts';
import type { MotionSceneSpec } from '../contracts/motion-spec.ts';
import { PATTERN_DEFINITION_SCHEMA, PATTERN_DEFINITION_VERSION, PatternDefinitionSchema } from '../contracts/pattern.ts';
import type { PatternDefinition } from '../contracts/pattern.ts';
import { PLATFORM_PRESETS_SCHEMA, PLATFORM_PRESETS_VERSION, PlatformPresetsSchema } from '../contracts/platform.ts';
import type { PlatformPresets } from '../contracts/platform.ts';
import { RENDER_PLAN_LEGACY_VERSION, RENDER_PLAN_SCHEMA, RENDER_PLAN_VERSION, RenderPlanSchema } from '../contracts/render-plan.ts';
import type { RenderPlan } from '../contracts/render-plan.ts';
import { AUDIO_PLAN_VERSION, AudioPlanSchema, SUBTITLE_PLAN_VERSION, SubtitlePlanSchema } from '../contracts/render-plan.ts';
import type { AudioPlan, SubtitlePlan } from '../contracts/render-plan.ts';
import { DEPENDENCY_GRAPH_VERSION, DependencyGraphSchema } from '../contracts/dependency-graph.ts';
import type { DependencyGraph } from '../contracts/dependency-graph.ts';
import { RESOLVED_STYLE_SCHEMA, RESOLVED_STYLE_VERSION, ResolvedStyleSchema } from '../contracts/resolved-style.ts';
import type { ResolvedStyle } from '../contracts/resolved-style.ts';
import { SERIES_PROFILE_SCHEMA, SERIES_PROFILE_VERSION, SeriesMotionProfileSchema } from '../contracts/series-profile.ts';
import type { SeriesMotionProfile } from '../contracts/series-profile.ts';
import { STYLE_PROFILE_SCHEMA, STYLE_PROFILE_VERSION, CreativeStyleProfileSchema } from '../contracts/style-profile.ts';
import type { CreativeStyleProfile } from '../contracts/style-profile.ts';
import type { ValidationIssue } from './issues.ts';
import { parseStructure } from './structural.ts';

export interface DocumentKinds {
  'creative-intent': CreativeIntent;
  'creative-style-profile': CreativeStyleProfile;
  'brand-motion-profile': BrandMotionProfile;
  'series-motion-profile': SeriesMotionProfile;
  'resolved-style': ResolvedStyle;
  'platform-presets': PlatformPresets;
  'motion-scene-spec': MotionSceneSpec;
  'pattern-definition': PatternDefinition;
  'behavior-definition': BehaviorDefinition;
  'render-plan': RenderPlan;
  'reproducibility-manifest': ReproducibilityManifest;
  'audio-plan': AudioPlan;
  'subtitle-plan': SubtitlePlan;
  'dependency-graph': DependencyGraph;
}
export type DocumentKind = keyof DocumentKinds;

type Migrator = (doc: Record<string, unknown>) => Record<string, unknown>;

function migrateMotionSpec010(doc: Record<string, unknown>): Record<string, unknown> {
  const clone = structuredClone(doc);
  const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
  const visit = (layer: unknown): void => {
    if (!record(layer)) return;
    const behaviors = layer['behaviors'];
    if (Array.isArray(behaviors)) {
      for (const behavior of behaviors) if (record(behavior) && behavior['version'] === undefined) behavior['version'] = '1.0.0';
    }
    const children = layer['children'];
    if (Array.isArray(children)) for (const child of children) visit(child);
  };
  const scenes = clone['scenes'];
  if (!Array.isArray(scenes)) return clone;
  for (const scene of scenes) {
    if (!record(scene)) continue;
    const layers = scene['layers'];
    if (Array.isArray(layers)) for (const layer of layers) visit(layer);
    const transition = scene['transition_out'];
    if (record(transition) && transition['version'] === undefined) transition['version'] = '1.0.0';
  }
  return clone;
}

interface KindEntry<T> {
  current: string;
  schema: z.ZodType<T>;
  /** Migrations d'une version vers la suivante. Vide tant qu'une seule version existe. */
  migrations: Record<string, { to: string; migrate: Migrator }>;
}

const REGISTRY: { [K in DocumentKind]: KindEntry<DocumentKinds[K]> } = {
  [CREATIVE_INTENT_SCHEMA]: { current: CREATIVE_INTENT_VERSION, schema: CreativeIntentSchema, migrations: {} },
  [STYLE_PROFILE_SCHEMA]: { current: STYLE_PROFILE_VERSION, schema: CreativeStyleProfileSchema, migrations: {} },
  [BRAND_PROFILE_SCHEMA]: { current: BRAND_PROFILE_VERSION, schema: BrandMotionProfileSchema, migrations: {} },
  [SERIES_PROFILE_SCHEMA]: { current: SERIES_PROFILE_VERSION, schema: SeriesMotionProfileSchema, migrations: {} },
  [RESOLVED_STYLE_SCHEMA]: { current: RESOLVED_STYLE_VERSION, schema: ResolvedStyleSchema, migrations: {} },
  [PLATFORM_PRESETS_SCHEMA]: { current: PLATFORM_PRESETS_VERSION, schema: PlatformPresetsSchema, migrations: {} },
  [MOTION_SPEC_SCHEMA]: {
    current: MOTION_SPEC_VERSION,
    schema: MotionSceneSpecSchema,
    migrations: { '0.1.0': { to: '0.2.0', migrate: migrateMotionSpec010 } },
  },
  [PATTERN_DEFINITION_SCHEMA]: { current: PATTERN_DEFINITION_VERSION, schema: PatternDefinitionSchema, migrations: {} },
  [BEHAVIOR_DEFINITION_SCHEMA]: { current: BEHAVIOR_DEFINITION_VERSION, schema: BehaviorDefinitionSchema, migrations: {} },
  [RENDER_PLAN_SCHEMA]: {
    current: RENDER_PLAN_VERSION,
    schema: RenderPlanSchema,
    migrations: {
      [RENDER_PLAN_LEGACY_VERSION]: {
        to: RENDER_PLAN_VERSION,
        migrate: (doc) => ({ ...doc, schema_version: RENDER_PLAN_VERSION }),
      },
    },
  },
  [MANIFEST_SCHEMA]: { current: MANIFEST_VERSION, schema: ReproducibilityManifestSchema, migrations: {} },
  'audio-plan': { current: AUDIO_PLAN_VERSION, schema: AudioPlanSchema, migrations: {} },
  'subtitle-plan': { current: SUBTITLE_PLAN_VERSION, schema: SubtitlePlanSchema, migrations: {} },
  'dependency-graph': { current: DEPENDENCY_GRAPH_VERSION, schema: DependencyGraphSchema, migrations: {} },
};

export function currentVersion(kind: DocumentKind): string {
  return REGISTRY[kind].current;
}

export function documentKinds(): DocumentKind[] {
  return Object.keys(REGISTRY) as DocumentKind[];
}

export function versionRegistry(): Array<{ kind: DocumentKind; current: string; automatic_from: string[] }> {
  return documentKinds().map((kind) => ({ kind, current: REGISTRY[kind].current, automatic_from: Object.keys(REGISTRY[kind].migrations).sort() }));
}

/**
 * Lit un document versionné : vérifie son type, le migre jusqu'à la version
 * courante si un chemin existe, puis applique le schéma strict. Une version
 * inconnue est refusée, jamais interprétée « au mieux ».
 */
export function readVersioned<K extends DocumentKind>(
  kind: K,
  input: unknown,
): { ok: true; value: DocumentKinds[K]; migratedFrom: string | null } | { ok: false; issues: ValidationIssue[] } {
  const entry = REGISTRY[kind] as KindEntry<DocumentKinds[K]>;
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, issues: [issue('version.not_object', '', 'objet JSON attendu')] };
  }
  let doc = input as Record<string, unknown>;
  if (doc['schema'] !== kind) {
    return {
      ok: false,
      issues: [issue('version.wrong_kind', 'schema', `document « ${kind} » attendu, reçu « ${String(doc['schema'])} »`)],
    };
  }
  const original = typeof doc['schema_version'] === 'string' ? doc['schema_version'] : null;
  if (original === null) {
    return { ok: false, issues: [issue('version.missing', 'schema_version', 'version de schéma absente')] };
  }
  let version = original;
  const seen = new Set<string>();
  while (version !== entry.current) {
    const step = entry.migrations[version];
    if (!step || seen.has(version)) {
      return {
        ok: false,
        issues: [
          issue(
            'version.unsupported',
            'schema_version',
            `version ${version} non prise en charge (courante : ${entry.current}) et aucune migration disponible`,
          ),
        ],
      };
    }
    seen.add(version);
    doc = { ...step.migrate(doc), schema_version: step.to };
    version = step.to;
  }
  const parsed = parseStructure(entry.schema, doc);
  if (!parsed.ok) return parsed;
  return { ok: true, value: parsed.value, migratedFrom: original === entry.current ? null : original };
}

function issue(code: string, path: string, message: string): ValidationIssue {
  return { code, path, message, severity: 'error' };
}
