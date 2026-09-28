import type { CSSProperties, ReactNode } from 'react';
import React, { useEffect, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, Easing as RemotionEasing, useCurrentFrame } from 'remotion';

import type { PlanImageNode, PlanNode, RenderPlan, Track } from '@motion-engine/core';

export interface GenericCompositionProps extends Record<string, unknown> {
  plan: RenderPlan;
  fontUrls: Record<string, string>;
  assetUrls: Record<string, string>;
}

const TRACKS = new Set(['opacity', 'translate_x', 'translate_y', 'scale', 'rotate', 'clip_top', 'clip_right', 'clip_bottom', 'clip_left', 'path_progress', 'color']);

export function assertP15Plan(plan: RenderPlan): void {
  const visit = (node: PlanNode): void => {
    for (const track of node.tracks) if (!TRACKS.has(track.property)) throw new Error(`Track « ${track.property} » inconnu du renderer générique.`);
    if (node.type === 'group' || node.type === 'mask') node.children.forEach(visit);
  };
  plan.scenes.forEach((scene) => scene.nodes.forEach(visit));
}

export const assertP14Plan = assertP15Plan;
export const assertP13Plan = assertP15Plan;
export const assertP12Plan = assertP15Plan;

function genericSpring(progress: number, durationFrames: number, fps: number, ease: Extract<Track['keys'][number]['ease'], { type: 'spring' }>): number {
  const duration = durationFrames / fps;
  const time = progress * duration;
  const omega0 = Math.sqrt(ease.stiffness / ease.mass);
  const zeta = ease.damping / (2 * Math.sqrt(ease.stiffness * ease.mass));
  const velocity = ease.initial_velocity ?? 0;
  const sample = (t: number): number => {
    if (zeta < 1) {
      const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
      const a = 1;
      const b = (zeta * omega0 - velocity) / omegaD;
      return 1 - Math.exp(-zeta * omega0 * t) * (a * Math.cos(omegaD * t) + b * Math.sin(omegaD * t));
    }
    if (zeta === 1) return 1 - Math.exp(-omega0 * t) * (1 + (omega0 - velocity) * t);
    const root = Math.sqrt(zeta * zeta - 1);
    const r1 = -omega0 * (zeta - root);
    const r2 = -omega0 * (zeta + root);
    const c2 = (velocity + r1) / (r2 - r1);
    const c1 = -1 - c2;
    return 1 + c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t);
  };
  const end = sample(duration);
  return end === 0 ? progress : sample(time) / end;
}

function easedProgress(track: Track, leftIndex: number, frame: number, fps: number): number {
  const left = track.keys[leftIndex]!;
  const right = track.keys[leftIndex + 1]!;
  const duration = right.frame - left.frame;
  const progress = duration <= 0 ? 1 : (frame - left.frame) / duration;
  const ease = left.ease;
  if (!ease || ease.type === 'linear') return progress;
  if (ease.type === 'bezier') return RemotionEasing.bezier(...ease.p)(progress);
  return genericSpring(progress, duration, fps, ease);
}

export function numericTrackValue(track: Track | undefined, frame: number, fallback: number, fps = 30): number {
  if (!track || track.keys.length === 0) return fallback;
  const keys = track.keys;
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (!first || !last || typeof first.value !== 'number' || typeof last.value !== 'number') return fallback;
  if (frame <= first.frame) return first.value;
  if (frame >= last.frame) return last.value;
  for (let index = 1; index < keys.length; index += 1) {
    const right = keys[index];
    const left = keys[index - 1];
    if (!left || !right || frame > right.frame || typeof left.value !== 'number' || typeof right.value !== 'number') continue;
    const progress = easedProgress(track, index - 1, frame, fps);
    return left.value + (right.value - left.value) * progress;
  }
  return fallback;
}

function track(node: PlanNode, property: Track['property'], target?: { run?: string; line?: number }): Track | undefined {
  return node.tracks.find((candidate) =>
    candidate.property === property &&
    (target?.run === undefined ? candidate.target?.run === undefined : candidate.target?.run === target.run) &&
    (target?.line === undefined ? candidate.target?.line === undefined : candidate.target?.line === target.line));
}

