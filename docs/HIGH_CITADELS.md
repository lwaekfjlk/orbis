# High citadels

Newly generated worlds can contain up to two rare, inhabited mountain settlements: a Dragon King's Aerie and a High Sanctuary. Each stands on an existing dry, buildable platform at least 3,500 m high. The current founding rule searches inside an already owned rural province, so a low-lying administrative centre cannot hide a habitable mountain shoulder elsewhere in the same district. Worlds without enough safe ground, local water or residents may receive fewer than two; there is no lowland fallback or invented mountain.

The current default Aereth-47 world (`landformVersion: 1`, `highCitadelsVersion: 2`) contains:

| Settlement | Parent-grid site | Elevation | Founding residents | Authored buildings |
| --- | --- | ---: | ---: | ---: |
| Cairnwatch · Dragon King's Aerie | 239, 117 | 4,010 m | 719 | 14 |
| Rosethorpe · High Sanctuary | 242, 115 | 3,886 m | 759 | 14 |

Each settlement occupies a survey of 0.648 parent cells, compared with at least 1.92 for an ordinary town. The Dragon King's Aerie has a crown hall, horned watches, supported dragon landing platforms, a forge and keeper lodges. The High Sanctuary has a narrow sanctuary, open bell chambers, separate apsidal chapels, hospices and scriptoria. Both retain their architectural identity in the regional and detailed map views.

The whole composition rotates and shifts onto the safest part of the existing rock shoulder. Individual parcels have bounded foundations and dry, connected footpaths. Founding first runs the same placement and path query used by the renderer; it requires a viable main building and at least ten connected parcels. No bedrock, ice, water, climate or province geometry is changed.

Residents transfer from the district's existing rural population. Their support is reserved from the separate retained rural carrying capacity, leaving the existing market-surplus allocation untouched. Total district population and carrying capacity are conserved; yearly urban growth remains capped at the founding capacity (at most 1,100 residents). The site cell remains inside the same province's existing cell list and owner map. Version 2 establishes the courts after cultural origins and country formation, preserving the original administrative graph, national ownership and country identities. Ordinary towns keep their exact surveys and layouts; these tiny fixed precincts do not reduce a distant town's normal spacing allowance.

Use map search for **dragon**, **holy**, **龙王城** or **圣城**. Directory entries visit the complete settlement, and building selection remains in the same map. The dragon-head marker and radiant sacred marker distinguish the two sites.

Founding versions remain explicit in saved simulation options:

- Version 0 preserves histories from before rare mountain courts existed.
- Version 1 uses only the original administrative centre. Legacy terrain keeps this default and its original two sites: Granitewatch at 4,097 m (1,100 residents) and Blackley at 3,938 m (748 residents).
- Version 2 is the default for newly generated version 1 terrain. It searches actual eligible cells within an existing owned rural district and records both `originalCell` and the settlement's `sourceCell`.

Loading, resetting or rerolling a saved world retains its recorded founding version. An older save with neither a version nor citadel metadata stays at version 0; version 1 saves on the newer terrain do not silently acquire the version 2 courts. A newly generated world is required to opt into the new default.

The standalone `node scripts/preview-high-citadels.mjs` review page retains the legacy terrain fixture for comparison. The current application and `tests/high-citadel-platforms.test.mjs` exercise the new default sites with the production planner.

The dedicated site, layout, mesh, worker, directory and camera tests are in `tests/high-citadel-*.test.mjs` and `tests/highland-kit.test.mjs`. The version 2 regression compares all ordinary province records, cultural mixtures, administration and country data, all ordinary town surveys and the complete nearest-city layout against the same world with high-city founding disabled. Legacy version 0/1 fingerprint checks remain in place.
