# High citadels

Newly generated worlds can contain up to two rare, inhabited mountain settlements: a Dragon King's Aerie and a High Sanctuary. They use the original province site at elevations of at least 3,500 m. Worlds without sufficiently high, stable, dry rock receive neither; there is no lowland fallback or invented mountain.

The default Aereth-47 world contains:

| Settlement | Elevation | Founding residents | Authored buildings |
| --- | ---: | ---: | ---: |
| Granitewatch · Dragon King's Aerie | 4,097 m | 1,100 | 13 |
| Blackley · High Sanctuary | 3,938 m | 748 | 12 |

Each settlement occupies a survey of 0.648 parent cells, compared with at least 1.92 for an ordinary town. The Dragon King's Aerie has a crown hall, horned watches, supported dragon landing platforms, a forge and keeper lodges. The High Sanctuary has a narrow sanctuary, open bell chambers, separate apsidal chapels, hospices and scriptoria. Both retain their architectural identity in the regional and detailed map views.

The whole composition rotates and shifts onto the safest part of the existing rock shoulder. Individual parcels have bounded foundations and dry, connected footpaths. Founding first runs the same placement and path query used by the renderer; it requires a viable main building and at least ten connected parcels. No bedrock, ice, water, climate or province geometry is changed.

Residents transfer from the district's existing rural population. Their support is reserved from the separate retained rural carrying capacity, leaving the existing market-surplus allocation untouched. Total district population and carrying capacity are conserved; yearly urban growth remains capped at the founding capacity (at most 1,100 residents). Existing ordinary settlements, their surveys, cultural origins and founding politics retain their previous results.

Use map search for **dragon**, **holy**, **龙王城** or **圣城**. Directory entries visit the complete settlement, and building selection remains in the same map. Older saved worlds keep their original founding rules when resetting history or rerolling politics; regenerate a world to use the new founding rules.

Run `node scripts/preview-high-citadels.mjs` for the production-map review page in `previews/high-citadels/index.html`. It generates the actual default world and uses the same terrain, architecture, climate and foundations as the app.

The dedicated site, layout, mesh, worker, directory and camera tests are in `tests/high-citadel-*.test.mjs` and `tests/highland-kit.test.mjs`.
