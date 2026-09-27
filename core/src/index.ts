// API publique de @motion-engine/core.

export * from './contracts/common.ts';
export * from './contracts/creative-intent.ts';
export * from './contracts/style-roles.ts';
export * from './contracts/style-profile.ts';
export * from './contracts/brand-profile.ts';
export * from './contracts/series-profile.ts';
export * from './contracts/resolved-style.ts';
export * from './contracts/platform.ts';
export * from './contracts/motion-spec.ts';
export * from './contracts/render-plan.ts';
export * from './contracts/manifest.ts';

export { resolveStyle, resolvedStyleHash } from './style/resolve-style.ts';
export type { ResolveStyleInput } from './style/resolve-style.ts';
export { bindingMatches, describeResolved } from './style/binding.ts';
export { contrastRatio, relativeLuminance } from './style/contrast.ts';

export { canonicalJson, hashDocument, sha256Hex } from './integrity/canonical.ts';
export { buildReproducibilityManifest, manifestHash, verifyManifest, ManifestError } from './integrity/manifest.ts';
export type { ManifestInput } from './integrity/manifest.ts';

export {
  validateBrandProfile,
  validateIntent,
  validatePlatformPresets,
  validateRenderPlan,
  validateResolvedStyle,
  validateSeriesProfile,
  validateSpec,
  validateStyle,
} from './validation/validate.ts';
export { readVersioned, currentVersion, documentKinds } from './validation/versioning.ts';
export type { DocumentKind, DocumentKinds } from './validation/versioning.ts';
export { formatIssues, hasErrors, ValidationFailure } from './validation/issues.ts';
export type { ValidationIssue, ValidationResult } from './validation/issues.ts';
export type { SemanticRegistry, SpecSemanticOptions, BehaviorInfo } from './validation/semantic-spec.ts';

export { loadBrandFile, loadPlatformPresetsFile, loadSeriesFile, loadStyleFile, resolveResource } from './io/load.ts';
export type { LoadedBrand, LoadedSeries, LoadOptions } from './io/load.ts';

export { findWordMatches, normalizeWord, voiceWords } from './text/voice-words.ts';
