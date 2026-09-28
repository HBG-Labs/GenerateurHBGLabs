import { describe, expect, it } from 'vitest';

import type { CreativePlan, SceneIntent } from './contracts/creative-plan.ts';
import { DEFAULT_CREATIVE_LIMITS } from './limits.ts';
import { runCreativePreflight } from './preflight.ts';
import { loadValidFixture } from './test-support.ts';

function scene(index: number): SceneIntent {
  return {
    id: `scene_${index}`,
    narrative_role: 'development',
    semantic_purpose: `Scène ${index}.`,
    content: {
      semantic_meaning: `Idée ${index}.`,
      spoken: [],
      on_screen: [{ id: `screen_${index}`, text: 'Idée.', semantic_role: 'body' }],
      claims: [],
    },
    asset_slots: [],
  };
}

function withSceneCount(count: number): CreativePlan {
  const plan = structuredClone(loadValidFixture('minimal'));
  plan.scenes = Array.from({ length: count }, (_, index) => scene(index));
  plan.narrative.hook!.first_scene_id = 'scene_0';
  plan.narrative.sections[0]!.scene_ids = plan.scenes.map((entry) => entry.id);
  return plan;
}

describe('CreativeLimits', () => {
  it('accepte exactement la limite de scènes', () => {
    expect(runCreativePreflight(withSceneCount(DEFAULT_CREATIVE_LIMITS.max_scenes)).diagnostics).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'limit.scenes_exceeded' })]),
    );
  });

  it('refuse la limite de scènes + 1', () => {
    expect(runCreativePreflight(withSceneCount(DEFAULT_CREATIVE_LIMITS.max_scenes + 1)).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'limit.scenes_exceeded' })]),
    );
  });

  it('accepte exactement 180 secondes et refuse une valeur supérieure', () => {
    const exact = structuredClone(loadValidFixture());
    exact.target.duration = { min_seconds: 1, preferred_seconds: 2, max_seconds: 180 };
    expect(runCreativePreflight(exact).diagnostics.some((issue) => issue.code === 'limit.duration_exceeded')).toBe(false);
    exact.target.duration.max_seconds = 180.001;
    expect(runCreativePreflight(exact).diagnostics.some((issue) => issue.code === 'limit.duration_exceeded')).toBe(true);
  });

  it('accepte exactement la limite du script et refuse + 1', () => {
    const exact = structuredClone(loadValidFixture());
    exact.scenes[0]!.content.spoken = [{ id: 'limit_spoken', text: 'a'.repeat(DEFAULT_CREATIVE_LIMITS.max_script_characters) }];
    expect(runCreativePreflight(exact).diagnostics.some((issue) => issue.code === 'limit.script_characters_exceeded')).toBe(false);
    exact.scenes[0]!.content.spoken[0]!.text += 'a';
    expect(runCreativePreflight(exact).diagnostics.some((issue) => issue.code === 'limit.script_characters_exceeded')).toBe(true);
  });

  it('accepte exactement la limite du texte écran et refuse + 1', () => {
    const exact = structuredClone(loadValidFixture());
    exact.scenes[0]!.content.on_screen[0]!.text = 'a'.repeat(DEFAULT_CREATIVE_LIMITS.max_on_screen_characters_per_scene);
    expect(runCreativePreflight(exact).diagnostics.some((issue) => issue.code === 'limit.on_screen_text_exceeded')).toBe(false);
    exact.scenes[0]!.content.on_screen[0]!.text += 'a';
    expect(runCreativePreflight(exact).diagnostics.some((issue) => issue.code === 'limit.on_screen_text_exceeded')).toBe(true);
  });

  it('certifie les limites exactes/+1 des assets et éléments', () => {
    const assets = structuredClone(loadValidFixture());
    assets.asset_intents = Array.from({ length: DEFAULT_CREATIVE_LIMITS.max_asset_intents }, (_, index) => ({
      id: `asset_${index}`,
      slot: `slot_${index}`,
      kind: 'image' as const,
      required: false,
      purpose: 'Fixture de limite.',
      constraints: [],
    }));
    expect(runCreativePreflight(assets).diagnostics.some((issue) => issue.code === 'limit.asset_intents_exceeded')).toBe(false);
    assets.asset_intents.push({ id: 'asset_over', slot: 'slot_over', kind: 'image', required: false, purpose: 'Dépassement.', constraints: [] });
    expect(runCreativePreflight(assets).diagnostics.some((issue) => issue.code === 'limit.asset_intents_exceeded')).toBe(true);

    const elements = structuredClone(loadValidFixture());
    elements.scenes[0]!.visual = {
      mode: 'abstract',
      focal_element: 'element_0',
      elements: Array.from({ length: DEFAULT_CREATIVE_LIMITS.max_elements_per_scene }, (_, index) => ({
        id: `element_${index}`,
        kind: 'shape',
        hierarchy: 'decorative' as const,
        purpose: 'Fixture de limite.',
      })),
      hierarchy_relationships: [],
    };
    expect(runCreativePreflight(elements).diagnostics.some((issue) => issue.code === 'limit.visual_elements_exceeded')).toBe(false);
    elements.scenes[0]!.visual.elements.push({ id: 'element_over', kind: 'shape', hierarchy: 'decorative', purpose: 'Dépassement.' });
    expect(runCreativePreflight(elements).diagnostics.some((issue) => issue.code === 'limit.visual_elements_exceeded')).toBe(true);
  });
});
