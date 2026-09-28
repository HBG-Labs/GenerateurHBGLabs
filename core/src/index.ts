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
export * from './contracts/behavior.ts';
export * from './contracts/pattern.ts';
export * from './contracts/render-plan.ts';
export * from './contracts/manifest.ts';
export * from './contracts/visual.ts';
export * from './contracts/limits.ts';
export * from './contracts/dependency-graph.ts';
export * from './contracts/metrics.ts';

export { resolveStyle, resolvedStyleHash } from './style/resolve-style.ts';
export type { ResolveStyleInput } from './style/resolve-style.ts';
export { bindingMatches, describeResolved } from './style/binding.ts';
export { contrastRatio, relativeLuminance } from './style/contrast.ts';

export { canonicalJson, hashDocument, sha256Hex } from './integrity/canonical.ts';
export { buildSemanticCertificationFingerprint, manifestSemanticHash, SEMANTIC_CERTIFICATION_VERSION } from './integrity/certification.ts';
export type { SemanticCertificationFingerprint } from './integrity/certification.ts';
export { buildReproducibilityManifest, manifestHash, verifyManifest, referenceEligibility, ManifestError } from './integrity/manifest.ts';
export type { ManifestInput } from './integrity/manifest.ts';
export type { MotionRenderer, RenderFrameRequest, RenderFrameResult, RenderVideoRequest, RenderVideoResult } from './rendering/motion-renderer.ts';
export { assertRendererCompatible, assertRenderGate, rendererCompatibility, rendererRequirements, RendererCompatibilityError, RenderGateError } from './rendering/capabilities.ts';
export type { RendererDescriptor } from './rendering/capabilities.ts';

export {
  validateBrandProfile,
  validateBehaviorDefinition,
  validateIntent,
  validatePlatformPresets,
  validatePatternDefinition,
  validateRenderPlan,
  validateResolvedStyle,
  validateSeriesProfile,
  validateSpec,
  validateStyle,
} from './validation/validate.ts';
export { readVersioned, currentVersion, documentKinds, versionRegistry } from './validation/versioning.ts';
export type { DocumentKind, DocumentKinds } from './validation/versioning.ts';
export { formatIssues, hasErrors, ValidationFailure } from './validation/issues.ts';
export type { ValidationIssue, ValidationResult } from './validation/issues.ts';
export type { SemanticRegistry, SpecSemanticOptions, BehaviorInfo } from './validation/semantic-spec.ts';

export {
  BehaviorRegistry,
  behaviorRegistryFingerprint,
  P13_BEHAVIOR_DEFINITIONS,
  P13_BEHAVIOR_REGISTRY,
  P14_BEHAVIOR_DEFINITIONS,
  P14_BEHAVIOR_REGISTRY,
  P14_VISUAL_BEHAVIOR_DEFINITIONS,
} from './motion/behavior-registry.ts';
export { assertNoTrackConflicts, compileLayerTracks, MotionTrackError } from './motion/compile-tracks.ts';
export {
  analyzeTemporalPlan,
  anchorKind,
  durationToMs,
  maximumReadableWords,
  minimumReadabilityMs,
  readabilityWordCount,
  resolveTemporalPlan,
  stableReadingWindowMs,
  TemporalResolutionError,
} from './temporal/resolve.ts';
export type {
  ResolveTemporalInput,
  ResolvedBehaviorTiming,
  ResolvedSceneTiming,
  ResolvedTransitionTiming,
  TemporalDiagnostic,
  TemporalAnalysis,
  TemporalResolution,
} from './temporal/resolve.ts';

export { loadBrandFile, loadPlatformPresetsFile, loadSeriesFile, loadStyleFile, resolveResource } from './io/load.ts';
export type { LoadedBrand, LoadedSeries, LoadOptions } from './io/load.ts';

export { findWordMatches, normalizeWord, voiceWords } from './text/voice-words.ts';
export { formatTypography, FRENCH_TYPOGRAPHY_SPACES } from './typography/formatter.ts';
export type { FormattedTypography } from './typography/formatter.ts';
export {
  HarfBuzzTextEngine,
  TEXT_ENGINE_NAME,
  TEXT_ENGINE_PACKAGE_VERSION,
  TypographyEngineError,
} from './typography/harfbuzz-text-engine.ts';
export type { FontBinary, GlyphPlacement, SupportedAxis, TextMetrics, TypographyDiagnostic } from './typography/harfbuzz-text-engine.ts';
export { analyzeTextFit, fitText, TextOverflowError } from './typography/fit-text.ts';
export type { FitFragmentInput, FittedFragment, FittedLine, FitTextInput, FitTextResult, TextFitAnalysis, TextFitOverflowReason } from './typography/fit-text.ts';
export { analyzeSubtitleTextFit, fitSubtitleText, resolveSubtitleFittingContext } from './typography/subtitle-fit.ts';
export type { SubtitleFittingContext, SubtitleFittingContextInput, SubtitleFontResource, SubtitleTextFitAnalysis } from './typography/subtitle-fit.ts';

export { AssetValidationError, inspectImage, placeImage, resolveContainedAssetPath, validateImageResource } from './visual/assets.ts';
export type { ImageResource } from './visual/assets.ts';
export { boxContains, gridPlacementBox, intersectBoxes, normalizedRegionBox, resolveVisualLayout } from './visual/layout.ts';
export type { VisualLayoutKind } from './visual/layout.ts';
export { compileNormalizedPath, PathGeometryError } from './visual/path.ts';
export { buildQualityPreflight } from './visual/preflight.ts';
export { assertStyleVersionPolicy, StyleVersionPolicyError } from './style/version-policy.ts';
export type { StyleVersionBaseline } from './style/version-policy.ts';

export { buildMotionSceneSpec, SPEC_BUILDER_VERSION, SpecBuilderError } from './spec-builder/build-spec.ts';
export type { BuildSpecInput, SpecContentLine } from './spec-builder/build-spec.ts';
export { compileMotionScene, compilePipeline, compileForRender, profileCompileForRender, profileCompilePipeline, COMPILER_PIPELINE_PHASES, COMPILER_VERSION, CompileError } from './compiler/compile.ts';
export type { CompilationManifestContext, CompileInput, CompilerMeasuredPhase, CompilerPhaseMetrics, CompilerPipelineResult, FontResource, ProfiledRenderCompilationResult, RenderCompilationResult } from './compiler/compile.ts';
export { buildDependencyGraph, affectedNodes } from './compiler/dependency-graph.ts';
export { compileAudioPlan, compileSubtitlePlan } from './compiler/plans.ts';
export { resolveRenderGeometry } from './compiler/render-geometry.ts';
export type { RenderGeometry, ResolveRenderGeometryInput } from './compiler/render-geometry.ts';
export { assertAuxiliaryPlanLimits, assertInputLimits, assertPlanLimits, EngineLimitError } from './compiler/limits.ts';
