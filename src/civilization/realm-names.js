/* Mythological namebases, inspired by Azgaar's culture-base / state-form separation.
 * Keep complete mythic names: splitting them into Markov syllables loses their meaning.
 * These are literary naming traditions, independent of peoples and state faiths.
 * Sources and romanization choices: docs/REALM_NAMES.md.
 */
const RealmNames = (() => {
    const base = (id, tradition, entries) => Object.freeze({ id, tradition,
        names: Object.freeze(entries.map(([name, meaning]) => Object.freeze({ name, meaning }))) });
    const bases = Object.freeze([
        base('norse', 'Norse mythology', [
            ['Asgard', 'the dwelling of the Aesir gods'],
            ['Midgard', 'the world inhabited by humankind'],
            ['Vanaheim', 'the home of the Vanir gods'],
            ['Alfheim', 'the realm of the light elves'],
            ['Jotunheim', 'the realm of the giants'],
            ['Niflheim', 'the primordial realm of mist and cold'],
            ['Muspelheim', 'the realm of primordial fire'],
            ['Nidavellir', 'the place of the golden hall of Sindri\'s kin']
        ]),
        base('greek', 'Greek mythology', [
            ['Olympus', 'the mountain dwelling of the Olympian gods'],
            ['Elysium', 'the blessed afterlife of heroes'],
            ['Hyperborea', 'the legendary land beyond the north wind'],
            ['Atlantis', 'the island kingdom in Plato\'s account'],
            ['Tartarus', 'the deep abyss beneath the world'],
            ['Ogygia', 'the island home of Calypso'],
            ['Scheria', 'the island homeland of the Phaeacians'],
            ['Aiaia', 'the island home of Circe']
        ]),
        base('egyptian', 'Egyptian mythology', [
            ['Aaru', 'the Field of Reeds in the blessed afterlife'],
            ['Duat', 'the otherworld traversed by the sun and the dead'],
            ['Amenti', 'the western realm of the dead'],
            ['Osiris', 'the god associated with rebirth and the afterlife'],
            ['Isis', 'the goddess associated with magic and protection'],
            ['Horus', 'the falcon god associated with kingship'],
            ['Ra', 'the sun god who journeys across the sky']
        ]),
        base('celtic', 'Celtic and Arthurian tradition', [
            ['Avalon', 'the island to which the wounded Arthur is taken'],
            ['Annwn', 'the Otherworld of Welsh tradition'],
            ['Tir na nOg', 'the Land of Youth in Irish tradition'],
            ['Mag Mell', 'the Plain of Delight in Irish tradition'],
            ['Emain Ablach', 'an otherworld island associated with Manannan'],
            ['Caer Sidi', 'an otherworld fortress in Welsh poetry']
        ]),
        base('mesopotamian', 'Mesopotamian mythology', [
            ['Dilmun', 'the pure land in the story of Enki and Ninhursag'],
            ['Abzu', 'the subterranean freshwater realm associated with Enki'],
            ['Inanna', 'the goddess associated with love, warfare and Venus'],
            ['Enki', 'the god associated with wisdom and fresh water'],
            ['Ninhursag', 'the mother goddess associated with the mountains'],
            ['Ereshkigal', 'the queen of the underworld']
        ]),
        base('hindu', 'Hindu mythology', [
            ['Amaravati', 'the celestial city of Indra'],
            ['Alaka', 'the city of Kubera'],
            ['Vaikuntha', 'the abode of Vishnu'],
            ['Kailasa', 'the mountain abode of Shiva'],
            ['Svarga', 'a heavenly realm of the gods'],
            ['Meru', 'the cosmic mountain at the center of the world']
        ]),
        base('chinese', 'Chinese mythology', [
            ['Kunlun', 'the sacred mountain associated with the Queen Mother of the West'],
            ['Penglai', 'an island of immortals in the eastern sea'],
            ['Yingzhou', 'one of the three island mountains of immortals'],
            ['Fangzhang', 'one of the three island mountains of immortals'],
            ['Fusang', 'the eastern tree associated with the rising suns'],
            ['Guixu', 'the great abyss into which the waters flow']
        ]),
        base('japanese', 'Japanese mythology', [
            ['Takamagahara', 'the heavenly plain of the kami'],
            ['Ashihara', 'short for Ashihara no Nakatsukuni, the reed-plain human world'],
            ['Yomi', 'the land of the dead visited by Izanagi'],
            ['Tokoyo', 'the Otherworld, often imagined beyond the sea'],
            ['Ryugu', 'the undersea palace of the dragon king'],
            ['Onogoro', 'the island formed by Izanagi and Izanami']
        ]),
        base('aztec', 'Aztec mythology', [
            ['Aztlan', 'the legendary ancestral homeland of the Mexica'],
            ['Tlalocan', 'the paradise associated with the rain god Tlaloc'],
            ['Mictlan', 'the underworld ruled by Mictlantecuhtli'],
            ['Tamoanchan', 'a mythical place of origins'],
            ['Chicomoztoc', 'the Seven Caves of ancestral emergence'],
            ['Quetzalcoatl', 'the Feathered Serpent deity']
        ]),
        base('finnish', 'Finnish mythology', [
            ['Kalevala', 'the land of Kaleva in the Finnish epic'],
            ['Pohjola', 'the northern realm ruled by Louhi'],
            ['Tuonela', 'the realm of the dead'],
            ['Tapiola', 'the forest domain of Tapio'],
            ['Ahtola', 'the watery domain of Ahto'],
            ['Vainola', 'the home of Vainamoinen']
        ])
    ]);
    const forms = [
        ['Kingdom of $', 'Crown of $', 'the $ Throne'],
        ['Sanctuary of $', 'the $ Covenant', 'See of $'],
        ['the $ Collegium', 'the $ Athenaeum', 'Scholars of $'],
        ['the $ Confederacy', 'the Clans of $', 'the $ Accord'],
        ['the $ Merchant League', 'the $ Concession', 'Factors of $'],
        ['the $ Holds', 'the $ Marches', 'Wardens of $'],
        ['Republic of $', 'the $ Commonwealth', 'the Free State of $'],
        ['the $ City League', 'the $ Compact', 'the $ Assembly']
    ];
    const qualifiers = ['', 'New', 'Old', 'Upper', 'Lower', 'Greater', 'Lesser', 'North', 'South', 'East', 'West'];
    const key = name => String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
    const seed = sim => `${sim.seed} / realm names / ${sim.options?.politySeed || 'First-councils'}`;
    function preferredBase(sim, c) {
        const p = sim.provinces[c.capital] || {};
        // Nearby capitals share a literary namebase; regional assignment is seeded,
        // not a rule that associates a real tradition with one species or climate.
        const region = `${p.landmass ?? 0} / ${Math.floor((p.x || 0) / 50)} / ${Math.floor((p.y || 0) / 40)}`;
        return seedHash(`${seed(sim)} / ${region}`) % bases.length;
    }
    function shuffled(items, rng) {
        const out = [...items];
        for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
    }
    function assign(sim, c, { baseId, taken } = {}) {
        // Never draw from the politics or annual simulation random streams.
        const rng = random32(seedHash(`${seed(sim)} / ${c.capital} / ${c.founded} / ${c.id}`));
        const used = taken || new Set(sim.realms.filter(r => r !== c).map(r => key(r.name)));
        const requested = bases.findIndex(b => b.id === baseId);
        const first = requested >= 0 ? requested : preferredBase(sim, c);
        const ordered = [bases[first], ...shuffled(bases.filter((_, i) => i !== first), rng)]
            .flatMap(b => shuffled(b.names, rng).map(entry => ({ b, entry })));
        // Exhaust recognizable names before adding a qualifier. Every fallback still
        // contains a complete mythological source, including in a crowded late world.
        for (let round = 0; ; round++) {
            const choices = round === 0 ? qualifiers : qualifiers.slice(1).map(q => `${'New '.repeat(round)}${q}`);
            for (const qualifier of choices) {
                for (const { b, entry } of ordered) {
                    const name = qualifier ? `${qualifier} ${entry.name}` : entry.name;
                    if (used.has(key(name))) continue;
                    used.add(key(name));
                    c.name = name;
                    const titles = forms[c.gov] || forms[0];
                    c.title = titles[Math.floor(rng() * titles.length)].replace('$', name);
                    c.namedFor = 'mythology';
                    c.nameOrigin = { baseId: b.id, tradition: b.tradition, source: entry.name, meaning: entry.meaning, qualifier };
                    return c;
                }
            }
        }
    }
    function generate(sim) {
        // Reserve custom and historical names so rerunning this pass is safe and stable.
        const keep = c => !c.alive || c.namedFor === 'custom';
        const taken = new Set(sim.realms.filter(keep).map(c => key(c.name)));
        for (const c of sim.realms.filter(c => !keep(c)).sort((a, b) => a.id - b.id)) assign(sim, c, { taken });
    }
    function describe(c) {
        const origin = c?.namedFor === 'mythology' && c.nameOrigin;
        if (!origin?.tradition || !origin.source || !origin.meaning) return '';
        return `${origin.tradition}: ${origin.source}, ${origin.meaning}.${origin.qualifier ? ` “${origin.qualifier}” distinguishes this realm from another namesake.` : ''}`;
    }
    return Object.freeze({ bases, assign, generate, describe });
})();
