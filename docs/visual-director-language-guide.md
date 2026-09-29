# Visual Director language guide

This guide describes the vocabulary a future provider-agnostic Visual Director
may select. It is not a provider prompt and does not authorize P3.3.

## Available now

### Layout and focus

Use registered layout strategies, one primary HERO by default, explicit visual
focus, hierarchy roles, negative space, and entry/exit anchors. Sequence-level
variation matters more than maximizing effect count.

### Patterns and phrases

Select only active registry IDs. High-value supported families include kinetic
word impact, dynamic tracking/axes, editorial split, vector assembly, causal
diagram/path reveal, shape-to-mask, frame expansion, foreground occlusion, depth
parallax, overlap/follow-through, and visual breath.

### Continuity

Prefer transformation over replacement when semantics justify it. Supported
choices include match position/scale, element carry, color continuity, shape
masking, persistent entities, anchors, and bounded camera continuity. Preserve
identity and scene scope across every bridge.

### Camera and depth

Camera is purposeful staging: push, punch, depth surge, follow approximation, and
settle. Depth uses explicit foreground/midground/background relationships and
different parallax factors. No true 3D camera is available.

### Morph and causality

Use semantic morph chains and topology-compatible parametric morphs only. Express
causal motion with named events and `TRIGGERS`, `FOLLOWS`, `OVERLAPS`, `PREPARES`,
or `REVEALS` relations.

### Asset roles

Refer to `SUBJECT`, `PRODUCT`, `UI_SURFACE`, `TYPOGRAPHIC_HERO`, `DATA_MARK`,
`DECORATIVE_OBJECT`, `ENVIRONMENT`, `FOREGROUND`, and `BACKGROUND`. Never invent
an asset path or treat generated text as a source asset.

### Motif, intensity, and pacing

Declare intentional motifs so reuse is distinguished from repetition. Alternate
intensity and pacing: build, impact, breath, hold, and payoff. A premium sequence
does not require everything to move.

## Available but simplified

`PATH_CONTINUE`, `TYPE_SCALE_THROUGH`, `WORD_TO_MASK`, `CIRCLE_TO_PORTAL`, and
some camera follow/zoom behaviors must remain marked `SIMPLIFIED`. A future
Director may select them only when policy permits warnings and must not describe
them as arbitrary morphs or a general compositor.

## Unsupported/future

- arbitrary per-character/per-cluster choreography;
- general path-follow;
- arbitrary geometry/mesh morph;
- general overlapping inter-scene compositor;
- true 3D camera, mesh, materials, lighting, particles, physics;
- generated assets, image understanding, audio, and Visual Critic.

Unsupported IDs must never appear as available choices. Future structured output
must constrain pattern, phrase, bridge, camera, asset-role, and capability enums
to the active registries, followed by local validation and targeted repair.

## Selection hierarchy for P3.3

A future Director should decide from largest scale to smallest:

1. `SequenceStrategy`: build, contrast, breath, escalation and payoff;
2. scene focus, hierarchy, negative space and asset roles;
3. `TechniqueComposition`: coordinated multi-pattern language;
4. registered patterns, MotionPhrases, bridges and camera intents;
5. bounded parameters such as intensity, direction, timing and depth.

It must not start by selecting a bag of effects.

## Supported TechniqueCompositions for Director use

The following normalized compositions are compatible with current P3.2 in full
or in a clearly constrained subset:

- `PERSISTENT_GUIDE_THROUGH_PRODUCT` — persistent entity, layout/camera follow,
  supported feature handoffs, CTA settle;
- `BUILD_COMPLEXITY_BREATH_PAYOFF` — global intensity and complexity arc;
- `BRAND_MOTION_RECIPE_SYSTEM` — supported registry choices under a versioned
  style/motif/restraint policy (the profile contract itself is future P3.3);
- `UI_DEPTH_CAMERA_FOCUS` — only with generic approved UI surfaces and existing
  2.5D camera/depth behaviors;
- `DATA_TO_CHARACTER_STORY` — only with current vector/diagram components;
- `TYPE_STATE_TO_TRANSITION` — dynamic run axes/tracking are supported, while
  true glyph masks and cluster choreography remain unavailable.

## Asset dependency gate

Every selected composition must declare one of:

- `PROCEDURAL_ONLY`;
- `EXTERNAL_ASSET_OPTIONAL`;
- `EXTERNAL_ASSET_REQUIRED`;
- `TRUE_3D_REQUIRED`.

P3.3 may use only assets already approved and bound. It may not invent paths,
claim subject isolation, or select a composition whose required asset/system is
unavailable. `POSTER_DECONSTRUCT_RECOMPOSE`, `MIXED_MEDIA_COHERENCE_SYSTEM`,
`PRODUCT_FEATURE_TO_VISUAL_METAPHOR` with a real product, and
`TRUE_3D_PRODUCT_REVEAL` remain unavailable without their respective systems.

## Cross-category principles mined from the corpus

- use transformation to preserve identity when the semantic relation is real;
- use restraint and static holds as first-class choices;
- make camera serve focus, product, depth or transition—not constant activity;
- treat type as hierarchy and geometry, but preserve P1.7 shaping authority;
- coordinate palette, material and motif when switching asset languages;
- use UI/data motion to explain state and causality rather than decorate cards;
- choose an intentional cut when continuity would be dishonest;
- define one sequence arc, not a list of independent scene effects.

## Still unsupported after benchmark expansion

Public references do not change runtime truth. General overlapping scene
composition, arbitrary path/morph, safe per-cluster choreography, true 3D,
unapproved external assets and audio coupling remain absent. The structured
output schema must exclude them, not rely on prompting to discourage them.
