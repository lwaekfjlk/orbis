# 13.1.0 — A sharper map, and places worth naming

- Terrain refinement follows the camera: a grid cell is subdivided up to eight ways once it
  covers enough screen, so relief stops reading as a fan of flat triangles. Refined vertices
  sample the same parent surface — more triangles, the same landscape.
- Terrain carries per-vertex shading normals from one continuous field, so coarse and refined
  patches meet without a seam and slopes read as ground rather than facets.
- The map renders above CSS resolution (at least 1.6x on a 1x display), bounded by a pixel
  budget. The software fallback keeps its old ceiling.
- Seven legendary places are named from the finished physical model — The Dragonwell at the
  greatest river's headwater, The Skymirror on the highest standing water, The Nightspire,
  The Drowned Choir, The Emberthroat, The Weeping Stair, The Hollow Crown. Each carries its
  lore and the measurement it was chosen by, and appears as a gilt map marker, a name, a
  search hit and a detail card. A world without the landform simply has no legend there.
- The **Legends** toggle sits with Names, Borders and Rivers.
- New checks: refinement bounds and parent-surface parity in `tests/continuous.test.mjs`;
  legend derivation and render resolution in `tests/onemap.test.mjs`.

---

# 13.0.0 — Continuous Atlas

- One original canvas, coordinate reference and renderer for world, towns and buildings.
- Original surrounding terrain remains visible; no city diorama transition.
- Worker-backed bounded city mesh streaming, regional silhouettes and near architecture.
- Exact shared terrain surface and rigid foundation seating.
- Pointer-anchored wheel zoom, camera-only city/building focus, in-place picking and details.
- Regeneration, saved worlds, annual history and geography-first city placement retained.
- New regression suite: `tests/continuous.test.mjs` and `tests/continuous_browser.py`.

---

## Earlier versions (historical notes)

# Citadel Studies / 11.0.0

- Terrain-constrained highland parcel reservation before street layout.
- Defensive envelope, towers and gate approaches connected to existing roads.
- Nine reusable civic precincts and finer ordinary building ensembles.
- Original full-screen map, simulation and regeneration retained.
- **Structural prototype only: the approved cinematic art target is not reached.**
- Current report: `docs/VERIFICATION_CITADELS.md`; older entries below describe historical versions.

## 10.0.1 — Regenerated civilizations are visible

- Default new/loaded worlds to Realms and reset hidden civilization toggles.
- Keep optional settlement and border geometry visible on Landscape as well.
- Include settlement labels and measured generation counts in the existing shell.
- Verify model-to-renderer binding; handle errors without publishing half a world.
- Preserve the prior complete map, camera and timeline when a replacement fails.
- Add visibility regression tests, sequential generation and fault-injection tests.
- No changes to procedural geography, settlement, polity or town generation.

# Changelog

## 9.1.0 — Geography survives the city transition

- Added a read-only world-to-town environment adapter and shared landscape palette.
- Preserved per-sample biome, temperature, water, ice and source coordinates through detail generation.
- Added sampled surroundings with matched boundaries, Settings view and source-cell navigation.
- Corrected the hot-desert-first architecture heuristic; integrated glacial foothill context.
- Ground colors no longer depend on architecture recipe or its random seed.
- Local ecology controls vegetation and cultivation; glacier parcels are not buildable.
- Compatible legacy recipe adaptation has stable round-trip fingerprints.
- Added eight environment model regressions and an offline browser regression.

No change to the natural-world generation or the civilization simulation's rules/state.

## 10.0.0 — One Map
- One full-screen map replaces the default three-column dashboard and local editor pages.
- Shared simulation/regeneration bar stays visible in world, town and landmark scenes.
- Search, map layers, Chronicle, save/load and detailed editors open only on demand.
- Explicit nonmodal drill-down and Back preserve the original world camera.
- Regeneration proposes a fresh seed but requires Generate; cancellation is inert.
- Annual batch UI yields and a lock prevent overlapping operations.
- Geography, settlement/state formation, local terrain inheritance, recipes and model geometry are unchanged from 9.1 (14 SHA-256 baselines checked).
- Added UI regression tests, mobile viewport checks and a robust self-contained build.
