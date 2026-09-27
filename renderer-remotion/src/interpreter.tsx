import type { CSSProperties, ReactNode } from 'react';
import React, { useEffect, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, Easing as RemotionEasing, spring, staticFile, useCurrentFrame } from 'remotion';

import type { PlanNode, RenderPlan, Track } from '@motion-engine/core';

export interface GenericCompositionProps extends Record<string, unknown> {
  plan: RenderPlan;
  fontUrls: Record<string, string>;
}

const P13_TRACKS = new Set(['opacity', 'translate_x', 'translate_y', 'scale']);

export function assertP13Plan(plan: RenderPlan): void {
  const visit = (node: PlanNode): void => {
    if (node.type !== 'group' && node.type !== 'text' && node.type !== 'shape') {
      throw new Error(`Primitive « ${node.type} » hors périmètre renderer P1.3.`);
    }
    for (const track of node.tracks) {
      if (!P13_TRACKS.has(track.property)) throw new Error(`Track « ${track.property} » hors périmètre renderer P1.3.`);
    }
    if (node.type === 'group') node.children.forEach(visit);
  };
  plan.scenes.forEach((scene) => scene.nodes.forEach(visit));
}

export const assertP12Plan = assertP13Plan;

function easedProgress(track: Track, leftIndex: number, frame: number, fps: number): number {
  const left = track.keys[leftIndex]!;
  const right = track.keys[leftIndex + 1]!;
  const duration = right.frame - left.frame;
  const progress = duration <= 0 ? 1 : (frame - left.frame) / duration;
  const ease = left.ease;
  if (!ease || ease.type === 'linear') return progress;
  if (ease.type === 'bezier') return RemotionEasing.bezier(...ease.p)(progress);
  return spring({
    frame: progress * duration,
    fps,
    durationInFrames: duration,
    config: { damping: ease.damping, stiffness: ease.stiffness, mass: ease.mass },
  });
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
  const x = numericTrackValue(track(node, 'translate_x'), frame, 0, fps);
  const y = numericTrackValue(track(node, 'translate_y'), frame, 0, fps);
  const scale = numericTrackValue(track(node, 'scale'), frame, 1, fps);
  return {
    position: 'absolute',
    left: node.box.x,
    top: node.box.y,
    width: node.box.w,
    height: node.box.h,
    opacity: numericTrackValue(track(node, 'opacity'), frame, node.opacity, fps),
    transform: `translate(${x}px, ${y}px) scale(${scale})`,
    transformOrigin: `${node.origin.x * 100}% ${node.origin.y * 100}%`,
  };
}

function targetStyle(node: PlanNode, frame: number, fps: number, target: { run?: string; line?: number }): CSSProperties {
  const x = numericTrackValue(track(node, 'translate_x', target), frame, 0, fps);
  const y = numericTrackValue(track(node, 'translate_y', target), frame, 0, fps);
  const scale = numericTrackValue(track(node, 'scale', target), frame, 1, fps);
  return {
    opacity: numericTrackValue(track(node, 'opacity', target), frame, 1, fps),
    transform: `translate(${x}px, ${y}px) scale(${scale})`,
    transformOrigin: '50% 50%',
  };
}

function RenderNode({ node, plan, frame }: { node: PlanNode; plan: RenderPlan; frame: number }): ReactNode {
  const fps = plan.canvas.fps;
  const base = positionStyle(node, frame, fps);
  if (node.type === 'group') {
    return (
      <div data-node-id={node.id} style={base}>
        {node.children.map((child) => (
          <RenderNode key={child.id} node={child} plan={plan} frame={frame} />
        ))}
      </div>
    );
  }
  if (node.type === 'shape') {
    return (
      <div
        data-node-id={node.id}
        style={{
          ...base,
          backgroundColor: node.fill ?? 'transparent',
          borderRadius: node.shape === 'ellipse' ? '50%' : node.radius,
          border: node.stroke ? `${node.stroke.width}px solid ${node.stroke.color}` : undefined,
          boxSizing: 'border-box',
        }}
      />
    );
  }
  if (node.type === 'text') {
    const justifyContent = node.align === 'center' ? 'center' : node.align === 'end' ? 'flex-end' : 'flex-start';
    return (
      <div data-node-id={node.id} style={base}>
        {node.lines.map((line, lineIndex) => (
          <div
            key={`${node.id}-line-${lineIndex}`}
            style={{ position: 'absolute', top: line.top, height: line.height, left: 0, right: 0, display: 'flex', justifyContent, ...targetStyle(node, frame, fps, { line: lineIndex }) }}
          >
            {line.runs.map((run) => {
              const font = plan.fonts.find((candidate) => candidate.id === run.font);
              if (!font) throw new Error(`Police « ${run.font} » absente du RenderPlan.`);
              return (
                <span
                  key={run.id}
                  style={{
                    color: run.color,
                    fontFamily: font.css_name,
                    fontSize: run.size,
                    fontWeight: run.weight,
                    letterSpacing: run.tracking_px,
                    lineHeight: `${line.height}px`,
                    whiteSpace: 'pre',
                    display: 'inline-block',
                    ...targetStyle(node, frame, fps, { run: run.id }),
                  }}
                >
                  {run.text}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    );
  }
  return null;
}

export const GenericComposition: React.FC<GenericCompositionProps> = ({ plan, fontUrls }) => {
  const frame = useCurrentFrame();
  const [fontHandle] = useState(() => delayRender('Chargement des polices du RenderPlan'));
  useEffect(() => {
    document.fonts.ready.then(() => continueRender(fontHandle)).catch(() => continueRender(fontHandle));
  }, [fontHandle]);
  const scene = plan.scenes.find((candidate) => frame >= candidate.from && frame < candidate.to) ?? plan.scenes[0];
  if (!scene) return null;
  const css = plan.fonts
    .map((font) => {
      const url = fontUrls[font.id];
      if (!url) throw new Error(`URL de police « ${font.id} » absente.`);
      return `@font-face{font-family:"${font.css_name}";src:url("${staticFile(url)}") format("truetype");font-weight:${font.weight};font-style:${font.style};}`;
    })
    .join('\n');
  return (
    <AbsoluteFill style={{ backgroundColor: scene.background, overflow: 'hidden' }}>
      <style>{css}</style>
      {scene.nodes.map((node) => (
        <RenderNode key={node.id} node={node} plan={plan} frame={frame} />
      ))}
    </AbsoluteFill>
  );
};
