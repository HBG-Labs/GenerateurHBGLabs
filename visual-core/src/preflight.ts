import { hashVisualDocument } from './canonical.ts';
import type { VisualDiagnostic, VisualPlan, VisualPreflightReport, VisualScene } from './contracts.ts';
import { buildVisualDiversityReport } from './diversity.ts';
import { DEFAULT_VISUAL_LIMITS } from './limits.ts';
import type { VisualEngineLimits } from './limits.ts';
import {
  ACTIVE_VISUAL_GRAMMAR,
  visualGrammarForVersion,
} from './registry.ts';
import { validateVisualPlan } from './validation.ts';

function addDuplicateDiagnostics(ids: readonly { id: string; path: string; scene_id?: string }[], diagnostics: VisualDiagnostic[]): void {
  const seen = new Set<string>();
  for (const entry of ids) {
    if (seen.has(entry.id)) diagnostics.push({ code: 'visual.id.duplicate', severity: 'error', path: entry.path, ...(entry.scene_id ? { scene_id: entry.scene_id } : {}), node_id: entry.id, message: `Identifiant dupliqué : ${entry.id}.`, suggested_action: 'Dériver un ID stable unique.' });
    seen.add(entry.id);
  }
}

function hasCycle(scene: VisualScene): boolean {
  const edges = new Map<string, string[]>();
  for (const depth of scene.depth_layers) edges.set(depth.entity_id, depth.occludes);
  const active = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): boolean => {
    if (active.has(id)) return true;
    if (done.has(id)) return false;
    active.add(id);
    for (const next of edges.get(id) ?? []) if (visit(next)) return true;
    active.delete(id); done.add(id); return false;
  };
  return [...edges.keys()].some(visit);
}

function hasChoreographyCycle(scene: VisualScene): boolean {
  const edges = new Map(scene.choreography.map((entry) => [entry.id, entry.trigger.event_id ? [entry.trigger.event_id] : []]));
  const active = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): boolean => {
    if (active.has(id)) return true;
    if (done.has(id)) return false;
    active.add(id);
    for (const next of edges.get(id) ?? []) if (edges.has(next) && visit(next)) return true;
    active.delete(id); done.add(id); return false;
  };
  return [...edges.keys()].some(visit);
}

function hasMotionCausalityCycle(scene: VisualScene): boolean {
  const events = new Set((scene.motion_events ?? []).map((entry) => entry.id));
  const edges = new Map<string, string[]>();
  for (const event of events) edges.set(event, []);
  for (const relation of scene.causal_relations ?? []) {
    if (events.has(relation.source_event_id) && events.has(relation.destination_event_id)) {
      edges.get(relation.source_event_id)!.push(relation.destination_event_id);
    }
  }
  const active = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): boolean => {
    if (active.has(id)) return true;
    if (done.has(id)) return false;
    active.add(id);
    for (const next of edges.get(id) ?? []) if (visit(next)) return true;
    active.delete(id); done.add(id); return false;
  };
  return [...events].some(visit);
}

function limitDiagnostic(code: string, path: string, actual: number, limit: number): VisualDiagnostic {
  return { code, severity: 'error', path, message: `${actual} dépasse la limite ${limit}.`, context: { actual, limit }, suggested_action: 'Réduire la complexité avant compilation.' };
}

