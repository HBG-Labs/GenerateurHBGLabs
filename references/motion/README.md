# Motion reference research

This directory contains research metadata and abstract analyses only. It is not a
product asset library and is never imported by Visual Core, Visual Compiler, P1,
or the renderer.

## Layout

- `reference-manifest.json`: stable reference IDs and availability;
- `corpus-expansion.json`: 35 retained public case studies, grouped by research wave;
- `normalized-language-index.json`: deduplicated language levels, frequencies,
  TechniqueCompositions, and current-engine mappings;
- `analyses/`: structured, non-artwork descriptions;
- `schemas/`: strict research-data contracts;
- `motion-language-gap-map.json`: normalized engine/director/asset gaps;
- `media/`: optional local reference media, ignored by Git.

Reference media is untrusted, local-only research material. Do not commit,
redistribute, execute, or use it as a generated-video asset. A reference may be
promoted from `METADATA_ONLY` to `TIMECODED_LOCAL` only after a human-authorized
local copy has been inspected and its provenance recorded. `PUBLIC_CASE_STUDY`
allows only claims explicitly made on an attributable creator/studio/feature
page; it never authorizes invented shot timing or authoring-tool claims.
