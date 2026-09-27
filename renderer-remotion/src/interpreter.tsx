import type { CSSProperties, ReactNode } from 'react';
import React, { useEffect, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame } from 'remotion';

import type { PlanNode, RenderPlan, Track } from '@motion-engine/core';

export interface GenericCompositionProps extends Record<string, unknown> {
  plan: RenderPlan;
  fontUrls: Record<string, string>;
}

const P12_TRACKS = new Set(['opacity', 'translate_x', 'translate_y', 'scale']);

export function assertP12Plan(plan: RenderPlan): void {
  const visit = (node: PlanNode): void => {
    if (node.type !== 'group' && node.type !== 'text' && node.type !== 'shape') {
      throw new Error(`Primitive « ${node.type} » hors périmètre renderer P1.2.`);
    }
    for (const track of node.tracks) {
      if (!P12_TRACKS.has(track.property)) throw new Error(`Track « ${track.property} » hors périmètre renderer P1.2.`);
    }
    if (node.type === 'group') node.children.forEach(visit);
  };
  plan.scenes.forEach((scene) => scene.nodes.forEach(visit));
}

export function numericTrackValue(track: Track | undefined, frame: number, fallback: number): number {
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
    const progress = (frame - left.frame) / (right.frame - left.frame);
    return left.value + (right.value - left.value) * progress;
  }
  return fallback;
}

function track(node: PlanNode, property: Track['property']): Track | undefined {
  return node.tracks.find((candidate) => candidate.property === property);
}

function positionStyle(node: PlanNode, frame: number): CSSProperties {
  const x = numericTrackValue(track(node, 'translate_x'), frame, 0);
  const y = numericTrackValue(track(node, 'translate_y'), frame, 0);
  const scale = numericTrackValue(track(node, 'scale'), frame, 1);
  return {
    position: 'absolute',
    left: node.box.x,
    top: node.box.y,
    width: node.box.w,
    height: node.box.h,
    opacity: numericTrackValue(track(node, 'opacity'), frame, node.opacity),
    transform: `translate(${x}px, ${y}px) scale(${scale})`,
    transformOrigin: `${node.origin.x * 100}% ${node.origin.y * 100}%`,
  };
}

function RenderNode({ node, plan, frame }: { node: PlanNode; plan: RenderPlan; frame: number }): ReactNode {
  const base = positionStyle(node, frame);
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
            style={{ position: 'absolute', top: line.top, height: line.height, left: 0, right: 0, display: 'flex', justifyContent }}
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
