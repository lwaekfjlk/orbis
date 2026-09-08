# Inland territory and city names

Open land outside a country's territory remains unclaimed and is named exactly
**wildness**. Existing administered provinces retain their countries. Only an
unclaimed pocket completely enclosed by one country joins that surrounding
territory. Remote mountains and separate islands are not automatically distributed
among the nearest countries. A genuine foreign enclave keeps its country and its
internal border.

Domestic lakes leave no hole in a country's highlighted territory. This includes
below-sea-level water basins that are enclosed inland: water connected to the outer
map ocean remains unclaimed. Four-neighbour connectivity matches the actual map
border edges. Shared lakes are partitioned by shortest distance through water from
their shores. Unclaimed shore sources preserve wildness water, winning distance
ties before country IDs; equal country claims use the lower ID. Separate water
components remain separate even when they share a drainage basin.

`PoliticalLand.territory(world, sim).owners` is a derived display snapshot. Borders,
country highlighting and place dossiers share it. Its `inlandWater` mask identifies
positive-elevation lakes and enclosed negative-elevation water basins without
changing either water surface. Country ownership changes,
country disappearance and world replacement invalidate the cache. Physical water
levels, administered province cells, population, resources and political history
are unchanged. A lake or remote mountain is never converted into a population
province to draw its boundary. Country area and climate summaries describe only
claimed dry land; inland-water area is counted separately. Unclaimed area remains
outside country summaries, so their dry-land shares do not add up to the whole
world. Country margins next to wildness retain a distinct dashed border.

Every settled town has a complete name in the world view, including villages and
the high-altitude citadels. Country and town names both use the genuine
**IM FELL English Italic** face for classical Latin-style serif lettering, with
town names smaller than country names. The live HTML map uses the existing local
font asset; the standalone build embeds the same font and its OFL license for
offline display. Labels move around crowded locations and retain a
fine leader and marker at the real settlement position. Camera distance, town
population and per-country quotas no longer remove names. Off-screen towns do not
produce floating names; the Names control still hides the entire label layer.
The same town labels continue into local views, avoiding duplicate streaming pins.
Country lettering always prints the complete formal name, including the polity
and proper name. Both lettering sizes contain that same full text; a short name,
number or tooltip never replaces it. Crowded names wrap or use a fine leader to
their own territorial anchor. Dedicated dragon, holy-city and dragon-ruin symbols
retain their space, as do the map's permanent controls.

Opening map search with an empty query offers direct **Visit** cards for the
existing Dragon King Citadel and High Holy City, with their actual place names and
elevations. Searches also accept **dragon**, **dragon city**, **dragoncity**,
**龙王**, **龙城**, **龙王城**, **holy**, **holy city**, **holycity** and **圣城**.
Selecting a high-city result approaches its complete settlement in the same map.
These cards expose cities already present in that world; they do not create new
ones. Some generated geographies have fewer than two suitable high sites. Older
saves retain their founding rules until the user generates a new world.

The current default Aereth-47 map uses `landformVersion: 2` and
`highCitadelsVersion: 2`. It has **108 named settlements and 26 living countries**.
`tests/full-realm-labels.browser.mjs` verifies that all names remain fully printed
at 1480px and 430px, with no clipping, text overlap or covering icons/controls.
`tests/dragon-sites.browser.mjs` separately visits both dedicated high cities and
all three default dragon ruins, checks real mounted geometry, part navigation and
independent GLB exports, and verifies unchanged source fingerprints
`2377e4fa / 254caa7c / 24a862f0` throughout those interactions.

The preserved legacy reference uses **`landformVersion: 0` and
`highCitadelsVersion: 1`**. It has 104 named settlements and 22 living countries,
not the counts of the current default map. It retains
6,251 unclaimed dry cells and 125 unclaimed inland-water cells, while filling 35
enclosed dry cells. Its 17,556 claimed cells include 189 cells in below-sea-level
inland basins. Annwn's 64-cell basin at atlas coordinates (95, 53) now shares its
surrounding country without an internal hollow ring. Physical, settlement and
political fingerprints remain `440ae5d0 / e6aee7b8 / d8ba763d`.

`tests/territory-topology-integration.test.mjs` checks four actual generated worlds:
Aereth-47, Tanguine, Ninefold-9 and Meridian-21 (rift). An independent flood fill
rejects enclosed country holes unless another living country occupies them. The
suite also transfers a real interior province to verify that foreign enclaves and
their visible borders survive, checks actual border meshes and wildness hover,
and verifies source geography, population and city founding remain unchanged.

Generate the five real-lake and enclosed-sea review scenes with `npm run preview:politics` and open
`previews/politics/index.html` through the development server. The optional
`npm run test:lake-labels-browser` explicitly generates that legacy reference in
the production app before retaining its 104-town, 22-country and Annwn-basin
assertions. It verifies the production DOM at desktop and narrow
sizes, thematic layers, the Names control, local zoom transitions, lake cards,
wildness and enclosed-basin identity, italic map labels and actual high-city
search/card model entry.
It accepts `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` and `TELLURIC_LABEL_OUTPUT` for an
external browser runtime and screenshot destination.
For current-default coverage, run `npm run test:full-realm-labels-browser` and
`npm run test:dragon-sites-browser`; both use the same external browser runtime
variables. Their screenshot destinations are `TELLURIC_LABEL_OUTPUT` and
`TELLURIC_DRAGON_OUTPUT`, respectively.
