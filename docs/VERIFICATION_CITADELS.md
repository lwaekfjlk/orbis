# Citadel Studies — verification

This is a structural/art-direction prototype. Tests do not establish that the art meets the approved cinematic reference.

## Automated model checks

The complete Node suite passed **36 tests, 0 failures**. See `artifacts/test-results.log` for the recorded TAP output. This includes unchanged parent geography, unchanged initial societies, the Stonefall local-climate regression, all 96 existing towns avoiding invalid building footprints, nine town grammars, replayable recipes, new highland reservations and new architecture geometry bounds.

The legacy test that required ALL city source files to be byte-identical was appropriately narrowed to the still-frozen geography, civilization and world-map renderer. City detail files intentionally change in this revision; they are instead tested by invariants and geometry checks.

New model tests in `tests/artisan.test.mjs` verify nine distinct deterministic civic compounds, actual GLB output, valid highland reservation, a connected street approach to a gate, and rotated parcel bounds. They do not prove every generated defense circuit is closed or every possible seed is safe.

## Real browser checks

**10 checks passed** using the actual offline HTML and Canvas software depth-buffer fallback. Four existing cities were entered, rendered and inspected without altering world geography, settlements, political state or the year. The real citadel was selected and its close-up used the same artisan recipe. Time advancement and regeneration with visible civilizations passed. There were no reported application errors or network requests.

| Actual site | Construction family | Representative parcels | Modeled gate spans | Scene triangles |
|---|---|---:|---:|---:|
| Valehold | mountain | 154 | 1 | 1,045,788 |
| Bluegate 3 | desert | 165 | 3 | 1,125,550 |
| Valemere | forest | 107 | 2 | 251,699 |
| Reedwatch | arcane | 162 | 1 | 1,107,668 |

These triangle counts explain why the software path is expensive. They are not a quality metric or an FPS promise. No real hardware-GPU benchmark was performed.

## Independent asset check

All **9 exported civic-precinct GLB files** were loaded with trimesh. Geometry was present and scene bounds were finite. See `ARTISAN_GLB_VALIDATION.json`. These are building ensembles, not nine full city models, and this is not a Blender render validation.

## Scope

Tests cover implementation consistency, not artistic equivalence to a concept image, historical accuracy, military effectiveness, or a physically calibrated city landscape. Terrain openings remain possible along walls; full siege topology is not simulated. Surface materials remain vertex colors. Interiors, citizen traffic and production-level streaming are absent.

## Final rendering-cache smoke check

The final bundle was separately opened in Chromium after the rendering cache change. Advancing one year reused the same building mesh without changing parent geography. Changing the local environment signature invalidated the mesh and rebuilt it. Both checks passed with no page errors. See `FINAL_SMOKE.json` and `tests/cache-browser.py`.
