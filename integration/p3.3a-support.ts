import { readFileSync } from 'node:fs';
import path from 'node:path';

import { P17_BEHAVIOR_REGISTRY, compilePipeline, type CompilerPipelineResult, type ResolvedStyle } from '@motion-engine/core';
import { planCreativeStory, type CreativePlan, type PlannerInput } from '@motion-engine/creative-core';
import {
  DeterministicFixtureDirector,
  compileVisualDirectionPlan,
  createVisualDirectorContext,
  type FixtureDirectionSpecification,
  type FixtureSceneDecision,
  type VisualDirectionCompileResult,
  type VisualDirectionPlan,
  type VisualDirectorContext,
} from '@motion-engine/visual-director-core';
import { compileVisualPlan, type VisualCompileResult } from '@motion-engine/visual-compiler';
import { buildVisualDiversityReport, type VisualPlan } from '@motion-engine/visual-core';

import { pattern, platforms } from './p1.2-support.ts';
import { p14FontResources } from './p1.4-support.ts';
import { p31CreativePlan } from './p3.1-support.ts';
import { p32Style } from './p3.2-support.ts';
import { WORKSPACE } from './support.ts';

export type P33AFixtureKind = 'science' | 'product' | 'problem_solution' | 'editorial';

function plannerFixture(file: string): CreativePlan {
  const input = JSON.parse(readFileSync(path.join(WORKSPACE, 'fixtures', 'p3.3a', file), 'utf8')) as PlannerInput;
  const result = planCreativeStory(input);
  if (!result.ok || !result.creative_plan) throw new Error(`P3.3A planner invalide ${file}: ${JSON.stringify(result.report?.diagnostics)}`);
  return result.creative_plan;
}

export function p33aCreativePlan(kind: P33AFixtureKind): CreativePlan {
  if (kind === 'science') return p31CreativePlan();
  if (kind === 'product') return plannerFixture('product-app.planner-input.json');
  if (kind === 'problem_solution') return plannerFixture('problem-solution.planner-input.json');
  return plannerFixture('editorial.planner-input.json');
}

const asset = (type: 'PROCEDURAL_VECTOR' | 'UI_SURFACE', role: FixtureSceneDecision['asset_intents'][number]['role'], material: 'FLAT' | 'GRADIENT' | 'LUMINOUS' = 'FLAT') => ({ type, role, material, availability: 'AVAILABLE' as const, reason: 'SEMANTIC_CLARITY' as const });

function lifecycle(index: number, count: number): FixtureSceneDecision['motif_state'] {
  if (index === 0) return 'INTRODUCE';
  if (index === count - 1) return 'RESOLVE';
  return index % 2 === 0 ? 'EVOLVE' : 'CARRY';
}

