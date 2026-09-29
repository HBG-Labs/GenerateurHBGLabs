# Procedural material catalog

Material recipes are deterministic combinations of existing layers. They are not shaders and do not accept arbitrary CSS.

| Material | Status | Layer intent | Notes |
|---|---|---:|---|
| `FLAT` | supported | 1 | single tokenized surface |
| `GRADIENT_LAYERED` | supported | 3 | layered token fields; not a native continuous gradient |
| `SOFT_SHADOW` | supported | 2 | bounded offset support layer |
| `BORDERED` | supported | 1 | emphasized tokenized stroke |
| `PAPER_LIKE` | simplified | 2 | matte/layered approximation; no raster fibre texture |
| `GLASS_LIKE_SIMPLIFIED` | simplified | 3 | opacity/layers/border; no backdrop blur |
| `LUMINOUS` | supported | 3 | controlled accent glow layers; no shader |
| `MATTE` | supported | 1 | opaque restrained surface |

The active implementation is designed for Chromium/Linux determinism. Blend modes, native motion blur, arbitrary grain shaders and expensive filters remain future capabilities.
