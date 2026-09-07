# 13.4.0 — Lakes with a shoreline, and a roof on the ranges

Two landform priors. Unlike everything since 13.0.0, these move the world: `physicalFingerprint`
goes `dfd91476` → `4b02963c` and `settlementFingerprint` `77c3b21f` → `73c1127f`, by design.

- **Basin lakes were discs.** The interior depressions were carved as exact ellipses with a
  smooth quadratic floor and 18 m of noise inside a 700 m bowl, so the water filled to the
  contour of the bowl and nothing else. Measured over two worlds, every lake sitting in one
  came out at **0.59–0.60 circularity** where real lakes run 0.15–0.5. The rim now wanders with
  bearing and the floor carries real relief, so the water finds bays, headlands and islands:
  **0.36**, with the largest lakes at 0.28–0.43.
- **There was no plateau anywhere, so there was no high-altitude climate.** Collision built
  ranges and nothing else: of 2426 cells above 2000 m, **1** had local relief low enough to
  read as a plateau, and `Alpine meadow` only ever appeared as ribbons along ridge crests.
  The interiors of the widest collision belts are now planed into uplands — valleys filled to
  the roof, isolated spires cut back to a fraction of what rises above it, great peaks left
  standing on the rim, the way Tibet sits behind the Himalaya. Three per world, and flat high
  ground goes from 1 cell to **132**, carrying cold desert, alpine meadow, tundra and ice.
  Placed before climate, so an upland casts its own rain shadow rather than having one
  painted on.
- Several tests were measuring the world by address rather than by property, and a landform
  prior is exactly what exposes that. A hardcoded province id that stopped being a town, a
  town count, "the tallest building" (0.37 atlas units in nine towns of ten and 1.25 in the
  one with a cathedral), "the first non-landmark building in the array" (0.026 to 0.148
  across eight towns), a hull's cell found by rounding x and y separately onto a headland
  it was 599 m of water away from, and "all fifteen traditions appear in *this* seed" — all
  now ask for the thing they were actually checking.
- New checks: lake circularity and plateau flatness, and that high flat ground is classified
  as a cold high climate, in `tests/onemap.test.mjs`.

---

# 13.3.1 — A town is many houses

- **Every building in a town was still the same colour.** 13.3.0 gave each tradition a
  climate tone, so a cold town and a hot one of the same family finally differ — but within
  one town, every wall was still one hue. Measured across five towns: 2-6 degrees of hue and
  8% of brightness, one house at slightly different exposures, repeated. Each house now takes
  one of the town's building materials before it weathers — the stock it is built from, a
  limewashed version, a warmer fired earth, a colder weathered stone, a deeper tint of the
  base. This runs inside `weather()`, so it lands on the climate-toned palette: a hot dry
  town's five materials are variations of *its* whitewash, not of the tradition's generic
  stock. `ArtisanCityKit.blockClimate` and `blockPaint` are now the one place the
  climate-then-weather composition lives, so the detailed mesh and the silhouette cannot
  drift apart. Wall saturation spread ±0.054 to ±0.157 on a desert town, roofs ±0.031 to ±0.167,
  wall hue ±2.4° to ±12.2°.
- **The regional silhouette was worse: two colours for the whole world.** Between zoom 4.8 and
  18 — the range a whole town is actually read in — every building in every town shared one
  hardcoded beige wall and one slate roof, and the wall did not even ask which town it stood
  in. Each silhouette now takes the same paint the detailed mesh gives that same building, so
  closing in changes the geometry and not the colour of the town.
- Colour spread per town, and the silhouette matching the detail, are asserted in
  `tests/artisan.test.mjs` and `tests/continuous.test.mjs`.

---

# 13.3.0 — Climate-conditioned atlas

- One shared resolver, `CityEnvironment.climate`, drives ground colour, vegetation and architecture from the existing temperature/aridity/ice fields, so map and town agree by construction.
- Ground colour grades continuously inside each biome. The flat 40% khaki blend over all five forest biomes is gone: boreal and tropical forest were ~5/255 apart and are now ~40.
- Vegetation has seven climate-chosen forms with a temperature-driven treeline. Savanna, tundra, dry steppe and alpine meadow carry cover for the first time; tropical rainforest no longer draws conifers.
- Every town tradition now adapts to its own site: roof pitch and form, eave depth, opening area, chimneys, stilts, wall material and palette are read per block, not per town.
- Two traditions added for the extremes — **Boreal Log Town** (`taiga`) and **Monsoon Stilt Town** (`monsoon`) — with their own grammars, block kits and palace precincts. Fifteen families in total.
- A −1.3 °C site is no longer built as a Mediterranean limestone courtyard town.
- New regression suite `tests/climate.test.mjs` (`npm run test:climate`) locks colour separation, the treeline, the house response and same-tradition divergence.
- `physicalFingerprint` and `settlementFingerprint` are unchanged: this changes how the world is drawn, not what it is.
- Incidental: repaired two stale references in `tests/continuous_browser.py` that predated this work (a renamed town, and a hardcoded sanctuary province id now looked up dynamically).

