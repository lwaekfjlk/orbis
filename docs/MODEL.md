# Model assumptions and deliberate simplifications

The geography/civilization model from Many Crowns is retained. It is not a new claim of scientific validation. Plates carry prescribed kinematics; continent provinces and preserved channels include design priors. Climate transport, ice storage, fjords and inland basin rules are qualitative approximations. A latitude-longitude-like rectangular grid is not a geometrically exact spherical simulation.

Climate reaches the picture through one resolver, `CityEnvironment.climate`, which turns the existing `temp`, `arid`, `height`, `ice` and `snow` fields into continuous 0–1 factors (cold, warm, frost, dry, humid, alpine, snow load). Ground colour, vegetation form and building form all read those same factors, so the map and the town cannot disagree about what kind of place a cell is. The break points are the measured spread of a generated world, not chosen constants: over land, temperature runs p10 −15.0 / p50 6.2 / p90 24.4 °C and aridity p10 .08 / p50 .55 / p90 2.36.

This is a legibility pass over existing data, not new physics. Nothing in it writes to the world: `physicalFingerprint` is unchanged, so height, biome, rain, temperature, lake, flow, ice and plate are byte-identical to the pre-climate baseline. No snow, water or terrain is invented — sub-threshold ice is shown because the cryosphere already stored it, and bare rock appears only where the model reports both cold and elevation. Biome identity remains categorical and authoritative; the continuous grading separates the two ends of a biome's own range and is capped so the category still reads. The vegetation forms (conifer, broadleaf, rainforest, palm, acacia, scrub, cushion, mangrove) are schematic symbols with a temperature-driven treeline; they are not plant populations, species claims or a biogeography model.

Architecture responds to the same factors. A tradition is the cultural and site identity; climate modifies roof pitch and form, eave depth, opening area, chimneys, wall material and palette on top of it, read at each block's own cell rather than the town centre's — 67 of the 96 towns in a default world span more than 4 °C internally. Two towns of one tradition at opposite ends of their range are therefore different buildings, which they previously were not. This is an architectural reading of a climate index, not a thermal-performance or building-code simulation.

City refinement reads a 7.8-world-cell-wide area around a pre-existing settlement. Water masks and surface elevations are interpolated from parent data; narrow rivers follow inherited drainage segments. Local buildings, lots, walls, orchards and their names are generated additions. No archaeological, cadastral or meter-accurate fidelity is claimed.

A local mesh is compressed in height for legibility. Its footprints are tested against local refined fields, not validated against a higher-resolution physical Earth model. Neighborhood labels describe function; they do not mean real inhabitants or institutions were microsimulated. An "orchards and commons" district can contain edge houses.

The simulation supports different peoples and traditions. They are fantasy definitions and normalized population mixtures, not human stereotypes or claims that ancestry determines government. State borders, religion and ancestry remain separate arrays. The city dossier inherits the province's demographic mixtures; it does not generate individual people.

City projects are an explicit small game system:

| Project | Preconditions | Completion effect |
| --- | --- | --- |
| Granary | Existing settled place, live government, budget | Existing urban food support ×1.08; max two upgrades |
| Waterworks | Freshwater access ≥0.30 | Development +0.06, unrest −5; no new water |
| Academy | Live government and budget | Realm technology +0.045, arcana +0.05 |
| Waterfront | Existing harbor ≥0.12 or lake access ≥0.25 | Development +0.10; no new graph route |
| Festival | Live government and budget | Unrest −8; max four commissions |

Infrastructure does not currently have an independent maintenance ledger. New buildings are representative visual upgrades, not a complete physical production economy. Food improvement models lower losses and organization within a small cap. There is no dynamic water-table simulation.

Journey planning finds a least-cost path on the existing market graph and removes edges across active enemy frontiers. Land/sea connection kinds are inherited. It does not draw a meter-level route, animate a party, estimate days, add ship fleets, or simulate individual encounter outcomes.

The default street plan does not grow house-by-house when population increases. Population, state membership, unrest, public works and selected landmark forms update; core layout remains reproducible. Some buildings may appear abandoned in story interpretation, but visual dereliction is not simulated in this release.

Missing deliberately: seamless infinite LOD, interiors, dungeon geometry, citizen behavior, traffic AI, high-fidelity erosion, continuous city sprawl, complete dynasties, and character portraits.
