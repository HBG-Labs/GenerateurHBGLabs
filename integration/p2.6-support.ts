import {
  compilePipeline,
  type CompilerPipelineResult,
} from '@motion-engine/core';
import {
  SHORT_FORM_DEFAULT_PROFILE,
  compileCreativePlan,
  type CreativeCompileResult,
} from '@motion-engine/creative-compiler';
import type {
  ArchetypeId,
  ContentSlot,
} from '@motion-engine/creative-core';
import {
  createCreativeGenerationRequest,
  runCreativeGateway,
  type CreativeGatewayResult,
  type CreativeProvider,
  type CreateCreativeGenerationRequestInput,
  type PlanningGenerationOutput,
  type ProviderMetadata,
  type ProviderInvocation,
  type ProviderResponse,
  type ResolutionGenerationOutput,
  type ResolutionRepairPatch,
  RESOLUTION_REPAIR_CONTRACT_VERSION,
} from '@motion-engine/creative-gateway';

import { pattern, platforms } from './p1.2-support.ts';
import { p14FontResources } from './p1.4-support.ts';
import { p23Asset, p23Style } from './p2.3-support.ts';

export type P26CaseId =
  | 'hypothetical'
  | 'science_explainer'
  | 'product_demo'
  | 'problem_solution'
  | 'comparison'
  | 'minimal_short'
  | 'long_form_short'
  | 'french_typography';

export interface P26CertificationCase {
  readonly id: P26CaseId;
  readonly label: string;
  readonly expected_archetype: ArchetypeId;
  readonly request: CreateCreativeGenerationRequestInput;
  readonly real_provider: boolean;
  readonly render: boolean;
}

function request(
  idea: string,
  creativeGoal: string,
  targetDurationMs: number,
  tone: readonly string[],
  desiredReaction: string,
  factualMode: 'factual' | 'creative' | 'mixed',
  knowledgeLevel: CreateCreativeGenerationRequestInput['audience']['knowledge_level'],
): CreateCreativeGenerationRequestInput {
  return {
    idea,
    creative_goal: creativeGoal,
    target_duration_ms: targetDurationMs,
    target_format: 'vertical_short',
    audience: {
      description: 'Public francophone général',
      knowledge_level: knowledgeLevel,
    },
    language: 'fr',
    locale: 'fr-FR',
    tone: [...tone],
    desired_reaction: desiredReaction,
    factual_mode: factualMode,
    cta: { mode: 'none' },
    constraints: [],
  };
}

export const P26_CERTIFICATION_MATRIX: readonly P26CertificationCase[] = Object.freeze([
  {
    id: 'hypothetical',
    label: 'A — Hypothetical',
    expected_archetype: 'HYPOTHETICAL',
    request: request(
      "Et si les dinosaures existaient encore aujourd'hui ?",
      'curiosity',
      30_000,
      ['dramatic'],
      'surprise',
      'creative',
      'mixed',
    ),
    real_provider: false,
    render: true,
  },
  {
    id: 'science_explainer',
    label: 'B — Science / Explainer',
    expected_archetype: 'EXPLAINER',
    request: request(
      'Pourquoi le ciel est-il bleu ?',
      'educate',
      30_000,
      ['clear', 'curious'],
      'understanding',
      'mixed',
      'beginner',
    ),
    real_provider: true,
    render: true,
  },
  {
    id: 'product_demo',
    label: 'C — Product demonstration',
    expected_archetype: 'DEMONSTRATION',
    request: request(
      'Présente une application qui permet d’organiser ses tâches quotidiennes.',
      'demonstrate',
      20_000,
      ['precise', 'reassuring'],
      'confidence',
      'creative',
      'unaware',
    ),
    real_provider: true,
    render: true,
  },
  {
    id: 'problem_solution',
    label: 'D — Problem / Solution',
    expected_archetype: 'PROBLEM_SOLUTION',
    request: request(
      'Pourquoi perd-on autant de temps à chercher ses fichiers, et comment mieux les organiser ?',
      'problem_solution',
      30_000,
      ['clear', 'practical'],
      'relief',
      'creative',
      'mixed',
    ),
    real_provider: true,
    render: false,
  },
  {
    id: 'comparison',
    label: 'E — Comparison',
    expected_archetype: 'COMPARISON',
    request: request(
      'Papier ou application numérique pour organiser ses tâches ?',
      'compare',
      30_000,
      ['balanced', 'clear'],
      'informed_choice',
      'creative',
      'beginner',
    ),
    real_provider: false,
    render: false,
  },
  {
    id: 'minimal_short',
    label: 'F — Minimal short',
    expected_archetype: 'HYPOTHETICAL',
    request: request(
      'Et si le Soleil s’éteignait ?',
      'hypothetical',
      8_000,
      ['dramatic'],
      'surprise',
      'creative',
      'mixed',
    ),
    real_provider: true,
    render: true,
  },
  {
    id: 'long_form_short',
    label: 'G — Long-form short',
    expected_archetype: 'EXPLAINER',
    request: request(
      'Comment les courants océaniques transportent-ils la chaleur autour du globe ?',
      'educate',
      60_000,
      ['clear', 'precise'],
      'understanding',
      'mixed',
      'intermediate',
    ),
    real_provider: false,
    render: false,
  },
  {
    id: 'french_typography',
    label: 'H — French typography stress',
    expected_archetype: 'EXPLAINER',
    request: request(
      'Comment lire aujourd’hui une facture d’électricité de 1 249,90 € à Fort-de-France ?',
      'educate',
      30_000,
      ['clear', 'technical'],
      'understanding',
      'creative',
      'beginner',
    ),
    real_provider: false,
    render: false,
  },
]);

