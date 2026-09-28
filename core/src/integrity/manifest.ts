import { MANIFEST_SCHEMA, MANIFEST_VERSION, ReproducibilityManifestSchema } from '../contracts/manifest.ts';
import type { ReproducibilityManifest } from '../contracts/manifest.ts';
import type { MotionSceneSpec } from '../contracts/motion-spec.ts';
import type { PlatformPresets } from '../contracts/platform.ts';
import type { RenderPlan } from '../contracts/render-plan.ts';
import type { ResolvedStyle } from '../contracts/resolved-style.ts';
import { bindingMatches, describeResolved } from '../style/binding.ts';
import { hashDocument } from './canonical.ts';

export interface ManifestInput {
  createdAt: string;
  engine: Omit<ReproducibilityManifest['engine'], 'git_dirty' | 'reference_eligible'> & {
    git_dirty?: boolean;
    reference_eligible?: boolean;
  };
  spec: MotionSceneSpec;
  resolvedStyle: ResolvedStyle;
  plan: RenderPlan;
  platformPresets: PlatformPresets | null;
  toolchain: ReproducibilityManifest['toolchain'];
  renderConfig: ReproducibilityManifest['render_config'];
  renderer?: { name: string; version: string } | null;
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

  const body: ManifestBody = {
    schema: MANIFEST_SCHEMA,
    schema_version: MANIFEST_VERSION,
    engine: {
      ...input.engine,
      git_dirty: input.engine.git_dirty ?? true,
      reference_eligible: input.engine.reference_eligible ?? false,
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
      renderer: input.renderer ?? null,
    },
    render_plan_sha256: hashDocument(plan),
    toolchain: input.toolchain,
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
