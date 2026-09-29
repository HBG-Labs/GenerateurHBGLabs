# Motion language gap map

Baseline: P3.2 commit `5a25897f0364083d5ecfa8c21015f8c709b22a74`.
The machine-readable map is `references/motion/motion-language-gap-map.json`.

## Current high-value coverage

P3.2 already supports high-reuse language that must not be rediscovered:

- run-safe dynamic tracking, `wght`, and `wdth` with HarfBuzz authority;
- semantic shape-to-mask, frame expansion, match position/scale, element carry;
- causal path draw, vector assembly, diagram flow, overlap/follow-through;
- foreground occlusion, type behind subject, depth parallax;
- persistent visual entities, continuity anchors, camera continuity;
- six layout strategies used in the certified reference;
- deterministic preflight, registry closure, complexity limits, replay, and
  cross-process hashes.

## Partial and simplified language

| Capability                     | P3.2 state                   | Missing quality                                              | Primary owner   |
| ------------------------------ | ---------------------------- | ------------------------------------------------------------ | --------------- |
| `PATH_CONTINUE`                | simplified                   | actual path-state handoff and trajectory continuity          | engine          |
| `TYPE_SCALE_THROUGH`           | simplified                   | type remains a continuous framing/scene element              | engine/renderer |
| `WORD_TO_MASK`                 | simplified                   | glyph/run-driven mask transformation rather than scale proxy | engine/renderer |
| `CIRCLE_TO_PORTAL`             | simplified                   | coordinated camera/mask/depth passage                        | engine/renderer |
| camera follow/zoom             | bounded approximation        | pan/pull/path momentum and wider safe movement               | engine          |
| parametric morph               | narrow topology allowlist    | broader compatible vector families                           | engine          |
| UI/product/poster compositions | generic building blocks only | domain TechniqueCompositions and asset parts                 | asset/director  |

## Priority A — high impact, high reuse

### A1. Art direction and motion-identity recipes

Across branding, product, broadcast and social references, the recurring need is
not another isolated primitive but a versioned rule system for motif, hierarchy,
restraint, variation and sequence contrast. P3.2 already contains the necessary
closed registries and deterministic preflight; selection belongs to P3.3.

### A2. Procedural Asset Grammar and material roles

Asset-language switching appears in 12 retained references, texture/material
language in 11, mixed-media compositing in 7 and character/illustration motion
in 7. Define provider-free layered vector illustration, UI/device shells,
diagrams, decorative systems, texture/material roles and approved bindings.
This is a separate data/validation layer using P1 asset security—not additional
MotionPhrases and not executable SVG/JSX.

### A3. UI/product composition language

Nine references use UI or product narrative. P3.2 has generic building blocks,
but reusable TechniqueCompositions are missing for card extraction, UI depth,
device persistence, focus transfer, data reveal and product-to-CTA handoff.
P3.3 can select the supported subset while procedural UI/data assets evolve.

### A4. Complete type/mask/portal continuity

Finish the most visible simplified resolvers as a coherent transformation family:
`WORD_TO_MASK`, `TYPE_SCALE_THROUGH`, and `CIRCLE_TO_PORTAL`. These are already
versioned concepts, have high reuse, and directly address the human observation
that transformations remain too simple. This remains a bounded P3.2.x candidate,
but the expanded corpus does not demonstrate it as a prerequisite for P3.3.

### A5. Material/texture compositing boundary

Define a closed vocabulary for texture, matte, photographic layer and material
intent plus deterministic cost/capability metadata. Renderer changes require
cross-platform proof; many gaps are asset-binding or art-direction gaps rather
than new primitives.

### A6. Timecoded evidence before major P1/renderer change

The public case studies support family-level frequencies, but they cannot prove
overlap duration, easing, path geometry or exact causal order. Authorized local
timecoded inspection remains mandatory before approving a general compositor,
arbitrary morph or other substantial P1 change.

## Priority B — important, non-blocking

- inter-scene overlap compositor investigation, only after timecoded evidence;
- general path-follow with validated sampling, orientation, and safe bounds;
- broader but still topology-controlled vector morphing;
- UI Motion compositions: card extraction, chart assembly, device persistence;
- poster semantic layer/deconstruct/reassemble contracts;
- material richness: deterministic texture, gradient, light, shadow, and matte;
- Visual Director choices for motif, restraint, pacing contrast, and variation;
- data/information compositions: counters, charts, icons and comprehension-first
  pacing;
- additional references for still-low categories: architectural motion,
  fashion/editorial, logo-only motion and complex character rigging.

## Priority C — specialized/future systems

- arbitrary geometry morph and mesh deformation;
- true 3D scene, material, lighting, perspective, particles, physics, volumetrics;
- character rigging and complex articulated motion;
- Sound Director and sound-motion coupling;
- multimodal Visual Critic and targeted visual repair.

## Engine versus direction

- **ENGINE**: missing deterministic operation or validated bridge state.
- **VISUAL_DIRECTOR**: selecting when to transform, hold, simplify, contrast, or
  reuse a motif.
- **ASSET_SYSTEM**: visual material and layer parts unavailable to animate.
- **RENDERER**: compositing, geometry, or effect cannot be passively drawn.
- **3D/AUDIO**: separate future systems.

Do not add an engine primitive to repair weak hierarchy, palette, negative space,
or timing choices. Do not ask a future model to fake missing path, compositor,
or morph support.

## Frequency and confidence

The expanded corpus contains 35 attributable public case studies plus five
anchors. Reference-level frequency is now published in
`normalized-language-index.json`: asset-language switch 12, texture/material
11, mixed 2D/3D 9, UI/product narrative 9, motion identity 8, true 3D/cinematic
depth 8, and seven references each for camera/depth, modular systems,
character/illustration, restraint and mixed-media compositing.

These are exact assignments within the retained corpus, not shot counts or
quality scores. Timecoded frequency remains unknown.

## Updated readiness consequence

The broader corpus does **not** demonstrate one missing engine primitive that
blocks almost every premium result. Instead it exposes three parallel ceilings:

1. asset/material richness (`ASSET_SYSTEM` / `RENDERER`);
2. sequence strategy and motion-identity choice (`VISUAL_DIRECTOR`);
3. a smaller set of bounded engine simplifications.

Therefore the vocabulary is sufficient for a constrained P3.3 Visual Director
to add substantial value now. Unsupported IDs remain unavailable, and the asset
ceiling must stay explicit.
