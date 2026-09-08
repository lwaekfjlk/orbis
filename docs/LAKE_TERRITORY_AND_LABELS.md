# Inland territory and city names

Every dry-land and inland-lake cell belongs to a living country. Existing
administered province cells retain their country. The surrounding highlands,
icefields and other land inherit the nearest adjoining territory; separate islands
inherit the country nearest their shore. Ocean remains outside national territory.
A lake surrounded by one country leaves no hole in its highlighted territory.
Shared lakes are partitioned by shortest distance through water from the completed
shore territories, with the lower country ID resolving equal distances. Separate
water components remain separate even when they share a drainage basin.

`PoliticalLand.territory(world, sim).owners` is a derived display snapshot. Borders,
country highlighting and place dossiers share it. Country ownership changes,
country disappearance and world replacement invalidate the cache. Physical water
levels, administered province cells, population, resources and political history
are unchanged. A lake or remote mountain is never converted into a population
province to draw its boundary. Country area and climate summaries now include the
complete dry-land territory; inland-water area is counted separately. No wilderness
territory labels remain in a world with living countries.

Every settled town has a complete name in the world view, including villages and
the high-altitude citadels. Town lettering is
smaller than country lettering. Labels move around crowded locations and retain a
fine leader and marker at the real settlement position. Camera distance, town
population and per-country quotas no longer remove names. Off-screen towns do not
produce floating names; the Names control still hides the entire label layer.
The same town labels continue into local views, avoiding duplicate streaming pins.

Opening map search with an empty query offers direct **Visit** cards for the
existing Dragon King Citadel and High Holy City, with their actual place names and
elevations. Searches also accept **dragon**, **dragon city**, **dragoncity**,
**龙王**, **龙城**, **龙王城**, **holy**, **holy city**, **holycity** and **圣城**.
Selecting a high-city result approaches its complete settlement in the same map.
These cards expose cities already present in that world; they do not create new
ones. Some generated geographies have fewer than two suitable high sites. Older
saves retain their founding rules until the user generates a new world.

The default map has 104 named settlements and 22 living countries. All 23,087 dry
land cells and 538 inland-lake cells have a country, including 6,286 dry cells that
previously lacked a claim. Its physical, settlement and political fingerprints
remain `440ae5d0 / e6aee7b8 / d8ba763d`.

Generate the four real-lake review scenes with `npm run preview:politics` and open
`previews/politics/index.html` through the development server. The optional
`npm run test:lake-labels-browser` verifies the production DOM at desktop and narrow
sizes, thematic layers, the Names control, local zoom transitions, lake cards,
complete territory coverage and actual high-city search/card model entry.
It accepts `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` and `TELLURIC_LABEL_OUTPUT` for an
external browser runtime and screenshot destination.
