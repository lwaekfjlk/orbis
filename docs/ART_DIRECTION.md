# Art target versus current implementation

## Approved target, not claimed as delivered

The approved reference is a densely inhabited, highly crafted mountain city with a dominant summit castle, climbing districts, strong walls and gates, narrow streets, bridges, public monuments and detailed material surfaces. A successful implementation needs an attractive composition from multiple angles, not only a single generated view.

The current prototype adds real geometric foundations for this direction. It is still visibly schematic and is not a movie-quality city renderer.

## Whole-city variation to develop

- **Crown city:** high keep, noble terraces, dense slate-roofed boroughs, civic squares and a lower gate district.
- **Sanctuary city:** a cathedral-dominated skyline, cloister neighborhoods, hospices and a processional avenue rather than a royal keep recolored gold.
- **Collegiate city:** groups of slender towers and observatories, connecting galleries, scholar housing and instrument workshops; arcane decoration is restricted to relevant districts.
- **Forest court:** inhabited trees, irregular clearings, timber and leaf-roof pavilions, low-impact paths and canopy-scale landmarks.
- **Highland hold:** retaining terraces, robust stone halls, mountain gates and covered stairs. Mines and interior halls require separate detailed assets.
- **Courtyard city:** compact shaded streets, inhabited roof terraces, wind towers, caravan courts and cisterns supplied by actual water access.
- **Waterfront city:** piers, warehouses, quays and appropriately placed defenses; no invented sea or lake for an architectural template.

## Structural standards

1. World geography is authoritative. Ground, water, ice and ecological colors must agree across scales.
2. Local terrain is reserved before streets; a citadel cannot silently delete a road or river.
3. Gates must connect an internal street to outside terrain. A decorative arch over a blocked road is a failed gate.
4. Representative houses must fit in their parcels; richer visuals do not create population or food.
5. Walls can meet a natural boundary, but this must be labeled as a gap or unmodeled defense, not asserted to be a complete secure enclosure.
6. Repeated design seeds must replay; world regeneration must retain civilizations and their visible layers.

## Production-art work that remains

Build and validate an excellent single-city slice before multiplying templates. Author distinctive, reusable housing rows, markets, workshops, retaining-wall segments, gatehouses and towers with consistent scale and connection points. Add bevels, purposeful asymmetry, surface materials, weathering and vegetation that hold up at close range. Then replace the current prototype families with those assets while retaining the spatial contract and simulation.

A full production implementation should explicitly budget geometry, textures, scene loading and levels of detail. Those optimizations and a mature material/light/postprocessing pipeline have not been completed here. The existing GLBs are editable structural assets, not a claim that a conceptual image has been reconstructed as a finished 3D city.
