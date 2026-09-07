# What every town remembers

Click a settlement and somebody who lives there turns up to tell you its history: a
layered vector portrait, their name and their office, and five chapters in their own voice. Not a
story attached to a town — a story *derived from* one, the way the seven legendary places
are derived from the physical extremes that produced them.

## Who is talking

The narrator is a resident, drawn from the district's own `people` mixture exactly as the
hero is, so across a world the spread of who narrates tracks who actually lives there
(within 9 points, asserted). They hold the office that keeps this town's particular
trouble, because that is who keeps its story: a **harbourmaster** on an exposed coast, a
**pit-warden** where the ore is, a **warden of the collegium door** on thin ground, a
**gate-warden** where the walls were tested. Nineteen offices appear across a default world.

They speak in the first person, to you. Whose story it is and who is telling it are two
different facts, and the prose keeps them apart — a Hornkin gate-warden narrating a town
the Humans founded says *"This is where the Humans began… I am Hornkin; my family came
later"*, never *"still ours"*. That is pinned by test, because the first cut got it wrong.

The face is **procedural SVG** — no image files, no fonts, nothing fetched, the same rule
the rest of the atlas keeps. Layered skin tones, shaped hair, almond-shaped eyes and
detailed collars give each narrator an illustrated appearance that remains legible at
72px. Portraits use about 7–9 KB of inline markup, with no shared SVG resource IDs, so
several copies can appear together. A common parameter table defines the seven silhouettes:

| people | reads as | ears | crown | snout |
|---|---|---|---|---|
| Humans | cropped hair, rounded ears | round | — | — |
| Sylvans | an elf | long | circlet | — |
| Stonekin | broad, bearded | round | — | — |
| Beastfolk | tufted, muzzled | tuft | — | short, round |
| Hornkin | horned | round | curved horns | — |
| Tideborn | finned, gilled | fin | crest fin | — |
| Drakekin | **a dragon**, scaled brow, slit pupils | fin | swept horns + crest spikes | broad, squared |

Build, ears, hair, brow, crown and muzzle distinguish each people. Every face uses the
same eye and brow construction with restrained expressions; the Drakekin have narrow
vertical pupils. Skin, hair, clothing and background colours mix that people's own
`PEOPLES[k].color` with common material tones. Seeded variations in proportions, colouring
and gaze give residents individual faces, and the same narrator renders identically in
the map card and town drawer. Open and closed mouth states are available for every people.

Tests check all seven identities, two eyes per face, complete accessible labels, bounded
markup size, deterministic variation and offline rendering without resource references.
They also cover invalid inputs: an unknown people falls back to Humans, a non-finite seed
uses zero, and a non-numeric or non-finite size uses 96px. Finite sizes are limited to
16–1024px. Visual review determines how the expressions and silhouettes read at display size.

Run `node scripts/preview-portraits.mjs` to rebuild the standalone
`previews/portraits/index.html` contact sheet. It shows all seven peoples with three
different residents each, including the 72px map card and 104px town drawer sizes.

## Nothing is invented on top of the model

Every clause has a source, and the interface shows it under the prose it produced:

| chapter | composed from |
|---|---|
| **The Coming** | the province's live `people` mixture, and whether `sim.culturalOrigins` puts a people's origin here; the model's own `siteReason` |
| **The Founding** | whether a realm's capital is this province, its `GOVERNMENTS` institution, the district's `faith` mixture and that faith's tenet |
| **The Trial** | the chronicle first — a real `conquest` or `battle` attributed to this province, with its real year — then the landscape: the arcane `rift` field, a nearby legendary place, a live volcano, ice, wetland, freshwater access, ore, exposed coast, hinterland surplus |
| **The Deed** | a hero whose people is sampled from the province's own mixture, and a deed matched to the trial |
| **What Remains** | current `urbanPop`, `ruralPop` and settlement type |

A world with no active volcano tells no story about a burning mountain. A town nobody ever
besieged does not remember a siege — it tells its coast, or its wells, or its harvests, and
tells them with the figure that made them a trial. The same rule the legendary places
already follow: *a world without the landform simply has no legend there.*

## No people is an enemy

The civilization model states plainly that no species has hard-coded intelligence, moral
alignment or combat superiority. A saga generator is exactly where that quietly breaks, so
two properties are pinned by test rather than left to the prose:

- **An adversary is always a state, a disaster or a place.** Never a race. A war adversary
  must resolve to a real realm; a legend adversary to a real legendary place. A people's
  name may not appear as an adversary at all.
- **Heroes track the population.** Across a world, the share of sagas whose hero is a given
  people must stay within 9 points of that people's actual share of the settled population.
  The first cut failed this — always handing the deed to the single runner-up people made
  Sylvans 29% of heroes on 17% of the population. Drawing proportionally among the
  non-majority peoples brought the worst gap to 3 points.

A conqueror's ancestry *is* reported, because the model records `originPeople` for every
realm and records it the same way for the defender. Both sides of a war get to tell it as
their own: the town that fell names the warlord, and the realm that took it is a link away.

## The world holds together

A conqueror belongs to the **realm**, not to the town that fell. Seeded from the defender,
one realm fielded a different warlord in every town it took, and the same name turned up as
a hero two districts away. Seeded from the realm, one name recurs across every telling that
realm appears in — so reading four sagas along a frontier assembles one war.

Where the chronicle ties two towns together, the saga carries a **link**: the other town,
and the chronicle's own sentence about the shared event. It does not claim what that town's
saga says, because that town chose its own trial and it is often a different one.

## Interaction points

- **On the world map** — click a settlement and the card shows the narrator's face, their
  name and office, and their opening line. *Hear the whole story* flies the camera in and
  opens the full telling.
- **In the town drawer** — the portrait, who they are, and their five chapters, each with its
  basis beneath it.
- **The place a chapter is about** — a legendary-place chapter carries a button that flies
  the camera to it.
- **They tell it differently over there** — the linked towns are buttons; following one
  flies there and hands you to *that* town's narrator, who chose a different trial.
- **Search** — a town is findable by its hero, its warlord or its adversary, not just by
  name. Type a hero and the town that remembers them comes up.

## Scope

Sagas and portraits are **derived, not simulated**. They are composed on read, cached per
`(province, year, owner, chronicle length)`, and stored in a `WeakMap` — nothing enters
`sim`, nothing enters the save, and no fingerprint moves. Deleting either module changes
no model quantity.

The narrator is invented, and so is the hero. The wars are not. A name, an office, a face
and a deed are composed in the register of an epic, and the interface never claims
otherwise — the basis line under each chapter is what is actually true of the world. The
`rift` adversary is the furthest this goes: the arcane capacity and rift intensity beneath
a district are real fields, and what the district says came out of them is explicitly
marked as its own account.
