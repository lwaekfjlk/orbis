# Dense city blocks

City detail now fills usable yards inside the existing built footprint with small
houses and shared access lanes. Main streets, gates, water and the entrances to
existing buildings remain clear. Existing landmarks keep their positions and
dimensions. This changes the city illustration, not settlement population or the
parent world's terrain, climate and politics.

The infill pass checks the full paved road width instead of treating an entire
coarse survey cell as road. It uses a shared route tree and spatial indexes to
connect interior houses without routing every house across the whole town.
Landmark directory queries skip this pass entirely.

Performance work also removes crowd and dossier rebuilding during camera motion,
avoids duplicate nearby-road updates, caches unchanged label positions, and writes
projected geometry directly into its final upload buffer. Building detail is
retained. Degenerate polygons from overlapping narrow road strips are discarded
before they can multiply during road clipping.

## Reproduce

Run `npm test` for layout, clearance, landmark, projection and camera regressions.
For an offline browser comparison, freeze the old standalone HTML and run
`npm run test:dense-city-browser` with `DENSE_HTML` and `DENSE_OUTPUT`. Run it again
against the new build with `DENSE_BASELINE` pointing to the old `results.json`.
Set `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` if Playwright and Chromium are not on
their default paths. The benchmark records the GPU, viewport, bundle hash,
city-entry times, camera frame times and actual renderer work; it does not enforce
machine-dependent timing thresholds.

`node scripts/rank-readme-cities.mjs` ranks every ordinary city in the default
world by generated building parcels. A parcel is not always a single house; the
density regression separately counts the actual houses emitted by the renderer.