function scienceScene(index: number, count: number): FixtureSceneDecision {
  if (index === 0) return { visual_role: 'HOOK', semantic_role: 'TYPOGRAPHIC_STATEMENT', focus: 'TYPE', layout_id: 'ASYMMETRIC_HERO', technique_composition_id: 'TYPE_STATE_TO_TRANSITION', technique_composition_version: '1.0.0', pattern_ids: [], phrase_ids: [], camera_mode: 'INHERIT', camera_id: null, depth_intent: 'SUBTLE', entry_strategy: 'IMPACT', exit_strategy: 'CARRY', asset_intents: [], motif_state: lifecycle(index, count), motion_intensity: 'HIGH', complexity: 'HIGH', visual_density: 'SPARSE', reason: 'HIERARCHY' };
  if (index === count - 2) return { visual_role: 'BREATH', semantic_role: 'ENVIRONMENT', focus: 'OBJECT', layout_id: 'FRAME_WITHIN_FRAME', technique_composition_id: 'BRAND_MOTION_RECIPE_SYSTEM', technique_composition_version: '1.0.0', pattern_ids: [], phrase_ids: ['VISUAL_BREATH'], camera_mode: 'STATIC', camera_id: null, depth_intent: 'SUBTLE', entry_strategy: 'REVEAL', exit_strategy: 'MASK', asset_intents: [asset('PROCEDURAL_VECTOR', 'BACKGROUND', 'GRADIENT')], motif_state: lifecycle(index, count), motion_intensity: 'LOW', complexity: 'LOW', visual_density: 'SPARSE', reason: 'VISUAL_BREATH' };
  if (index === count - 1) return { visual_role: 'PAYOFF', semantic_role: 'PAYOFF', focus: 'TYPE', layout_id: 'CENTER_HERO', technique_composition_id: 'BUILD_COMPLEXITY_BREATH_PAYOFF', technique_composition_version: '1.0.0', pattern_ids: ['KINETIC_WORD_IMPACT'], phrase_ids: ['HERO_WORD_IMPACT'], camera_mode: 'SELECT', camera_id: 'CAMERA_SETTLE', depth_intent: 'SUBTLE', entry_strategy: 'CARRY', exit_strategy: 'STATIC', asset_intents: [], motif_state: lifecycle(index, count), motion_intensity: 'HIGH', complexity: 'MEDIUM', visual_density: 'BALANCED', reason: 'PAYOFF' };
  if (index === 1) return { visual_role: 'SETUP', semantic_role: 'PHENOMENON', focus: 'PHENOMENON', layout_id: 'DIAGONAL_FLOW', technique_composition_id: 'ABSTRACT_SCIENCE_WORLD_TRANSITION', technique_composition_version: '1.0.0', pattern_ids: [], phrase_ids: [], camera_mode: 'INHERIT', camera_id: null, depth_intent: 'LAYERED', entry_strategy: 'CARRY', exit_strategy: 'CAMERA', asset_intents: [asset('PROCEDURAL_VECTOR', 'HERO', 'LUMINOUS')], motif_state: lifecycle(index, count), motion_intensity: 'MEDIUM', complexity: 'HIGH', visual_density: 'BALANCED', reason: 'SEMANTIC_CONTINUITY' };
  return { visual_role: 'EXPLAIN', semantic_role: 'DIAGRAM', focus: 'DIAGRAM', layout_id: index % 2 === 0 ? 'RADIAL_FOCUS' : 'EDITORIAL_SPLIT', technique_composition_id: 'CAUSAL_EXPLAINER', technique_composition_version: '1.0.0', pattern_ids: [], phrase_ids: [], camera_mode: 'INHERIT', camera_id: null, depth_intent: 'LAYERED', entry_strategy: 'REVEAL', exit_strategy: 'CARRY', asset_intents: [asset('PROCEDURAL_VECTOR', 'SUPPORT')], motif_state: lifecycle(index, count), motion_intensity: 'HIGH', complexity: 'MEDIUM', visual_density: 'BALANCED', reason: 'SEMANTIC_CLARITY' };
}

function productScene(index: number, count: number): FixtureSceneDecision {
  const payoff = index === count - 1;
  const semantic = payoff ? 'PAYOFF' as const : index === 0 ? 'PRODUCT' as const : 'UI' as const;
  const composition = payoff ? 'BUILD_COMPLEXITY_BREATH_PAYOFF' : index === 0 ? 'PERSISTENT_GUIDE_THROUGH_PRODUCT' : 'UI_DEPTH_CAMERA_FOCUS';
  return {
    visual_role: index === 0 ? 'HOOK' : payoff ? 'PAYOFF' : index === 1 ? 'REVEAL' : 'PROOF',
    semantic_role: semantic, focus: payoff ? 'TYPE' : index === 0 ? 'PRODUCT' : 'UI',
    layout_id: payoff ? 'CENTER_HERO' : index === 0 ? 'FRAME_WITHIN_FRAME' : index % 2 === 0 ? 'DEPTH_STACK' : 'EDITORIAL_SPLIT',
    technique_composition_id: composition, technique_composition_version: '1.0.0', pattern_ids: [], phrase_ids: [], camera_mode: 'INHERIT', camera_id: null,
    depth_intent: payoff ? 'SUBTLE' : index === 0 ? 'LAYERED' : 'FOREGROUND_OCCLUSION',
    entry_strategy: index === 0 ? 'IMPACT' : 'CARRY', exit_strategy: payoff ? 'STATIC' : 'CARRY',
    asset_intents: payoff ? [] : [asset('UI_SURFACE', index === 0 ? 'DEVICE_FRAME' : 'UI_CARD', 'GRADIENT')],
    motif_state: lifecycle(index, count), motion_intensity: payoff ? 'MEDIUM' : index === 2 ? 'HIGH' : 'MEDIUM', complexity: payoff ? 'MEDIUM' : index === 0 ? 'MEDIUM' : 'HIGH', visual_density: payoff ? 'SPARSE' : 'BALANCED', reason: payoff ? 'PAYOFF' : 'PRODUCT_FOCUS',
  };
}

