import path from 'node:path';

import {
  compileMotionScene,
  hashDocument,
  P13_BEHAVIOR_REGISTRY,
  validateSpec,
} from '@motion-engine/core';
import type { MotionSceneSpec, RenderPlan, ResolvedStyle, TemporalResolution } from '@motion-engine/core';
import { resolveTemporalPlan } from '@motion-engine/core';

import { fontResources, nocturne, pattern, platforms, signal } from './p1.2-support.ts';
import { CORE, FONT_LIBRARY, readJson } from './support.ts';

export interface P13Pipeline {
  spec: MotionSceneSpec;
  specHash: string;
  signalStyle: ResolvedStyle;
  nocturneStyle: ResolvedStyle;
  signalPlan: RenderPlan;
  nocturnePlan: RenderPlan;
  signalTemporal: TemporalResolution;
  nocturneTemporal: TemporalResolution;
}

function validSpec(): MotionSceneSpec {
  const raw = readJson('fixtures/p1.3/motion.spec.json');
  const style = signal();
  const result = validateSpec(raw, style, { registry: P13_BEHAVIOR_REGISTRY });
  if (!result.ok) throw new Error(`Spec P1.3 invalide : ${JSON.stringify(result.issues)}`);
  return result.value;
}

export function buildP13Pipeline(): P13Pipeline {
  const spec = validSpec();
  const signalStyle = signal();
  const nocturneStyle = nocturne();
  const base = {
    spec,
    platformPresets: platforms(),
    pattern: pattern(),
    config: { fps: 30, render_scale: 0.5 },
    behaviorRegistry: P13_BEHAVIOR_REGISTRY,
  } as const;
  const signalPlan = compileMotionScene({
    ...base,
    resolvedStyle: signalStyle,
    fontResources: fontResources(signalStyle, path.join(CORE, 'test-fixtures', 'fonts')),
  });
  const nocturnePlan = compileMotionScene({
    ...base,
    resolvedStyle: nocturneStyle,
    fontResources: fontResources(nocturneStyle, FONT_LIBRARY.libraryRoot),
    allowStyleSubstitution: true,
  });
  const temporalInput = { spec, fps: 30, registry: P13_BEHAVIOR_REGISTRY } as const;
  return {
    spec,
    specHash: hashDocument(spec),
    signalStyle,
    nocturneStyle,
    signalPlan,
    nocturnePlan,
    signalTemporal: resolveTemporalPlan({ ...temporalInput, resolvedStyle: signalStyle }),
    nocturneTemporal: resolveTemporalPlan({ ...temporalInput, resolvedStyle: nocturneStyle }),
  };
}
