import { hashCreativeDocument } from './canonical.ts';
import type { CreativePlan, SceneIntent } from './contracts/creative-plan.ts';
import type { CreativeDiagnostic, CreativePreflightReport } from './contracts/diagnostics.ts';
import { reportStatus, sortCreativeDiagnostics, summarizeDiagnostics } from './diagnostics.ts';
import type { CreativeLimits } from './limits.ts';
import { DEFAULT_CREATIVE_LIMITS } from './limits.ts';

export interface CreativePreflightPolicy {
  readonly require_hook: boolean;
  readonly limits: CreativeLimits;
}

export const DEFAULT_CREATIVE_PREFLIGHT_POLICY: Readonly<CreativePreflightPolicy> = Object.freeze({
  require_hook: true,
  limits: DEFAULT_CREATIVE_LIMITS,
});

interface CollectedId {
  readonly id: string;
  readonly path: string;
  readonly scene_id?: string;
}

function sceneContentIds(scene: SceneIntent): Set<string> {
  return new Set([
    ...scene.content.spoken.map((entry) => entry.id),
    ...scene.content.on_screen.map((entry) => entry.id),
    ...scene.content.claims.map((entry) => entry.id),
  ]);
}

function collectIds(plan: CreativePlan): CollectedId[] {
  const ids: CollectedId[] = [{ id: plan.plan_id, path: '$.plan_id' }];
  const push = (id: string, path: string, sceneId?: string) => {
    ids.push(sceneId === undefined ? { id, path } : { id, path, scene_id: sceneId });
  };
  if (plan.narrative.hook) push(plan.narrative.hook.id, '$.narrative.hook.id');
  if (plan.narrative.cta) push(plan.narrative.cta.id, '$.narrative.cta.id');
  plan.narrative.sections.forEach((section, index) => push(section.id, `$.narrative.sections[${index}].id`));
  plan.asset_intents.forEach((asset, index) => push(asset.id, `$.asset_intents[${index}].id`));
  plan.global_intents.visual?.elements.forEach((entry, index) =>
    push(entry.id, `$.global_intents.visual.elements[${index}].id`),
  );
  plan.global_intents.visual?.hierarchy_relationships.forEach((entry, index) =>
    push(entry.id, `$.global_intents.visual.hierarchy_relationships[${index}].id`),
  );
  plan.global_intents.typography?.treatments.forEach((entry, index) =>
    push(entry.id, `$.global_intents.typography.treatments[${index}].id`),
  );
  plan.global_intents.audio?.events.forEach((entry, index) =>
    push(entry.id, `$.global_intents.audio.events[${index}].id`),
  );
  plan.scenes.forEach((scene, sceneIndex) => {
    const base = `$.scenes[${sceneIndex}]`;
    push(scene.id, `${base}.id`, scene.id);
    scene.content.spoken.forEach((entry, index) => push(entry.id, `${base}.content.spoken[${index}].id`, scene.id));
    scene.content.on_screen.forEach((entry, index) => push(entry.id, `${base}.content.on_screen[${index}].id`, scene.id));
    scene.content.claims.forEach((entry, index) => push(entry.id, `${base}.content.claims[${index}].id`, scene.id));
    scene.visual?.elements.forEach((entry, index) => push(entry.id, `${base}.visual.elements[${index}].id`, scene.id));
    scene.visual?.hierarchy_relationships.forEach((entry, index) =>
      push(entry.id, `${base}.visual.hierarchy_relationships[${index}].id`, scene.id),
    );
    scene.typography?.treatments.forEach((entry, index) =>
      push(entry.id, `${base}.typography.treatments[${index}].id`, scene.id),
    );
    scene.audio?.events.forEach((entry, index) => push(entry.id, `${base}.audio.events[${index}].id`, scene.id));
  });
  return ids;
}

