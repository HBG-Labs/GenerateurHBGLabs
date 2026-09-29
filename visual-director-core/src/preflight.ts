import type { CreativePlan } from '@motion-engine/creative-core';
import {
  P32_CAMERA_REGISTRY,
  P32_MOTION_PHRASE_REGISTRY,
  P32_SCENE_BRIDGE_REGISTRY,
  P32_VISUAL_PATTERN_REGISTRY,
  hashVisualDocument,
} from '@motion-engine/visual-core';

import {
  VisualDirectionPlanSchema,
  VisualDirectionPreflightReportSchema,
} from './contracts.ts';
import type {
  DirectorDiagnostic,
  VisualDirectionPlan,
  VisualDirectionPreflightReport,
  VisualDirectorContext,
} from './contracts.ts';
import { buildSequenceCoherenceReport } from './coherence.ts';
import { hashVisualDirectorContext } from './context.ts';
import {
  MOTION_IDENTITY_REGISTRY,
  SEQUENCE_STRATEGY_REGISTRY,
  TECHNIQUE_COMPOSITION_REGISTRY,
} from './registry.ts';

const MAX_JSON_BYTES = 256_000;
const MAX_DEPTH = 32;

function diagnostic(
  code: string,
  severity: DirectorDiagnostic['severity'],
  path: string,
  suggestedAction: string,
  options: { target?: string | null; scene?: string | null; concept?: string | null; context?: DirectorDiagnostic['context'] } = {},
): DirectorDiagnostic {
  return {
    code, severity, path,
    target_id: options.target ?? null,
    scene_id: options.scene ?? null,
    selected_concept: options.concept ?? null,
    context: options.context ?? {},
    suggested_action: suggestedAction,
  };
}

function inspectPayload(value: unknown): DirectorDiagnostic[] {
  const diagnostics: DirectorDiagnostic[] = [];
  const visited = new WeakSet<object>();
  function visit(current: unknown, path: string, depth: number): void {
    if (depth > MAX_DEPTH) {
      diagnostics.push(diagnostic('visual_direction.payload.too_deep', 'error', path, 'Réduire la profondeur du document.'));
      return;
    }
    if (typeof current !== 'object' || current === null) return;
    if (visited.has(current)) {
      diagnostics.push(diagnostic('visual_direction.payload.cyclic', 'error', path, 'Fournir un document JSON acyclique.'));
      return;
    }
    visited.add(current);
    for (const [key, child] of Object.entries(current)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        diagnostics.push(diagnostic('visual_direction.payload.prototype_key', 'error', `${path}.${key}`, 'Supprimer la clé interdite.'));
      } else visit(child, `${path}.${key}`, depth + 1);
    }
  }
  visit(value, '$', 0);
  if (diagnostics.length === 0) {
    try {
      if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_JSON_BYTES) diagnostics.push(diagnostic('visual_direction.payload.oversized', 'error', '$', 'Réduire le payload de direction.'));
    } catch {
      diagnostics.push(diagnostic('visual_direction.payload.not_serializable', 'error', '$', 'Fournir un document JSON canonique.'));
    }
  }
  return diagnostics;
}

function countSummary(diagnostics: readonly DirectorDiagnostic[]): VisualDirectionPreflightReport['summary'] {
  return {
    errors: diagnostics.filter((entry) => entry.severity === 'error').length,
    warnings: diagnostics.filter((entry) => entry.severity === 'warning').length,
    infos: diagnostics.filter((entry) => entry.severity === 'info').length,
  };
}

function duplicateIds(plan: VisualDirectionPlan, diagnostics: DirectorDiagnostic[]): void {
  const all = [plan.direction_plan_id, plan.motif.id, ...plan.scenes.map((scene) => scene.id), ...plan.bridges.map((bridge) => bridge.id), ...plan.scenes.flatMap((scene) => scene.asset_intents.map((asset) => asset.id))];
  const seen = new Set<string>();
  for (const id of all) {
    if (seen.has(id)) diagnostics.push(diagnostic('visual_direction.id.duplicate', 'error', '$', 'Utiliser des IDs stables uniques.', { target: id }));
    seen.add(id);
  }
}