function positionStyle(node: PlanNode, frame: number, fps: number): CSSProperties {
  const x = node.transform.translate_x + numericTrackValue(track(node, 'translate_x'), frame, 0, fps);
  const y = node.transform.translate_y + numericTrackValue(track(node, 'translate_y'), frame, 0, fps);
  const scale = node.transform.scale * numericTrackValue(track(node, 'scale'), frame, 1, fps);
  const rotate = node.transform.rotate + numericTrackValue(track(node, 'rotate'), frame, 0, fps);
  return {
    position: 'absolute', left: node.box.x, top: node.box.y, width: node.box.w, height: node.box.h,
    opacity: numericTrackValue(track(node, 'opacity'), frame, node.opacity, fps),
    transform: `translate(${x}px, ${y}px) scale(${scale}) rotate(${rotate}deg)`,
    transformOrigin: `${node.origin.x * 100}% ${node.origin.y * 100}%`,
  };
}

function targetStyle(node: PlanNode, frame: number, fps: number, target: { run?: string; line?: number }): CSSProperties {
  const x = numericTrackValue(track(node, 'translate_x', target), frame, 0, fps);
  const y = numericTrackValue(track(node, 'translate_y', target), frame, 0, fps);
  const scale = numericTrackValue(track(node, 'scale', target), frame, 1, fps);
  return { opacity: numericTrackValue(track(node, 'opacity', target), frame, 1, fps), transform: `translate(${x}px, ${y}px) scale(${scale})`, transformOrigin: '50% 50%' };
}

function imageFilter(node: PlanImageNode): string {
  const treatments: string[] = [`contrast(${Math.max(0, 1 + node.treatment.contrast)})`];
  if (node.treatment.grade === 'warm') treatments.push('sepia(0.28)', 'saturate(1.08)');
  if (node.treatment.grade === 'cool') treatments.push('hue-rotate(172deg)', 'saturate(0.82)');
  if (node.treatment.grade === 'mono' || node.treatment.grade === 'duotone') treatments.push('grayscale(1)');
  return treatments.join(' ');
}

