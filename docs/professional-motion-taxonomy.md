# Professional motion taxonomy

The taxonomy names reusable visual language, not artworks or author styles. A
technique atom is minimal; a `TechniqueComposition` combines atoms whose quality
depends on their coordination.

## Motion

- kinetic typography: run/word reveal, tracking, variable-axis emphasis,
  clipping, type-as-frame, type-as-mask;
- transformation: parametric morph, semantic morph, assembly/disassembly,
  extreme scale, layout transformation;
- choreography: anticipation, impact, overlap, stagger, follow-through, settle,
  hold, rhythmic contrast, visual breath;
- causality: `TRIGGERS`, `FOLLOWS`, `OVERLAPS`, `PREPARES`, `REVEALS`.

Per-character/per-cluster choreography remains future unless shaping-safe cluster
data is available. Arbitrary geometry morph is separate from semantic morph.

## Composition

- `CENTER_HERO`, `ASYMMETRIC_HERO`, `EDITORIAL_SPLIT`, `FULL_BLEED`;
- layered poster, depth stack, diagonal flow, radial focus, grid stagger;
- nested frame, UI depth stack, product hero, typography-led scene;
- evolving layout rather than one static slide per scene.

## Transitions and continuity

- match position/scale/shape;
- mask or shape expansion;
- type, object, color, path, or camera continuity;
- element carry, portal, zoom-through, frame expansion;
- intentional impact/contrast/rhythm cut;
- bounded cross-scene overlap where both scenes coexist.

`FOREGROUND_OBJECT_WIPE_BRIDGE` normalizes any foreground object that crosses the
frame, occludes it, and reveals the next composition. Subject and color are
parameters, not new patterns.

## Camera

- push, pull, pan, follow, punch, settle, zoom-through;
- orbit simulation in 2.5D versus true 3D orbit;
- momentum continuity across scenes;
- camera tied to a persistent entity or validated path.

## Compositing

- foreground occlusion and typography behind subject;
- nested mask/frame and moving matte;
- product/UI layer interaction;
- split reveal and depth overlay;
- general inter-scene compositor as a distinct future capability.

## Assets

- typography, procedural vector, illustration, photography, UI, product,
  character, 3D object, environment, texture;
- roles are generic: `SUBJECT`, `PRODUCT`, `UI_SURFACE`, `DATA_MARK`,
  `DECORATIVE_OBJECT`, `BACKGROUND`, `FOREGROUND`.

## Domain languages

### `UI_MOTION`

Device hero, UI card extraction, card-to-scene, scrolling/focus, counters,
charts, dashboard layers, product-to-interface handoff.

### `POSTER_MOTION`

Poster deconstruction, subject isolation, type recomposition, decorative layer
expansion, palette preservation, foreground wipe, poster reassembly.

### `PRODUCT_MOTION`

Product hero, orbit, feature callout, conceptual exploded view, camera reveal,
product persistence, product-to-interface/CTA handoff.

### `EXPLAINER_MOTION`

Causal diagram, process, comparison, data, path explanation, semantic
transformation, visual proof.

### `EDITORIAL_MOTION`

Oversized type, crop, asymmetric grid, image/type overlap, negative space,
magazine transition, restrained pacing.

## Motion signature

A signature uses descriptive values (`UNOBSERVED`, `LOW`, `MEDIUM`, `HIGH`,
`UNKNOWN`) for continuity, transformation density, camera, depth, typography
integration, asset richness, and causal chaining. It is not a quality score.

Complexity may be `SIMPLE`, `COMPOSED`, `MULTI_LAYER`, or
`HIGHLY_CHOREOGRAPHED`. Asset dependency is `PROCEDURAL_ONLY`,
`EXTERNAL_ASSET_OPTIONAL`, `EXTERNAL_ASSET_REQUIRED`, or `TRUE_3D_REQUIRED`.

## Five language levels

The expanded corpus is normalized at five levels so a future Director does not
mistake an effect for a sequence strategy:

1. **Primitive** — transform, mask, clip, path, shaped type run, dynamic axis,
   camera/depth, color, texture, true-3D geometry/light.
2. **Pattern** — type as geometry, foreground occlusion, UI depth stack,
   product hero, data highlight, collage recomposition, persistent handoff.
3. **MotionPhrase** — anticipation/impact/settle,
   prepare/transform/crossover/reveal/settle, camera-follow/focus/settle,
   build/breath/payoff.
4. **TechniqueComposition** — coordinated patterns such as UI depth + camera
   focus + card extraction, or palette + texture + motif continuity across mixed
   media.
5. **SequenceStrategy** — multi-scene progression such as progressive
   complexity, feature build to payoff, motif evolution, or dynamic/breath
   contrast.

The machine-readable closure is in
`references/motion/normalized-language-index.json`.

## Expanded transition language

- boundary-state bridge: matched position/scale/color/entity state;
- occlusion bridge: foreground/object/matte covers the boundary;
- field bridge: color, gradient, texture, or type field becomes the next space;
- portal/frame bridge: a bounded frame becomes viewport or environment;
- information bridge: data/UI element changes role while identity persists;
- material bridge: surface, texture, or light carries continuity;
- intentional cut: impact, contrast, rhythm, or semantic discontinuity;
- general overlapping compositor: still future/unsupported.

## Expanded camera language

The observed public case studies extend the vocabulary beyond named moves:

- focus transfer between UI/product layers;
- camera bound to a persistent entity;
- cinematic macro/detail reveal;
- environment-scale navigation;
- multi-screen/large-format staging;
- momentum carried into a bridge;
- restrained or static camera as a deliberate choice;
- true perspective/orbit/lighting only in the future 3D system.

## Asset and material language

Asset classes are now separated from surfaces:

- asset: procedural vector, icon system, UI component, data graphic, vector
  illustration, character, photography, subject cutout, poster layer, product
  image/render, paper model, 3D object, environment, texture;
- surface: flat, gradient, paper, grain, collage, glass, textile, metallic,
  tactile, luminous, photographic/photoreal, organic, dimensional.

Material richness is not a motion primitive. It depends on an asset/material
system and renderer support, while the Visual Director chooses where it serves
hierarchy and narrative.

## Art-direction versus motion

The corpus repeatedly separates three responsibilities:

- **Motion Engine:** executable, deterministic transformation and validation;
- **Asset/Renderer:** visual matter, layers, masks, texture, material and true
  compositing capability;
- **Visual Director:** hierarchy, restraint, motif, contrast, pacing, choice of
  TechniqueComposition and sequence strategy.

Adding another primitive cannot repair incoherent palette, weak scale hierarchy,
poor negative space, or indiscriminate motion.