export const P26_REAL_PROVIDER_CASES = P26_CERTIFICATION_MATRIX.filter((entry) => entry.real_provider);

export function p26Case(id: P26CaseId): P26CertificationCase {
  const found = P26_CERTIFICATION_MATRIX.find((entry) => entry.id === id);
  if (!found) throw new Error(`Cas de certification P2.6 inconnu : ${id}`);
  return found;
}

export function p26Request(entry: P26CertificationCase) {
  return createCreativeGenerationRequest(entry.request);
}

const ROLE_TEXT: Readonly<Record<ContentSlot['role'], readonly string[]>> = {
  hook_text: ['Question clé ?', 'À retenir maintenant.'],
  narration: ['Voici l’essentiel.', 'Le résultat devient clair.', 'Chaque étape reste simple.'],
  explanation: ['Un mécanisme simple explique ce phénomène.'],
  factual_claim: ['Ce point demande une source externe.'],
  reveal: ['La réponse apparaît.'],
  cta: ['Gardez cette idée.'],
  statistic: ['1 249,90 €'],
  comparison: ['Deux options, deux usages.'],
  label: ['POINT CLÉ'],
};

function fixtureText(entry: P26CertificationCase, role: ContentSlot['role'], index: number): string {
  if (entry.id === 'french_typography') {
    const typography: Readonly<Record<ContentSlot['role'], readonly string[]>> = {
      hook_text: ['Électricité : 1 249,90 € ?'],
      narration: ["Aujourd’hui, l’équipe vérifie l’échéance.", 'À Fort-de-France, le total reste lisible.'],
      explanation: ["L’apostrophe, les accents et l’espace fine sont préservés."],
      factual_claim: ['ÉÈÀÇÙ : caractères français.'],
      reveal: ['« Tout est clair ! »'],
      cta: ['Vérifiez le montant.'],
      statistic: ['1 249,90 €'],
      comparison: ['Avant : 1 200 € ; après : 1 249,90 €.'],
      label: ['ÉCHÉANCE'],
    };
    const candidates = typography[role];
    return candidates[index % candidates.length]!;
  }
  const candidates = ROLE_TEXT[role];
  return candidates[index % candidates.length]!;
}

export class P26MatrixProvider implements CreativeProvider {
  readonly metadata: ProviderMetadata = {
    provider_id: 'p26_matrix_fixture',
    adapter_version: '0.1.0',
    capabilities: ['structured_output', 'json_schema', 'text_generation'],
    model_family: 'deterministic_fixture',
    deterministic_test: true,
  };

  readonly entry: P26CertificationCase;
  readonly repairMode:
    | 'none'
    | 'combined'
    | 'scene_binding'
    | 'repair_exhausted'
    | 'missing_glyph'
    | 'missing_glyph_exhausted'
    | 'multiple_missing_glyphs'
    | 'multiple_missing_targets'
    | 'factual_requirement'
    | 'cumulative_preflight'
    | 'cumulative_multi_error';
  calls = 0;

  constructor(
    entry: P26CertificationCase,
    repairMode:
      | 'none'
      | 'combined'
      | 'scene_binding'
      | 'repair_exhausted'
      | 'missing_glyph'
      | 'missing_glyph_exhausted'
      | 'multiple_missing_glyphs'
      | 'multiple_missing_targets'
      | 'factual_requirement'
      | 'cumulative_preflight'
      | 'cumulative_multi_error' = 'none',
  ) {
    this.entry = entry;
    this.repairMode = repairMode;
  }

