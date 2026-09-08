/* Towns inherit a realm's literary name family, while their religion and site
 * shape its local vocabulary. These derived words and patrons are game fiction:
 * the syllables below are a naming palette, not translations of ancient languages.
 * This independent pass never draws from simulation RNG or changes its geography.
 */
const PlaceNames = (() => {
    const version = 1;
    const faithNames = ['Dawn Communion', 'Veil of Stars', 'Rootbound Covenant', 'Ancestral Forge', 'Tideway', 'Manyfold Tradition'];
    const motifs = ['dawn and sanctuary', 'stars and learning', 'groves and ancestors', 'craft and oaths', 'tides and hospitality', 'local shrines and meeting places'];
    const palettes = {
        norse: {
            roots: ['Arv', 'Svan', 'Hald', 'Skel'], links: ['ar', 'en', 'val', 'ul', 'kel', 'or', 'nar', 'ir'],
            persons: ['vild', 'runa', 'rik', 'hild', 'vard', 'dis', 'kelda', 'frid', 'unn', 'var', 'lind', 'mund'],
            motifs: [['lys', 'dag', 'helg'], ['stjar', 'ves', 'run'], ['ask', 'eik', 'lund'], ['eld', 'hamr', 'smid'], ['sjo', 'bylg', 'nav'], ['ting', 'var', 'sam']],
            tails: { common: ['heim', 'stad', 'by'], coast: ['vik', 'havn', 'nes'], water: ['fjord', 'sund', 'vik'], river: ['ford', 'vad', 'bek'], upland: ['borg', 'fjell', 'hald'], forest: ['lund', 'holt', 'skog'], marsh: ['myr', 'fen', 'mose'], arid: ['dal', 'gard', 'brunn'] }
        },
        greek: {
            roots: ['Aster', 'Elar', 'Ther', 'Kyren'], links: ['a', 'e', 'io', 'an', 'el', 'or', 'ess', 'on'],
            persons: ['andros', 'ene', 'ion', 'thea', 'oros', 'ale', 'ides', 'essa', 'onel', 'iane', 'eron', 'alia'],
            motifs: [['aurel', 'phot', 'helen'], ['astr', 'sel', 'lyr'], ['dry', 'mel', 'anth'], ['chal', 'ther', 'pyrr'], ['thal', 'naus', 'lim'], ['koin', 'agor', 'pan']],
            tails: { common: ['polis', 'ion', 'eia'], coast: ['limen', 'naia', 'thalos'], water: ['limne', 'nesos', 'aia'], river: ['potamos', 'rheon', 'gephyra'], upland: ['akra', 'pyrgos', 'oros'], forest: ['alsos', 'drys', 'yle'], marsh: ['eleia', 'limne', 'naia'], arid: ['krene', 'thera', 'pyrgos'] }
        },
        celtic: {
            roots: ['Aren', 'Bryn', 'Eir', 'Mael'], links: ['a', 'wyn', 'el', 'bran', 'or', 'ith', 'en', 'roan'],
            persons: ['gwen', 'elan', 'oc', 'rynn', 'wen', 'ael', 'anna', 'dren', 'eth', 'vara', 'rith', 'onne'],
            motifs: [['aur', 'gwyn', 'llan'], ['ser', 'aran', 'elun'], ['derw', 'bryn', 'roan'], ['gof', 'garan', 'bran'], ['mor', 'aber', 'trel'], ['teir', 'cyv', 'elan']],
            prefixes: true,
            tails: { common: ['Caer', 'Dun', 'Tre'], coast: ['Aber', 'Inver', 'Porth'], water: ['Llyn', 'Loch', 'Inver'], river: ['Aber', 'Ath', 'Inver'], upland: ['Dun', 'Ben', 'Caer'], forest: ['Coed', 'Glyn', 'Derry'], marsh: ['Cors', 'Glyn', 'Llyn'], arid: ['Dun', 'Caer', 'Tre'] }
        },
        arthurian: {
            roots: ['Avel', 'Bel', 'Car', 'Lorien'], links: ['ar', 'el', 'bel', 'wen', 'or', 'gal', 'mor', 'ros'],
            persons: ['dor', 'ien', 'aine', 'ric', 'elle', 'oran', 'is', 'ard', 'ean', 'wyn', 'ant', 'ise'],
            motifs: [['luc', 'clar', 'mer'], ['astr', 'ves', 'lor'], ['bran', 'thorn', 'el'], ['ald', 'brand', 'fer'], ['mar', 'nav', 'bel'], ['com', 'wen', 'gal']],
            tails: { common: ['court', 'wick', 'combe'], coast: ['haven', 'port', 'mont'], water: ['mere', 'lake', 'isle'], river: ['ford', 'bourne', 'bridge'], upland: ['fort', 'mont', 'keep'], forest: ['wood', 'holt', 'dene'], marsh: ['mere', 'fen', 'marsh'], arid: ['well', 'court', 'mont'] }
        },
        finnish: {
            roots: ['Vaar', 'Ilm', 'Aun', 'Kaar'], links: ['a', 'i', 'o', 'el', 'ar', 'in', 'al', 'en'],
            persons: ['aino', 'armi', 'tar', 'eli', 'ari', 'anna', 'ervo', 'ikki', 'ula', 'elma', 'ina', 'alvi'],
            motifs: [['val', 'sar', 'arm'], ['taht', 'kuu', 'ilm'], ['mets', 'juur', 'leht'], ['raut', 'ahj', 'tak'], ['meri', 'aal', 'ven'], ['kyl', 'sov', 'piir']],
            tails: { common: ['la', 'nen', 'kylä'], coast: ['ranta', 'niemi', 'satama'], water: ['järvi', 'saari', 'lampi'], river: ['joki', 'koski', 'virta'], upland: ['linna', 'vaara', 'mäki'], forest: ['salo', 'lehto', 'metsä'], marsh: ['suo', 'neva', 'räme'], arid: ['kangas', 'la', 'mäki'] }
        }
    };
    const key = name => String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
    const hash = value => { let h = 2166136261; for (const ch of String(value)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
    const pick = (items, seed) => items[hash(seed) % items.length];
    const dominant = weights => {
        if (!weights?.length) return null;
        let best = -1, value = -Infinity;
        for (let i = 0; i < weights.length; i++) if (Number.isFinite(weights[i]) && weights[i] > value) { value = weights[i]; best = i; }
        return best >= 0 ? best : null;
    };
    const faithIndex = value => Number.isInteger(value) && value >= 0 && value < faithNames.length ? value : null;
    const provinces = sim => (sim.provinces || []).filter(Boolean);
    const realms = sim => (sim.realms || []).filter(Boolean);
    function ownerOf(sim, p) {
        if (p.owner === undefined || p.owner === null || p.owner < 0) return null;
        return realms(sim).find(c => c.id === p.owner) || sim.realms?.[p.owner] || null;
    }
    function cultureOf(sim, p, c) {
        const capital = c && provinces(sim).find(q => q.id === c.capital);
        const recorded = c?.namingCulture || c?.nameOrigin || {};
        const home = capital?.culturalHome ?? c?.originPeople ?? p.culturalHome ?? dominant(p.people) ?? 'unrecorded';
        const bases = RealmNames.bases;
        const b = bases.find(b => b.id === recorded.baseId) || bases[hash(`${sim.seed ?? 0} / naming culture / ${home}`) % bases.length];
        const palette = palettes[b.id];
        const entry = b.names.find(n => n.name === recorded.source || key(n.name) === key(c?.name));
        const root = recorded.baseId === b.id && recorded.root || entry?.root || pick(palette.roots, `${sim.seed ?? 0} / local family / ${home} / ${c?.id ?? ''}`);
        return { baseId: b.id, tradition: b.tradition, root, source: recorded.baseId === b.id && recorded.source || entry?.name || null, palette };
    }
    function terrainOf(p) {
        if (p.harbor > .35 || p.coast > .30 || p.saltShore > .25) return 'coast';
        if (p.lake > .12 || p.siteLake > 0) return 'water';
        if (p.river > .35) return 'river';
        if (p.altitude > 1100 || p.highCitadel) return 'upland';
        if (p.forest > .40) return 'forest';
        if (p.wet > .28) return 'marsh';
        // The saved field is precipitation / water demand: low values are dry.
        if (Number.isFinite(p.aridity) && p.aridity < .55) return 'arid';
        return 'common';
    }
    // A bijective syllable counter provides unbounded, pronounceable collision
    // choices. It never numbers towns or borrows a different culture's words.
    function syllables(value, alphabet) {
        let out = '';
        for (let n = value + 1; n > 0; n = Math.floor((n - 1) / alphabet.length)) out = alphabet[(n - 1) % alphabet.length] + out;
        return out;
    }
    function join(root, ...parts) {
        let out = root, previous = root;
        for (const part of parts) {
            if (!part || part.toLowerCase() === previous.toLowerCase()) continue;
            // Keep the realm root intact; only trim the following word boundary.
            out += out.at(-1)?.toLowerCase() === part[0].toLowerCase() ? part.slice(1) : part;
            previous = part;
        }
        return out;
    }
    function custom(p) {
        return p.namedFor === 'custom' || p.customName === true || (typeof p.nameOrigin?.generatedName === 'string' && p.name !== p.nameOrigin.generatedName);
    }
    function retained(p, force = false) {
        return custom(p) || (!force && p.nameOrigin?.generatedName === p.name && !!p.name);
    }
    const settled = p => p.settled === true || p.city === true || (p.settled === undefined && p.city === undefined && p.urbanPop >= 650);
    function assign(sim, p, { taken, force = false } = {}) {
        if (!p) return p;
        if (retained(p, force)) { taken?.add(key(p.name)); return p; }
        const c = ownerOf(sim, p), culture = cultureOf(sim, p, c), palette = culture.palette;
        const faith = faithIndex(c?.faith) ?? faithIndex(dominant(p.faith)) ?? 5;
        const capital = !!c && c.capital === p.id, town = settled(p);
        const identity = `${sim.seed ?? 0} / place names / ${p.id ?? p.i ?? ''} / ${culture.baseId} / ${culture.root} / ${c?.id ?? ''}`;
        const terrain = terrainOf(p), saint = faith === 0 && town && (capital || p.highCitadel?.kind === 'holy' || hash(`${identity} / patronage`) % 5 !== 0);
        const motif = pick(palette.motifs[faith], `${identity} / motif`), tail = pick(palette.tails[terrain], `${identity} / terrain`);
        const personalEnd = pick(palette.persons, `${identity} / person`), start = hash(`${identity} / branch`) % palette.links.length;
        const used = taken || new Set(provinces(sim).filter(q => q !== p).map(q => key(q.name)));
        for (let attempt = 0; ; attempt++) {
            const branch = capital && attempt === 0 ? '' : syllables(start + attempt, palette.links);
            const patron = saint ? join(culture.root, branch, personalEnd) : null;
            const name = saint ? `Saint ${patron}` : palette.prefixes ? `${tail} ${join(culture.root, motif, branch)}` : join(culture.root, motif, branch, tail);
            if (used.has(key(name))) continue;
            used.add(key(name));
            p.name = name;
            p.nameOrigin = { version, baseId: culture.baseId, tradition: culture.tradition, realmId: c?.id ?? null, faith,
                source: culture.source, root: culture.root, pattern: saint ? 'saint-patron' : town ? 'culture-terrain' : 'landscape',
                patron, motif: motifs[faith], terrain, capital, generatedName: name, fictional: true };
            return p;
        }
    }
    function generate(sim) {
        const ps = provinces(sim), taken = new Set(ps.filter(p => retained(p)).map(p => key(p.name)));
        // Existing and hand-written names are reserved before the first new town.
        // Sorting makes array storage order irrelevant when a collision is resolved.
        for (const p of ps.slice().sort((a, b) => (a.id ?? a.i ?? 0) - (b.id ?? b.i ?? 0))) assign(sim, p, { taken });
        return sim;
    }
    function describe(p) {
        const o = p?.nameOrigin;
        if (!o?.fictional || custom(p) || p.name !== o.generatedName) return '';
        const family = o.source ? `the ${o.source} name family` : `the local ${o.root} name family`;
        if (o.pattern === 'saint-patron') return `A Dawn Communion dedication to Saint ${o.patron}. The ${o.root} root links the patron's name to ${family}.`;
        const landscape = ({ coast: 'the coast', water: 'inland waters', river: 'the river', upland: 'the highlands', forest: 'woodland', marsh: 'wetlands', arid: 'dry country' })[o.terrain];
        return `Part of ${family}. ${faithNames[o.faith] || 'Local tradition'} supplies imagery of ${o.motif || 'shared customs'}${landscape ? `, shaped by ${landscape}` : ''}.`;
    }
    function describeRealm(sim, c) {
        if (!c) return '';
        const recorded = c.namingCulture || (c.namedFor === 'mythology' ? c.nameOrigin : null);
        if (!recorded?.baseId) return '';
        const b = RealmNames.bases.find(b => b.id === recorded.baseId);
        if (!b) return '';
        const entries = provinces(sim).filter(p => p.owner === c.id && p.nameOrigin?.fictional && !custom(p) && p.nameOrigin.realmId === c.id && p.nameOrigin.baseId === b.id);
        const root = recorded.root || entries[0]?.nameOrigin.root;
        const parts = [`${b.tradition} supplies the founding place-name family${root ? `, recognizable by the ${root} root` : ''}.`];
        const namingFaiths = [...new Set(entries.map(p => p.nameOrigin.faith))].filter(f => faithIndex(f) !== null);
        for (const faith of namingFaiths) parts.push(faith === 0 ? 'Dawn Communion gives its towns Saint dedications and sanctuary names.' : `${faithNames[faith]} appears in imagery of ${motifs[faith]}.`);
        const examples = entries.filter(settled).sort((a, b) => Number(b.id === c.capital) - Number(a.id === c.capital) || (a.id ?? 0) - (b.id ?? 0)).slice(0, 3).map(p => p.name);
        if (examples.length) parts.push(`Places in this family include ${examples.join(', ')}.`);
        return parts.join(' ');
    }
    return Object.freeze({ generate, assign, describe, describeRealm });
})();
