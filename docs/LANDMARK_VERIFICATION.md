> Historical report for the earlier release. Current 9.1 verification: `ENVIRONMENT_VERIFICATION.md`.

# TELLURIC VIII — current verification

Tested against the source and standalone builds supplied in this archive. This report concerns software consistency, not architectural engineering, historical realism or physical climate validation.

## Automated model tests: 16 passed / 0 failed

Command: `npm test` (`node --test tests/*.test.mjs`). Full log: `NODE_TEST_RESULTS.txt`.

The original world/city regression tests remain included. Seven new architecture tests check the nine palace and six regional grammars; deterministic finite, nonempty and distinct model output; actual geometry changes under recombination; ritual changes without foundation relocation; strict recipe validation; all 15 GLB exports; and unchanged world/settlement/political fingerprints after binding or inspecting a landmark.

City precincts are reserved on existing dry, road-free ground before household lots. The city audit tests continue to check building/water, building/road and footprint-overlap constraints. The software integration tests additionally verify nonempty rendered geometry and a valid shadow projection.

## Real browser interaction

Command: `python tests/landmark_browser.py`. Full structured output: `LANDMARK_BROWSER_RESULTS.json`.

The supplied standalone code was executed in Chromium via the browser's DOM-content API with the network set offline. There were **no external requests and no uncaught JavaScript errors** in the completed run.

Verified actions:

- Open the actual atlas header entry and interactively select all 15 model families.
- Orbit the model and click an actual ray/triangle hit; the matching named component becomes selected.
- Hide roof groups; show the exploded assembly without changing the canonical recipe/model signature.
- Recombine tower crowns, religious motifs and composition seed; parent geographic, settlement and political fingerprints remain unchanged.
- Download an actual GLB, download recipe JSON and reload the recipe to reproduce the same model signature.
- Click a real world-map landmark pin; edit its design and commit with **Keep this design at this site**.
- Enter the existing city and verify that the architectural miniatures have mesh geometry and valid rendered height bounds.
- Return from a city to its monument, save the entire world, clear the in-memory design, reload the save and restore the committed model signature.
- At 390 × 844 CSS pixels the root document width remains 390 pixels; controls remain reachable through the scrolling panels. Escape closes the atelier.

Default registry: **127 located entries** (instances from reusable grammars, not 127 separately authored models). Default baseline fingerprints: geography `dfd91476`, founding settlements `77c3b21f`, politics `973dace6`, year 400. These remained unchanged during architectural study and explicit visual-design commits.

### Browser policy limitation

Direct `file://` navigation and browser navigation to `http://127.0.0.1:5173` were rejected by this environment's administrator policy (`ERR_BLOCKED_BY_ADMINISTRATOR`). Therefore, a successful double-click launch or a full browser navigation through the development server is **not claimed as an observed test**. The same bundled content ran successfully offline through the DOM-content API. Separately, HTTP fetch checks confirmed that the loopback server serves the source index, JavaScript, CSS and GLB assets correctly. See `DEV_SERVER_CHECK.json` and `SOURCE_BROWSER_CHECK.json`.

## Mesh import check: all 15 passed

All fifteen shipped GLBs were independently loaded as scenes with `trimesh`; every scene contained nonempty real meshes, finite vertices and finite bounds. Results: `GLB_IMPORT_CHECK.json`.

The default collection ranges from 14,655 to 88,802 triangles per complete scene. Each file has named component meshes. GLB uses geometry and vertex colors; no concept images, image billboards or textures are embedded. The largest default palace contains 88,802 triangles. A Blender application was not run; no claim is made that these screenshots came from Blender.

## Rendering verification scope

The completed browser run used **software per-pixel depth buffering with cached directional-light shadows**, not a hardware GPU. The software path was added specifically so arches, terraces and crossing roofs do not suffer painter-order occlusion. WebGL2 remains available in the source but real hardware performance and rendering were not revalidated here. No 60 fps claim is made. Large assemblies can be slower in software mode.

`previews/` contains actual browser screenshots. `palace-collection.jpg` is a contact sheet of the nine actual model renders, not an image-generator concept sheet. These are stylized procedural meshes and should not be mistaken for production-sculpted versions of the earlier concept art.

## Known modeling boundaries

There are no navigable rooms, NPCs or first-person mode. Removing roofs exposes an assembly, not fully furnished interiors. Module choices are bounded alternatives, not freeform drag-and-drop editing or a general collision solver. Regional sites are selected near suitable existing settlements; the detailed scenic tile is illustrative and does not replace real world terrain. An ice/archive or labyrinth entrance does not imply an entire underground network was simulated.

Source/recipe generation is authoritative for the runtime. Exported GLBs can be edited externally, but arbitrary GLB reimport is not implemented. Visual-design commits are aesthetic changes only and do not secretly change treasury, army, population or supply.
