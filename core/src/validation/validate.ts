import type { BrandMotionProfile } from '../contracts/brand-profile.ts';
import type { BehaviorDefinition } from '../contracts/behavior.ts';
import type { CreativeIntent } from '../contracts/creative-intent.ts';
import type { MotionSceneSpec } from '../contracts/motion-spec.ts';
import type { PatternDefinition } from '../contracts/pattern.ts';
import type { PlatformPresets } from '../contracts/platform.ts';
import type { RenderPlan } from '../contracts/render-plan.ts';
import type { ResolvedStyle } from '../contracts/resolved-style.ts';
import type { SeriesMotionProfile } from '../contracts/series-profile.ts';
import type { CreativeStyleProfile } from '../contracts/style-profile.ts';
import { resolvedStyleHash } from '../style/resolve-style.ts';
import { hasErrors } from './issues.ts';
import type { ValidationIssue, ValidationResult } from './issues.ts';
import { validateIntentSemantics } from './semantic-intent.ts';
import { validateRenderPlanSemantics } from './semantic-plan.ts';
import { validateSpecSemantics } from './semantic-spec.ts';
import type { SpecSemanticOptions } from './semantic-spec.ts';
import { validateStyleSemantics } from './semantic-style.ts';
import { readVersioned } from './versioning.ts';

function finish<T>(value: T, issues: ValidationIssue[]): ValidationResult<T> {
  if (hasErrors(issues)) return { ok: false, issues };
  return { ok: true, value, warnings: issues };
}

export function validateIntent(input: unknown): ValidationResult<CreativeIntent> {
  const read = readVersioned('creative-intent', input);
  if (!read.ok) return read;
  return finish(read.value, validateIntentSemantics(read.value));
}

export function validateStyle(input: unknown): ValidationResult<CreativeStyleProfile> {
  const read = readVersioned('creative-style-profile', input);
  if (!read.ok) return read;
  return finish(read.value, validateStyleSemantics(read.value));
}

/** Validation propre au profil de marque ; sa cohérence avec le style se vérifie à la résolution. */
export function validateBrandProfile(input: unknown): ValidationResult<BrandMotionProfile> {
  const read = readVersioned('brand-motion-profile', input);
  if (!read.ok) return read;
  const issues: ValidationIssue[] = [];
  const refs = new Set<string>();
  read.value.assets.approved.forEach((asset, i) => {
    if (refs.has(asset.ref)) {
      issues.push({ code: 'asset.duplicate', path: `assets.approved[${i}]`, message: `asset « ${asset.ref} » en double`, severity: 'error' });
    }
    refs.add(asset.ref);
  });
  return finish(read.value, issues);
}

export function validateSeriesProfile(input: unknown): ValidationResult<SeriesMotionProfile> {
  const read = readVersioned('series-motion-profile', input);
  if (!read.ok) return read;
  return finish(read.value, []);
}

export function validatePlatformPresets(input: unknown): ValidationResult<PlatformPresets> {
  const read = readVersioned('platform-presets', input);
  if (!read.ok) return read;
  const issues: ValidationIssue[] = [];
  for (const [platform, preset] of Object.entries(read.value.platforms)) {
    if (!preset) continue;
    for (const format of [...preset.formats, preset.safe_zone.format]) {
      if (!read.value.formats[format]) {
        issues.push({ code: 'platform.unknown_format', path: `platforms.${platform}`, message: `format « ${format} » non défini`, severity: 'error' });
      }
    }
  }
  return finish(read.value, issues);
}

export function validatePatternDefinition(input: unknown): ValidationResult<PatternDefinition> {
  const read = readVersioned('pattern-definition', input);
  if (!read.ok) return read;
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();
  const orders = new Set<number>();
  read.value.slots.forEach((slot, index) => {
    if (ids.has(slot.id)) {
      issues.push({ code: 'pattern.slot_duplicate', path: `slots[${index}].id`, message: `slot « ${slot.id} » en double`, severity: 'error' });
    }
    if (orders.has(slot.order)) {
      issues.push({ code: 'pattern.order_duplicate', path: `slots[${index}].order`, message: `ordre ${slot.order} en double`, severity: 'error' });
    }
    ids.add(slot.id);
    orders.add(slot.order);
  });
  if (read.value.constraints.min_lines > read.value.constraints.max_lines) {
    issues.push({ code: 'pattern.line_range', path: 'constraints', message: 'min_lines doit être inférieur ou égal à max_lines', severity: 'error' });
  }
  if (!read.value.slots.some((slot) => slot.primitive === 'text')) {
    issues.push({ code: 'pattern.text_required', path: 'slots', message: 'un slot texte est requis', severity: 'error' });
  }
  return finish(read.value, issues);
}

export function validateBehaviorDefinition(input: unknown): ValidationResult<BehaviorDefinition> {
  const read = readVersioned('behavior-definition', input);
  if (!read.ok) return read;
  const issues: ValidationIssue[] = [];
  if (read.value.duration_budget.min_ms > read.value.duration_budget.max_ms) {
    issues.push({ code: 'behavior.duration_budget', path: 'duration_budget', message: 'min_ms doit être inférieur ou égal à max_ms', severity: 'error' });
  }
  const properties = new Set(read.value.animatable_properties);
  if (properties.size !== read.value.animatable_properties.length) {
    issues.push({ code: 'behavior.property_duplicate', path: 'animatable_properties', message: 'propriété animable en double', severity: 'error' });
  }
  return finish(read.value, issues);
}

/** Un style résolu relu depuis un stockage : schéma et empreinte. */
export function validateResolvedStyle(input: unknown): ValidationResult<ResolvedStyle> {
  const read = readVersioned('resolved-style', input);
  if (!read.ok) return read;
  const issues: ValidationIssue[] = [];
  if (resolvedStyleHash(read.value) !== read.value.sha256) {
    issues.push({ code: 'resolved.hash_mismatch', path: 'sha256', message: 'le style résolu a été modifié après sa résolution', severity: 'error' });
  }
  return finish(read.value, issues);
}

export function validateSpec(
  input: unknown,
  resolved: ResolvedStyle,
  options: SpecSemanticOptions = {},
): ValidationResult<MotionSceneSpec> {
  const read = readVersioned('motion-scene-spec', input);
  if (!read.ok) return read;
  return finish(read.value, validateSpecSemantics(read.value, resolved, options));
}

export function validateRenderPlan(input: unknown): ValidationResult<RenderPlan> {
  const read = readVersioned('render-plan', input);
  if (!read.ok) return read;
  return finish(read.value, validateRenderPlanSemantics(read.value));
}