  generate(invocation: ProviderInvocation): Promise<ProviderResponse> {
    this.calls += 1;
    if (invocation.stage === 'planning') return Promise.resolve({ output: this.planning(invocation) });
    if (invocation.mode === 'repair') return Promise.resolve({ output: this.repair(invocation) });
    return Promise.resolve({ output: this.resolution(invocation) });
  }

  private planning(invocation: ProviderInvocation): PlanningGenerationOutput {
    const input = invocation.request;
    return {
      schema: 'creative-generation-output',
      schema_version: '0.1.0',
      stage: 'planning',
      request_id: input.request_id,
      provenance: 'fixture',
      normalized_topic: input.idea,
      creative_goal: input.creative_goal,
      audience: input.audience,
      language: input.language,
      locale: input.locale,
      target_duration_ms: input.target_duration_ms,
      target_format: input.target_format,
      tone: [...input.tone],
      pacing: input.target_duration_ms <= 10_000 ? 'fast' : input.target_duration_ms >= 45_000 ? 'measured' : 'medium',
      information_density: input.target_duration_ms <= 10_000 ? 'minimal' : input.target_duration_ms >= 45_000 ? 'high' : 'medium',
      narrative_archetype: this.entry.expected_archetype,
      desired_reaction: input.desired_reaction,
      factual_mode: input.factual_mode,
      cta: input.cta,
      suggested_constraints: [],
    };
  }

  private resolution(invocation: ProviderInvocation): ResolutionGenerationOutput {
    const context = invocation.resolution_context;
    if (!context) throw new Error('Contexte de résolution P2.6 absent.');
    const roleCounts = new Map<ContentSlot['role'], number>();
    const combinedTarget = context.content_slots.find((slot) => (
      slot.constraints.channels.includes('spoken') && slot.constraints.channels.includes('on_screen')
    ));
    const spokenTargets = context.content_slots.filter((slot) => slot.constraints.channels.includes('spoken'));
    const cumulativeTargetIds = new Set(spokenTargets.slice(0, 3).map((slot) => slot.slot_id));
    return {
      schema: 'creative-generation-output',
      schema_version: '0.1.0',
      stage: 'resolution',
      request_id: invocation.request.request_id,
      plan_id: context.plan_id,
      provenance: 'fixture',
      content: context.content_slots.map((slot, slotIndex) => {
        const index = roleCounts.get(slot.role) ?? 0;
        roleCounts.set(slot.role, index + 1);
        let text = fixtureText(this.entry, slot.role, index);
        let sceneId: string | undefined;
        if (this.repairMode === 'scene_binding' && slotIndex === 0) sceneId = 'scene_forbidden';
        if ((this.repairMode === 'combined' || this.repairMode === 'repair_exhausted')
          && slot.slot_id === combinedTarget?.slot_id) {
          text = Array.from({ length: 96 }, () => 'W').join(' ')
            .slice(0, slot.constraints.max_characters);
        }
        if ((this.repairMode === 'missing_glyph' || this.repairMode === 'missing_glyph_exhausted')
          && slot.slot_id === spokenTargets[0]?.slot_id) {
          text = 'Le Soleil revient dans huit分钟.';
        }
        if (this.repairMode === 'multiple_missing_glyphs' && slot.slot_id === spokenTargets[0]?.slot_id) {
          text = 'Le Soleil revient dans huit分钟世界.';
        }
        if (this.repairMode === 'multiple_missing_targets'
          && spokenTargets.slice(0, 2).some((target) => target.slot_id === slot.slot_id)) {
          text = slot.slot_id === spokenTargets[0]?.slot_id
            ? 'Premier contenu分钟.'
            : 'Second contenu世界.';
        }
        if (this.repairMode === 'cumulative_preflight' && cumulativeTargetIds.has(slot.slot_id)) {
          text = Array.from({ length: 64 }, () => 'W').join(' ')
            .slice(0, slot.constraints.max_characters);
        }
        if (this.repairMode === 'cumulative_multi_error' && slot.slot_id === combinedTarget?.slot_id) {
          text = Array.from({ length: 64 }, () => 'W').join(' ')
            .slice(0, slot.constraints.max_characters);
        }
        if (this.repairMode === 'cumulative_multi_error'
          && slot.slot_id === spokenTargets.find((target) => target.slot_id !== combinedTarget?.slot_id)?.slot_id) {
          text = 'Cette formulation contient plusieurs caractères分钟世界.';
        }
        const sourceRequired = slot.factual_requirement === 'source_required';
        const factualMismatch = (
          this.repairMode === 'factual_requirement'
          || this.repairMode === 'cumulative_preflight'
          || this.repairMode === 'cumulative_multi_error'
        ) && slot.slot_id === (combinedTarget?.slot_id ?? context.content_slots[0]?.slot_id);
        return {
          slot_id: slot.slot_id,
          ...(sceneId === undefined ? {} : { scene_id: sceneId }),
          text,
          provenance: 'fixture' as const,
          uncertainty: slot.factual_requirement === 'none' ? 'none' as const : 'unknown' as const,
          source_required: factualMismatch
            ? !sourceRequired
            : sourceRequired,
        };
      }),
      asset_descriptions: context.asset_intents.map((asset) => ({
        asset_intent_id: asset.id,
        asset_slot: asset.slot,
        description: asset.content_description ?? `${asset.kind} abstrait pour ${asset.purpose}`,
        provenance: 'fixture',
      })),
    };
  }

