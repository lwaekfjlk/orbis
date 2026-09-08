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

Camera work retains the deferred terrain updates and reusable animated buffers
already merged in #69. Model identity checks avoid rebuilding crowds and dossiers
on loading-status changes; building labels reuse unchanged positions. Projection
writes geometry directly into its final upload buffer and preserves
the geometry chosen by the existing detail budget. Degenerate polygons from
overlapping narrow road strips are discarded before they can multiply during
road clipping.

Courtyard entrances use the actual points of refined gate approaches, not their
rounded survey-cell centers. Residents in these compact neighborhoods also scale
to the smaller homes and walk along the center of narrow lanes.

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

## Browser measurements

The final build was compared with main after #70 on an Apple M2, native Metal
ANGLE, at 1200 × 1020. Each city has two 90-frame pan/orbit runs, with its dossier
closed and open. The final median frame times were 16.5–16.7 ms, with 95th
percentiles of 17.7–18.8 ms. Average render-callback CPU time was 2.56 ms before
and 2.50 ms after; this small difference is not evidence of a further frame-rate
gain. It demonstrates that the substantially larger scenes retain smooth motion.
Both versions avoid crowd and road rebuilding during gestures, as established
by #69.

| City | First entry before | First entry after | Rendered triangles after |
| --- | ---: | ---: | ---: |
| Corbinbelararhaven | 1.91 s | 4.33 s | 962,419 |
| Sarrelmont | 1.85 s | 3.99 s | 1,111,064 |
| Alflundenvik | 1.40 s | 3.41 s | 711,276 |
| Saint Tuoneneli | 1.50 s | 2.43 s | 568,687 |

More houses still cost more to assemble on first entry, in the background worker.
Whole-world readiness was essentially unchanged at 9.05 s versus 8.97 s. These
are measurements on this machine, not guarantees for other hardware. Raw results
include exact bundle hashes, counts, camera settings, unchanged world fingerprints
and the successful interaction checks:
[baseline](../previews/dense-cities/before-main70.json) and
[final build](../previews/dense-cities/after.json).

The earlier [geometry profile](../previews/dense-cities/geometry.json) records a
source snapshot before #70's house shapes; its triangle totals and nested Node
timings are diagnostic and must not be substituted for the final browser results.

## Reproduce

Run `npm test` for layout, clearance, landmark, projection and camera regressions.
For an offline browser comparison, freeze the old standalone HTML and run
`npm run test:dense-city-browser` with `DENSE_HTML` and `DENSE_OUTPUT`. Run it again
against the new build with `DENSE_BASELINE` pointing to the old `results.json`.
Set `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` if Playwright and Chromium are not on
their default paths. The benchmark records the GPU, viewport, bundle hash,
city-entry times, camera frame times and actual renderer work; it does not enforce
machine-dependent timing thresholds. `DENSE_VERIFY_UI=1` additionally checks real
building picking, Closer, Shift-drag orbiting, a 430-pixel viewport, and Recreate
followed by entering a new town. These checks run after the timed measurements.

`node scripts/rank-readme-cities.mjs` ranks every ordinary city in the default
world by generated building parcels. A parcel is not always a single house; the
density regression separately counts the actual houses emitted by the renderer.
