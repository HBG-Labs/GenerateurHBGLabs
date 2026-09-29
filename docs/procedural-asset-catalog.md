# Procedural asset catalog

All entries are closed registry IDs at version `1.0.0`. “Structured” means a dedicated component resolver; “generic structured” means a reusable component surface, not a claim of bespoke illustration quality.

| Family | Variants | Resolver | Main components | Affordances | Cost | Current limitation |
|---|---|---|---|---|---|---|
| `UI_CARD` | metric, feature, status, chart | structured | group, surface, label, value, badge, icon, chart | assemble, focus, extract, expand, carry | low | no arbitrary widget tree |
| `APP_SCREEN` | phone, feature | structured | surface, navigation rail, title, focus card, action | product choreography | medium | synthetic UI only |
| `DASHBOARD` | chart, metric | structured | shell, nav, metric card, focus chart | product/data choreography | high | bounded panels and charts |
| `DATA_CHART` | bar, line, donut | structured line/data system | surface, title, value, grid, series, focus | draw, grow, focus, extract series | medium | line treatment is most complete |
| `COUNTER` | metric, status | data surface | metric/value hierarchy | data choreography | low | no locale-aware live data source |
| `GENERIC_SMARTPHONE_FRAME` | phone | structured | body, screen, header, card, chart, indicator | product hero, carry, reassemble | high | generic silhouette, no branded hardware |
| `PANEL` | feature, status | generic structured | surface, title, label, rule, anchor | product hero | low | no arbitrary panel schema |
| `BROWSER_FRAME` | browser | generic structured | frame surface and semantic content slots | product hero | medium | simplified browser chrome |
| `GENERIC_PRODUCT_FRAME` | product | generic structured | product surface, label and anchor | product hero | medium | conceptual, not photorealistic |
| `PROCESS_DIAGRAM` | process | structured data/diagram | nodes represented by data surface, paths and focus | data hero | medium | general graph layout is future |
| `LIGHT_SYSTEM` | atmosphere | structured environment | field, glow, rays, seeded particles | environment focus | medium | no volumetric light |
| `PARTICLE_FIELD` | atmosphere | structured environment | bounded seeded particles and depth roles | environment focus | medium | graphic particles, no physics |
| `ORBIT_SYSTEM` | orbit | structured environment | field, paths and semantic anchors | environment/data focus | medium | no true 3D orbit |
| `POSTER_FRAME` | editorial | generic editorial system | frame, headline, metadata, divider, motif | editorial recompose | medium | subject/image slot unresolved |
| `DECORATIVE_SYSTEM` | grid, orbit | generic structured | primary surface, rule and decorative anchor | editorial/environment | low | intentionally supporting, not HERO art |

Component IDs are derived from asset ID and local semantic role. Variant, density, hierarchy and material parameters are bounded; no runtime download or untrusted SVG is used.
