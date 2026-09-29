import type { PlanNode, RenderPlan } from '../contracts/render-plan.ts';
import { IssueCollector } from './issues.ts';
import type { ValidationIssue } from './issues.ts';

export function validateRenderPlanSemantics(plan: RenderPlan): ValidationIssue[] {
  const c = new IssueCollector();
  const fonts = new Set(plan.fonts.map((f) => f.id));
  const fontsById = new Map(plan.fonts.map((font) => [font.id, font]));
  const assets = new Set(plan.assets.map((a) => a.ref));
  const ids = new Set<string>();

  let cursor = 0;
  plan.scenes.forEach((scene, si) => {
    const base = `scenes[${si}]`;
    if (scene.from !== cursor) c.error('plan.scene_gap', base, `la scène commence à ${scene.from}, attendu ${cursor}`);
    if (scene.to <= scene.from) c.error('plan.scene_empty', base, 'scène de durée nulle');
    cursor = scene.to;
    const nextScene = plan.scenes[si + 1];
    if (nextScene) {
      if (scene.transition_out === null) {
        c.error('plan.transition_missing', `${base}.transition_out`, `transition vers « ${nextScene.id} » absente`);
      } else {
        if (scene.transition_out.to_scene !== nextScene.id) {
          c.error('plan.transition_target', `${base}.transition_out.to_scene`, `cible « ${scene.transition_out.to_scene} », attendu « ${nextScene.id} »`);
        }
        if (scene.transition_out.at_frame !== scene.to) {
          c.error('plan.transition_frame', `${base}.transition_out.at_frame`, `frame ${scene.transition_out.at_frame}, attendu ${scene.to}`);
        }
        if (scene.transition_out.kind === 'cut' && scene.transition_out.behavior.id !== 'CUT') {
          c.error('plan.transition_behavior', `${base}.transition_out.behavior`, 'une transition cut doit tracer CUT');
        }
      }
    } else if (scene.transition_out !== null) {
      c.error('plan.transition_terminal', `${base}.transition_out`, 'la dernière scène ne doit pas déclarer de transition sortante');
    }
    const visit = (node: PlanNode, path: string) => {
      if (ids.has(node.id)) c.error('id.duplicate', path, `nœud « ${node.id} » en double`);
      ids.add(node.id);
      node.tracks.forEach((track, ti) => {
        const tpath = `${path}.tracks[${ti}]`;
        let previous = -1;
        for (const key of track.keys) {
          if (key.frame <= previous) c.error('track.order', tpath, 'clés non strictement croissantes');
          if (key.frame < scene.from || key.frame >= scene.to) {
            c.error('track.range', tpath, `clé ${key.frame} hors de la scène [${scene.from}, ${scene.to})`);
          }
          const isColor = typeof key.value === 'string';
          if (isColor !== (track.property === 'color')) {
            c.error('track.value_type', tpath, `valeur incompatible avec la propriété ${track.property}`);
          }
          previous = key.frame;
        }
      });
      if (node.type === 'text') {
        const runs = new Map(node.lines.flatMap((line) => line.runs).map((run) => [run.source_run, run]));
        node.tracks.forEach((track, trackIndex) => {
          if (track.property !== 'tracking_px' && !track.property.startsWith('font_axis.')) return;
          const tpath = `${path}.tracks[${trackIndex}]`;
          const run = track.target?.run ? runs.get(track.target.run) : undefined;
          if (!run) {
            c.error('typography.dynamic_target_missing', tpath, 'track typographique sans run cible valide');
            return;
          }
          if (track.property === 'tracking_px') {
            for (const key of track.keys) if (typeof key.value === 'number' && (key.value < -0.2 * run.size || key.value > 0.5 * run.size)) c.error('text.tracking_out_of_range', tpath, `tracking ${key.value} hors limites pour ${run.size}px`);
            return;
          }
          const axis = track.property.slice('font_axis.'.length);
          const font = fontsById.get(run.font);
          const supported = font?.supported_axes[axis];
          if (!supported) c.error('font.axis_unsupported', tpath, `axe ${axis} absent de ${run.font}`);
          else for (const key of track.keys) if (typeof key.value === 'number' && (key.value < supported.min || key.value > supported.max)) c.error('font.axis_out_of_range', tpath, `${axis}=${key.value} hors [${supported.min}, ${supported.max}]`);
        });
        node.lines.forEach((line) =>
          line.runs.forEach((run) => {
            if (!fonts.has(run.font)) c.error('plan.unknown_font', path, `police « ${run.font} » non déclarée`);
          }),
        );
      }
      if (node.type === 'image' && !assets.has(node.asset)) {
        c.error('plan.unknown_asset', path, `asset « ${node.asset} » non déclaré`);
      }
      if (node.type === 'group' || node.type === 'mask') {
        node.children.forEach((child, i) => visit(child, `${path}.children[${i}]`));
      }
    };
    scene.nodes.forEach((node, ni) => visit(node, `${base}.nodes[${ni}]`));
  });
  if (cursor !== plan.canvas.duration_frames) {
    c.error('plan.duration', 'canvas.duration_frames', `durée ${plan.canvas.duration_frames}, scènes jusqu'à ${cursor}`);
  }
  return c.issues;
}
