/* Mythological namebases, inspired by Azgaar's culture-base / state-form separation.
 * Keep complete mythic names: splitting them into Markov syllables loses their meaning.
 * A seeded mapping follows each world's cultural homelands, never a fixed species rule.
 * Only complete mythological places are realm names; derived town roots are fiction.
 * Sources and romanization choices: docs/REALM_NAMES.md.
 */
const RealmNames = (() => {
    const base = (id, tradition, entries) => Object.freeze({ id, tradition,
        names: Object.freeze(entries.map(([name, meaning, root]) => Object.freeze({ name, meaning, root }))) });
    const bases = Object.freeze([
        base('norse', 'Norse mythology', [
            ['Asgard', 'the dwelling of the Aesir gods', 'As'],
            ['Midgard', 'the world inhabited by humankind', 'Mid'],
            ['Vanaheim', 'the home of the Vanir gods', 'Vana'],
            ['Alfheim', 'the realm of the light elves', 'Alf'],
            ['Jotunheim', 'the realm of the giants', 'Jotun'],
            ['Niflheim', 'the primordial realm of mist and cold', 'Nifl'],
            ['Muspelheim', 'the realm of primordial fire', 'Muspel'],
            ['Nidavellir', "the place of the golden hall of Sindri's kin", 'Nidav']
        ]),
        base('greek', 'Greek mythology', [
            ['Elysium', 'the blessed afterlife of heroes', 'Elys'],
            ['Hyperborea', 'the legendary land beyond the north wind', 'Hyper'],
            ['Atlantis', "the island kingdom in Plato's account", 'Atlant'],
            ['Tartarus', 'the deep abyss beneath the world', 'Tartar'],
            ['Ogygia', 'the island home of Calypso', 'Ogyg'],
            ['Scheria', 'the island homeland of the Phaeacians', 'Scher'],
            ['Aiaia', 'the island home of Circe', 'Aiai']
        ]),
        base('celtic', 'Celtic mythology', [
            ['Annwn', 'the Otherworld of Welsh tradition', 'Ann'],
            ['Tir na nOg', 'the Land of Youth in Irish tradition', 'Tir'],
            ['Mag Mell', 'the Plain of Delight in Irish tradition', 'Mell'],
            ['Emain Ablach', 'an otherworld island associated with Manannan', 'Emain'],
            ['Caer Sidi', 'an otherworld fortress in Welsh poetry', 'Sidi']
        ]),
        base('arthurian', 'Arthurian legend', [
            ['Avalon', 'the island to which the wounded Arthur is taken', 'Aval'],
            ['Camelot', "the legendary city of Arthur's court", 'Camel'],
            ['Sarras', 'the city associated with the Holy Grail in Arthurian romance', 'Sarr'],
            ['Corbin', 'the Grail castle and its surrounding city in Malory', 'Corbin']
        ]),
        base('finnish', 'Finnish mythology', [
            ['Kalevala', 'the land of Kaleva in the Finnish epic', 'Kalev'],
            ['Pohjola', 'the northern realm ruled by Louhi', 'Pohj'],
            ['Tuonela', 'the realm of the dead', 'Tuon'],
            ['Tapiola', 'the forest domain of Tapio', 'Tapio'],
            ['Ahtola', 'the watery domain of Ahto', 'Ahto'],
            ['Vainola', 'the home of Vainamoinen', 'Vaino']
        ])
    ]);
    const forms = [
        ['Kingdom of $', 'Empire of $', 'Principality of $'],
        ['Holy Kingdom of $', 'Sacred Empire of $', 'Theocracy of $'],
        ['Magocracy of $', 'Arcane Dominion of $', 'Arcane Empire of $'],
        ['Confederacy of $', 'Tribal Federation of $', 'Clan Confederation of $'],
        ['Merchant Republic of $', 'Trade League of $', 'Maritime Republic of $'],
        ['Mountain Kingdom of $', 'Federation of $', 'Highland Principality of $'],
        ['Republic of $', 'Commonwealth of $', 'Free State of $'],
        ['League of $', 'City League of $', 'League of $']
    ];
    function fullName(c) {
        if (!c) return '';
        // Custom names remain exactly as written. Old saves receive a clear state
        // form for display without changing their stored names or histories.
        if (c.namedFor === 'custom') return c.title || c.name || '';
        const title = String(c.title || '');
        if (/\b(empire|kingdom|principality|theocracy|magocracy|dominion|confederacy|confederation|federation|republic|league|commonwealth|state)\b/i.test(title)) return title.replace(/^the /i, '');
        return (forms[c.gov] || forms[0])[0].replace('$', () => c.name || 'Unnamed Realm');
    }
    const qualifiers = ['', 'New', 'Old', 'Upper', 'Lower', 'Greater', 'Lesser', 'North', 'South', 'East', 'West'];
    const key = name => String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
    const hash = value => { let h = 2166136261; for (const ch of String(value)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
    const seed = sim => `${sim.seed ?? 0} / realm names / ${sim.options?.politySeed || 'First-councils'}`;
    function homeOf(sim, c) {
        const p = (sim.provinces || []).find(p => p && p.id === c.capital) || sim.provinces?.[c.capital] || {};
        return p.culturalHome ?? c.originPeople ?? 'unrecorded';
    }
    function preferredBase(sim, c) {
        const recorded = bases.findIndex(b => b.id === c.namingCulture?.baseId);
        if (recorded >= 0) return recorded;
        // Each world's actual cultural homelands share a seeded literary tradition.
        // Coordinates do not split a homeland, and no species has a fixed real culture.
        return hash(`${sim.seed ?? 0} / naming culture / ${homeOf(sim, c)}`) % bases.length;
    }
    function assign(sim, c, { baseId, taken } = {}) {
        // A private hash selects names; naming never consumes simulation randomness.
        const identity = `${seed(sim)} / ${c.capital ?? ''} / ${c.founded ?? ''} / ${c.id ?? ''}`;
        const used = taken || new Set((sim.realms || []).filter(r => r && r !== c).map(r => key(r.name)));
        const requested = bases.findIndex(b => b.id === baseId);
        const b = bases[requested >= 0 ? requested : preferredBase(sim, c)];
        const entries = [...b.names].sort((a, z) => hash(`${identity} / ${a.name}`) - hash(`${identity} / ${z.name}`) || a.name.localeCompare(z.name));
        // Stay within this culture even when its unqualified source names run out.
        for (let round = 0; ; round++) {
            const choices = round === 0 ? qualifiers : qualifiers.slice(1).map(q => `${'New '.repeat(round)}${q}`);
            for (const qualifier of choices) for (const entry of entries) {
                const name = qualifier ? `${qualifier} ${entry.name}` : entry.name;
                if (used.has(key(name))) continue;
                used.add(key(name));
                c.name = name;
                const titles = forms[c.gov] || forms[0];
                c.title = titles[hash(`${identity} / government form`) % titles.length].replace('$', () => name);
                c.namedFor = 'mythology';
                c.nameOrigin = { baseId: b.id, tradition: b.tradition, source: entry.name, meaning: entry.meaning, qualifier, root: entry.root };
                // Independent of nameOrigin: a manual political rename must not erase
                // the language family inherited by its towns and successor realms.
                c.namingCulture = { version: 1, baseId: b.id, tradition: b.tradition, culturalHome: homeOf(sim, c), originPeople: c.originPeople ?? null, source: entry.name, root: entry.root };
                return c;
            }
        }
    }
    function generate(sim) {
        const realms = (sim.realms || []).filter(Boolean);
        const keep = c => c.alive === false || c.namedFor === 'custom';
        const taken = new Set(realms.filter(keep).map(c => key(c.name)));
        for (const c of realms.filter(c => !keep(c)).sort((a, b) => (a.id ?? 0) - (b.id ?? 0))) assign(sim, c, { taken });
    }
    function describe(c) {
        const origin = c?.namedFor === 'mythology' && c.nameOrigin;
        if (!origin?.tradition || !origin.source || !origin.meaning) return '';
        return `${origin.tradition}: ${origin.source}, ${origin.meaning}.${origin.qualifier ? ` “${origin.qualifier}” distinguishes this realm from another namesake.` : ''}`;
    }
    return Object.freeze({ bases, assign, generate, describe, fullName });
})();
