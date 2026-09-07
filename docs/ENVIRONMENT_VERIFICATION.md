# Townsmith 9.1 — Stonefall cross-scale geography repair

## Reproduction

The reproducible reference is the default world `Aereth-47`, physical parameters from `tests/engine-loader.mjs`, settlement history `First-dawn`, initial year 400. The generated settlement is **Stonefall 5**, province ID **507**, world cell **38502** (grid position 102, 128). Other seeds and saves may assign the name Stonefall to other places; this is not a claim about an unseen user save.

The settlement cell is a **Salt basin**, with modeled annual temperature **11.143 °C**, bed elevation **104.249 model meters**, and no permanent ice at the town center. Glacier-bearing terrain begins three parent grid cells away. Nearby terrain includes forest, cold dryland, tundra and glacier cells, with high mountain relief. The correct scene is a dry lake basin adjacent to cold mountain slopes, not a uniform hot desert or a uniformly snow-covered town.

## Confirmed faults in 9.0

- `TownCatalog.native()` tested province-average aridity before elevation or surrounding mountain context, selecting the hot-desert kit for the reference settlement.
- `createCityRenderer()` chose one base color for an entire town using province-average aridity and temperature. Parent-world elevation and water were sampled, but local biome, ice and temperature were not propagated to the terrain renderer.
- The city surface did not include inherited glacier ice thickness. Nearby mountains outside the small detail tile were not shown.
- World and city surfaces had separate coloring rules. The world renderer also included an altitude/temperature-only whitening heuristic, which was not evidence of modeled glacier ice.

## Repair

`src/city/environment.js` is the read-only geography adapter. It samples parent coordinates, biome, temperature, precipitation, aridity, bed elevation, surface elevation, ice, wetness, local cultivation potential and vegetation suitability. Continuous fields are interpolated; biome IDs are categorical. All local samples carry a source cell reference. Ground color resolves from the same `cellColor()` routine used by the world landscape renderer; architecture cannot change it. The altitude-only whitening shortcut was removed from the landscape renderer. These are display changes; no parent-world model arrays are changed.

The wider surroundings ring reads the same world and has the same sampling pitch as the town. Its inner boundary matches the town tile exactly. It is a non-buildable context view, not invented backdrop geometry. The `Setting` and `Surroundings` controls expose it. `Locate on atlas` returns to the exact source world cell.

Native architecture uses the settlement's actual site and nearby relief. The existing hot-desert kit includes warm-climate features, so it is no longer an automatic choice for every dry district. This is a constraint on this particular kit, not a claim that courtyard architecture is impossible in cold regions. The reference Stonefall receives the Highland Hold kit. Compatible architectural styles and seeds remain selectable without recoloring the landscape.

Trees and farms use local environmental samples. New building parcels cannot occupy the inherited glacier surface. Automatically loading an incompatible legacy hot-desert recipe derives a compatible design while preserving its composition seed and leaving the save and natural world unmodified. Explicit incompatible style changes are rejected rather than changing climate.

## Tests actually run

**28 Node tests passed, 0 failed.** The suite includes the prior 20 tests plus eight new environment regressions:

1. Stonefall reference site remains a dry basin, has actual nearby glacier samples, and no longer auto-selects the hot-desert kit.
2. 227 local sample points match parent coordinates, continuous fields, biome classification and colors.
3. Four architectural families and different composition seeds retain identical local terrain, water, surface colors, climate, ice and surroundings signatures.
4. Changing province-average temperature/aridity/elevation cannot overwrite local climate.
5. Legacy recipe adaptation and subsequent JSON replay are deterministic.
6. All 320 town boundary samples join the context ring without a height/color seam.
7. All 96 default towns avoid glacier building footprints; modeled trees/farms respect local conditions; the full natural-world fingerprint and civilization state are unchanged by detail generation.
8. World landscape colors and sampled city colors agree at the checked parent land cells.

Raw results: `ENVIRONMENT_RESULTS.json`, `NODE_TEST_RESULTS_9_1.txt`.

**Offline Chromium browser checks passed** with zero page errors and zero network requests:

- Enter the actual Stonefall settlement from the existing simulation.
- Show the actual surroundings ring using the UI control.
- Change the building family and verify the actual rendered terrain meshes, including vertex colors, remain byte-identical.
- Toggle surroundings visibility.
- Open an incompatible legacy design and display its adaptation notice.
- Download and re-import a town recipe and reproduce its layout fingerprint.
- Return to the exact parent-world source cell with `Locate on atlas`.

Raw browser results: `ENVIRONMENT_BROWSER_RESULTS.json`.

Screenshots in `previews/terrain-fix/` are actual application renders, not generated concept art. This browser run used the Canvas software depth renderer. Hardware GPU rendering was not independently retested.

## Running the checks

```sh
npm test
npm run build
npm run test:environment-browser
```

Browser tests require Python Playwright and a Chromium executable. Set `CHROMIUM_PATH` when it is not `/usr/bin/chromium`. These are test-only dependencies; the offline HTML needs neither.

## Limits

The parent map is a coarse, uncalibrated rectangular model. Local streets and structures remain synthesized representative geometry, not survey data or a physical downscaling simulation. The local and world scenes have different camera/vertical presentation scales. The context ring adds rendering cost; it can be hidden. Ice shown by this repair is inherited model ice, not a newly integrated seasonal weather simulation. The reference settlement is not hard-coded by name into the terrain or architecture algorithms.
