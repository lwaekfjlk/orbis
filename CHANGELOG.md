# 13.4.0 — A vocabulary, not fifteen bundles

- Town architecture is **composed** from four orthogonal axes instead of picked as a
  bundle: eave form, wall material, colourway and ornament are each chosen separately.
- **Ten roof/eave forms** (was four): the original gable, hip, leaf and northern plus
  upturned tile on bracket sets, deep straight eave on exposed rafters, parapet terrace,
  barrel vault, felted cone and rock-cut face. All ten are reachable and none takes more
  than 29% of the world; a town averages 2.4 of them.
- **Nine wall materials** (was five): log, timber, thatch, adobe, masonry plus fired
  brick, ashlar, rock-cut and felt, each with its own construction detail.
- Weather picks the construction — snowy resolves to steep shingle over log, monsoon to
  deep thatch, desert to a parapet terrace over mud brick — and the roof carries the
  material's own colour rather than one shared paint pot.
- **The seat of government answers to its realm and its faith**, not only to its weather:
  seven realm archetypes give seven different halls, governments override, and the six
  faiths give five different crowns. Before, style was copied from the town's own
  climate-derived tradition, so two nations of different religions in one climate built
  the same palace.
- **A capital now looks like a capital.** Extent follows population: span ratio 1.64x to
  **2.47x**, correlation with population 0.01 to **0.44**. Great Saltlanding (93,150) is
  span 11.6 with 617 blocks; Oakforge (3,360) is span 4.7 with 199.
- Ancestry decides nothing. A people contributes a craft leaning that only breaks ties
  between materials the ground already supplies; holding place and faith fixed and
  varying only the inhabitants leaves the building unchanged, and `tests/vocabulary.test.mjs`
  asserts it.
- New suite `npm run test:vocabulary` (8 checks).

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
