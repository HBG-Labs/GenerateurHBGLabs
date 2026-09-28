import type { AudioPlan, PlanNode, RenderPlan, SubtitlePlan } from '../contracts/render-plan.ts';
import type { QualityIssue, QualityPreflightReport } from '../contracts/visual.ts';
import { contrastRatio } from '../style/contrast.ts';
import { boxContains } from './layout.ts';

type PlanWithoutPreflight = Omit<RenderPlan, 'preflight'>;

interface PlacedNode {
  node: PlanNode;
  box: { x: number; y: number; w: number; h: number };
  path: string;
}

function flatten(nodes: readonly PlanNode[], parentX = 0, parentY = 0, base = 'nodes'): PlacedNode[] {
  const result: PlacedNode[] = [];
  nodes.forEach((node, index) => {
    const box = { x: parentX + node.box.x, y: parentY + node.box.y, w: node.box.w, h: node.box.h };
    const path = `${base}[${index}]`;
    result.push({ node, box, path });
    if (node.type === 'group' || node.type === 'mask') result.push(...flatten(node.children, box.x, box.y, `${path}.children`));
  });
  return result;
}

function intersects(a: PlacedNode['box'], b: PlacedNode['box']): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function buildQualityPreflight(
  plan: PlanWithoutPreflight,
  related: { audioPlan?: AudioPlan; subtitlePlan?: SubtitlePlan } = {},
): QualityPreflightReport {
  const issues: QualityIssue[] = [];
  let textNodes = 0;
  let safeNodes = 0;
  let contrastPairs = 0;
  let motionTracks = 0;
  plan.scenes.forEach((scene, sceneIndex) => {
    const placed = flatten(scene.nodes, 0, 0, `scenes[${sceneIndex}].nodes`);
    const images = placed.filter((entry) => entry.node.type === 'image');
    for (const entry of placed) {
      const { node, box, path } = entry;
      if (box.w <= 0 || box.h <= 0) {
        issues.push({ code: box.w === 0 || box.h === 0 ? 'layout.zero_size' : 'layout.negative_dimensions', severity: 'error', path: `${path}.box`, node_id: node.id, scene_id: scene.id, message: `dimensions invalides pour ${node.id}`, context: { width: box.w, height: box.h } });
      }
      const canvas = { x: 0, y: 0, w: plan.canvas.width, h: plan.canvas.height };
      if (!boxContains(canvas, box)) issues.push({ code: 'layout.out_of_bounds', severity: 'error', path: `${path}.box`, node_id: node.id, scene_id: scene.id, message: `${node.id} sort du canvas` });
      motionTracks += node.tracks.length;
      node.tracks.forEach((track, trackIndex) => {
        let previous = -1;
        track.keys.forEach((key, keyIndex) => {
          if (key.frame < scene.from || key.frame >= scene.to) issues.push({ code: 'motion.keyframe_outside_scene', severity: 'error', path: `${path}.tracks[${trackIndex}].keys[${keyIndex}]`, node_id: node.id, scene_id: scene.id, message: `keyframe ${key.frame} hors de [${scene.from}, ${scene.to}[`, context: { frame: key.frame, scene_from: scene.from, scene_to: scene.to } });
          if (key.frame < previous) issues.push({ code: 'motion.keyframe_order', severity: 'error', path: `${path}.tracks[${trackIndex}].keys`, node_id: node.id, scene_id: scene.id, message: 'keyframes non ordonnées' });
          previous = key.frame;
        });
      });
      if (node.must_be_safe) {
        safeNodes += 1;
        if (!boxContains(plan.safe_zone, box)) {
          issues.push({ code: 'placement.unsafe', severity: 'error', path, node_id: node.id, scene_id: scene.id, message: `le nœud ${node.id} sort de la zone sûre`, suggested_action: 'Réduire ou replacer le nœud dans la zone sûre résolue.' });
        }
      }
      if (node.type === 'image') {
        const asset = plan.assets.find((candidate) => candidate.ref === node.asset);
        if (!asset) {
          issues.push({ code: 'asset.missing', severity: 'error', path, node_id: node.id, scene_id: scene.id, message: `asset ${node.asset} absent` });
        } else if (
          node.crop.x < 0 || node.crop.y < 0 || node.crop.x + node.crop.w > asset.width + 0.001 || node.crop.y + node.crop.h > asset.height + 0.001
        ) {
          issues.push({ code: 'crop.out_of_bounds', severity: 'error', path: `${path}.crop`, node_id: node.id, scene_id: scene.id, message: 'le crop sort de l’image source' });
        }
      }
      if (node.type !== 'text') continue;
      textNodes += 1;
      let vertical = 0;
      node.lines.forEach((line, lineIndex) => {
        vertical = Math.max(vertical, line.top + line.height);
        if (line.measured_width > node.box.w + 0.001) {
          issues.push({
            code: 'text.overflow', severity: 'error', path: `${path}.lines[${lineIndex}]`,
            node_id: node.id, scene_id: scene.id,
            message: `${line.measured_width.toFixed(2)}px > ${node.box.w.toFixed(2)}px`,
          });
        }
        line.runs.forEach((run, runIndex) => {
          if (run.glyphs.some((glyph) => glyph.glyph_id === 0)) issues.push({ code: 'typography.unsupported_glyph', severity: 'error', path: `${path}.lines[${lineIndex}].runs[${runIndex}].glyphs`, node_id: node.id, scene_id: scene.id, message: `glyph .notdef détecté dans ${run.id}` });
          contrastPairs += 1;
          if (images.some((image) => intersects(box, image.box))) {
            issues.push({
              code: 'contrast.unknown_on_image', severity: 'warning', path: `${path}.lines[${lineIndex}].runs[${runIndex}]`,
              node_id: node.id, scene_id: scene.id,
              message: 'contraste indéterminable sans analyse pixel ; aucune conformité n’est prétendue',
            });
            return;
          }
          const ratio = contrastRatio(run.color, scene.background);
          const minimum = run.role === 'accent' ? 3 : 4.5;
          if (ratio < minimum) {
            issues.push({
              code: run.role === 'accent' ? 'contrast.accent' : 'contrast.text',
              severity: run.role === 'accent' ? 'warning' : 'error',
              path: `${path}.lines[${lineIndex}].runs[${runIndex}].color`,
              node_id: node.id, scene_id: scene.id,
              message: `contraste ${ratio.toFixed(2)} < ${minimum}`,
              details: { ratio, minimum },
            });
          }
        });
      });
      if (vertical > node.box.h + 0.001) {
        issues.push({ code: 'text.overflow', severity: 'error', path, node_id: node.id, scene_id: scene.id, message: `${vertical.toFixed(2)}px > ${node.box.h.toFixed(2)}px` });
      }
    }
  });
  plan.scenes.forEach((scene, index) => {
    if (scene.from >= scene.to) issues.push({ code: 'motion.scene_range_invalid', severity: 'error', path: `scenes[${index}]`, scene_id: scene.id, message: 'durée de scène nulle ou négative' });
    if (scene.transition_out?.kind === 'cut' && scene.transition_out.at_frame !== scene.to) issues.push({ code: 'motion.cut_boundary_invalid', severity: 'error', path: `scenes[${index}].transition_out`, scene_id: scene.id, message: `CUT attendu à ${scene.to}, reçu ${scene.transition_out.at_frame}` });
  });
  for (const asset of plan.assets) {
    if (!asset.provenance.license || !asset.provenance.source || !asset.provenance.author) issues.push({ code: 'asset.provenance_invalid', severity: 'error', path: `assets.${asset.ref}.provenance`, message: `provenance incomplète pour ${asset.ref}` });
    if (asset.provenance.commercial_use === 'unknown') issues.push({ code: 'asset.license_unknown', severity: 'warning', path: `assets.${asset.ref}.provenance.commercial_use`, message: `usage commercial non confirmé pour ${asset.ref}`, suggested_action: 'Confirmer les droits avant une diffusion commerciale.' });
  }
  const subtitleSegments = related.subtitlePlan?.segments.length ?? 0;
  for (const segment of related.subtitlePlan?.segments ?? []) {
    if (!boxContains(plan.safe_zone, segment.box)) issues.push({ code: 'subtitle.unsafe', severity: 'error', path: `subtitle.segments.${segment.id}.box`, node_id: segment.id, scene_id: segment.scene_id, message: 'sous-titre hors zone sûre' });
    if (segment.font_size < segment.minimum_size) issues.push({ code: 'typography.below_minimum', severity: 'error', path: `subtitle.segments.${segment.id}.font_size`, node_id: segment.id, scene_id: segment.scene_id, message: `${segment.font_size}px < ${segment.minimum_size}px` });
    const height = segment.lines.reduce((maximum, line) => Math.max(maximum, line.top + line.height), 0);
    if (height > segment.box.h + 0.001 || segment.lines.some((line) => line.measured_width > segment.box.w + 0.001)) issues.push({ code: 'subtitle.overflow', severity: 'error', path: `subtitle.segments.${segment.id}`, node_id: segment.id, scene_id: segment.scene_id, message: 'sous-titre hors de sa boîte résolue' });
    if (!plan.fonts.some((font) => font.id === segment.font)) issues.push({ code: 'font.missing', severity: 'error', path: `subtitle.segments.${segment.id}.font`, node_id: segment.id, scene_id: segment.scene_id, message: `font ${segment.font} absente du RenderPlan` });
  }
  for (const cue of related.audioPlan?.sfx_cues ?? []) if (cue.at_frame >= plan.canvas.duration_frames) issues.push({ code: 'audio.cue_outside_duration', severity: 'error', path: `audio.sfx_cues.${cue.id}`, node_id: cue.id, message: `cue ${cue.at_frame} hors durée` });
  issues.push({ code: 'preflight.completed', severity: 'info', path: 'preflight', node_id: null, scene_id: null, message: 'Toutes les familles de vérifications P1.5 ont été exécutées.' });
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.filter((issue) => issue.severity === 'warning').length;
  const infos = issues.filter((issue) => issue.severity === 'info').length;
  return {
    schema: 'quality-preflight-report', schema_version: '0.2.0',
    status: errors > 0 ? 'fail' : warnings > 0 ? 'warn' : 'pass',
    issues,
    summary: { errors, warnings, infos },
    checks: { fonts: plan.fonts.length, assets: plan.assets.length, text_nodes: textNodes, safe_nodes: safeNodes, contrast_pairs: contrastPairs, motion_tracks: motionTracks, subtitle_segments: subtitleSegments, audio_cues: related.audioPlan?.sfx_cues.length ?? 0 },
  };
}
