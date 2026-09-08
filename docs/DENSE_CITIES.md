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
projected geometry directly into its final upload buffer. Projection preserves
the geometry chosen by the existing detail budget. Degenerate polygons from
overlapping narrow road strips are discarded before they can multiply during
road clipping.

## Density checks

The default world's 110 ordinary towns contain 93,534 building parcels, up from
39,996 (2.34×). The former four largest cities were kept as fixed comparison
fixtures; houses are counted from the actual building kit, not population or an
abstract component estimate.

| City | Houses before | Houses after | Change |
| --- | ---: | ---: | ---: |
| Corbinbelararhaven | 1,083 | 3,564 | 3.29× |
| Sarrelmont | 917 | 2,832 | 3.09× |
| Alflundenvik | 954 | 3,029 | 3.18× |
| Saint Tuoneneli | 839 | 1,719 | 2.05× |

All earlier homes and landmarks retain their footprint, height and doorway.
The tests independently check the entire width of new lanes and entrances,
including water edges, and connectivity to the market. Additional samples cover
three smaller default towns and five population quantiles in a second world;
their aggregate house counts rise by 2.32× and 2.29× respectively. Constrained
individual sites vary: safe ground and access take precedence over forcing an
identical multiplier into every settlement.

The README gallery is reranked after infill. Its fourth city is now
Camelelorport, and the four-panel image consists of direct application captures.

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
