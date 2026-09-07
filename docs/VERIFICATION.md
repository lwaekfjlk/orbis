> Historical VII report. Current VIII results are in LANDMARK_VERIFICATION.md.

# Verification — 6 September 2026

These are observed test results for the delivered code, not claims of scientific realism.

## Engine tests

`npm test` runs nine Node test groups using the delivered source files. Tested here with Node.js **22.16.0**. All nine passed.

The default `Aereth-47` world retains **38 independent polities and 96 towns/cities**. Every one of those 96 towns was generated twice at local scale. Scenes contained **161–333 representative buildings**. All passed the following checks:

- Identical deterministic city-plan fingerprint on repeated generation.
- Zero building samples on water, zero building samples on street cells, zero overlapping building footprints.
- Zero sea/lake traversals in the local street network; narrow parent-river crossings remain separately allowed as schematic bridges.
- No nonfinite building geometry.
- All original parent typed-array hashes unchanged; civilization state unchanged merely by viewing a city.

The remaining groups checked: no detail for unsettled accounting districts; political rerolls preserve local plans; projects pay once and finish once; a saved unfinished project resumes identically; water/harbor/budget preconditions; malformed city-save rejection; network-only journeys and unreachable destinations; 120 years of finite civilization evolution; and aligned GLB headers/accessors with nonfinite-vertex rejection.

Detailed results: `engine-results.json`. Scene rows are recorded for all 96 towns. These are tests of geometric and data consistency, not real-world urban accuracy.

## Browser integration

Tested with Python Playwright **1.57.0** and the container's Chromium, at **1660×1060**, **1440×950**, and **390×844**. The renderer selected the **Canvas software fallback** in this environment. The inherited WebGL2 path is included but **was not hardware-GPU tested in this run**.

The browser test passed:

- Modular source files loaded in their declared order.
- Offline standalone HTML initialization.
- World → coastal city → selected landmark/building → world.
- Cityscape/district views, overhead camera, zoom and district controls.
- Construction commissioning with exact treasury debit; pending project after one year; completion on the due year.
- Save/download/upload of an unfinished project and matching restored city-plan fingerprint.
- Journey through the existing graph, and entry into a reachable destination.
- A distinct lakefront scene derived from a different existing town.
- Political reroll preserving the original town signature and resetting history to 400, as documented.
- Mobile layout with no horizontal page overflow, accessible return button and scrolling project panel.
- PNG, detailed city JSON and actual vertex-colored GLB export. The sample GLB is **6,347,456 bytes**, containing **9 meshes**; header length and glTF accessors were parsed successfully.
- **Zero JavaScript page errors and zero external service requests** during the successful run.

Managed Chromium policy blocks `file://` navigation here. Therefore modular sources were loaded by Playwright's trusted script/style injection; the complete standalone was loaded with `set_content` and networking disabled. **Direct double-click navigation is not reported as tested.** The served source assets were also checked separately over the bundled loopback HTTP server.

Blender itself was not run. The exported GLB structure was inspected; rendering/import behavior in a specific Blender release is not claimed to have been tested.

Detailed result: `browser-results.json`. Actual screenshots are in `examples/`.

## Server

The Node development server was started on 127.0.0.1 and verified over HTTP. Main HTML, city source, CSS and standalone build returned 200 with correct content types. Missing files returned 404; POST returned 405; an encoded traversal request was rejected. It is a development server, not a public production deployment server.

Detailed result: `server-results.json`.

## Known visual/interaction limits

Software rendering sorts triangles and can produce small seams or occlusion artifacts with extreme camera angles. A GPU-capable browser should use the WebGL2 depth-buffer path, but browser/device capability still matters. The default city view is linked drill-down, not seamless whole-world LOD. Construction visibly alters scaffold/landmark meshes; it is not a full building-by-building city economy.

All reported tests use the default world plus controlled counterfactual state variations. This release does not claim exhaustive testing of every possible world seed, every desktop browser or every touch device.