function globalChecks(plan: VisualDirectionPlan, context: VisualDirectorContext, diagnostics: DirectorDiagnostic[]): void {
  const strategy = SEQUENCE_STRATEGY_REGISTRY.get(plan.sequence_strategy.id);
  if (!strategy || strategy.version !== plan.sequence_strategy.version) diagnostics.push(diagnostic('visual_direction.strategy.unknown', 'error', '$.sequence_strategy', 'Sélectionner une stratégie active et sa version exacte.', { concept: plan.sequence_strategy.id }));
  else {
    if (!strategy.compatible_archetypes.includes(context.narrative_archetype)) diagnostics.push(diagnostic('visual_direction.strategy.incompatible_archetype', 'error', '$.sequence_strategy', 'Choisir une stratégie compatible avec l’archétype canonique.', { concept: strategy.id, context: { archetype: context.narrative_archetype } }));
    if (strategy.requires_breath && !plan.scenes.some((scene) => scene.visual_role === 'BREATH')) diagnostics.push(diagnostic('visual_direction.sequence.breath_missing', 'error', '$.scenes', 'Affecter le rôle BREATH à une scène existante.', { concept: strategy.id }));
    if (strategy.requires_payoff && !plan.scenes.some((scene) => scene.visual_role === 'PAYOFF')) diagnostics.push(diagnostic('visual_direction.sequence.payoff_missing', 'error', '$.scenes', 'Affecter le rôle PAYOFF à une scène existante.', { concept: strategy.id }));
  }
  const identity = MOTION_IDENTITY_REGISTRY.get(plan.motion_identity.id);
  if (!identity || identity.version !== plan.motion_identity.version) diagnostics.push(diagnostic('visual_direction.identity.unknown', 'error', '$.motion_identity', 'Sélectionner une MotionIdentity active.', { concept: plan.motion_identity.id }));
  if (!context.supported_materials.includes(plan.art_direction.material_intent)) diagnostics.push(diagnostic('visual_direction.material.unsupported', 'error', '$.art_direction.material_intent', 'Utiliser une matière réellement supportée.', { concept: plan.art_direction.material_intent }));
  if (plan.source.director_context_sha256 !== hashVisualDirectorContext(context)) diagnostics.push(diagnostic('visual_direction.context.changed', 'error', '$.source.director_context_sha256', 'Reconstruire la direction avec le contexte actif.'));
  if (JSON.stringify(plan.source.registry_fingerprints) !== JSON.stringify(context.registry_fingerprints)) diagnostics.push(diagnostic('visual_direction.registry.fingerprint_mismatch', 'error', '$.source.registry_fingerprints', 'Recompiler avec les registres actifs.'));
  if (plan.source.creative_plan_id !== context.creative_plan_id || plan.source.creative_plan_sha256 !== context.creative_plan_sha256) diagnostics.push(diagnostic('visual_direction.creative_plan.changed', 'error', '$.source', 'Préserver l’identité canonique du CreativePlan.'));
  if (JSON.stringify(plan.source.creative_scene_ids) !== JSON.stringify(context.scene_ids)) diagnostics.push(diagnostic('visual_direction.scene_order.changed', 'error', '$.source.creative_scene_ids', 'Préserver les IDs et l’ordre des scènes CreativePlan.'));
  if (plan.style_id !== context.style_id) diagnostics.push(diagnostic('visual_direction.style.changed', 'error', '$.style_id', 'Utiliser le style canonique du contexte.'));
}

