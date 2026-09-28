import type { PathLayer, PathSegment } from '../contracts/motion-spec.ts';
import type { Box } from '../contracts/render-plan.ts';

export class PathGeometryError extends Error {
  readonly code = 'path.malformed';
}

const n = (value: number): string => Number(value.toFixed(4)).toString();

function point(point: { x: number; y: number }, box: Box): [number, number] {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
    throw new PathGeometryError('path.malformed: point hors de [0,1]');
  }
  return [point.x * box.w, point.y * box.h];
}

function segmentCommand(segment: PathSegment, box: Box): string {
  if (segment.command === 'close') return 'Z';
  const [x, y] = point(segment.to, box);
  if (segment.command === 'move') return `M${n(x)} ${n(y)}`;
  if (segment.command === 'line') return `L${n(x)} ${n(y)}`;
  if (segment.command === 'quadratic') {
    const [cx, cy] = point(segment.control, box);
    return `Q${n(cx)} ${n(cy)} ${n(x)} ${n(y)}`;
  }
  const [c1x, c1y] = point(segment.control1, box);
  const [c2x, c2y] = point(segment.control2, box);
  return `C${n(c1x)} ${n(c1y)} ${n(c2x)} ${n(c2y)} ${n(x)} ${n(y)}`;
}

export function compileNormalizedPath(geometry: PathLayer['geometry'], box: Box, motifLength = 1): string {
  if ('motif' in geometry) return `M0 ${n(box.h / 2)} L${n(Math.min(box.w, box.w * motifLength))} ${n(box.h / 2)}`;
  if ('points' in geometry) {
    const commands = geometry.points.map((value, index) => {
      const [x, y] = point(value, box);
      return `${index === 0 ? 'M' : 'L'}${n(x)} ${n(y)}`;
    });
    if (geometry.closed) commands.push('Z');
    return commands.join(' ');
  }
  if (geometry.segments[0]?.command !== 'move') throw new PathGeometryError('path.malformed: le premier segment doit être move');
  const closed = geometry.segments.findIndex((segment) => segment.command === 'close');
  if (closed >= 0 && closed !== geometry.segments.length - 1) {
    throw new PathGeometryError('path.malformed: close doit terminer le tracé');
  }
  return geometry.segments.map((segment) => segmentCommand(segment, box)).join(' ');
}
