import type { PlanNode, RenderCapability, RenderPlan } from '../contracts/render-plan.ts';
import type { QualityIssue } from '../contracts/visual.ts';
import { hashDocument } from '../integrity/canonical.ts';

function visit(node: PlanNode, result: Set<RenderCapability>): void {
  result.add(node.type.toUpperCase() as RenderCapability);
  if (node.opacity !== 1 || node.tracks.some((track) => track.property === 'opacity')) result.add('OPACITY');
  if (node.transform.scale !== 1 || node.transform.rotate !== 0 || node.transform.translate_x !== 0 || node.transform.translate_y !== 0 ||
      node.tracks.some((track) => ['scale', 'rotate', 'translate_x', 'translate_y'].includes(track.property))) result.add('TRANSFORM');
  if (node.tracks.some((track) => track.property.startsWith('clip_'))) result.add('CLIP');
  if (node.tracks.some((track) => track.property === 'path_progress')) result.add('PATH_PROGRESS');
  if (node.tracks.some((track) => track.property === 'color')) result.add('COLOR');
  if (node.tracks.some((track) => track.property === 'tracking_px' || track.property.startsWith('font_axis.'))) result.add('DYNAMIC_TYPOGRAPHY');
  if (node.type === 'group' || node.type === 'mask') node.children.forEach((child) => visit(child, result));
}

export function rendererRequirements(input: Pick<RenderPlan, 'scenes' | 'fonts'>): RenderPlan['requirements'] {
  const capabilities = new Set<RenderCapability>();
  input.scenes.forEach((scene) => {
    scene.nodes.forEach((node) => visit(node, capabilities));
    if (scene.transition_out?.kind === 'cut') capabilities.add('CUT');
  });
  if (input.fonts.some((font) => Object.keys(font.axes).length > 0)) capabilities.add('VARIABLE_FONT');
  const sorted = [...capabilities].sort();
  return { capabilities: sorted, fingerprint: hashDocument(sorted) };
}

export interface RendererDescriptor {
  name: string;
  version: string;
  capabilities: readonly RenderCapability[];
}

export class RendererCompatibilityError extends Error {
  readonly diagnostics: readonly QualityIssue[];
  constructor(diagnostics: readonly QualityIssue[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join('; '));
    this.name = 'RendererCompatibilityError';
    this.diagnostics = diagnostics;
  }
}

export function rendererCompatibility(plan: RenderPlan, renderer: RendererDescriptor): QualityIssue[] {
  const available = new Set(renderer.capabilities);
  const issues: QualityIssue[] = [];
  if (plan.requirements.fingerprint !== hashDocument(plan.requirements.capabilities)) issues.push({
    code: 'renderer.requirements_fingerprint_invalid', severity: 'error', path: 'requirements.fingerprint',
    node_id: null, scene_id: null, message: 'L’empreinte des capabilities du RenderPlan est invalide.',
    suggested_action: 'Recompiler le RenderPlan depuis les sources validées.',
  });
  issues.push(...plan.requirements.capabilities
    .filter((capability) => !available.has(capability))
    .map((capability) => ({
      code: 'renderer.capability_missing', severity: 'error' as const, path: 'requirements.capabilities',
      node_id: null, scene_id: null,
      message: `${renderer.name}@${renderer.version} ne déclare pas ${capability}`,
      context: { capability, renderer: renderer.name, renderer_version: renderer.version },
      suggested_action: 'Utiliser un renderer compatible ou recompiler avec des primitives prises en charge.',
    })));
  return issues;
}

export function assertRendererCompatible(plan: RenderPlan, renderer: RendererDescriptor): void {
  const diagnostics = rendererCompatibility(plan, renderer);
  if (diagnostics.length > 0) throw new RendererCompatibilityError(diagnostics);
}

export class RenderGateError extends Error {
  readonly diagnostics: readonly QualityIssue[];
  constructor(diagnostics: readonly QualityIssue[]) {
    super(`Rendu bloqué par ${diagnostics.length} diagnostic(s) ERROR.`);
    this.name = 'RenderGateError';
    this.diagnostics = diagnostics;
  }
}

export function assertRenderGate(plan: RenderPlan, renderer?: RendererDescriptor): void {
  const errors = plan.preflight.issues.filter((issue) => issue.severity === 'error');
  if (renderer) errors.push(...rendererCompatibility(plan, renderer));
  if (errors.length > 0) throw new RenderGateError(errors);
}
