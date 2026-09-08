# Country names, territory and population

The default atlas had two separate gaps: only 9 of 34 country names fit on a
1480 × 980 overview, and the simulation actually left 23 existing settlements
outside every country. Administrative travel limits were also sovereignty
limits, so even a large dependent town could become unclaimed land.

| Default Aereth-47, year 400 | Before | After |
| --- | ---: | ---: |
| Countries | 34 | 22 |
| Country names visible on desktop | 9 | 22 (all full names) |
| Settlements without a country | 23 | 0 |
| Population within countries | 84.54% | 99.57% |
| Dry-land area within countries | 64.49% | 83.96% |
| Dry-land area in unclaimed accounting districts | 20.73% | 1.27% |
| Countries with a population majority | 3 | 22 |
| Smallest share of a country's leading people | 23.43% | 62.01% |

The remaining 14.77% of area outside the settlement raster is principally cold
or glaciated wilderness. The raster still excludes lakes and seas; it does not
create settlements in uninhabitable terrain. Remaining residents outside a
country belong to recorded local communities and are not described as empty land.
Measurements and the additional seed audits are in [POLITY_RESULTS.json](POLITY_RESULTS.json).

Country labels have priority over town lettering. They keep anchors on their own
land, try alternate locations, wrap or shrink their formal name, and use the
country's short name when necessary. Tiny regions on narrow screens retain a
numbered, clickable marker with the complete name in its accessible label and
tooltip. Labels disappear from keyboard navigation when outside the viewport.
Hovering still outlines the current territory, and clicking opens its overview.

Unclaimed regions have explicit `NO REALM / Unclaimed wilds` labels. A settled
independent region is labelled `Independent communities`. Dashed boundaries
mark the edge between national territory and unclaimed dry land; solid cased
lines remain the border between two countries. Location cards and field notes
state whether the selected land belongs to a realm, an independent community or
wilderness.

## Founding rules

The existing historical cultural origins and market distances define local
homelands before states form. Each district combines a 75% local homeland share
with 25% of the prior exchange mixture. All peoples follow identical rules;
religion, total population, food budgets, and settlement locations are unchanged.
This retains minorities rather than assigning a uniform people to a whole realm.

Nearby centers consolidate more readily, reducing the default count without a
fixed quota or continent-wide owner. Claims grow only across connected land from
held districts. At founding, a joining district must keep the realm's actual,
population-weighted homeland share above 52.5%; deferred border districts are
reconsidered after additional homeland residents join. An isolated existing town
can retain its own polity. Shipping routes do not annex territory.

Command range and the administration budget govern the directly administered
core. Outlying districts stay within the country under local administration;
only directly administered districts consume the central budget. Small isolated
household communities are recorded separately, with their real residents.

The majority rule applies to new founding, not to loaded histories or later
migration, conquest or secession. Overviews always calculate the current mixture
and distinguish a majority from a largest community that is below 50%.

## Verification

Three independent seed regressions lock every province's full-precision
population, settlement coordinates, cells, capacity allocations and faith
mixture to the previous engine, as well as the physical and settlement hashes.
They verify connected ownership, settlement coverage, direct-administration
budgets, national majorities, nonzero minorities, and deterministic JSON save
continuation. Eight additional worlds, including islands, cold and rift maps,
were audited for the same invariants.

The default political hash intentionally changes from `aaa577eb` to `d8ba763d`;
physical `440ae5d0`, settlements `6b6c5ea8`, and the save-compatible province
raster are unchanged. An actual old 34-country save retains its original borders
and mixtures and continues identically after JSON restoration.

The new country count changes the default directory from 168 to 152 entries.
All 69 sacred sites and 78 exact placement queries remain. An independent full
city-generation directory was compared field by field with the optimized index;
all metadata matched. City survey dimensions are now part of the site cache key
so a political reroll that changes a capital cannot reuse its old placement.

`npm run test:polities-browser` checks the offline standalone HTML in Chromium:
all desktop names, non-overlap, country hover and overview, wilderness inspection,
mobile overview and approach, and unchanged simulation after viewing. Set
`PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` to existing local installations if needed.