function problemScene(index: number, count: number): FixtureSceneDecision {
  if (index === count - 1) return { ...scienceScene(index, count), motif_state: 'RESOLVE' };
  if (index === count - 2) return { visual_role: 'BREATH', semantic_role: 'DIAGRAM', focus: 'DIAGRAM', layout_id: 'GRID_STAGGER', technique_composition_id: 'CAUSAL_EXPLAINER', technique_composition_version: '1.0.0', pattern_ids: ['DIAGRAM_CAUSAL_FLOW'], phrase_ids: ['VISUAL_BREATH'], camera_mode: 'STATIC', camera_id: null, depth_intent: 'SUBTLE', entry_strategy: 'REVEAL', exit_strategy: 'CARRY', asset_intents: [asset('PROCEDURAL_VECTOR', 'SUPPORT')], motif_state: lifecycle(index, count), motion_intensity: 'LOW', complexity: 'LOW', visual_density: 'SPARSE', reason: 'VISUAL_BREATH' };
  return { visual_role: index === 0 ? 'HOOK' : index === 1 ? 'ESCALATE' : 'CONTRAST', semantic_role: 'TYPOGRAPHIC_STATEMENT', focus: 'TYPE', layout_id: index === 0 ? 'LAYERED_POSTER' : index === 1 ? 'GRID_STAGGER' : 'ASYMMETRIC_HERO', technique_composition_id: index === 2 ? 'TYPE_STATE_TO_TRANSITION' : 'BRAND_MOTION_RECIPE_SYSTEM', technique_composition_version: '1.0.0', pattern_ids: [], phrase_ids: [], camera_mode: index === 1 ? 'SELECT' : 'STATIC', camera_id: index === 1 ? 'CAMERA_PUNCH_IN' : null, depth_intent: index === 1 ? 'SUBTLE' : 'FLAT', entry_strategy: index === 0 ? 'IMPACT' : 'REVEAL', exit_strategy: index === 2 ? 'INTENTIONAL_CUT' : 'CARRY', asset_intents: index === 2 ? [] : [asset('PROCEDURAL_VECTOR', 'BACKGROUND')], motif_state: lifecycle(index, count), motion_intensity: index === 1 ? 'HIGH' : 'MEDIUM', complexity: index === 1 ? 'HIGH' : 'MEDIUM', visual_density: index === 1 ? 'DENSE' : 'BALANCED', reason: index === 2 ? 'CONTRAST' : 'HIERARCHY' };
}

function editorialScene(index: number, count: number): FixtureSceneDecision {
  const breath = index === count - 2;
  const payoff = index === count - 1;
  return { visual_role: index === 0 ? 'HOOK' : breath ? 'BREATH' : payoff ? 'PAYOFF' : index === 2 ? 'CONTRAST' : 'SETUP', semantic_role: payoff ? 'PAYOFF' : 'TYPOGRAPHIC_STATEMENT', focus: 'TYPE', layout_id: index % 2 === 0 ? 'ASYMMETRIC_HERO' : 'EDITORIAL_SPLIT', technique_composition_id: index === 0 || index === 2 || payoff ? 'TYPE_STATE_TO_TRANSITION' : 'BRAND_MOTION_RECIPE_SYSTEM', technique_composition_version: '1.0.0', pattern_ids: [], phrase_ids: breath ? ['VISUAL_BREATH'] : [], camera_mode: index === 2 ? 'SELECT' : 'STATIC', camera_id: index === 2 ? 'CAMERA_SETTLE' : null, depth_intent: 'FLAT', entry_strategy: index === 0 ? 'IMPACT' : 'REVEAL', exit_strategy: payoff ? 'STATIC' : index === 2 ? 'INTENTIONAL_CUT' : 'CARRY', asset_intents: index === 0 || index === 2 || payoff ? [] : [asset('PROCEDURAL_VECTOR', 'SUPPORT')], motif_state: lifecycle(index, count), motion_intensity: breath ? 'LOW' : index === 2 ? 'HIGH' : 'MEDIUM', complexity: breath ? 'LOW' : 'MEDIUM', visual_density: breath ? 'SPARSE' : 'BALANCED', reason: breath ? 'VISUAL_BREATH' : payoff ? 'PAYOFF' : 'HIERARCHY' };
}

function bridge(id: string, motivation: FixtureDirectionSpecification['bridges'][number]['motivation'], cameraContinuity = false): FixtureDirectionSpecification['bridges'][number] {
  return { bridge_id: id, bridge_version: '1.0.0', motivation, persistent_entity_key: id === 'ELEMENT_CARRY' || motivation === 'OBJECT_CONTINUITY' ? 'directed_motif_entity' : null, camera_continuity: cameraContinuity, reason: motivation === 'INTENTIONAL_CONTRAST' ? 'INTENTIONAL_CUT' : motivation === 'TYPOGRAPHY_CONTINUITY' ? 'HIERARCHY' : 'SEMANTIC_CONTINUITY' };
}

