import type { Track } from '../contracts/render-plan.ts';

function cubicCoordinate(t: number, a: number, b: number): number {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * a + 3 * inverse * t * t * b + t * t * t;
}

function cubicDerivative(t: number, a: number, b: number): number {
  const inverse = 1 - t;
  return 3 * inverse * inverse * a + 6 * inverse * t * (b - a) + 3 * t * t * (1 - b);
}

/** Deterministic CSS cubic-bezier evaluation with a bounded solver. */
export function cubicBezierProgress(progress: number, points: readonly [number, number, number, number]): number {
  const [x1, y1, x2, y2] = points;
  let t = progress;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const error = cubicCoordinate(t, x1, x2) - progress;
    const derivative = cubicDerivative(t, x1, x2);
    if (Math.abs(error) < 1e-7 || Math.abs(derivative) < 1e-7) break;
    t = Math.min(1, Math.max(0, t - error / derivative));
  }
  let lower = 0;
  let upper = 1;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const x = cubicCoordinate(t, x1, x2);
    if (Math.abs(x - progress) < 1e-7) break;
    if (x < progress) lower = t; else upper = t;
    t = (lower + upper) / 2;
  }
  return cubicCoordinate(t, y1, y2);
}

function springProgress(progress: number, durationFrames: number, fps: number, ease: Extract<Track['keys'][number]['ease'], { type: 'spring' }>): number {
  const duration = durationFrames / fps;
  const time = progress * duration;
  const omega0 = Math.sqrt(ease.stiffness / ease.mass);
  const zeta = ease.damping / (2 * Math.sqrt(ease.stiffness * ease.mass));
  const velocity = ease.initial_velocity ?? 0;
  const sample = (at: number): number => {
    if (zeta < 1) {
      const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
      const a = 1;
      const b = (zeta * omega0 - velocity) / omegaD;
      return 1 - Math.exp(-zeta * omega0 * at) * (a * Math.cos(omegaD * at) + b * Math.sin(omegaD * at));
    }
    if (zeta === 1) return 1 - Math.exp(-omega0 * at) * (1 + (omega0 - velocity) * at);
    const root = Math.sqrt(zeta * zeta - 1);
    const r1 = -omega0 * (zeta - root);
    const r2 = -omega0 * (zeta + root);
    const c2 = (velocity + r1) / (r2 - r1);
    const c1 = -1 - c2;
    return 1 + c1 * Math.exp(r1 * at) + c2 * Math.exp(r2 * at);
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
  if (ease.type === 'bezier') return cubicBezierProgress(progress, ease.p);
  return springProgress(progress, duration, fps, ease);
}

/** Shared by P1.7 analysis and the passive renderer for dynamic typography. */
export function resolvedNumericTrackValue(track: Track | undefined, frame: number, fallback: number, fps: number): number {
  if (!track || track.keys.length === 0) return fallback;
  const first = track.keys[0];
  const last = track.keys.at(-1);
  if (!first || !last || typeof first.value !== 'number' || typeof last.value !== 'number') return fallback;
  if (frame <= first.frame) return first.value;
  if (frame >= last.frame) return last.value;
  for (let index = 1; index < track.keys.length; index += 1) {
    const left = track.keys[index - 1];
    const right = track.keys[index];
    if (!left || !right || frame > right.frame || typeof left.value !== 'number' || typeof right.value !== 'number') continue;
    const progress = easedProgress(track, index - 1, frame, fps);
    return left.value + (right.value - left.value) * progress;
  }
  return fallback;
}

export function boundedCriticalFrames(tracks: readonly Track[], maximumStates: number): number[] {
  if (tracks.length === 0) return [];
  const keys = new Set(tracks.flatMap((track) => track.keys.map((key) => key.frame)));
  if (keys.size > maximumStates) throw new Error(`dynamic typography key states ${keys.size} > ${maximumStates}`);
  const start = Math.min(...tracks.map((track) => track.keys[0]!.frame));
  const end = Math.max(...tracks.map((track) => track.keys.at(-1)!.frame));
  const available = maximumStates - keys.size;
  if (available > 0 && end > start) {
    const step = (end - start) / (available + 1);
    for (let index = 1; index <= available; index += 1) keys.add(Math.round(start + step * index));
  }
  return [...keys].sort((a, b) => a - b).slice(0, maximumStates);
}