  private repair(invocation: ProviderInvocation): ResolutionRepairPatch {
    const request = invocation.resolution_repair_request;
    if (!request) throw new Error('ResolutionRepairRequest P2.6 absent.');
    return {
      schema: 'resolution-repair-patch',
      schema_version: RESOLUTION_REPAIR_CONTRACT_VERSION,
      request_id: request.request_id,
      plan_id: request.plan_id,
      items: request.targets.map((target) => ({
        target: target.target,
        replacement: {
          scene_id: target.target.scene_id,
          text: this.repairMode === 'repair_exhausted' || this.repairMode === 'missing_glyph_exhausted'
            ? target.previous_content?.text ?? 'ÉLECTRICITÉ '.repeat(24).trim()
            : 'Sens essentiel.',
          provenance: 'fixture',
          uncertainty: target.previous_content?.uncertainty ?? 'none',
          source_required: target.content_constraints.factual_requirement === 'source_required',
        },
      })),
    };
  }
}

export function p26ReadingPolicy() {
  const style = p23Style('signal');
  return {
    profile: SHORT_FORM_DEFAULT_PROFILE,
    resolved_style: style,
    pattern: pattern(),
    platform_presets: platforms(),
    font_resources: p14FontResources(style),
    render_scale: 1,
    minimum_readable_size: 28,
  };
}

export async function buildP26GatewayRun(
  entry: P26CertificationCase,
  provider: CreativeProvider = new P26MatrixProvider(entry),
): Promise<CreativeGatewayResult> {
  return runCreativeGateway(p26Request(entry), {
    provider,
    max_repair_attempts: 1,
    timeout_ms: 2_000,
    reading_policy: p26ReadingPolicy(),
    resolve_asset_bindings: ({ asset_intents }) => asset_intents.map((asset) => ({
      asset_slot: asset.slot,
      asset_ref: 'neutral_landscape',
      provenance: 'fixture' as const,
      focus: { region: 'focus_disc' as const },
    })),
  });
}

export interface P26CompiledPipeline {
  readonly creative_compile: CreativeCompileResult;
  readonly p1: CompilerPipelineResult;
}

export function compileP26GatewayResult(
  gateway: CreativeGatewayResult,
  renderScale = 0.5,
): P26CompiledPipeline {
  if (!gateway.ok || !gateway.planning?.creative_plan || !gateway.creative_resolution) {
    throw new Error(`Gateway P2.6 invalide : ${JSON.stringify(gateway.report.diagnostics)}`);
  }
  const style = p23Style('signal');
  const definition = pattern();
  const creativeCompile = compileCreativePlan(gateway.planning.creative_plan, {
    resolution: gateway.creative_resolution,
    profile: SHORT_FORM_DEFAULT_PROFILE,
    resolved_style: style,
    pattern: definition,
  });
  if (!creativeCompile.ok || !creativeCompile.motion_spec) {
    throw new Error(`Creative Compiler P2.6 invalide : ${JSON.stringify(creativeCompile.report.diagnostics)}`);
  }
  const asset = p23Asset();
  const p1 = compilePipeline({
    spec: creativeCompile.motion_spec,
    resolvedStyle: style,
    platformPresets: platforms(),
    pattern: definition,
    fontResources: p14FontResources(style),
    assetResources: { [asset.ref]: asset },
    config: {
      fps: SHORT_FORM_DEFAULT_PROFILE.fps,
      render_scale: renderScale,
      minimum_readable_size: renderScale === 1 ? 28 : 14,
    },
  });
  return { creative_compile: creativeCompile, p1 };
}
