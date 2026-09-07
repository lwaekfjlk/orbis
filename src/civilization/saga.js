/** The epic each settlement tells about itself.
 *
 * Every clause is DERIVED. The peoples in a saga are the province's own live mixture,
 * the faith is its own, the adversary is a polity that really took this town or a place
 * the physical model really put nearby, and the year is a real year. A world with no
 * volcano tells no story about a burning mountain; a town nobody ever besieged does not
 * remember a siege. Each chapter carries the model fact it was built from, the way the
 * legendary places carry the measurement they were chosen by.
 *
 * NO PEOPLE IS AN ENEMY HERE. The civilization model is explicit that no species has
 * hard-coded intelligence, moral alignment or combat superiority, and this respects that:
 * an adversary is always a STATE, a DISASTER or a PLACE. A conqueror's ancestry is
 * reported because the model happens to record it, exactly as the defender's is, and
 * either side of the same war reads the other as the enemy in its own telling.
 */
const Saga = (() => {
    const cached = new WeakMap();
    // Sound registers, not ranks. Each people names its children differently; none of
    // these syllables carries a virtue, and heroes are drawn from whoever actually lives
    // in the province. `mid` is usually empty: it exists to widen the space enough that a
    // town's hero and some realm's warlord stop landing on the same name.
    const VOICES = [
        { lead: ['Ald', 'Bren', 'Cor', 'Hal', 'Mar', 'Ost', 'Rand', 'Wen'], mid: ['', '', '', 'e', 'be', 'ho'], tail: ['ric', 'wyn', 'mund', 'gar', 'dis', 'ath'] },
        { lead: ['Aeli', 'Ithe', 'Lyra', 'Neve', 'Sila', 'Thali', 'Ysse'], mid: ['', '', '', 'va', 'me', 'nu'], tail: ['ndel', 'riel', 'wyn', 'ath', 'lien', 'sae'] },
        { lead: ['Bur', 'Dor', 'Grim', 'Kar', 'Thrun', 'Vor', 'Bal'], mid: ['', '', '', 'ok', 'ba', 'un'], tail: ['dek', 'grim', 'nar', 'stone', 'kar', 'dun'] },
        { lead: ['Ash', 'Fen', 'Kir', 'Ras', 'Sura', 'Tave', 'Yune'], mid: ['', '', '', 'ta', 'ni', 'sho'], tail: ['ka', 'mir', 'sha', 'ro', 'tai', 'vek'] },
        { lead: ['Ammu', 'Dhar', 'Kesh', 'Oru', 'Sarn', 'Tuma', 'Vash'], mid: ['', '', '', 'ne', 'la', 'ri'], tail: ['ka', 'than', 'reh', 'mora', 'dun', 'ai'] },
        { lead: ['Bel', 'Cael', 'Isa', 'Mere', 'Nael', 'Ono', 'Tira'], mid: ['', '', '', 'lu', 'she', 'vo'], tail: ['mar', 'wave', 'siren', 'thys', 'lo', 'ren'] },
        { lead: ['Azh', 'Drak', 'Ferr', 'Kaal', 'Sorn', 'Uth', 'Zeri'], mid: ['', '', '', 'ga', 'vu', 'ka'], tail: ['ax', 'moth', 'zar', 'kan', 'ith', 'oth'] }
    ];
    const RANKS = ['the Ferryreeve', 'the Warden', 'the Shieldwright', 'the Lampkeeper', 'the Hollow-walker', 'the Oathbound', 'the Roadbreaker', 'the Quiet', 'the Twice-drowned', 'the Unhoused'];
    const roll = (p, salt, extra = 0) => hash2(p.i, salt, (extra | 0) + 977);
    const pickFrom = (list, r) => list[Math.min(list.length - 1, Math.floor(clamp(r, 0, .9999) * list.length))];
    /** A hero belongs to a people that actually lives here, in the proportion it lives here. */
    function personOf(p, salt, peopleIndex) {
        const k = peopleIndex ?? Folk.pick(p.people, roll(p, salt));
        const v = VOICES[k] || VOICES[0];
        return { people: k, peopleName: PEOPLES[k].name, color: PEOPLES[k].color,
            name: pickFrom(v.lead, roll(p, salt + 11)) + pickFrom(v.mid, roll(p, salt + 17)) + pickFrom(v.tail, roll(p, salt + 23)),
            rank: pickFrom(RANKS, roll(p, salt + 31)) };
    }
    /** A conqueror belongs to the REALM, not to the town that fell. Seeding this from the
     * defender gave one realm a different warlord in every town it took, and let the same
     * name turn up as a hero two districts away. Seeded from the realm, one name recurs
     * across every telling that realm appears in — which is what makes a map into a history. */
    function warlordOf(sim, c) {
        return personOf({ i: (c.capital * 131 + c.id * 7 + 5) | 0 }, 401, c.originPeople);
    }
    const share = (mix, k) => Math.round((mix[k] || 0) * 100);
    const dominant = mix => mix.indexOf(Math.max(...mix));
    /** The second people of a place, when there genuinely is one worth naming. */
    function second(mix) {
        const first = dominant(mix);
        let best = -1, value = 0;
        for (let k = 0; k < mix.length; k++)
            if (k !== first && mix[k] > value) { value = mix[k]; best = k; }
        return value >= .12 ? best : -1;
    }
    /** Some tellings put the deed on someone who was not of the district's majority.
     * That draw still has to be PROPORTIONAL among the rest: always handing it to the
     * single runner-up makes one people the world's hero, which is the thing this whole
     * module is built not to do. */
    function fromMinority(mix, r) {
        const first = dominant(mix), rest = mix.map((v, k) => k === first ? 0 : v);
        return rest.some(v => v > 0) ? Folk.pick(rest, r) : first;
    }
    /** Events the chronicle actually attributes to this province. */
    function eventsAt(sim, p) {
        return sim.events.filter(e => e.details?.province === p.id || (e.type === 'founding' && sim.realms[e.actors?.[0]]?.capital === p.id));
    }
    /** The nearest legendary place, if the physical model put one within reach of here. */
    function legendNear(w, p, reach = 26) {
        let best = null;
        for (const f of w.legends || []) {
            const d = Math.hypot(f.x - p.x, f.y - p.y);
            if (d < reach && (!best || d < best.d))
                best = { f, d };
        }
        return best;
    }
    /** What this town had to survive. History first, because it is specific; then the
     * landscape, which is always there. Never an invented cosmic evil: the closest this
     * comes is the rift, and the rift is a field the physical model actually computes. */
    function adversary(w, sim, p, events) {
        const taken = events.filter(e => e.type === 'conquest').at(-1);
        if (taken) {
            const c = sim.realms[taken.actors[0]];
            if (c) {
                const lord = warlordOf(sim, c);
                return { kind: 'conqueror', year: taken.year, realm: c,
                    name: `${lord.name} of ${c.name}`, lord,
                    styled: `the ${GOVERNMENTS[c.gov].toLowerCase()} of ${c.name}`,
                    basis: `chronicle: ${c.name} took ${p.name} in ${taken.year}` };
            }
        }
        const siege = events.filter(e => e.type === 'battle').at(-1);
        if (siege) {
            const c = sim.realms[siege.actors[0]];
            if (c)
                return { kind: 'siege', year: siege.year, realm: c, name: c.name,
                    styled: `the armies of ${c.name}`, lord: warlordOf(sim, c),
                    basis: `chronicle: ${c.name} fought at ${p.name} in ${siege.year}` };
        }
        // The arcane fields are real numbers on this cell. What a town says came out of
        // them is its own telling, and is marked as such.
        const rift = w.rift?.[p.i] || 0;
        if (p.mana > .60 || rift > .55) {
            const named = pickFrom(['the Unmade Thing', 'the Sleepless Guest', 'what the rift let through', 'the Second Shadow', 'the Nameless Claimant'], roll(p, 211));
            return { kind: 'rift', name: named, styled: named, telling: true,
                basis: `arcane capacity ${p.mana.toFixed(2)}, rift intensity ${rift.toFixed(2)} — the adversary is this district's own account of those fields, not a modelled entity` };
        }
        const near = legendNear(w, p);
        if (near)
            return { kind: 'legend', place: near.f, name: near.f.name,
                styled: near.f.name, distance: Math.round(near.d),
                basis: `${near.f.name} (${near.f.kind.toLowerCase()}) lies ${Math.round(near.d)} cells away` };
        const volcano = (w.volcanoes || []).filter(v => v.active).map(v => ({ v, d: Math.hypot(v.x - p.x, v.y - p.y) })).sort((a, b) => a.d - b.d)[0];
        if (volcano && volcano.d < 14)
            return { kind: 'mountain', name: pickFrom(['the Burning Mountain', 'the Mountain That Wakes', 'the Ashfall Years'], roll(p, 217)),
                styled: 'the mountain that would not sleep',
                basis: `an active volcano lies ${Math.round(volcano.d)} cells away` };
        if ((w.ice?.[p.i] || 0) > 40 || (p.altitude > 1500 && p.temp < 4))
            return { kind: 'winter', name: pickFrom(['the Long Winter', 'the Year Without a Thaw', 'the White Silence'], roll(p, 223)),
                styled: 'the winter that did not break',
                basis: `site elevation ${Math.round(p.altitude)}, ice ${Math.round(w.ice?.[p.i] || 0)}, mean temperature ${p.temp.toFixed(1)}` };
        if (p.wet > .30)
            return { kind: 'flood', name: pickFrom(['the Drowning Springs', 'the River That Turned', 'the Standing Water'], roll(p, 227)),
                styled: 'water that would not stay in its channel',
                basis: `wetland fraction ${p.wet.toFixed(2)}` };
        if (p.fresh < .45)
            return { kind: 'thirst', name: pickFrom(['the Drying of the Wells', 'the Salt Years', 'the Closing of the Springs'], roll(p, 229)),
                styled: 'the years the water failed',
                basis: `modelled freshwater access ${p.fresh.toFixed(2)}` };
        if (p.ore > .55 && p.altitude > 700)
            return { kind: 'delve', name: pickFrom(['the Deep Fall', 'the Shaft That Answered', 'the Lost Level'], roll(p, 233)),
                styled: 'the workings themselves',
                basis: `ore index ${p.ore.toFixed(2)} at elevation ${Math.round(p.altitude)}` };
        if (p.harbor > .35)
            return { kind: 'sea', name: pickFrom(['the Wrecking Seasons', 'the Grey Fleet', 'the Winter Gales', 'the Year the Boats Did Not Come Back'], roll(p, 239)),
                styled: 'the sea itself',
                basis: `exposed coast, harbour index ${p.harbor.toFixed(2)}` };
        return { kind: 'hunger', name: pickFrom(['the Hungry Years', 'the Thin Harvests', 'the Winter of Divided Bread'], roll(p, 241)),
            styled: 'a hunger that outlasted two harvests',
            basis: `hinterland surplus supports ${Math.round(p.urbanSupport).toLocaleString('en-US')} people` };
    }
    const DEEDS = {
        conqueror: ['refused the terms and held the gate until the terms changed', 'walked out alone to the siege lines and came back with the town still standing', 'lost the walls and took them back before the year turned'],
        siege: ['held the approaches through a winter of it', 'opened the granaries against every counsel and outlasted the encampment', 'broke the line at the ford and did not survive the crossing'],
        rift: ['went in after it and came out the other side changed and unwilling to say how', 'held the door of the place for one night, which was all that was asked and more than was expected', 'ended it, by an account the collegium has never been able to check'],
        legend: ['went to that place and came back able to describe it', 'led the first party there and brought back the count of who returned', 'stood a season at its edge so the road behind could be finished'],
        mountain: ['read the mountain right and emptied the valley before it spoke', 'went up while it was burning to bring down those who had not run'],
        winter: ['kept the fires and the count of the living until the thaw', 'brought the herds down through the pass in the dark'],
        flood: ['cut the relief channel by hand and by night while the water came up', 'moved the whole lower town uphill in nine days and was blamed for it afterwards'],
        thirst: ['found the deep water and cut the channel that still runs', 'rationed the cisterns and was hated for it until the rain'],
        delve: ['went down after the shift that did not come up', 'closed the level against the owners\' word and was proved right by the collapse'],
        sea: ['put out in the worst of it and brought back four crews', 'built the first breakwater and drowned before it was finished'],
        hunger: ['divided the last stores by household and kept nothing back', 'walked to three neighbouring markets and returned with grain and a debt']
    };
    const REMEMBRANCE = ['a stone by the market with the name still cut into it', 'a name read aloud on the founding day and on no other', 'a lamp kept lit in the sanctuary at that family\'s expense', 'a gate that carries the name and no explanation', 'a song the ferrymen use to time their strokes'];
    /** The landscape trials, told with the number that produced them. A trial that reads
     * as a label — "the sea itself" — is not a telling; the figure is what makes it one. */
    const TRIALS = {
        mountain: (p, f) => `${p.name} calls it ${f.name}. The mountain is close enough that its ash reaches the fields, and close enough that the district has always known which way the wind would carry it.`,
        winter: (p, f) => `${p.name} calls it ${f.name}. At ${Math.round(p.altitude)} above the sea, with a mean of ${p.temp.toFixed(1)}°, the cold here is not a season that passes but a thing the town is built against, and in the worst of those years it very nearly won.`,
        flood: (p, f) => `${p.name} calls it ${f.name}. Nearly a third of this district is ground that holds water, and the year it decided where to sit is the year the lower streets were given up and rebuilt higher.`,
        thirst: (p, f) => `${p.name} calls it ${f.name}. Freshwater access here reads ${p.fresh.toFixed(2)} — thin enough that the town has always been one dry season from an argument, and once was one dry season from nothing.`,
        delve: (p, f) => `${p.name} calls it ${f.name}. The ore that made this place is ${Math.round(p.altitude)} up and a long way in, and the town keeps a separate count of the people the workings took.`,
        sea: (p, f) => `${p.name} calls it ${f.name}. This is an open coast — harbour shelter reads ${p.harbor.toFixed(2)} — and the town has always paid for its trade in crews, in a currency it never agreed to.`,
        hunger: (p, f) => `${p.name} calls it ${f.name}. The hinterland around it feeds about ${Math.round(p.urbanSupport).toLocaleString('en-US')} people and no more, and the years it fed fewer are the years this telling is about.`
    };

    const fmt = v => Math.round(v).toLocaleString('en-US');
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    // 'City' / 'Town' / 'Village' read as a count; 'Dispersed households' does not.
    const articled = type => /^[A-Z][a-z]+$/.test(type) ? 'a ' + type.toLowerCase() : type.toLowerCase();
    function compose(w, sim, p) {
        const events = eventsAt(sim, p);
        const realm = sim.realms[p.owner], founded = sim.realms.find(c => c.alive && c.capital === p.id);
        const first = dominant(p.people), other = second(p.people), faith = dominant(p.faith);
        const origins = sim.culturalOrigins || { peoples: [], faiths: [] };
        const homeland = origins.peoples.find(o => o.province === p.id);
        const faithHome = origins.faiths.find(o => o.province === p.id);
        const foe = adversary(w, sim, p, events);
        const hero = personOf(p, 101, roll(p, 57) < .30 ? fromMinority(p.people, roll(p, 59)) : undefined);
        const chapters = [];
        const add = (heading, text, basis, anchor = null) => chapters.push({ heading, text, basis, anchor });
        // I. Why anyone stopped here at all.
        add('The Coming',
            homeland
                ? `The ${PEOPLES[first].name} count this the ground they began on. Everything else in the ${p.name} telling is measured from that, and ${share(p.people, first)}% of the district is still theirs.`
                : `${PEOPLES[first].name} came to this ground and stayed — ${share(p.people, first)}% of the district in the current count${other >= 0 ? `, alongside ${PEOPLES[other].name} at ${share(p.people, other)}%` : ''}. ${p.siteReason.split('.')[0]}.`,
            homeland ? 'this province is a modelled origin point for that people' : `province people mixture; siteReason: ${p.siteReason.split('.')[0]}`);
        // II. What the place became, and under whom.
        add('The Founding',
            founded
                ? `${cap(founded.title)} formed here rather than being handed down from anywhere. ${GOVERNMENTS[founded.gov]} is what the councils settled on. The ${FAITHS[faith].name} keeps ${share(p.faith, faith)}% of the district, and its tenet is remembered as "${FAITHS[faith].tenet}"`
                : realm
                    ? `${p.name} did not become a capital. It answers to ${realm.name}, and has done since the ${GOVERNMENTS[realm.gov].toLowerCase()} reached this far. The ${FAITHS[faith].name} holds ${share(p.faith, faith)}% of the district${faithHome ? ', and began here' : ''}.`
                    : `No crown has ever held ${p.name}. The ${FAITHS[faith].name} keeps ${share(p.faith, faith)}% of it${faithHome ? ', and began here' : ''}, and the rest is argued about freely.`,
            founded ? `realm ${founded.title} has its capital at this province` : realm ? `owned by realm ${realm.name}` : 'province is unclaimed in the political model');
        // III. The trial. Specific if the chronicle has one, landscape if it does not.
        add('The Trial',
            foe.kind === 'conqueror'
                ? `In ${foe.year} ${foe.styled} came, and ${p.name} changed hands. Their line is reckoned ${PEOPLES[foe.realm.originPeople].name} — the chronicle records that of every realm, and records the same of this one.`
                : foe.kind === 'siege'
                    ? `In ${foe.year} ${foe.styled} stood in front of the town and did not leave. The walls held; the fields did not.`
                    : foe.kind === 'rift'
                        ? `${p.name} sits on ground the collegia read as thin. What the district says came through is called ${foe.name}; what can be measured is the arcane capacity and the rift beneath, and those are not in dispute.`
                        : foe.kind === 'legend'
                            ? `${foe.place.name} lies ${foe.distance} districts out, close enough that the road to it is a road anyone here can name. ${foe.place.lore}`
                            : (TRIALS[foe.kind] || TRIALS.hunger)(p, foe),
            foe.basis,
            foe.place ? { kind: 'legend', x: foe.place.x, y: foe.place.y, i: foe.place.i, name: foe.place.name } : null);
        // IV. Someone did something about it. Their people is drawn from who lives here.
        add('The Deed',
            `${hero.name} ${hero.rank}, ${PEOPLES[hero.people].name}, ${pickFrom(DEEDS[foe.kind] || DEEDS.hunger, roll(p, 71))}. ` +
            (foe.lord ? `The other side names ${foe.lord.name} in the same place in the story, and tells it the other way round.` : 'No one on the other side is named, because there was no other side to name.'),
            `hero people sampled from this province's live mixture (${PEOPLES[hero.people].name} at ${share(p.people, hero.people)}%)`);
        // V. What of it is still standing.
        add('What Remains',
            `${p.name} is ${articled(p.settlementType)} now, ${fmt(p.urbanPop)} within the walls and ${fmt(p.ruralPop)} on its land. ` +
            `They keep ${pickFrom(REMEMBRANCE, roll(p, 83))}. ` +
            (events.some(e => e.type === 'conquest') ? 'The peoples and the faiths did not change when the flag did.' : 'Nothing has taken it.'),
            `current model state: urbanPop ${Math.round(p.urbanPop)}, ruralPop ${Math.round(p.ruralPop)}, type ${p.settlementType}`);
        return { province: p.id, name: p.name, title: titleFor(p, hero, foe), hero, adversary: foe,
            people: first, faith, chapters, events: events.length,
            anchor: chapters.find(c => c.anchor)?.anchor || null };
    }
    function titleFor(p, hero, foe) {
        const forms = [`${hero.name} and ${foe.name}`, `The ${p.name} Telling`, `What ${p.name} Remembers`, `The Matter of ${p.name}`];
        return pickFrom(forms, roll(p, 131));
    }
    /** Other settlements the chronicle ties to this one through the same event, so the
     * two can be read against each other. This is where a world stops being a list of
     * places. It reports the CHRONICLE's sentence, not a claim about what the other town's
     * saga says: that town chose its own trial, and it is often a different one. */
    function links(w, sim, p) {
        const out = [];
        for (const e of sim.events) {
            if (!e.actors?.length || e.details?.province !== p.id)
                continue;
            for (const id of e.actors) {
                const c = sim.realms[id], seat = c && sim.provinces[c.capital];
                if (!seat || seat.id === p.id || !seat.settled || out.some(o => o.province === seat.id))
                    continue;
                out.push({ province: seat.id, name: seat.name, realm: c.name, year: e.year, type: e.type,
                    relation: `seat of ${c.name}`, record: e.text });
            }
        }
        return out.slice(0, 4);
    }
    function of(w, sim, p) {
        if (!p?.settled)
            return null;
        let book = cached.get(sim);
        if (!book) {
            book = new Map();
            cached.set(sim, book);
        }
        const key = `${p.id}/${sim.year}/${p.owner}/${sim.events.length}`;
        if (book.has(key))
            return book.get(key);
        const saga = compose(w, sim, p);
        saga.links = links(w, sim, p);
        book.set(key, saga);
        return saga;
    }
    return { of, personOf, adversary, legendNear, VOICES, version: 1 };
})();