function specification(kind: P33AFixtureKind, count: number): FixtureDirectionSpecification {
  const sceneBuilder = kind === 'science' ? scienceScene : kind === 'product' ? productScene : kind === 'problem_solution' ? problemScene : editorialScene;
  const scenes = Array.from({ length: count }, (_, index) => sceneBuilder(index, count));
  const bridgeSets: Record<P33AFixtureKind, readonly FixtureDirectionSpecification['bridges'][number][]> = {
    science: [bridge('PATH_CONTINUE', 'MOTIF_CONTINUITY', true), bridge('MATCH_SCALE', 'SEMANTIC_CONTINUITY'), bridge('MASK_EXPANSION', 'SEMANTIC_CONTINUITY'), bridge('COLOR_FIELD_CONTINUE', 'MOTIF_CONTINUITY'), bridge('ELEMENT_CARRY', 'OBJECT_CONTINUITY')],
    product: [bridge('ELEMENT_CARRY', 'OBJECT_CONTINUITY', true), bridge('FRAME_EXPANSION', 'OBJECT_CONTINUITY'), bridge('MATCH_SCALE', 'SEMANTIC_CONTINUITY'), bridge('CAMERA_CONTINUE', 'CAMERA_MOMENTUM', true)],
    problem_solution: [bridge('MATCH_POSITION', 'SEMANTIC_CONTINUITY'), bridge('COLOR_FIELD_CONTINUE', 'INTENTIONAL_CONTRAST'), bridge('MASK_EXPANSION', 'SEMANTIC_CONTINUITY'), bridge('MATCH_SCALE', 'SEMANTIC_CONTINUITY')],
    editorial: [bridge('TYPE_CONTINUE', 'TYPOGRAPHY_CONTINUITY'), bridge('MATCH_SCALE', 'TYPOGRAPHY_CONTINUITY'), bridge('MATCH_POSITION', 'INTENTIONAL_CONTRAST'), bridge('TYPE_SCALE_THROUGH', 'TYPOGRAPHY_CONTINUITY')],
  };
  const common = { budget: { complexity: 'HIGH' as const, render_cost: 'HIGH' as const, external_assets_allowed: false }, scenes, bridges: bridgeSets[kind].slice(0, Math.max(0, count - 1)) };
  if (kind === 'science') return { ...common, sequence_strategy_id: 'QUESTION_DISCOVERY_EXPLANATION_REVEAL', motion_identity_id: 'EXPLAINER_CAUSAL', motif_category: 'LIGHT_RAY', motif_lifecycle_required: true, art_direction: { hierarchy: 'DRAMATIC', scale_hierarchy: 'CONTRASTED', negative_space: 'BALANCED', visual_density: 'BALANCED', material_intent: 'LUMINOUS', asset_coherence: 'MIXED_INTENTIONAL' }, global_pacing: 'BALANCED', continuity_strategy: 'MOTIF_DRIVEN', camera_strategy: 'PROGRESSIVE_PUSH', depth_strategy: 'PROGRESSIVE_DEPTH', restraint_level: 'BALANCED' };
  if (kind === 'product') return { ...common, sequence_strategy_id: 'PRODUCT_REVEAL_FEATURES_PAYOFF', motion_identity_id: 'PRODUCT_POLISHED', motif_category: 'CARD', motif_lifecycle_required: true, art_direction: { hierarchy: 'CLEAR', scale_hierarchy: 'CONTRASTED', negative_space: 'BALANCED', visual_density: 'BALANCED', material_intent: 'GRADIENT', asset_coherence: 'COHERENT' }, global_pacing: 'BRISK', continuity_strategy: 'OBJECT_DRIVEN', camera_strategy: 'FOLLOW_MOTIF', depth_strategy: 'LAYERED_2_5D', restraint_level: 'BALANCED' };
  if (kind === 'problem_solution') return { ...common, sequence_strategy_id: 'PROBLEM_TENSION_SOLUTION_PROOF', motion_identity_id: 'PUNCHY_SOCIAL', motif_category: 'GRID', motif_lifecycle_required: true, art_direction: { hierarchy: 'DRAMATIC', scale_hierarchy: 'EXTREME', negative_space: 'DENSE_CONTROLLED', visual_density: 'DENSE', material_intent: 'FLAT', asset_coherence: 'COHERENT' }, global_pacing: 'PUNCHY', continuity_strategy: 'SEMANTIC', camera_strategy: 'ALTERNATING_STATIC_DYNAMIC', depth_strategy: 'MIXED', restraint_level: 'LOW' };
  return { ...common, sequence_strategy_id: 'EDITORIAL_STATEMENT_CONTRAST_PAYOFF', motion_identity_id: 'EDITORIAL_PRECISE', motif_category: 'FRAME', motif_lifecycle_required: true, art_direction: { hierarchy: 'EDITORIAL', scale_hierarchy: 'EXTREME', negative_space: 'GENEROUS', visual_density: 'SPARSE', material_intent: 'FLAT', asset_coherence: 'COHERENT' }, global_pacing: 'DELIBERATE', continuity_strategy: 'CUT_DRIVEN', camera_strategy: 'MOSTLY_STATIC', depth_strategy: 'FLAT_EDITORIAL', restraint_level: 'HIGH' };
}