export function buildVisualPreflight(input: unknown, limits: VisualEngineLimits = DEFAULT_VISUAL_LIMITS): VisualPreflightReport {
  const validated = validateVisualPlan(input, limits);
  const diagnostics: VisualDiagnostic[] = [...validated.diagnostics];
  if (!validated.ok) return report(null, diagnostics);
  const plan = validated.value;
  const grammar = visualGrammarForVersion(plan.grammar.version);
  const activeGrammar = grammar ?? ACTIVE_VISUAL_GRAMMAR;
  const patternRegistry = activeGrammar.patterns;
  const phraseRegistry = activeGrammar.phrases;
  const cameraRegistry = activeGrammar.cameras;
  const bridgeRegistry = activeGrammar.bridges;
  if (!grammar || plan.grammar.fingerprints.grammar !== activeGrammar.fingerprint) {
    diagnostics.push({ code: 'visual.grammar.fingerprint_mismatch', severity: 'error', path: '$.grammar', message: 'La version/empreinte de la grammaire active ne correspond pas au plan.', suggested_action: 'Recompiler le VisualPlan avec la grammaire active.' });
  }
  const expected = activeGrammar.registry_fingerprints;
  for (const key of ['patterns', 'phrases', 'bridges', 'cameras'] as const) if (plan.grammar.fingerprints[key] !== expected[key]) diagnostics.push({ code: 'visual.registry.fingerprint_mismatch', severity: 'error', path: `$.grammar.fingerprints.${key}`, message: `Empreinte du registre ${key} incohérente.`, suggested_action: 'Recompiler le VisualPlan.' });

  const allIds: Array<{ id: string; path: string; scene_id?: string }> = [
    { id: plan.plan_id, path: '$.plan_id' },
    ...plan.scenes.flatMap((scene, index) => [
      { id: scene.id, path: `$.scenes[${index}].id`, scene_id: scene.id },
      ...scene.entities.map((entry, entityIndex) => ({ id: entry.id, path: `$.scenes[${index}].entities[${entityIndex}].id`, scene_id: scene.id })),
      ...scene.patterns.map((entry, itemIndex) => ({ id: entry.id, path: `$.scenes[${index}].patterns[${itemIndex}].id`, scene_id: scene.id })),
      ...scene.motion_phrases.map((entry, itemIndex) => ({ id: entry.id, path: `$.scenes[${index}].motion_phrases[${itemIndex}].id`, scene_id: scene.id })),
      ...scene.camera_moves.map((entry, itemIndex) => ({ id: entry.id, path: `$.scenes[${index}].camera_moves[${itemIndex}].id`, scene_id: scene.id })),
      ...scene.anchors.map((entry, itemIndex) => ({ id: entry.id, path: `$.scenes[${index}].anchors[${itemIndex}].id`, scene_id: scene.id })),
      ...(scene.morph_chains ?? []).flatMap((entry, itemIndex) => [{ id: entry.id, path: `$.scenes[${index}].morph_chains[${itemIndex}].id`, scene_id: scene.id }, ...entry.steps.map((step, stepIndex) => ({ id: step.id, path: `$.scenes[${index}].morph_chains[${itemIndex}].steps[${stepIndex}].id`, scene_id: scene.id }))]),
      ...(scene.motion_events ?? []).map((entry, itemIndex) => ({ id: entry.id, path: `$.scenes[${index}].motion_events[${itemIndex}].id`, scene_id: scene.id })),
      ...(scene.causal_relations ?? []).map((entry, itemIndex) => ({ id: entry.id, path: `$.scenes[${index}].causal_relations[${itemIndex}].id`, scene_id: scene.id })),
      ...(scene.layout_transitions ?? []).map((entry, itemIndex) => ({ id: entry.id, path: `$.scenes[${index}].layout_transitions[${itemIndex}].id`, scene_id: scene.id })),
      ...(scene.effects ?? []).map((entry, itemIndex) => ({ id: entry.id, path: `$.scenes[${index}].effects[${itemIndex}].id`, scene_id: scene.id })),
    ]),
    ...plan.bridges.map((entry, index) => ({ id: entry.id, path: `$.bridges[${index}].id` })),
    ...plan.motifs.map((entry, index) => ({ id: entry.id, path: `$.motifs[${index}].id` })),
    ...(plan.camera_continuities ?? []).map((entry, index) => ({ id: entry.id, path: `$.camera_continuities[${index}].id` })),
  ];
  addDuplicateDiagnostics(allIds, diagnostics);
  const totalEntities = plan.scenes.reduce((sum, scene) => sum + scene.entities.length, 0);
  const totalAnchors = plan.scenes.reduce((sum, scene) => sum + scene.anchors.length, 0);
  if (totalEntities > limits.max_total_entities) diagnostics.push(limitDiagnostic('visual.limit.total_entities', '$.scenes', totalEntities, limits.max_total_entities));
  if (totalAnchors > limits.max_anchors) diagnostics.push(limitDiagnostic('visual.limit.anchors', '$.scenes', totalAnchors, limits.max_anchors));
  if (plan.bridges.length > limits.max_bridges) diagnostics.push(limitDiagnostic('visual.limit.bridges', '$.bridges', plan.bridges.length, limits.max_bridges));

  for (const [sceneIndex, scene] of plan.scenes.entries()) {
    const path = `$.scenes[${sceneIndex}]`;
    const entities = new Map(scene.entities.map((entry) => [entry.id, entry]));
    if (!entities.has(scene.visual_focus_id)) diagnostics.push({ code: 'visual.focus.missing', severity: 'error', path: `${path}.visual_focus_id`, scene_id: scene.id, node_id: scene.visual_focus_id, message: 'VisualFocus cible un élément absent.', suggested_action: 'Cibler un élément de la scène.' });
    const heroes = scene.entities.filter((entry) => entry.hierarchy === 'HERO');
    if (heroes.length > 1) diagnostics.push({ code: 'visual.hierarchy.multiple_heroes', severity: 'error', path: `${path}.entities`, scene_id: scene.id, message: 'Plusieurs HERO simultanés sans politique explicite.', context: { count: heroes.length }, suggested_action: 'Conserver un seul HERO principal.' });
    const focus = entities.get(scene.visual_focus_id);
    if (focus?.hierarchy === 'DECORATIVE') diagnostics.push({ code: 'visual.focus.decorative', severity: 'error', path: `${path}.visual_focus_id`, scene_id: scene.id, node_id: focus.id, message: 'Un élément décoratif ne peut être le focus principal.', suggested_action: 'Choisir un élément sémantique.' });
    if (scene.patterns.length > limits.max_patterns_per_scene) diagnostics.push(limitDiagnostic('visual.limit.patterns', `${path}.patterns`, scene.patterns.length, limits.max_patterns_per_scene));
    if (scene.motion_phrases.length > limits.max_phrases_per_scene) diagnostics.push(limitDiagnostic('visual.limit.phrases', `${path}.motion_phrases`, scene.motion_phrases.length, limits.max_phrases_per_scene));
    if (scene.camera_moves.length > limits.max_camera_moves_per_scene) diagnostics.push(limitDiagnostic('visual.limit.camera_moves', `${path}.camera_moves`, scene.camera_moves.length, limits.max_camera_moves_per_scene));
    if (scene.depth_layers.length > limits.max_depth_layers_per_scene) diagnostics.push(limitDiagnostic('visual.limit.depth_layers', `${path}.depth_layers`, scene.depth_layers.length, limits.max_depth_layers_per_scene));
    if (scene.relations.length > limits.max_relations_per_scene) diagnostics.push(limitDiagnostic('visual.limit.relations', `${path}.relations`, scene.relations.length, limits.max_relations_per_scene));
    for (const entity of scene.entities) {
      if (entity.parent_id && !entities.has(entity.parent_id)) diagnostics.push({ code: 'visual.entity.parent_missing', severity: 'error', path: `${path}.entities`, scene_id: scene.id, node_id: entity.id, message: `Parent ${entity.parent_id} absent.`, suggested_action: 'Référencer un parent local existant.' });
      if (entity.parent_id === entity.id) diagnostics.push({ code: 'visual.entity.self_parent', severity: 'error', path: `${path}.entities`, scene_id: scene.id, node_id: entity.id, message: 'Auto-parentage interdit.', suggested_action: 'Supprimer la relation cyclique.' });
      if (entity.kind === 'text' && !entity.text) diagnostics.push({ code: 'visual.entity.text_missing', severity: 'error', path: `${path}.entities`, scene_id: scene.id, node_id: entity.id, message: 'Contenu texte absent.', suggested_action: 'Fournir le contenu résolu.' });
      if (entity.kind === 'path' && !entity.path) diagnostics.push({ code: 'visual.entity.path_missing', severity: 'error', path: `${path}.entities`, scene_id: scene.id, node_id: entity.id, message: 'Géométrie path absente.', suggested_action: 'Fournir une géométrie normalisée.' });
    }
    for (const relation of scene.relations) if (!entities.has(relation.subject) || !entities.has(relation.object)) diagnostics.push({ code: 'visual.relation.target_missing', severity: 'error', path: `${path}.relations`, scene_id: scene.id, node_id: relation.id, message: 'Relation vers un élément absent.', suggested_action: 'Référencer des éléments locaux existants.' });
    const anchors = new Map(scene.anchors.map((entry) => [entry.id, entry]));
    for (const anchor of scene.anchors) if (!entities.has(anchor.entity_id)) diagnostics.push({ code: 'visual.anchor.target_missing', severity: 'error', path: `${path}.anchors`, scene_id: scene.id, node_id: anchor.id, message: 'ContinuityAnchor sans élément cible.', suggested_action: 'Référencer un élément existant.' });
    if (scene.entry_anchor_id && !anchors.has(scene.entry_anchor_id)) diagnostics.push({ code: 'visual.anchor.entry_missing', severity: 'error', path: `${path}.entry_anchor_id`, scene_id: scene.id, message: 'Entry anchor absent.', suggested_action: 'Déclarer l’ancre.' });
    if (scene.exit_anchor_id && !anchors.has(scene.exit_anchor_id)) diagnostics.push({ code: 'visual.anchor.exit_missing', severity: 'error', path: `${path}.exit_anchor_id`, scene_id: scene.id, message: 'Exit anchor absent.', suggested_action: 'Déclarer l’ancre.' });
    for (const instance of scene.patterns) {
      const definition = patternRegistry.get(instance.pattern_id);
      if (!definition || definition.version !== instance.version) diagnostics.push({ code: 'visual.pattern.unknown', severity: 'error', path: `${path}.patterns`, scene_id: scene.id, node_id: instance.id, message: `Pattern inconnu : ${instance.pattern_id}@${instance.version}.`, suggested_action: 'Utiliser le registre actif.' });
      else {
        if (definition.support === 'future') diagnostics.push({ code: 'visual.capability.unsupported', severity: 'error', path: `${path}.patterns`, scene_id: scene.id, node_id: instance.id, message: `${instance.pattern_id} est FUTURE/UNSUPPORTED.`, suggested_action: 'Choisir un pattern supporté.' });
        if (definition.support === 'compatible_simplified') diagnostics.push({ code: 'visual.pattern.compatible_simplified', severity: 'warning', path: `${path}.patterns`, scene_id: scene.id, node_id: instance.id, message: `${instance.pattern_id} utilise son resolver simplifié versionné.`, suggested_action: 'Inspecter visuellement la simplification.' });
        for (const target of instance.target_ids) {
          const entity = entities.get(target);
          if (!entity) diagnostics.push({ code: 'visual.pattern.target_missing', severity: 'error', path: `${path}.patterns`, scene_id: scene.id, node_id: instance.id, message: `Target ${target} absent.`, suggested_action: 'Cibler un élément existant.' });
          else if (!definition.allowed_targets.includes(entity.kind)) diagnostics.push({ code: 'visual.pattern.target_incompatible', severity: 'error', path: `${path}.patterns`, scene_id: scene.id, node_id: instance.id, message: `${instance.pattern_id} incompatible avec ${entity.kind}.`, suggested_action: 'Changer de target ou de pattern.' });
        }
      }
    }
    const controls = new Map<string, string>();
    for (const instance of scene.patterns) {
      const definition = patternRegistry.get(instance.pattern_id);
      if (!definition) continue;
      for (const target of instance.target_ids) for (const exclusive of definition.exclusive_control) {
        const key = `${target}:${exclusive}`;
        const owner = controls.get(key);
        if (owner) diagnostics.push({ code: 'visual.pattern.conflict', severity: 'error', path: `${path}.patterns`, scene_id: scene.id, node_id: instance.id, message: `${owner} et ${instance.pattern_id} contrôlent exclusivement ${exclusive} sur ${target}.`, suggested_action: 'Retirer un des patterns en conflit.' });
        controls.set(key, instance.pattern_id);
      }
    }
    for (const phrase of scene.motion_phrases) {
      const definition = phraseRegistry.get(phrase.phrase_id);
      if (!definition || definition.version !== phrase.version) diagnostics.push({ code: 'visual.phrase.unknown', severity: 'error', path: `${path}.motion_phrases`, scene_id: scene.id, node_id: phrase.id, message: `MotionPhrase inconnue : ${phrase.phrase_id}.`, suggested_action: 'Utiliser le registre actif.' });
      else {
        if (phrase.target_ids.length > definition.max_targets) diagnostics.push({ code: 'visual.phrase.targets_exceeded', severity: 'error', path: `${path}.motion_phrases`, scene_id: scene.id, node_id: phrase.id, message: `Trop de targets pour ${phrase.phrase_id}.`, suggested_action: 'Réduire les targets.' });
        for (const target of phrase.target_ids) {
          const entity = entities.get(target);
          if (!entity) diagnostics.push({ code: 'visual.phrase.target_missing', severity: 'error', path: `${path}.motion_phrases`, scene_id: scene.id, node_id: phrase.id, message: `Target ${target} absente.`, suggested_action: 'Cibler une entité locale.' });
          else if (!definition.compatible_targets.includes(entity.kind)) diagnostics.push({ code: 'visual.phrase.target_incompatible', severity: 'error', path: `${path}.motion_phrases`, scene_id: scene.id, node_id: phrase.id, message: `${phrase.phrase_id} incompatible avec ${entity.kind}.`, suggested_action: 'Changer de target ou de MotionPhrase.' });
        }
      }
    }
    for (const camera of scene.camera_moves) {
      const definition = cameraRegistry.get(camera.camera_id);
      if (!definition || definition.version !== camera.version) diagnostics.push({ code: 'visual.camera.unknown', severity: 'error', path: `${path}.camera_moves`, scene_id: scene.id, node_id: camera.id, message: `Camera move inconnu : ${camera.camera_id}.`, suggested_action: 'Utiliser le registre actif.' });
      else {
        if (definition.support === 'future') diagnostics.push({ code: 'visual.camera.unsupported', severity: 'error', path: `${path}.camera_moves`, scene_id: scene.id, node_id: camera.id, message: `${camera.camera_id} est FUTURE.`, suggested_action: 'Utiliser un mouvement supporté.' });
        const target = entities.get(camera.target_id);
        if (!target) diagnostics.push({ code: 'visual.camera.target_missing', severity: 'error', path: `${path}.camera_moves`, scene_id: scene.id, node_id: camera.id, message: 'Camera target absent.', suggested_action: 'Cibler un groupe ou élément existant.' });
        else if (!definition.allowed_targets.includes(target.kind)) diagnostics.push({ code: 'visual.camera.target_incompatible', severity: 'error', path: `${path}.camera_moves`, scene_id: scene.id, node_id: camera.id, message: `${camera.camera_id} incompatible avec ${target.kind}.`, suggested_action: 'Cibler un espace visuel compatible.' });
      }
    }
    for (const depth of scene.depth_layers) {
      if (!entities.has(depth.entity_id)) diagnostics.push({ code: 'visual.depth.target_missing', severity: 'error', path: `${path}.depth_layers`, scene_id: scene.id, node_id: depth.entity_id, message: 'Depth layer absent.', suggested_action: 'Référencer une entité existante.' });
      if (depth.occludes.includes(depth.entity_id)) diagnostics.push({ code: 'visual.depth.self_reference', severity: 'error', path: `${path}.depth_layers`, scene_id: scene.id, node_id: depth.entity_id, message: 'Une couche ne peut pas s’occulter elle-même.', suggested_action: 'Corriger le graphe de profondeur.' });
      for (const target of depth.occludes) if (!entities.has(target)) diagnostics.push({ code: 'visual.depth.occlusion_target_missing', severity: 'error', path: `${path}.depth_layers`, scene_id: scene.id, node_id: depth.entity_id, message: `Occlusion vers ${target} absent.`, suggested_action: 'Corriger le graphe.' });
    }
    if (hasCycle(scene)) diagnostics.push({ code: 'visual.depth.cycle', severity: 'error', path: `${path}.depth_layers`, scene_id: scene.id, message: 'Cycle impossible dans le graphe de profondeur.', suggested_action: 'Rendre les relations d’occlusion acycliques.' });
    const events = new Map(scene.choreography.map((entry) => [entry.id, entry]));
    for (const entry of scene.choreography) {
      if (!entities.has(entry.target_id)) diagnostics.push({ code: 'visual.choreography.target_missing', severity: 'error', path: `${path}.choreography`, scene_id: scene.id, node_id: entry.id, message: 'Événement chorégraphique sans target locale.', suggested_action: 'Cibler une entité existante.' });
      const knownAction = phraseRegistry.has(entry.action_id) || patternRegistry.has(entry.action_id) || cameraRegistry.has(entry.action_id);
      if (!knownAction) diagnostics.push({ code: 'visual.choreography.action_unknown', severity: 'error', path: `${path}.choreography`, scene_id: scene.id, node_id: entry.id, message: `Action chorégraphique inconnue : ${entry.action_id}.`, suggested_action: 'Utiliser une action enregistrée.' });
      if (entry.trigger.relation === 'at_phase_start' && entry.trigger.event_id !== null) diagnostics.push({ code: 'visual.choreography.trigger_invalid', severity: 'error', path: `${path}.choreography`, scene_id: scene.id, node_id: entry.id, message: 'at_phase_start ne référence aucun événement.', suggested_action: 'Supprimer event_id.' });
      if (entry.trigger.relation !== 'at_phase_start' && (!entry.trigger.event_id || !events.has(entry.trigger.event_id))) diagnostics.push({ code: 'visual.choreography.trigger_missing', severity: 'error', path: `${path}.choreography`, scene_id: scene.id, node_id: entry.id, message: 'Trigger vers un événement absent.', suggested_action: 'Référencer un événement local existant.' });
    }
    if (hasChoreographyCycle(scene)) diagnostics.push({ code: 'visual.choreography.cycle', severity: 'error', path: `${path}.choreography`, scene_id: scene.id, message: 'Cycle interdit dans la causalité visuelle.', suggested_action: 'Rendre la chaîne de mouvements acyclique.' });
    const morphRepresentations = new Set(['dot:ellipse', 'ellipse:dot', 'ellipse:ellipse', 'rect:frame', 'frame:rect', 'rect:rect']);
    for (const [morphIndex, morph] of (scene.morph_chains ?? []).entries()) {
      if (!entities.has(morph.entity_id)) diagnostics.push({ code: 'visual.morph.target_missing', severity: 'error', path: `${path}.morph_chains[${morphIndex}]`, scene_id: scene.id, node_id: morph.id, message: 'MorphChain sans entité locale.', suggested_action: 'Cibler une entité existante.' });
      if (morph.kind === 'parametric') for (let stepIndex = 1; stepIndex < morph.steps.length; stepIndex += 1) {
        const previous = morph.steps[stepIndex - 1]!; const current = morph.steps[stepIndex]!;
        if (!morphRepresentations.has(`${previous.representation}:${current.representation}`)) diagnostics.push({ code: 'visual.morph.incompatible', severity: 'error', path: `${path}.morph_chains[${morphIndex}].steps[${stepIndex}]`, scene_id: scene.id, node_id: morph.id, message: `Morph paramétrique ${previous.representation} → ${current.representation} non supporté.`, suggested_action: 'Utiliser une topologie compatible ou un morph sémantique explicite.' });
      }
    }
    const motionEvents = new Map((scene.motion_events ?? []).map((entry) => [entry.id, entry]));
    for (const event of motionEvents.values()) if (!entities.has(event.target_id)) diagnostics.push({ code: 'visual.motion_event.target_missing', severity: 'error', path: `${path}.motion_events`, scene_id: scene.id, node_id: event.id, message: 'MotionEvent sans target locale.', suggested_action: 'Cibler une entité existante.' });
    for (const relation of scene.causal_relations ?? []) if (!motionEvents.has(relation.source_event_id) || !motionEvents.has(relation.destination_event_id)) diagnostics.push({ code: 'visual.causality.event_missing', severity: 'error', path: `${path}.causal_relations`, scene_id: scene.id, node_id: relation.id, message: 'Relation causale vers un MotionEvent absent.', suggested_action: 'Référencer deux événements locaux.' });
    if (hasMotionCausalityCycle(scene)) diagnostics.push({ code: 'visual.causality.cycle', severity: 'error', path: `${path}.causal_relations`, scene_id: scene.id, message: 'Cycle interdit dans la chaîne causale de mouvements.', suggested_action: 'Conserver une causalité orientée et acyclique.' });
    for (const transition of scene.layout_transitions ?? []) for (const target of transition.target_ids) if (!entities.has(target)) diagnostics.push({ code: 'visual.layout_transition.target_missing', severity: 'error', path: `${path}.layout_transitions`, scene_id: scene.id, node_id: transition.id, message: 'LayoutTransition vers une target absente.', suggested_action: 'Cibler une entité locale.' });
    for (const effect of scene.effects ?? []) {
      if (!entities.has(effect.target_id)) diagnostics.push({ code: 'visual.effect.target_missing', severity: 'error', path: `${path}.effects`, scene_id: scene.id, node_id: effect.id, message: 'Effet vers une target absente.', suggested_action: 'Cibler une entité locale.' });
      else diagnostics.push({ code: 'visual.effect.future', severity: 'error', path: `${path}.effects`, scene_id: scene.id, node_id: effect.id, message: `${effect.effect_id} reste FUTURE/UNSUPPORTED pour la certification CPU P3.2.`, suggested_action: 'Retirer l’effet ou utiliser la composition sans effet décoratif.' });
    }
    const highEffects = scene.patterns.filter((entry) => patternRegistry.get(entry.pattern_id)?.complexity === 3).length + scene.motion_phrases.filter((entry) => entry.intensity === 'HIGH').length;
    if (highEffects > 3) diagnostics.push({ code: 'visual.complexity.effect_soup', severity: 'warning', path, scene_id: scene.id, message: 'Plus de trois effets HIGH simultanés.', context: { count: highEffects }, suggested_action: 'Préserver un focus visuel clair.' });
  }

  for (const [index, bridge] of plan.bridges.entries()) {
    const path = `$.bridges[${index}]`;
    const sourceIndex = plan.scenes.findIndex((scene) => scene.id === bridge.source_scene_id);
    const destinationIndex = plan.scenes.findIndex((scene) => scene.id === bridge.destination_scene_id);
    if (sourceIndex < 0 || destinationIndex < 0) diagnostics.push({ code: 'visual.bridge.scene_missing', severity: 'error', path, node_id: bridge.id, message: 'Bridge vers une scène inexistante.', suggested_action: 'Référencer deux scènes existantes.' });
    else if (destinationIndex !== sourceIndex + 1) diagnostics.push({ code: 'visual.bridge.non_adjacent', severity: 'error', path, node_id: bridge.id, message: 'P3.1 autorise uniquement un bridge entre scènes adjacentes.', suggested_action: 'Relier la frontière suivante.' });
    const source = plan.scenes[sourceIndex]; const destination = plan.scenes[destinationIndex];
    const sourceAnchor = source?.anchors.find((entry) => entry.id === bridge.source_anchor_id);
    const destinationAnchor = destination?.anchors.find((entry) => entry.id === bridge.destination_anchor_id);
    if (!sourceAnchor || !destinationAnchor) diagnostics.push({ code: 'visual.bridge.anchor_missing', severity: 'error', path, node_id: bridge.id, message: 'Ancre source ou destination absente.', suggested_action: 'Déclarer les deux anchors.' });
    else if (sourceAnchor.visual_entity_id !== bridge.visual_entity_id || destinationAnchor.visual_entity_id !== bridge.visual_entity_id) diagnostics.push({ code: 'visual.bridge.entity_mismatch', severity: 'error', path, node_id: bridge.id, message: 'Le visual_entity_id du bridge ne correspond pas aux anchors.', suggested_action: 'Préserver une identité persistante.' });
    const definition = bridgeRegistry.get(bridge.bridge_id);
    if (!definition || definition.version !== bridge.version) diagnostics.push({ code: 'visual.bridge.unknown', severity: 'error', path, node_id: bridge.id, message: `SceneBridge inconnu : ${bridge.bridge_id}.`, suggested_action: 'Utiliser le registre actif.' });
    else if (definition.support === 'future') diagnostics.push({ code: 'visual.bridge.unsupported', severity: 'error', path, node_id: bridge.id, message: `${bridge.bridge_id} est FUTURE.`, suggested_action: 'Choisir un bridge supporté.' });
    else if (definition.support === 'compatible_simplified') diagnostics.push({ code: 'visual.bridge.compatible_simplified', severity: 'warning', path, node_id: bridge.id, message: `${bridge.bridge_id} utilise un bridge simplifié et non un morph arbitraire.`, suggested_action: 'Inspecter les frames de frontière.' });
  }
  for (const [index, continuity] of (plan.camera_continuities ?? []).entries()) {
    const source = plan.scenes.find((scene) => scene.id === continuity.source_scene_id);
    const destination = plan.scenes.find((scene) => scene.id === continuity.destination_scene_id);
    const sourceCamera = source?.camera_moves.find((entry) => entry.id === continuity.source_camera_id);
    const destinationCamera = destination?.camera_moves.find((entry) => entry.id === continuity.destination_camera_id);
    if (!source || !destination) diagnostics.push({ code: 'visual.camera_continuity.scene_missing', severity: 'error', path: `$.camera_continuities[${index}]`, node_id: continuity.id, message: 'CameraContinuity vers une scène absente.', suggested_action: 'Référencer deux scènes existantes.' });
    else if (!sourceCamera || !destinationCamera) diagnostics.push({ code: 'visual.camera_continuity.move_missing', severity: 'error', path: `$.camera_continuities[${index}]`, node_id: continuity.id, message: 'CameraContinuity vers un mouvement caméra absent.', suggested_action: 'Référencer les camera_move_id canoniques.' });
  }
  const persistent = new Set(plan.scenes.flatMap((scene) => scene.entities.filter((entry) => entry.persistent && entry.visual_entity_id).map((entry) => entry.visual_entity_id!)));
  if (persistent.size > limits.max_persistent_entities) diagnostics.push(limitDiagnostic('visual.limit.persistent_entities', '$.scenes', persistent.size, limits.max_persistent_entities));
  const diversity = buildVisualDiversityReport(plan);
  for (const repetition of diversity.consecutive_repetitions) {
    const motifDeclared = plan.motifs.some((motif) => motif.scene_ids.every((sceneId) => repetition.scene_ids.includes(sceneId)));
    if (!motifDeclared) diagnostics.push({ code: `visual.repetition.${repetition.kind}`, severity: 'warning', path: '$.scenes', message: `${repetition.value} répété consécutivement sur ${repetition.scene_ids.length} scènes.`, context: { value: repetition.value, count: repetition.scene_ids.length }, suggested_action: 'Varier ou déclarer un motif intentionnel.' });
  }
  return report(plan, diagnostics);
}