function RenderImage({ node, plan, frame, assetUrls }: { node: PlanImageNode; plan: RenderPlan; frame: number; assetUrls: Record<string, string> }): ReactNode {
  const asset = plan.assets.find((candidate) => candidate.ref === node.asset);
  const url = assetUrls[node.asset];
  if (!asset || !url) throw new Error(`Asset « ${node.asset} » absent des ressources du renderer.`);
  const scaleX = node.destination.w / node.crop.w;
  const scaleY = node.destination.h / node.crop.h;
  const positioned = positionStyle(node, frame, plan.canvas.fps);
  const { transform, transformOrigin, ...containerStyle } = positioned;
  const imgStyle: CSSProperties = {
    position: 'absolute',
    left: node.destination.x - node.crop.x * scaleX,
    top: node.destination.y - node.crop.y * scaleY,
    width: asset.width * scaleX,
    height: asset.height * scaleY,
    maxWidth: 'none',
    filter: imageFilter(node),
    transform,
    transformOrigin,
  };
  return (
    <div data-node-id={node.id} style={{ ...containerStyle, overflow: 'hidden' }}>
      <img alt="" src={url} style={imgStyle} />
      {node.treatment.duotone ? <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${node.treatment.duotone.dark}, ${node.treatment.duotone.light})`, mixBlendMode: 'color', opacity: 0.72 }} /> : null}
      {node.treatment.grain > 0 ? <div style={{ position: 'absolute', inset: 0, opacity: node.treatment.grain * 0.16, backgroundImage: 'repeating-radial-gradient(circle at 17% 31%, #fff 0 0.6px, #000 0.8px 1.3px, transparent 1.5px 3px)', backgroundSize: '5px 5px', mixBlendMode: 'overlay' }} /> : null}
    </div>
  );
}

function RenderNode({ node, plan, frame, assetUrls }: { node: PlanNode; plan: RenderPlan; frame: number; assetUrls: Record<string, string> }): ReactNode {
  const fps = plan.canvas.fps;
  const base = positionStyle(node, frame, fps);
  if (node.type === 'group') return <div data-node-id={node.id} style={base}>{node.children.map((child) => <RenderNode key={child.id} node={child} plan={plan} frame={frame} assetUrls={assetUrls} />)}</div>;
  if (node.type === 'mask') {
    const top = numericTrackValue(track(node, 'clip_top'), frame, 0, fps) * 100;
    const right = numericTrackValue(track(node, 'clip_right'), frame, 0, fps) * 100;
    const bottom = numericTrackValue(track(node, 'clip_bottom'), frame, 0, fps) * 100;
    const left = numericTrackValue(track(node, 'clip_left'), frame, 0, fps) * 100;
    return (
      <div data-node-id={node.id} style={{ ...base, overflow: 'hidden', borderRadius: node.clip.shape === 'ellipse' ? '50%' : node.clip.radius, clipPath: `inset(${top}% ${right}% ${bottom}% ${left}% round ${node.clip.radius}px)` }}>
        {node.children.map((child) => <RenderNode key={child.id} node={child} plan={plan} frame={frame} assetUrls={assetUrls} />)}
      </div>
    );
  }
  if (node.type === 'shape') return <div data-node-id={node.id} style={{ ...base, backgroundColor: node.fill ?? 'transparent', borderRadius: node.shape === 'ellipse' ? '50%' : node.radius, border: node.stroke ? `${node.stroke.width}px solid ${node.stroke.color}` : undefined, boxSizing: 'border-box' }} />;
  if (node.type === 'image') return <RenderImage node={node} plan={plan} frame={frame} assetUrls={assetUrls} />;
  if (node.type === 'path') {
    const progress = numericTrackValue(track(node, 'path_progress'), frame, node.progress, fps);
    return (
      <svg data-node-id={node.id} style={{ ...base, overflow: 'visible' }} viewBox={`0 0 ${node.box.w} ${node.box.h}`}>
        <path d={node.d} fill="none" stroke={node.stroke.color} strokeWidth={node.stroke.width} strokeLinecap={node.stroke.cap} strokeLinejoin={node.stroke.join} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - progress} />
      </svg>
    );
  }
  const justifyContent = node.align === 'center' ? 'center' : node.align === 'end' ? 'flex-end' : 'flex-start';
  return (
    <div data-node-id={node.id} style={base}>
      {node.lines.map((line, lineIndex) => (
        <div key={`${node.id}-line-${lineIndex}`} style={{ position: 'absolute', top: line.top, height: line.height, left: 0, right: 0, display: 'flex', justifyContent, alignItems: 'flex-start', ...targetStyle(node, frame, fps, { line: lineIndex }) }}>
          {line.runs.map((run) => {
            const font = plan.fonts.find((candidate) => candidate.id === run.font);
            if (!font) throw new Error(`Police « ${run.font} » absente du RenderPlan.`);
            const variation = Object.entries(font.axes).map(([tag, value]) => `"${tag}" ${value}`).join(', ');
            return (
              <span key={run.id} data-source-run={run.source_run} style={{ color: run.color, fontFamily: font.css_name, fontSize: run.size, fontWeight: run.weight, fontVariationSettings: variation || undefined, letterSpacing: run.tracking_px, lineHeight: `${line.height}px`, width: run.measured_width, flex: '0 0 auto', whiteSpace: 'pre', display: 'inline-block', ...targetStyle(node, frame, fps, { run: run.source_run }) }}>{run.text}</span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export const GenericComposition: React.FC<GenericCompositionProps> = ({ plan, fontUrls, assetUrls }) => {
  const frame = useCurrentFrame();
  const [fontHandle] = useState(() => delayRender('Chargement des polices du RenderPlan'));
  useEffect(() => { document.fonts.ready.then(() => continueRender(fontHandle)).catch(() => continueRender(fontHandle)); }, [fontHandle]);
  const scene = plan.scenes.find((candidate) => frame >= candidate.from && frame < candidate.to) ?? plan.scenes[0];
  if (!scene) return null;
  const css = plan.fonts.map((font) => {
    const url = fontUrls[font.id];
    if (!url) throw new Error(`URL de police « ${font.id} » absente.`);
    return `@font-face{font-family:"${font.css_name}";src:url("${url}") format("truetype");font-weight:${font.weight};font-style:${font.style};}`;
  }).join('\n');
  return (
    <AbsoluteFill style={{ backgroundColor: scene.background, overflow: 'hidden' }}>
      <style>{css}</style>
      {scene.nodes.map((node) => <RenderNode key={node.id} node={node} plan={plan} frame={frame} assetUrls={assetUrls} />)}
    </AbsoluteFill>
  );
};