export function runCreativePreflight(
  plan: CreativePlan,
  policy: CreativePreflightPolicy = DEFAULT_CREATIVE_PREFLIGHT_POLICY,
): CreativePreflightReport {
  const diagnostics: CreativeDiagnostic[] = [];
  const ids = collectIds(plan);
  const structuralIds = new Set(ids.map((entry) => entry.id));
  const sceneIds = new Set(plan.scenes.map((scene) => scene.id));
  const assetSlots = new Set(plan.asset_intents.map((asset) => asset.slot));
  const usedAssetSlots = new Set<string>();
  let references = 0;
  let contentItems = 0;

  const add = (diagnostic: CreativeDiagnostic) => diagnostics.push(diagnostic);
  const checkReference = (
    id: string,
    valid: ReadonlySet<string>,
    path: string,
    code: string,
    sceneId?: string,
  ) => {
    references += 1;
    if (!valid.has(id)) {
      add({
        code,
        severity: 'error',
        path,
        node_id: id,
        ...(sceneId === undefined ? {} : { scene_id: sceneId }),
        message: `La référence « ${id} » ne peut pas être résolue.`,
        context: { reference: id },
        suggested_action: 'Déclarer la cible ou corriger la référence stable.',
      });
    }
  };

  if (policy.require_hook && !plan.narrative.hook) {
    add({
      code: 'creative.hook_required',
      severity: 'error',
      path: '$.narrative.hook',
      message: 'Cette politique exige un hook explicite.',
      suggested_action: 'Décrire le hook et sa relation avec la première scène.',
    });
  }
  if (plan.narrative.hook) {
    checkReference(
      plan.narrative.hook.first_scene_id,
      sceneIds,
      '$.narrative.hook.first_scene_id',
      'reference.hook_scene_missing',
    );
    if (plan.scenes[0]?.id !== plan.narrative.hook.first_scene_id) {
      add({
        code: 'creative.hook_not_first_scene',
        severity: 'warning',
        path: '$.narrative.hook.first_scene_id',
        node_id: plan.narrative.hook.id,
        scene_id: plan.narrative.hook.first_scene_id,
        message: 'Le hook ne référence pas la première scène ordonnée.',
        suggested_action: 'Aligner first_scene_id ou justifier cet ordre dans une phase ultérieure.',
      });
    }
  }

  plan.narrative.sections.forEach((section, sectionIndex) => {
    section.scene_ids.forEach((id, sceneIndex) =>
      checkReference(
        id,
        sceneIds,
        `$.narrative.sections[${sectionIndex}].scene_ids[${sceneIndex}]`,
        'reference.narrative_scene_missing',
      ),
    );
  });

  const duplicateMap = new Map<string, CollectedId[]>();
  ids.forEach((entry) => duplicateMap.set(entry.id, [...(duplicateMap.get(entry.id) ?? []), entry]));
  for (const [id, entries] of duplicateMap) {
    if (entries.length < 2) continue;
    entries.forEach((entry) =>
      add({
        code: 'id.duplicate',
        severity: 'error',
        path: entry.path,
        node_id: id,
        ...(entry.scene_id === undefined ? {} : { scene_id: entry.scene_id }),
        message: `L’identifiant stable « ${id} » est déclaré ${entries.length} fois.`,
        context: { occurrences: entries.length },
        suggested_action: 'Attribuer un identifiant stable unique à chaque élément structurant.',
      }),
    );
  }
  const duplicateSlots = new Map<string, number>();
  plan.asset_intents.forEach((asset) => duplicateSlots.set(asset.slot, (duplicateSlots.get(asset.slot) ?? 0) + 1));
  for (const [slot, occurrences] of duplicateSlots) {
    if (occurrences < 2) continue;
    plan.asset_intents.forEach((asset, index) => {
      if (asset.slot !== slot) return;
      add({
        code: 'id.asset_slot_duplicate',
        severity: 'error',
        path: `$.asset_intents[${index}].slot`,
        node_id: asset.id,
        message: `Le slot d’asset « ${slot} » est déclaré ${occurrences} fois.`,
        context: { occurrences },
        suggested_action: 'Attribuer un slot sémantique unique à chaque intention d’asset.',
      });
    });
  }
  const globalVisualIds = new Set(plan.global_intents.visual?.elements.map((element) => element.id) ?? []);
  const allContentIds = new Set(plan.scenes.flatMap((scene) => [...sceneContentIds(scene)]));
  plan.global_intents.visual?.elements.forEach((element, index) => {
    if (!element.asset_slot) return;
    usedAssetSlots.add(element.asset_slot);
    checkReference(
      element.asset_slot,
      assetSlots,
      `$.global_intents.visual.elements[${index}].asset_slot`,
      'reference.asset_slot_missing',
    );
  });
  if (plan.global_intents.visual?.focal_element) {
    checkReference(
      plan.global_intents.visual.focal_element,
      globalVisualIds,
      '$.global_intents.visual.focal_element',
      'reference.focal_element_missing',
    );
  }
  plan.global_intents.visual?.hierarchy_relationships.forEach((relationship, index) => {
    checkReference(
      relationship.from,
      globalVisualIds,
      `$.global_intents.visual.hierarchy_relationships[${index}].from`,
      'reference.visual_element_missing',
    );
    checkReference(
      relationship.to,
      globalVisualIds,
      `$.global_intents.visual.hierarchy_relationships[${index}].to`,
      'reference.visual_element_missing',
    );
  });
  plan.global_intents.typography?.treatments.forEach((treatment, index) =>
    checkReference(
      treatment.content_id,
      allContentIds,
      `$.global_intents.typography.treatments[${index}].content_id`,
      'reference.typography_content_missing',
    ),
  );
  plan.global_intents.audio?.events.forEach((event, index) => {
    if (!event.relation) return;
    checkReference(
      event.relation.target_id,
      structuralIds,
      `$.global_intents.audio.events[${index}].relation.target_id`,
      'reference.audio_anchor_missing',
    );
  });

  if (plan.scenes.length > policy.limits.max_scenes) {
    add({
      code: 'limit.scenes_exceeded',
      severity: 'error',
      path: '$.scenes',
      message: `Le plan contient ${plan.scenes.length} scènes pour une limite de ${policy.limits.max_scenes}.`,
      context: { actual: plan.scenes.length, limit: policy.limits.max_scenes },
      suggested_action: 'Réduire ou regrouper les scènes.',
    });
  }
  if (plan.target.duration.max_seconds > policy.limits.max_duration_seconds) {
    add({
      code: 'limit.duration_exceeded',
      severity: 'error',
      path: '$.target.duration.max_seconds',
      message: `La durée maximale dépasse ${policy.limits.max_duration_seconds} secondes.`,
      context: { actual: plan.target.duration.max_seconds, limit: policy.limits.max_duration_seconds },
      suggested_action: 'Réduire la fenêtre de durée créative.',
    });
  }
  if (plan.asset_intents.length > policy.limits.max_asset_intents) {
    add({
      code: 'limit.asset_intents_exceeded',
      severity: 'error',
      path: '$.asset_intents',
      message: `Le plan contient trop d’intentions d’asset.`,
      context: { actual: plan.asset_intents.length, limit: policy.limits.max_asset_intents },
      suggested_action: 'Réduire les slots d’assets.',
    });
  }
  if (plan.narrative.sections.length > policy.limits.max_narrative_sections) {
    add({
      code: 'limit.narrative_sections_exceeded',
      severity: 'error',
      path: '$.narrative.sections',
      message: 'Le plan contient trop de sections narratives.',
      context: { actual: plan.narrative.sections.length, limit: policy.limits.max_narrative_sections },
      suggested_action: 'Simplifier la structure narrative.',
    });
  }

  const globalNarration = plan.global_intents.audio?.narration;
  let totalScriptCharacters = 0;
  plan.scenes.forEach((scene, sceneIndex) => {
    const base = `$.scenes[${sceneIndex}]`;
    const contentIds = sceneContentIds(scene);
    const elements = scene.visual?.elements ?? [];
    const visualIds = new Set(elements.map((element) => element.id));
    const itemCount = scene.content.spoken.length + scene.content.on_screen.length + scene.content.claims.length;
    contentItems += itemCount;
    totalScriptCharacters += scene.content.spoken.reduce((sum, entry) => sum + [...entry.text].length, 0);
    const onScreenCharacters = scene.content.on_screen.reduce((sum, entry) => sum + [...entry.text].length, 0);

    const hasResolvedAssetSlot = scene.asset_slots.some((slot) => assetSlots.has(slot));
    if (itemCount === 0 && !scene.content.semantic_meaning && elements.length === 0 && !hasResolvedAssetSlot) {
      add({
        code: 'creative.scene_empty',
        severity: 'error',
        path: base,
        node_id: scene.id,
        scene_id: scene.id,
        message: 'La scène ne contient aucune intention communicable.',
        suggested_action: 'Ajouter du contenu, un sens, un élément visuel ou un slot d’asset.',
      });
    }
    if (itemCount > policy.limits.max_content_items_per_scene) {
      add({
        code: 'limit.content_items_exceeded',
        severity: 'error',
        path: `${base}.content`,
        node_id: scene.id,
        scene_id: scene.id,
        message: 'La scène contient trop d’éléments de contenu.',
        context: { actual: itemCount, limit: policy.limits.max_content_items_per_scene },
        suggested_action: 'Répartir le contenu sur plusieurs scènes.',
      });
    }
    if (onScreenCharacters > policy.limits.max_on_screen_characters_per_scene) {
      add({
        code: 'limit.on_screen_text_exceeded',
        severity: 'error',
        path: `${base}.content.on_screen`,
        node_id: scene.id,
        scene_id: scene.id,
        message: 'Le texte écran dépasse la limite défensive de la scène.',
        context: { actual: onScreenCharacters, limit: policy.limits.max_on_screen_characters_per_scene },
        suggested_action: 'Réduire ou répartir le texte écran.',
      });
    }
    if (elements.length > policy.limits.max_elements_per_scene) {
      add({
        code: 'limit.visual_elements_exceeded',
        severity: 'error',
        path: `${base}.visual.elements`,
        node_id: scene.id,
        scene_id: scene.id,
        message: 'La scène contient trop d’éléments visuels intentionnels.',
        context: { actual: elements.length, limit: policy.limits.max_elements_per_scene },
        suggested_action: 'Simplifier la hiérarchie visuelle.',
      });
    }

    scene.asset_slots.forEach((slot, index) =>
      {
        usedAssetSlots.add(slot);
        checkReference(slot, assetSlots, `${base}.asset_slots[${index}]`, 'reference.asset_slot_missing', scene.id);
      },
    );
    scene.visual?.elements.forEach((element, index) => {
      if (element.asset_slot) {
        usedAssetSlots.add(element.asset_slot);
        checkReference(
          element.asset_slot,
          assetSlots,
          `${base}.visual.elements[${index}].asset_slot`,
          'reference.asset_slot_missing',
          scene.id,
        );
      }
    });
    if (scene.visual?.focal_element) {
      checkReference(
        scene.visual.focal_element,
        visualIds,
        `${base}.visual.focal_element`,
        'reference.focal_element_missing',
        scene.id,
      );
    }
    scene.visual?.hierarchy_relationships.forEach((relationship, index) => {
      checkReference(
        relationship.from,
        visualIds,
        `${base}.visual.hierarchy_relationships[${index}].from`,
        'reference.visual_element_missing',
        scene.id,
      );
      checkReference(
        relationship.to,
        visualIds,
        `${base}.visual.hierarchy_relationships[${index}].to`,
        'reference.visual_element_missing',
        scene.id,
      );
    });
    scene.typography?.treatments.forEach((treatment, index) =>
      checkReference(
        treatment.content_id,
        contentIds,
        `${base}.typography.treatments[${index}].content_id`,
        'reference.typography_content_missing',
        scene.id,
      ),
    );
    scene.audio?.events.forEach((event, index) => {
      if (!event.relation) return;
      checkReference(
        event.relation.target_id,
        structuralIds,
        `${base}.audio.events[${index}].relation.target_id`,
        'reference.audio_anchor_missing',
        scene.id,
      );
    });

    const narration = scene.audio?.narration ?? globalNarration;
    if (scene.content.spoken.length > 0 && narration === 'none') {
      add({
        code: 'creative.narration_incoherent',
        severity: 'warning',
        path: `${base}.audio.narration`,
        node_id: scene.id,
        scene_id: scene.id,
        message: 'La scène contient du contenu parlé alors que la narration est désactivée.',
        suggested_action: 'Activer la narration ou retirer le contenu parlé.',
      });
    }
    if (scene.subtitles?.required && scene.content.spoken.length === 0) {
      add({
        code: 'creative.subtitles_without_spoken_content',
        severity: 'warning',
        path: `${base}.subtitles`,
        node_id: scene.id,
        scene_id: scene.id,
        message: 'Des sous-titres sont requis sans contenu parlé dans la scène.',
        suggested_action: 'Ajouter le contenu parlé ou rendre les sous-titres optionnels.',
      });
    }
    scene.content.claims.forEach((claim, index) => {
      if (claim.classification === 'factual_claim' && claim.source_requirement === 'required' && !claim.source_slot) {
        add({
          code: 'creative.source_required_unassigned',
          severity: 'warning',
          path: `${base}.content.claims[${index}].source_slot`,
          node_id: claim.id,
          scene_id: scene.id,
          message: 'Cette affirmation exige une source, mais aucun slot de source n’est indiqué.',
          suggested_action: 'Réserver un source_slot sans inventer de source.',
        });
      }
    });

    const preferredSeconds = scene.pacing?.desired_duration?.preferred_seconds;
    if (preferredSeconds !== undefined && preferredSeconds > 0 && onScreenCharacters / preferredSeconds > 80) {
      add({
        code: 'creative.density_excessive',
        severity: 'warning',
        path: `${base}.content.on_screen`,
        node_id: scene.id,
        scene_id: scene.id,
        message: 'La densité de texte écran dépasse 80 caractères par seconde souhaitée.',
        context: { characters: onScreenCharacters, preferred_seconds: preferredSeconds },
        suggested_action: 'Réduire le texte, ralentir le pacing ou répartir le contenu.',
      });
    }
  });

  if (totalScriptCharacters > policy.limits.max_script_characters) {
    add({
      code: 'limit.script_characters_exceeded',
      severity: 'error',
      path: '$.scenes',
      message: 'Le script parlé cumulé dépasse la limite défensive.',
      context: { actual: totalScriptCharacters, limit: policy.limits.max_script_characters },
      suggested_action: 'Réduire ou scinder le script.',
    });
  }

  plan.asset_intents.forEach((asset, index) => {
    if (asset.kind === 'none' && asset.required) {
      add({
        code: 'creative.asset_intent_incoherent',
        severity: 'error',
        path: `$.asset_intents[${index}]`,
        node_id: asset.id,
        message: 'Un asset de type « none » ne peut pas être obligatoire.',
        suggested_action: 'Choisir un type d’asset ou rendre ce slot non requis.',
      });
    }
    if (!usedAssetSlots.has(asset.slot)) {
      add({
        code: 'creative.asset_intent_unused',
        severity: 'info',
        path: `$.asset_intents[${index}]`,
        node_id: asset.id,
        message: `Le slot d’asset « ${asset.slot} » n’est référencé par aucune scène.`,
        context: { slot: asset.slot },
        suggested_action: 'Référencer le slot ou supprimer cette intention si elle est inutile.',
      });
    }
  });

  const narrativeSceneIds = new Set(plan.narrative.sections.flatMap((section) => section.scene_ids));
  plan.scenes.forEach((scene, index) => {
    if (narrativeSceneIds.has(scene.id)) return;
    add({
      code: 'creative.scene_outside_narrative',
      severity: 'warning',
      path: `$.scenes[${index}]`,
      node_id: scene.id,
      scene_id: scene.id,
      message: 'La scène n’apparaît dans aucune section narrative.',
      suggested_action: 'Relier la scène à une section narrative ou la supprimer.',
    });
  });

  const preferredSceneDuration = plan.scenes.reduce(
    (sum, scene) => sum + (scene.pacing?.desired_duration?.preferred_seconds ?? 0),
    0,
  );
  if (
    preferredSceneDuration > 0 &&
    (preferredSceneDuration < plan.target.duration.min_seconds || preferredSceneDuration > plan.target.duration.max_seconds)
  ) {
    add({
      code: 'creative.duration_incoherent',
      severity: 'warning',
      path: '$.target.duration',
      message: 'La somme des durées préférées des scènes sort de la fenêtre de durée cible.',
      context: {
        scene_preferred_total: preferredSceneDuration,
        target_min: plan.target.duration.min_seconds,
        target_max: plan.target.duration.max_seconds,
      },
      suggested_action: 'Ajuster le pacing des scènes ou la durée cible.',
    });
  }

  const ordered = sortCreativeDiagnostics(diagnostics);
  const status = reportStatus(ordered);
  return {
    schema: 'creative-preflight-report',
    schema_version: '0.1.0',
    status,
    eligible_for_compilation: status !== 'fail',
    creative_plan_sha256: hashCreativeDocument(plan),
    diagnostics: ordered,
    summary: summarizeDiagnostics(ordered),
    checks: {
      scenes: plan.scenes.length,
      structural_ids: ids.length,
      content_items: contentItems,
      asset_intents: plan.asset_intents.length,
      references,
    },
  };
}
