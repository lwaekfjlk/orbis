# One Map 10.0 — verification

This records checks run for this release, rather than inheriting prior versions' claims.

## Model and source checks

`npm test`: **31 tests passed, 0 failed**. These include 28 existing model/geometry tests and three new shell/bundle/baseline checks. The full TAP output is in `ONEMAP_NODE_TEST_RESULTS.txt`.

Fourteen core files match the supplied Townsmith 9.1 source byte-for-byte by SHA-256, including world geography, civilization simulation, city geography inheritance, city generation/actions, town grammars/kit, landmark catalog/templates/binding, and world/city geometry renderers. Expected hashes are in `CORE_BASELINE.json`. This is a presentation update, not a new geographic model.

## Actual browser checks

`python tests/onemap_browser.py`: **16 checks passed** using Chromium and the fully embedded HTML with the browser context offline. Zero page errors and zero network requests. Results are in `ONEMAP_BROWSER_RESULTS.json`.

Checked:

1. A 1536 × 960 map exactly fills the viewport; no document scroll or initial side drawer; one visible map canvas.
2. +10 advances ten years without changing the physical fingerprint.
3. Play advances the simulation, and Pause stops further advancement.
4. The political layer opens inside the same viewport without a dashboard.
5. Searching for Stonefall 5 and entering the existing town preserves geography, displays one visible city canvas, and retains the shared time controls.
6. +1 works while viewing the town.
7. The inherited town setting signature remains unchanged when showing surroundings.
8. An actual city landmark opens its 3D model in the same viewport, without the old asset-library dashboard.
9. Selecting a model part and explicitly requesting Details opens the optional drawer.
10. Back returns from landmark to town to world and restores the exact original world camera target, rotation and zoom.
11. Save world downloads a real running simulation.
12. Regenerate proposes a new seed without changing the existing state; cancelling preserves it. The Generate button is inside the drawer bounds and the form has no horizontal overflow.
13. Confirmed generation produces a different world and resets its year to 400.
14. Loading the saved file restores physical, settlement, political and year fingerprints.
15. At 390 × 844, the map fills the viewport, there is no horizontal document scroll, primary controls remain within screen bounds, and town navigation works.
16. No application errors or network requests occurred in those checks.

The screenshots in `previews/onemap/` are actual renders from these checks, not image-generation concepts.

## Development server

The Node loopback server started successfully. HTTP reads of the source entry point, new UI JS/CSS and bootstrap returned 200 and matched the files on disk. See `ONEMAP_HTTP_RESULTS.json`.

The sandbox browser policy blocked direct `file://` navigation and navigation to loopback URLs with `ERR_BLOCKED_BY_ADMINISTRATOR`. Consequently, full browser interaction was tested with `page.set_content` on the offline bundle, not by navigating to the live development server. The direct-navigation limitation is recorded in `ONEMAP_DEV_SERVER_RESULTS.json`; it is not represented as a passed browser-server test.

## Boundaries

- Browser tests used the **Canvas software fallback**, not a real hardware GPU. WebGL2 remains in the unchanged renderer but was not independently hardware-tested here.
- “One map” is one visible viewport and consistent shell. The app retains separate lazy rendering objects for world, city and landmark detail; it is not a literal one-canvas engine or continuous physical-scale LOD.
- Geographic, demographic, institutional and architectural model limitations from 9.1 still apply.
- Simulation history is preserved on view changes. A full regeneration or confirmed Restart history intentionally replaces it; save first to keep a branch.
