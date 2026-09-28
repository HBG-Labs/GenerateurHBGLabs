import type { PlanNode, RenderPlan } from '../contracts/render-plan.ts';
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

export function buildQualityPreflight(plan: PlanWithoutPreflight): QualityPreflightReport {
  const issues: QualityIssue[] = [];
  let textNodes = 0;
  let safeNodes = 0;
  let contrastPairs = 0;
  plan.scenes.forEach((scene, sceneIndex) => {
    const placed = flatten(scene.nodes, 0, 0, `scenes[${sceneIndex}].nodes`);
    const images = placed.filter((entry) => entry.node.type === 'image');
    for (const entry of placed) {
      const { node, box, path } = entry;
      if (node.must_be_safe) {
        safeNodes += 1;
        if (!boxContains(plan.safe_zone, box)) {
          issues.push({ code: 'placement.unsafe', severity: 'error', path, message: `le nœud ${node.id} sort de la zone sûre` });
        }
      }
      if (node.type === 'image') {
        const asset = plan.assets.find((candidate) => candidate.ref === node.asset);
        if (!asset) {
          issues.push({ code: 'asset.missing', severity: 'error', path, message: `asset ${node.asset} absent` });
        } else if (
          node.crop.x < 0 || node.crop.y < 0 || node.crop.x + node.crop.w > asset.width + 0.001 || node.crop.y + node.crop.h > asset.height + 0.001
        ) {
          issues.push({ code: 'crop.out_of_bounds', severity: 'error', path: `${path}.crop`, message: 'le crop sort de l’image source' });
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
            message: `${line.measured_width.toFixed(2)}px > ${node.box.w.toFixed(2)}px`,
          });
        }
        line.runs.forEach((run, runIndex) => {
          contrastPairs += 1;
          if (images.some((image) => intersects(box, image.box))) {
            issues.push({
              code: 'contrast.unknown_on_image', severity: 'warning', path: `${path}.lines[${lineIndex}].runs[${runIndex}]`,
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
              message: `contraste ${ratio.toFixed(2)} < ${minimum}`,
              details: { ratio, minimum },
            });
          }
        });
      });
      if (vertical > node.box.h + 0.001) {
        issues.push({ code: 'text.overflow', severity: 'error', path, message: `${vertical.toFixed(2)}px > ${node.box.h.toFixed(2)}px` });
      }
    }
  });
  return {
    status: issues.some((issue) => issue.severity === 'error') ? 'fail' : issues.length > 0 ? 'warn' : 'pass',
    issues,
    checks: { fonts: plan.fonts.length, assets: plan.assets.length, text_nodes: textNodes, safe_nodes: safeNodes, contrast_pairs: contrastPairs },
  };
}