function sceneChecks(plan: VisualDirectionPlan, context: VisualDirectorContext, diagnostics: DirectorDiagnostic[]): void {
  if (plan.scenes.length !== context.scene_ids.length) diagnostics.push(diagnostic('visual_direction.scene.coverage', 'error', '$.scenes', 'Fournir exactement une décision par scène canonique.'));
  plan.scenes.forEach((scene, index) => {
    const path = `$.scenes[${index}]`;
    if (scene.scene_id !== context.scene_ids[index]) diagnostics.push(diagnostic('visual_direction.scene.order_changed', 'error', `${path}.scene_id`, 'Préserver l’ordre canonique.', { target: scene.id, scene: scene.scene_id }));
    const composition = TECHNIQUE_COMPOSITION_REGISTRY.get(scene.technique_composition_id);
    if (!composition || composition.version !== scene.technique_composition_version) diagnostics.push(diagnostic('visual_direction.technique.unknown', 'error', `${path}.technique_composition_id`, 'Utiliser une TechniqueComposition active.', { target: scene.id, scene: scene.scene_id, concept: scene.technique_composition_id }));
    else {
      if (composition.status === 'future') diagnostics.push(diagnostic('visual_direction.technique.future', 'error', `${path}.technique_composition_id`, 'Choisir une composition supportée ou partielle explicitement autorisée.', { target: scene.id, scene: scene.scene_id, concept: composition.id }));
      if (composition.status === 'partial') diagnostics.push(diagnostic('visual_direction.technique.partial', 'warning', `${path}.technique_composition_id`, 'Conserver la provenance PARTIAL et ne pas revendiquer le support complet.', { target: scene.id, scene: scene.scene_id, concept: composition.id }));
      if (!composition.compatible_roles.includes(scene.semantic_role)) diagnostics.push(diagnostic('visual_direction.technique.role_incompatible', 'error', `${path}.semantic_role`, 'Aligner le rôle sémantique et la TechniqueComposition.', { target: scene.id, scene: scene.scene_id, concept: composition.id }));
      if (!composition.preferred_depth.includes(scene.depth_intent)) diagnostics.push(diagnostic('visual_direction.technique.depth_incompatible', 'error', `${path}.depth_intent`, 'Choisir une profondeur compatible avec la TechniqueComposition.', { target: scene.id, scene: scene.scene_id, concept: composition.id }));
      for (const requiredAsset of composition.asset_requirements) if (!scene.asset_intents.some((asset) => asset.type === requiredAsset && asset.availability === 'AVAILABLE')) diagnostics.push(diagnostic('visual_direction.technique.asset_requirement_missing', 'error', `${path}.asset_intents`, 'Déclarer l’AssetIntent requis comme disponible.', { target: scene.id, scene: scene.scene_id, concept: requiredAsset }));
      for (const capability of composition.required_capabilities) if (context.capabilities[capability] !== 'SUPPORTED') diagnostics.push(diagnostic('visual_direction.capability.unsupported', 'error', `${path}.technique_composition_id`, 'Choisir une composition dont toutes les capabilities sont supportées.', { target: scene.id, scene: scene.scene_id, concept: capability, context: { support: context.capabilities[capability] ?? 'UNSUPPORTED' } }));
    }
    for (const patternId of scene.pattern_ids) {
      const entry = P32_VISUAL_PATTERN_REGISTRY.get(patternId);
      if (!entry || entry.support === 'future') diagnostics.push(diagnostic('visual_direction.pattern.unknown_or_future', 'error', `${path}.pattern_ids`, 'Utiliser un pattern actif non FUTURE.', { target: scene.id, scene: scene.scene_id, concept: patternId }));
      else if (entry.support === 'compatible_simplified') diagnostics.push(diagnostic('visual_direction.capability.simplified', 'warning', `${path}.pattern_ids`, 'Conserver la provenance compatible_simplified.', { target: scene.id, scene: scene.scene_id, concept: patternId }));
    }
    for (const phraseId of scene.phrase_ids) if (!P32_MOTION_PHRASE_REGISTRY.has(phraseId)) diagnostics.push(diagnostic('visual_direction.phrase.unknown', 'error', `${path}.phrase_ids`, 'Utiliser une MotionPhrase active.', { target: scene.id, scene: scene.scene_id, concept: phraseId }));
    if (scene.camera_mode === 'STATIC' && scene.camera_id !== null || scene.camera_mode === 'SELECT' && scene.camera_id === null) diagnostics.push(diagnostic('visual_direction.camera.mode_mismatch', 'error', `${path}.camera_mode`, 'Aligner camera_mode et camera_id.', { target: scene.id, scene: scene.scene_id }));
    if (scene.camera_id !== null) {
      const camera = P32_CAMERA_REGISTRY.get(scene.camera_id);
      if (!camera || camera.support === 'future') diagnostics.push(diagnostic('visual_direction.camera.unknown_or_future', 'error', `${path}.camera_id`, 'Utiliser une caméra active.', { target: scene.id, scene: scene.scene_id, concept: scene.camera_id }));
      else if (camera.support === 'compatible_simplified') diagnostics.push(diagnostic('visual_direction.capability.simplified', 'warning', `${path}.camera_id`, 'Conserver la provenance compatible_simplified.', { target: scene.id, scene: scene.scene_id, concept: scene.camera_id }));
    }
    for (const asset of scene.asset_intents) {
      if (asset.availability === 'AVAILABLE' && !context.available_asset_types.includes(asset.type)) diagnostics.push(diagnostic('visual_direction.asset.unavailable', 'error', `${path}.asset_intents`, 'Demander uniquement un type d’asset disponible.', { target: asset.id, scene: scene.scene_id, concept: asset.type }));
      if (!context.supported_materials.includes(asset.material)) diagnostics.push(diagnostic('visual_direction.material.unsupported', 'error', `${path}.asset_intents`, 'Utiliser une matière supportée.', { target: asset.id, scene: scene.scene_id, concept: asset.material }));
    }
  });
}

