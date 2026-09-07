# What every town remembers

Each settlement composes an epic about itself, in five chapters, from its own state in
this world. Not a story attached to a town — a story *derived from* one, the way the seven
legendary places are derived from the physical extremes that produced them.

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

- **On the world map** — click a settlement and its selection card carries the saga title;
  *Read its saga* flies the camera in and opens it.
- **In the town drawer** — the full five chapters, each with its basis beneath it.
- **The place a chapter is about** — a legendary-place chapter carries a button that flies
  the camera to it.
- **Told elsewhere** — the linked towns are buttons; following one flies there and opens
  that town's own telling of the same year.
- **Search** — a town is findable by its hero, its warlord or its adversary, not just by
  name. Type a hero and the town that remembers them comes up.

## Scope

Sagas are **derived, not simulated**. They are composed on read, cached per `(province,
year, owner, chronicle length)`, and stored in a `WeakMap` — nothing enters `sim`, nothing
enters the save, and no fingerprint moves. Deleting the module changes no model quantity.

The heroes did not exist; the wars did. A name, a rank and a deed are invented in the
register of an epic, and the interface never claims otherwise — the basis line under each
chapter is what is actually true of the world. The `rift` adversary is the furthest this
goes: the arcane capacity and rift intensity beneath a district are real fields, and what
the district says came out of them is explicitly marked as its own account.
