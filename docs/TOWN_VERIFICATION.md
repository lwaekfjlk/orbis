> Historical report for the earlier release. Current 9.1 verification: `ENVIRONMENT_VERIFICATION.md`.

# Townsmith IX — verification and scope

Verified in this workspace on 2026-09-06. All screenshots in `previews/towns` are captures of the running HTML, not concept art or rendered photographs used as model textures.

## Automated model checks

`npm test` completed: **20 tests passed, 0 failed**, approximately 28.4 seconds. Full output: `TOWNS_TEST_OUTPUT.txt`.

The inherited regression suite includes repeat generation/audits of the default world's **96 towns**. The new suite tests:

- All nine town grammars on geographically compatible existing settlements.
- No footprint on prohibited water or a road, no footprint overlaps, no nonfinite values; every placed compound has a street connector.
- Four grammars on the exact same Ambergrove site change road graphs and ordinary compound families, with identical local height/water arrays.
- Actual 3D compound meshes from all nine families, with vertices bounded by the allocated dry footprint and deterministic regeneration.
- Composition seed changes, exact JSON recipe replay, invalid recipe rejection, and incompatible-geography rejection.
- Read-only parent physical data and unchanged initial settlement/political data during layout generation.

Raw results: `TOWN_MODEL_RESULTS.json`. Component/structure counts are representational, not household census values.

## Browser checks

Chromium with Python Playwright, network explicitly disabled. The application used **Canvas software depth buffering** in this environment. The WebGL2 hardware path is retained but was not hardware-verified.

`TOWN_BROWSER_river.json` records successful assertions for actual style controls, reroll, recipe download/import, roof toggling, block view and compound selection. There were zero captured page errors and zero external requests. One long, repeated-recomposition smoke invocation completed its assertions and screenshots but hit the external command time limit during browser teardown; these interactions are consequently documented by their completed assertion records, not as a fast clean end-to-end run.

Fresh single-style invocations for forest and caravan-courtyard towns exited successfully (`TOWN_BROWSER_forest.json`, `TOWN_BROWSER_desert.json`). Nine-family coverage is provided by the model tests, not a claim that all nine were visually checked in the browser.

The separate fresh-page `tests/town_exports.py` completed successfully in about **31 seconds**:

- Downloaded an actual whole-city GLB: **14,841,680 bytes**.
- World save included the town recipe; load reconstructed the parent world, then reopening the town reproduced its layout fingerprint.
- Terrain, settlement, political fingerprints and year stayed identical.
- A 430px mobile viewport had 430px document width, with no horizontal overflow.
- Zero page errors; zero external requests.

Results: `TOWN_EXPORT_BROWSER.json`. The exported GLB was also independently loaded with trimesh: **9 meshes, 137,370 triangles**. This is a whole assembled town, not nine standalone palace models. No Blender render has been performed.

## Limitations

The art is procedural low-poly geometry and does not reproduce the earlier concept illustration's texture/detail. Layouts are authored grammars applied to model geography; changing one is an editor action, not an economic construction event. The module viewer selects parcel compounds, not individual rooms. No walking interiors, NPC movement, traffic solver, arbitrary external-model import or manual module-dragging editor is included.

Some kit primitives and public-anchor shapes are shared across traditions. Neighborhood-specific mixed traditions are not yet a user-editable planning layer. A restricted site may reject a style or produce fewer buildable compounds. Coastlines/rivers originate in a coarse model and can look angular at city scale.

Prior-version reports in this directory are retained for provenance; they should not be mistaken for new IX test runs.