function bridgeChecks(plan: VisualDirectionPlan, diagnostics: DirectorDiagnostic[]): void {
  const sceneIndex = new Map(plan.scenes.map((scene, index) => [scene.scene_id, index]));
  for (const [index, bridge] of plan.bridges.entries()) {
    const path = `$.bridges[${index}]`;
    const source = sceneIndex.get(bridge.source_scene_id);
    const destination = sceneIndex.get(bridge.destination_scene_id);
    if (source === undefined || destination === undefined || destination !== source + 1) diagnostics.push(diagnostic('visual_direction.bridge.topology', 'error', path, 'Relier deux scènes canoniques adjacentes.', { target: bridge.id }));
    const definition = P32_SCENE_BRIDGE_REGISTRY.get(bridge.bridge_id);
    if (!definition || definition.version !== bridge.bridge_version || definition.support === 'future') diagnostics.push(diagnostic('visual_direction.bridge.unknown_or_future', 'error', `${path}.bridge_id`, 'Utiliser un SceneBridge actif et sa version exacte.', { target: bridge.id, concept: bridge.bridge_id }));
    else if (definition.support === 'compatible_simplified') diagnostics.push(diagnostic('visual_direction.capability.simplified', 'warning', `${path}.bridge_id`, 'Conserver la provenance compatible_simplified.', { target: bridge.id, concept: bridge.bridge_id }));
    if (bridge.camera_continuity) {
      const sourceScene = plan.scenes[source ?? -1]; const destinationScene = plan.scenes[destination ?? -1];
      if (sourceScene?.camera_mode === 'STATIC' || destinationScene?.camera_mode === 'STATIC') diagnostics.push(diagnostic('visual_direction.camera.continuity_mismatch', 'error', path, 'La continuité caméra est incompatible avec un override STATIC.', { target: bridge.id }));
    }
    if ((bridge.bridge_id === 'ELEMENT_CARRY' || bridge.motivation === 'OBJECT_CONTINUITY') && bridge.persistent_entity_key === null) diagnostics.push(diagnostic('visual_direction.bridge.persistent_entity_missing', 'error', path, 'Déclarer l’identité persistante transportée.', { target: bridge.id }));
  }
}

function coherenceChecks(plan: VisualDirectionPlan, context: VisualDirectorContext, diagnostics: DirectorDiagnostic[]): void {
  const coherence = buildSequenceCoherenceReport(plan);
  if (coherence.motif_continuity === 'broken') diagnostics.push(diagnostic('visual_direction.motif.unresolved', 'error', '$.motif', 'Ajouter un état INTRODUCE et RESOLVE au motif.', { target: plan.motif.id }));
  if (coherence.layout_variety === 'repetitive') diagnostics.push(diagnostic('visual_direction.repetition.layout', 'warning', '$.scenes', 'Varier les familles de layout ou justifier le motif.'));
  if (coherence.bridge_variety === 'repetitive' && plan.bridges.length > 2) diagnostics.push(diagnostic('visual_direction.repetition.bridge', 'warning', '$.bridges', 'Varier les bridges motivés.'));
  if (coherence.focus_progression === 'repetitive') diagnostics.push(diagnostic('visual_direction.repetition.focus', 'warning', '$.scenes', 'Créer une progression de focus.'));
  if (coherence.intensity_progression === 'flat') diagnostics.push(diagnostic('visual_direction.sequence.intensity_flat', 'warning', '$.global_intensity_arc', 'Introduire un contraste d’intensité.'));
  const allOverdirected = plan.scenes.every((scene) => scene.complexity === 'HIGH' && scene.motion_intensity === 'HIGH' && scene.camera_id !== null)
    && plan.bridges.length >= Math.max(1, plan.scenes.length - 1);
  if (allOverdirected) diagnostics.push(diagnostic('visual_direction.overdirected_sequence', 'error', '$.scenes', 'Introduire de la retenue ou une respiration.'));
  const underDirected = plan.scenes.every((scene) => (scene.layout_id ?? 'CENTER_HERO') === 'CENTER_HERO' && scene.camera_id === null)
    && plan.bridges.every((bridge) => bridge.bridge_id === 'MATCH_POSITION');
  if (underDirected) diagnostics.push(diagnostic('visual_direction.underdirected_sequence', 'warning', '$.scenes', 'Diversifier au moins une décision de réalisation.'));
  if (plan.scenes.filter((scene) => scene.complexity === 'HIGH').length > context.limits.max_high_complexity_scenes || plan.budget.complexity === 'LOW' && plan.scenes.some((scene) => scene.complexity === 'HIGH')) diagnostics.push(diagnostic('visual_direction.complexity.overflow', 'error', '$.scenes', 'Respecter le budget de complexité global.'));
}

