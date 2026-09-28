import { MANIFEST_SCHEMA, MANIFEST_VERSION, ReproducibilityManifestSchema } from '../contracts/manifest.ts';
import type { ReproducibilityManifest } from '../contracts/manifest.ts';
import type { MotionSceneSpec } from '../contracts/motion-spec.ts';
import type { PlatformPresets } from '../contracts/platform.ts';
import type { RenderPlan } from '../contracts/render-plan.ts';
import type { AudioPlan, SubtitlePlan } from '../contracts/render-plan.ts';
import type { DependencyGraph } from '../contracts/dependency-graph.ts';
import type { EngineLimits } from '../contracts/limits.ts';
import { DEFAULT_ENGINE_LIMITS } from '../contracts/limits.ts';
import type { ResolvedStyle } from '../contracts/resolved-style.ts';
import { bindingMatches, describeResolved } from '../style/binding.ts';
import { hashDocument } from './canonical.ts';
import { rendererCompatibility } from '../rendering/capabilities.ts';
import type { RendererDescriptor } from '../rendering/capabilities.ts';

export interface ManifestInput {
  createdAt: string;
  engine: Omit<ReproducibilityManifest['engine'], 'git_dirty' | 'reference_eligible' | 'reference_ineligibility_reasons'> & {
    git_dirty?: boolean;
    reference_eligible?: boolean;
  };
  spec: MotionSceneSpec;
  resolvedStyle: ResolvedStyle;
  plan: RenderPlan;
  platformPresets: PlatformPresets | null;
  toolchain: Omit<ReproducibilityManifest['toolchain'], 'harfbuzzjs' | 'renderer_package' | 'os' | 'arch'> &
    Partial<Pick<ReproducibilityManifest['toolchain'], 'harfbuzzjs' | 'renderer_package' | 'os' | 'arch'>>;
  renderConfig: ReproducibilityManifest['render_config'];
  renderer?: { name: string; version: string } | null;
  rendererDescriptor?: RendererDescriptor | null;
  audioPlan?: AudioPlan | null;
  subtitlePlan?: SubtitlePlan | null;
  dependencyGraph?: DependencyGraph | null;
  engineLimits?: EngineLimits;
  pattern?: { id: string; version: string; sha256: string } | null;
  /** Obligatoire si le style utilisé n'est pas celui de la liaison de la spec. */
  substitutionReason?: string;
}

type ManifestBody = Omit<ReproducibilityManifest, 'created_at' | 'manifest_sha256'>;

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestError';
  }
}

export interface ReferenceEligibility {
  eligible: boolean;
  reasons: string[];
}

export function referenceEligibility(input: Pick<ManifestInput, 'engine' | 'plan' | 'platformPresets' | 'renderer' | 'rendererDescriptor'> & { toolchain?: ManifestInput['toolchain'] }): ReferenceEligibility {
  const reasons: string[] = [];
  if (input.engine.git_dirty ?? true) reasons.push('git_dirty');
  if (!input.engine.git_commit) reasons.push('git_commit_unknown');
  if (!input.platformPresets) reasons.push('platform_version_unknown');
  if (input.plan.preflight.issues.some((issue) => issue.severity === 'error')) reasons.push('preflight_error');
  if (input.plan.fonts.some((font) => !/^[0-9a-f]{64}$/u.test(font.sha256))) reasons.push('font_unhashed');
  if (input.plan.assets.some((asset) => !/^[0-9a-f]{64}$/u.test(asset.sha256))) reasons.push('asset_unhashed');
  const descriptor = input.rendererDescriptor;
  if (!descriptor && !input.renderer) reasons.push('renderer_unknown');
  if (descriptor && rendererCompatibility(input.plan, descriptor).length > 0) reasons.push('renderer_incompatible');
  const toolchain = input.toolchain;
  if (!toolchain) reasons.push('toolchain_unknown');
  else {
    if (!toolchain.node) reasons.push('node_version_unknown');
    if (!toolchain.package_manager) reasons.push('package_manager_unknown');
    if (!/^[0-9a-f]{64}$/u.test(toolchain.lockfile_sha256)) reasons.push('lockfile_unhashed');
    if (!toolchain.remotion) reasons.push('remotion_version_unknown');
    if (!toolchain.chromium) reasons.push('chromium_version_unknown');
    if (!toolchain.renderer_package) reasons.push('renderer_version_unknown');
    if (!toolchain.os || !toolchain.arch) reasons.push('platform_unknown');
  }
  return { eligible: reasons.length === 0, reasons: [...new Set(reasons)].sort() };
}

