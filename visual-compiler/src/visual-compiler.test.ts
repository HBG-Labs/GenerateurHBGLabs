import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { planCreativeStory } from '@motion-engine/creative-core';
import { buildVisualPreflight, hashVisualDocument } from '@motion-engine/visual-core';

import { compileCreativePlanToVisualPlan } from './planner.ts';

const workspace = path.resolve(import.meta.dirname, '..', '..');

function creativePlan() {
  const fixture = JSON.parse(readFileSync(path.join(workspace, 'visual-compiler', 'fixtures', 'p3.1', 'blue-sky.planner-input.json'), 'utf8'));
  const planned = planCreativeStory(fixture);
  if (!planned.ok || !planned.creative_plan) throw new Error('Fixture CreativePlan invalide.');
  return planned.creative_plan;
}

describe('Visual Compiler — CreativePlan vers VisualPlan', () => {
  it('produit un VisualPlan strict et déterministe par défaut', () => {
    const plan = creativePlan();
    const first = compileCreativePlanToVisualPlan(plan, { style_id: 'aurora_visual' });
    const second = compileCreativePlanToVisualPlan(plan, { style_id: 'aurora_visual' });
    expect(first).toEqual(second);
    expect(hashVisualDocument(first)).toBe(hashVisualDocument(second));
    expect(first.scenes).toHaveLength(plan.scenes.length);
    expect(first.source.pipeline_path).toBe('visual_directed');
    expect(buildVisualPreflight(first).summary.errors).toBe(0);
  });

  it('conserve une scène VisualPlan traçable pour chaque scène créative', () => {
    const plan = creativePlan();
    const visual = compileCreativePlanToVisualPlan(plan, { style_id: 'aurora_visual' });
    expect(visual.scenes.map((scene) => scene.source_scene_id)).toEqual(plan.scenes.map((scene) => scene.id));
    expect(new Set(visual.scenes.map((scene) => scene.id)).size).toBe(visual.scenes.length);
  });

  it('refuse une direction qui référence une scène créative absente', () => {
    const plan = creativePlan();
    expect(() => compileCreativePlanToVisualPlan(plan, {
      style_id: 'aurora_visual',
      direction: {
        style_id: 'aurora_visual', motifs: [], bridges: [],
        scenes: [{
          source_scene_id: 'scene_absente', narrative_role: 'hook', layout: 'CENTER_HERO', visual_focus_id: 'focus',
          entry_anchor_id: null, exit_anchor_id: null, complexity: 'LOW', motion_intensity: 'LOW', information_density: 'SPARSE',
          background_role: 'background', entities: [], relations: [], patterns: [], motion_phrases: [], camera_moves: [], anchors: [], depth_layers: [], choreography: [], reserved_regions: [],
        }],
      },
    })).toThrow('visual.direction.source_scene_missing');
  });
});