function report(plan: VisualPlan | null, diagnostics: VisualDiagnostic[]): VisualPreflightReport {
  const ordered = [...diagnostics].sort((a, b) => `${a.path}:${a.code}:${a.node_id ?? ''}`.localeCompare(`${b.path}:${b.code}:${b.node_id ?? ''}`));
  const errors = ordered.filter((entry) => entry.severity === 'error').length;
  const warnings = ordered.filter((entry) => entry.severity === 'warning').length;
  const infos = ordered.filter((entry) => entry.severity === 'info').length;
  return {
    schema: 'visual-preflight-report', schema_version: '0.1.0', status: errors > 0 ? 'fail' : warnings > 0 ? 'warn' : 'pass',
    eligible_for_compilation: errors === 0, visual_plan_sha256: plan ? hashVisualDocument(plan) : null,
    diagnostics: ordered, summary: { errors, warnings, infos },
    checks: {
      scenes: plan?.scenes.length ?? 0, entities: plan?.scenes.reduce((sum, scene) => sum + scene.entities.length, 0) ?? 0,
      patterns: plan?.scenes.reduce((sum, scene) => sum + scene.patterns.length, 0) ?? 0,
      phrases: plan?.scenes.reduce((sum, scene) => sum + scene.motion_phrases.length, 0) ?? 0,
      bridges: plan?.bridges.length ?? 0, anchors: plan?.scenes.reduce((sum, scene) => sum + scene.anchors.length, 0) ?? 0,
      depth_layers: plan?.scenes.reduce((sum, scene) => sum + scene.depth_layers.length, 0) ?? 0,
    },
  };
}