export function buildReproducibilityManifest(input: ManifestInput): ReproducibilityManifest {
  const { spec, resolvedStyle: resolved, plan } = input;
  const substituted = !bindingMatches(spec.style_binding, resolved);
  const reason = input.substitutionReason ?? null;
  if (substituted && reason === null) {
    const b = spec.style_binding;
    throw new ManifestError(
      `Substitution de style non déclarée : spec liée à ${b.kind}:${b.id}@${b.version}, style utilisé ${describeResolved(resolved)}.`,
    );
  }
  if (!substituted && reason !== null) {
    throw new ManifestError('Motif de substitution fourni alors que le style correspond à la liaison de la spec.');
  }
  if (plan.style.sha256 !== resolved.sha256) {
    throw new ManifestError('Le Render Plan a été compilé avec un autre style résolu.');
  }
  const specHash = hashDocument(spec);
  if (plan.spec.sha256 !== specHash || plan.spec.spec_id !== spec.spec_id) {
    throw new ManifestError('Le Render Plan a été compilé depuis une autre spec.');
  }

  const eligibility = referenceEligibility(input);
  const requestedEligibility = input.engine.reference_eligible;
  const eligible = (requestedEligibility ?? true) && eligibility.eligible;
  if (requestedEligibility === true && !eligibility.eligible) throw new ManifestError(`Référence demandée mais inéligible : ${eligibility.reasons.join(', ')}`);
  const limits = input.engineLimits ?? DEFAULT_ENGINE_LIMITS;
  const renderer = input.rendererDescriptor ? { name: input.rendererDescriptor.name, version: input.rendererDescriptor.version } : input.renderer ?? null;
  const body: ManifestBody = {
    schema: MANIFEST_SCHEMA,
    schema_version: MANIFEST_VERSION,
    engine: {
      ...input.engine,
      git_dirty: input.engine.git_dirty ?? true,
      reference_eligible: eligible,
      reference_ineligibility_reasons: eligible ? [] : eligibility.reasons,
    },
    spec: { spec_id: spec.spec_id, revision: spec.revision, sha256: specHash },
    style: {
      binding: spec.style_binding,
      mode: resolved.mode,
      resolved_sha256: resolved.sha256,
      sources: {
        style: { id: resolved.sources.style.id, version: resolved.sources.style.version, sha256: resolved.sources.style.sha256 },
        brand: resolved.sources.brand,
        series: resolved.sources.series,
      },
      substituted,
      substitution_reason: reason,
    },
    platform_presets: input.platformPresets
      ? { version: input.platformPresets.version, sha256: hashDocument(input.platformPresets) }
      : null,
    patterns: input.pattern ? [input.pattern] : [{ id: spec.system.id, version: spec.system.version, sha256: hashDocument({ id: spec.system.id, version: spec.system.version }) }],
    fonts: plan.fonts
      .map((font) => ({
        file: font.file,
        sha256: font.sha256,
        axes: font.axes,
        supported_axes: font.supported_axes,
        substituted_for: font.substituted_for,
      }))
      .sort((a, b) => a.file.localeCompare(b.file)),
    assets: plan.assets
      .map((asset) => ({
        ref: asset.ref,
        file: asset.file,
        sha256: asset.sha256,
        width: asset.width,
        height: asset.height,
        mime: asset.mime,
        provenance: asset.provenance,
        semantic_regions: asset.semantic_regions,
        transformations: asset.transformations,
      }))
      .sort((a, b) => a.ref.localeCompare(b.ref)),
    compilation: {
      timing_source: plan.provenance.timing_source,
      behavior_registry_fingerprint: plan.provenance.behavior_registry_fingerprint,
      text_engine: {
        name: plan.provenance.text_engine.name,
        package_version: plan.provenance.text_engine.package_version,
        native_version: plan.provenance.text_engine.native_version,
        shaping_configuration: plan.provenance.text_engine.shaping_configuration,
      },
      renderer,
      renderer_capabilities_fingerprint: input.rendererDescriptor ? hashDocument([...input.rendererDescriptor.capabilities].sort()) : null,
    },
    render_plan_sha256: hashDocument(plan),
    audio_plan_sha256: input.audioPlan ? hashDocument(input.audioPlan) : null,
    subtitle_plan_sha256: input.subtitlePlan ? hashDocument(input.subtitlePlan) : null,
    preflight_sha256: hashDocument(plan.preflight),
    dependency_graph_sha256: input.dependencyGraph?.sha256 ?? null,
    toolchain: {
      ...input.toolchain,
      harfbuzzjs: input.toolchain.harfbuzzjs ?? plan.provenance.text_engine.package_version,
      renderer_package: input.toolchain.renderer_package ?? renderer?.version ?? null,
      os: input.toolchain.os ?? process.platform,
      arch: input.toolchain.arch ?? process.arch,
    },
    configuration: { engine_limits_sha256: hashDocument(limits), network_required: false },
    render_config: input.renderConfig,
  };
  return ReproducibilityManifestSchema.parse({
    ...body,
    created_at: input.createdAt,
    manifest_sha256: manifestHash(body),
  });
}

/** Empreinte du manifeste, date de création exclue. */
export function manifestHash(manifest: ManifestBody | ReproducibilityManifest): string {
  const { created_at: _createdAt, manifest_sha256: _hash, ...body } = manifest as ReproducibilityManifest;
  return hashDocument(body);
}

export function verifyManifest(manifest: ReproducibilityManifest): boolean {
  return manifestHash(manifest) === manifest.manifest_sha256;
}
