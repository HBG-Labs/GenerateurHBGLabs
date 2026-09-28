import { describe, expect, it } from 'vitest';

import { validateCreativePlan } from '../validation.ts';
import { loadPlannerFixture, loadValidPlannerFixture } from '../test-support.ts';
import { planCreativeStory } from './plan.ts';

describe('Story / Scene Planner déterministe', () => {
  it.each(['hypothetical-30s', 'explainer-30s', 'product-demo-20s', 'minimal-5s', 'long-60s'] as const)(
    'produit un CreativePlan P2.1 valide pour %s',
    (name) => {
      const result = planCreativeStory(loadPlannerFixture(name));
      expect(result.ok, JSON.stringify(result.report?.diagnostics, null, 2)).toBe(true);
      expect(result.creative_plan).not.toBeNull();
      expect(result.creative_validation?.report.summary.errors).toBe(0);
      expect(result.creative_validation?.ok).toBe(true);
      expect(validateCreativePlan(result.creative_plan, { require_hook: result.creative_plan?.narrative.hook !== undefined }).ok).toBe(true);
      expect(result.report?.duration.exact).toBe(true);
    },
  );

  it.each([5, 10, 15, 30, 45, 60])('alloue exactement %s secondes sans frames', (durationSeconds) => {
    const input = structuredClone(loadValidPlannerFixture('hypothetical-30s'));
    input.target_duration_ms = durationSeconds * 1_000;
    input.pacing = 'medium';
    const result = planCreativeStory(input);
    expect(result.ok).toBe(true);
    expect(result.report?.duration).toEqual({
      target_ms: durationSeconds * 1_000,
      allocated_ms: durationSeconds * 1_000,
      exact: true,
    });
    expect(result.report?.scenes.reduce((sum, scene) => sum + scene.duration_ms, 0)).toBe(durationSeconds * 1_000);
    expect(JSON.stringify(result.report)).not.toMatch(/frame|fps/i);
  });

  it('réduit 5 secondes à très peu de scènes sans supprimer les rôles obligatoires', () => {
    const result = planCreativeStory(loadPlannerFixture('minimal-5s'));
    expect(result.report?.scenes).toHaveLength(2);
    expect(result.report?.beats.filter((beat) => beat.required).map((beat) => beat.role)).toEqual([
      'hook',
      'premise',
      'reveal',
      'payoff',
    ]);
    expect(result.report?.decisions.some((decision) => decision.kind === 'merged')).toBe(true);
  });

  it('splitte les beats importants sur 60 secondes', () => {
    const result = planCreativeStory(loadPlannerFixture('long-60s'));
    expect(result.report?.scenes.length).toBeGreaterThan(result.report?.beats.length ?? 0);
    expect(result.report?.decisions.some((decision) => decision.kind === 'split')).toBe(true);
  });

  it('ne transforme jamais les slots non résolus en faux texte', () => {
    const result = planCreativeStory(loadPlannerFixture('hypothetical-30s'));
    expect(result.content_slots.every((slot) => slot.status === 'unresolved')).toBe(true);
    expect(result.creative_plan?.scenes.flatMap((scene) => scene.content.spoken)).toEqual([]);
    expect(result.creative_plan?.scenes.flatMap((scene) => scene.content.on_screen)).toEqual([]);
    expect(result.report?.diagnostics.some((diagnostic) => diagnostic.code === 'planner.content_slot_unresolved')).toBe(true);
  });

  it('réutilise exactement le contenu résolu et conserve les exigences factuelles', () => {
    const input = loadValidPlannerFixture('explainer-30s');
    const result = planCreativeStory(input);
    const renderedText = result.creative_plan?.scenes.flatMap((scene) => [
      ...scene.content.spoken.map((entry) => entry.text),
      ...scene.content.on_screen.map((entry) => entry.text),
    ]);
    expect(renderedText).toEqual(expect.arrayContaining(input.provided_content.map((content) => content.text)));
    expect(result.content_slots.find((slot) => slot.role === 'explanation')).toEqual(
      expect.objectContaining({ status: 'resolved', factual_requirement: 'source_required' }),
    );
    expect(result.creative_plan?.scenes.flatMap((scene) => scene.content.claims)).toEqual(
      expect.arrayContaining([expect.objectContaining({ source_requirement: 'required', source_slot: 'sunset_science_source' })]),
    );
  });

  it('produit uniquement des intentions audio/SFX et asset sémantiques', () => {
    const result = planCreativeStory(loadPlannerFixture('hypothetical-30s'));
    const serialized = JSON.stringify(result.creative_plan);
    expect(serialized).toMatch(/semantic_sfx|dramatic_pause/u);
    expect(serialized).not.toMatch(/\.wav|\.mp3|https?:\/\//iu);
    expect(result.report?.asset_intents.length).toBeGreaterThan(0);
    expect(result.creative_plan?.asset_intents.every((asset) => asset.content_description?.includes('topic:'))).toBe(true);
  });

  it('rend le CTA facultatif et n’invente aucun appel', () => {
    const none = planCreativeStory(loadPlannerFixture('hypothetical-30s'));
    expect(none.creative_plan?.narrative.cta).toBeUndefined();
    const long = planCreativeStory(loadPlannerFixture('long-60s'));
    expect(long.creative_plan?.narrative.cta?.text).toBe('Retenez surtout que tout est lié.');
  });

  it('explique sélection, beats, allocations, slots, assets et preflight final', () => {
    const result = planCreativeStory(loadPlannerFixture('hypothetical-30s'));
    expect(result.report).toEqual(
      expect.objectContaining({
        archetype: expect.objectContaining({ id: 'HYPOTHETICAL', selection: 'received' }),
        beats: expect.any(Array),
        scenes: expect.any(Array),
        content_slots: expect.objectContaining({ unresolved: expect.any(Number) }),
        asset_intents: expect.any(Array),
        creative_plan: expect.objectContaining({ preflight_status: expect.stringMatching(/pass|warn/) }),
      }),
    );
  });

  it('est strictement déterministe dans un même processus', () => {
    const input = loadPlannerFixture('hypothetical-30s');
    expect(planCreativeStory(input)).toEqual(planCreativeStory(input));
  });

  it('refuse un archétype absent du registre', () => {
    const input = structuredClone(loadValidPlannerFixture());
    input.narrative_archetype = 'UNKNOWN_ARCHETYPE';
    const result = planCreativeStory(input);
    expect(result.ok).toBe(false);
    expect(result.report?.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'planner.archetype_unknown', severity: 'error' })]),
    );
  });
});