export interface P33ADirectionFixture {
  readonly kind: P33AFixtureKind;
  readonly creative_plan: CreativePlan;
  readonly context: VisualDirectorContext;
  readonly direction_plan: VisualDirectionPlan;
  readonly direction_compile: VisualDirectionCompileResult;
}

export function buildP33ADirectionFixture(kind: P33AFixtureKind): P33ADirectionFixture {
  const creativePlan = p33aCreativePlan(kind);
  const context = createVisualDirectorContext(creativePlan, { narrative_archetype: kind === 'science' ? 'EXPLAINER' : kind === 'product' ? 'PRODUCT_DEMO' : kind === 'problem_solution' ? 'PROBLEM_SOLUTION' : 'EDITORIAL', style_id: 'spectral_motion', available_asset_types: ['PROCEDURAL_VECTOR', 'UI_SURFACE'], supported_materials: ['FLAT', 'GRADIENT', 'LUMINOUS'] });
  const directionPlan = new DeterministicFixtureDirector().direct(creativePlan, context, specification(kind, creativePlan.scenes.length));
  const directionCompile = compileVisualDirectionPlan(directionPlan, creativePlan, context);
  return { kind, creative_plan: creativePlan, context, direction_plan: directionPlan, direction_compile: directionCompile };
}

export interface P33APipeline extends P33ADirectionFixture {
  readonly visual_plan: VisualPlan;
  readonly visual_compile: VisualCompileResult;
  readonly p1: CompilerPipelineResult;
  readonly style: ResolvedStyle;
  readonly diversity: ReturnType<typeof buildVisualDiversityReport>;
}

export interface P33ACompileMetrics {
  readonly director_validation_and_resolution_ms: number;
  readonly visual_plan_to_motion_spec_ms: number;
  readonly p1_compile_ms: number;
  readonly total_compile_ms: number;
}

export function profileP33APipeline(kind: P33AFixtureKind, renderScale = 0.5): { pipeline: P33APipeline; metrics: P33ACompileMetrics } {
  const totalStarted = performance.now();
  const directorStarted = performance.now();
  const fixture = buildP33ADirectionFixture(kind);
  const directorMs = performance.now() - directorStarted;
  if (!fixture.direction_compile.ok || !fixture.direction_compile.visual_plan) throw new Error(`Direction P3.3A invalide (${kind}): ${JSON.stringify(fixture.direction_compile.direction_preflight.diagnostics)}`);
  const style = p32Style();
  const visualStarted = performance.now();
  const visualCompile = compileVisualPlan(fixture.direction_compile.visual_plan, { resolved_style: style, pattern: pattern(), target_platform: 'shorts', asset_refs: new Set() });
  const visualMs = performance.now() - visualStarted;
  if (!visualCompile.ok || !visualCompile.motion_spec) throw new Error(`VisualPlan P3.3A invalide (${kind}): ${JSON.stringify(visualCompile.diagnostics)}`);
  const p1Started = performance.now();
  const p1 = compilePipeline({ spec: visualCompile.motion_spec, resolvedStyle: style, platformPresets: platforms(), pattern: pattern(), fontResources: p14FontResources(style), assetResources: {}, behaviorRegistry: P17_BEHAVIOR_REGISTRY, config: { fps: 30, render_scale: renderScale, minimum_readable_size: renderScale === 1 ? 28 : 14 } });
  const p1Ms = performance.now() - p1Started;
  return {
    pipeline: { ...fixture, visual_plan: fixture.direction_compile.visual_plan, visual_compile: visualCompile, p1, style, diversity: buildVisualDiversityReport(fixture.direction_compile.visual_plan) },
    metrics: {
      director_validation_and_resolution_ms: directorMs,
      visual_plan_to_motion_spec_ms: visualMs,
      p1_compile_ms: p1Ms,
      total_compile_ms: performance.now() - totalStarted,
    },
  };
}

export function buildP33APipeline(kind: P33AFixtureKind, renderScale = 0.5): P33APipeline {
  return profileP33APipeline(kind, renderScale).pipeline;
}