---

# 13.2.2 — No paint on the borders, and symbols that stay symbols

- **The border band is gone.** 13.2.1 replaced the full-territory wash with a soft tint just
  inside each border; it was still paint over the land and read badly. The political layers
  now paint nothing. Every border already carries a cased frontier line — dark casing, pale
  centre — and that plus the country's name is the whole of the country on this map. Only the
  realm you have selected takes a faint wash, so clicking a row still answers "where is it".
  Land outside every province is no longer greyed there either: no province means no country.
  Faiths, peoples, wealth and magic are untouched; there the colour is the measurement.
- **The harbour symbol no longer dwarfs the harbour.** Measured against the largest town on
  the default world — 3.69 atlas units across, tallest building 1.25, a person 0.043 — the
  port symbol ran 1.52 x 0.96 on the ground and 0.80 high: 41% of that town's width, with a
  moored sail 64% the height of the largest thing anybody had built. Halved, to 21% and 32%.
- **Ships were the same mistake with a clearer cause.** A hull and a cart reach the same
  drawing call with the same size, but the hull's factors ran 2x the cart's length and 5.4x
  its height, so one ship on a sea lane spanned a fifth of a whole town and stood half the
  height of its tallest building. The factors now agree: a tenth of a town, and it keeps its
  mast.
- Symbol scale is measured against a real town, and the port handover asserted, in
  `tests/roads.test.mjs`.

---

# 13.2.1 — Country names, closed walls, and the continents back

- **Every continent gets its name back.** 13.1.0 listed the seven legends ahead of the
  continents in the label packer, and three continent names lost the box race — the world
  read as four continents when it has seven. Continents are placed first again; wonders
  still outrank towns.
- **Countries are no longer painted over the land.** The realms and diplomacy layers laid a
  full-territory wash over every province. They now tint only the couple of cells inside
  each border, so relief, rivers and coasts read through and the name carries the identity —
  the way a printed atlas does it. Faiths, peoples, wealth and magic keep their full wash;
  there the colour is the measurement, not a flag.
- **A country's name sits over its territory**, at the centre of mass of the land it holds
  rather than stacked on its capital, and its four largest cities are labelled under it in
  ordinary town type.
- **Walled towns close their ring.** Not one of 24 walled towns enclosed itself: every reason
  the enceinte stopped collapsed into "water" and was left as a silent hole — a harbour front,
  a lane running alongside the wall, and a hull reaching a few units past the tile margin all
  read as sea. Waterfront runs now carry the quay section `defenses.quays` was always meant to
  hold, a run no gateway will span goes back to curtain, and the tile margin is not a reason
  to stop. 135 walled towns across three seeds: all enclosed, no opening wider than a gate.
- New checks: ring closure in `tests/towns.test.mjs`; political-layer coverage and continent
  label priority in `tests/onemap.test.mjs`.

---

# 13.2.0 — Roads, ports and the peoples on them

- Land routes between settlements, derived from one multi-source search over the unchanged
  raster: bridges only on real channels, never a metre of road over open water.
- Trunk roads emerge from modelled traffic across the network, not from settlement size.
- Working waterfronts at both scales: quay symbols on the atlas, and quays, jetties, moored
  hulls, sheds, a derrick and a beacon inside a town that has genuine shore.
- Walking figures of the world's seven peoples, each one a sample of its province's live
  population mixture. Appearance differs; speed, routes and capability do not.
- Residents on a town's own streets and door connectors; carts, riders and hulls on the
  roads and the sea lanes the simulation already computed.
- New **Roads & ports** and **Townsfolk** toggles. Figures animate on WebGL2 and hold
  position on the Canvas software fallback or under prefers-reduced-motion.
- Nothing here feeds back into the simulation: physical, settlement and political
  fingerprints, the save format and `city.fingerprint` are all unchanged.
- New regressions: `tests/roads.test.mjs` and `tests/folk.test.mjs`; notes in
  `docs/ROADS_PORTS_FOLK.md`, measurements and limits in
  `docs/ROADS_PORTS_FOLK_VERIFICATION.md`.

---

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