export function buildVisualDirectionPreflight(
  input: unknown,
  creativePlan: CreativePlan,
  context: VisualDirectorContext,
): VisualDirectionPreflightReport {
  const diagnostics = inspectPayload(input);
  const parsed = diagnostics.length === 0 ? VisualDirectionPlanSchema.safeParse(input) : { success: false as const };
  if (!parsed.success) {
    if ('error' in parsed) for (const issue of parsed.error.issues) diagnostics.push(diagnostic('visual_direction.schema.invalid', 'error', `$.${issue.path.join('.')}`, 'Corriger le document selon VisualDirectionPlan 0.1.0.', { context: { issue: issue.message.slice(0, 200) } }));
    const summary = countSummary(diagnostics);
    return VisualDirectionPreflightReportSchema.parse({ schema: 'visual-direction-preflight-report', schema_version: '0.1.0', status: 'fail', eligible_for_resolution: false, direction_plan_sha256: null, diagnostics, summary, checks: { schema: false, registries: false, capabilities: false, scene_compatibility: false, sequence_coherence: false, complexity: false, asset_availability: false, visual_plan_feasibility: false } });
  }
  const plan = parsed.data;
  if (creativePlan.plan_id !== context.creative_plan_id || creativePlan.scenes.map((scene) => scene.id).join('|') !== context.scene_ids.join('|')) diagnostics.push(diagnostic('visual_direction.context.creative_plan_mismatch', 'error', '$.source', 'Utiliser le CreativePlan ayant produit le contexte.'));
  duplicateIds(plan, diagnostics);
  globalChecks(plan, context, diagnostics);
  sceneChecks(plan, context, diagnostics);
  bridgeChecks(plan, diagnostics);
  coherenceChecks(plan, context, diagnostics);
  const summary = countSummary(diagnostics);
  return VisualDirectionPreflightReportSchema.parse({
    schema: 'visual-direction-preflight-report', schema_version: '0.1.0',
    status: summary.errors > 0 ? 'fail' : summary.warnings > 0 ? 'warn' : 'pass',
    eligible_for_resolution: summary.errors === 0,
    direction_plan_sha256: hashVisualDocument(plan), diagnostics, summary,
    checks: { schema: true, registries: !diagnostics.some((entry) => entry.code.includes('.unknown') || entry.code.includes('fingerprint')), capabilities: !diagnostics.some((entry) => entry.code.includes('capability.unsupported')), scene_compatibility: !diagnostics.some((entry) => entry.code.includes('scene.') || entry.code.includes('role_incompatible')), sequence_coherence: !diagnostics.some((entry) => entry.code.includes('motif.unresolved') || entry.code.includes('payoff_missing') || entry.code.includes('breath_missing')), complexity: !diagnostics.some((entry) => entry.code.includes('complexity') || entry.code.includes('overdirected')), asset_availability: !diagnostics.some((entry) => entry.code.includes('asset.') || entry.code.includes('material.')), visual_plan_feasibility: summary.errors === 0 },
  });
}
