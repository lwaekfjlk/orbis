/* A realm-wide account of the current simulation. Read-only, without invented
 * rulers, random biography, or cached aggregates that survive border changes. */
const RealmProfile = (() => {
    const finite = Number.isFinite;
    const positive = value => finite(value) && value > 0 ? value : 0;
    const number = (value, digits = 0) => value.toLocaleString('en-US', { maximumFractionDigits: digits });
    const list = values => values.length < 3 ? values.join(' and ') : values.slice(0, -1).join(', ') + ', and ' + values.at(-1);
    const counted = (n, singular, plural = singular + 's') => `${number(n)} ${n === 1 ? singular : plural}`;
    const dry = (world, i) => Number.isInteger(i) && i >= 0 && world?.height?.[i] > 0 && (world.lake?.[i] ?? 0) <= 0;
    const weight = (world, i) => dry(world, i) ? positive(finite(world.area?.[i]) ? world.area[i] : 1) : 0;
    function dryCells(world, held) {
        const cells = new Set();
        for (const p of held || []) for (const i of p.cells || []) if (dry(world, i)) cells.add(i);
        return [...cells];
    }
    /** Latitude-weighted model area, not square kilometres. Never count lake water. */
    function landArea(world, held) {
        return dryCells(world, held).reduce((sum, i) => sum + weight(world, i), 0);
    }
    function mix(held, key, definitions) {
        const sums = Array(definitions.length).fill(0);
        let known = 0;
        for (const p of held) {
            const values = definitions.map((_, i) => positive(p[key]?.[i]));
            const total = values.reduce((a, b) => a + b, 0), population = positive(p.pop);
            if (!total || !population) continue;
            known += population;
            values.forEach((value, i) => { sums[i] += value / total * population; });
        }
        return { known, shares: sums.map((value, i) => ({ name: definitions[i].name, share: known ? value / known : 0 })).filter(v => v.share > 0).sort((a, b) => b.share - a.share) };
    }
    function mixtureText(values) {
        const leading = values.slice(0, 3).map(v => `${v.name} (${number(v.share * 100, 1)}%)`);
        const rest = values.slice(3).reduce((sum, v) => sum + v.share, 0);
        if (rest) leading.push(`other communities (${number(rest * 100, 1)}%)`);
        return list(leading);
    }
    function create(world, sim, realmId) {
        const realms = sim?.realms || [], c = realms.find(r => r?.id === realmId);
        if (!c) return null;
        const provinces = (sim.provinces || []).filter(Boolean), held = provinces.filter(p => p.owner === c.id);
        const territory = typeof PoliticalLand !== 'undefined' && world?.provinceId ? PoliticalLand.territory(world, sim) : null;
        const cells = territory ? Array.from(territory.owners.keys()).filter(i => territory.owners[i] === c.id && dry(world, i)) : dryCells(world, held);
        const area = territory?.areas?.[c.id]?.land ?? landArea(world, held);
        let worldArea = 0;
        for (let i = 0; i < (world?.height?.length || 0); i++) worldArea += weight(world, i);
        const areas = new Map();
        for (const r of realms) if (r && r.alive !== false) areas.set(r.id, territory?.areas?.[r.id]?.land ?? landArea(world, provinces.filter(p => p.owner === r.id)));
        const areaShare = worldArea ? Math.min(1, area / worldArea) : 0;
        const areaRank = area > 0 && c.alive !== false ? 1 + [...areas.values()].filter(a => a > area).length : null;
        const population = held.reduce((sum, p) => sum + positive(p.pop), 0), towns = held.filter(p => p.settled || p.city);
        const capital = held.find(p => p.id === c.capital)?.name || null;
        const title = RealmNames.fullName(c);
        const peoples = mix(held, 'people', PEOPLES), primary = peoples.shares[0];
        const facts = { area, areaShare, areaRank, provinceCount: held.length, townCount: towns.length, population, capital,
            primaryPeople: primary?.name || null, primaryPeopleShare: primary?.share || 0 };
        const summary = `${title} administers ${counted(held.length, 'district')} and ${counted(towns.length, 'town')}, with ${number(population)} recorded residents.${capital ? ` Its capital is ${capital}.` : ''}${areaRank ? ` Its dry-land territory ranks ${areaRank} among living realms and covers ${number(areaShare * 100, 1)}% of the world's dry land.` : ''}`;

        const founding = [];
        if (finite(c.founded)) founding.push(`The realm was founded in year ${c.founded}${finite(sim.year) && sim.year > c.founded ? `, ${counted(sim.year - c.founded, 'year')} before the present` : ''}.`);
        else founding.push('Its founding year is not preserved in the available record.');
        if (GOVERNMENTS[c.gov]) founding.push(`Its current government is a ${GOVERNMENTS[c.gov].toLowerCase()}${c.policy ? ` with ${String(c.policy).toLowerCase()} as its governing priority` : ''}.`);
        const origin = RealmNames.describe(c);
        if (origin) founding.push(`Its name draws on ${origin}`);

        const terrain = [], biomes = new Map(), temperatures = [], moisture = [];
        for (const i of cells) {
            const a = weight(world, i), biome = BIOME[world?.biome?.[i]]?.[0];
            if (biome && a) biomes.set(biome, (biomes.get(biome) || 0) + a);
            if (finite(world?.temp?.[i]) && a) temperatures.push(world.temp[i]);
            if (finite(world?.arid?.[i]) && a) moisture.push({ value: world.arid[i], weight: a });
        }
        const landmassIds = new Set((territory && world.landmassId ? cells.map(i => world.landmassId[i]) : held.map(p => p.landmass)).filter(Number.isInteger));
        const namedLand = [...(world?.landmasses || []), ...(world?.continents || [])].filter(p => landmassIds.has(p.id) && p.name);
        const landNames = [...new Set(namedLand.map(p => p.name))];
        if (landNames.length) terrain.push(`Its holdings lie on ${list(landNames)}.`);
        const leadingBiomes = [...biomes].sort((a, b) => b[1] - a[1]).slice(0, 2);
        if (leadingBiomes.length) terrain.push(`The largest landscapes are ${list(leadingBiomes.map(([name, a]) => `${name.toLowerCase()} (${number(a / area * 100, 1)}% of its dry land)`))}.`);
        if (temperatures.length) terrain.push(`Temperatures across that land range from ${number(Math.min(...temperatures), 1)} to ${number(Math.max(...temperatures), 1)} °C.`);
        if (moisture.length) {
            const mean = moisture.reduce((sum, v) => sum + v.value * v.weight, 0) / moisture.reduce((sum, v) => sum + v.weight, 0);
            const climate = mean < .2 ? 'arid' : mean < .7 ? 'semi-arid' : mean < 1.4 ? 'moderately moist' : mean < 2.2 ? 'humid' : 'very humid';
            terrain.push(`Its lands are generally ${climate}.`);
        }
        const coastal = held.filter(p => positive(p.coast) > 0).length, lakeside = held.filter(p => positive(p.lake) > 0).length;
        if (coastal || lakeside) terrain.push(`${counted(coastal, 'district')} ${coastal === 1 ? 'reaches' : 'reach'} the sea and ${counted(lakeside, 'district')} ${lakeside === 1 ? 'borders' : 'border'} inland lakes.`);
        if (!terrain.length) terrain.push('The available territorial record does not describe its landscape or climate.');

        const residents = [], faiths = mix(held, 'faith', FAITHS);
        if (primary) residents.push(`${primary.name} ${primary.share > .5 ? 'form the majority' : 'are the largest community'}, accounting for ${number(primary.share * 100, 1)}% of residents.`);
        if (peoples.known) residents.push(`Among ${peoples.known < population ? 'residents with recorded ancestry' : 'its residents'}, the population includes ${mixtureText(peoples.shares)}.`);
        else residents.push('No population mixture is recorded for its present districts.');
        if (FAITHS[c.faith]) residents.push(`${FAITHS[c.faith].name} is the state tradition; that designation does not determine each resident's belief.`);
        else residents.push('No state tradition is recorded.');
        if (faiths.known) residents.push(`The ${faiths.known < population ? 'recorded resident' : 'resident'} faiths are ${mixtureText(faiths.shares)}.`);
        else residents.push('The religious mixture of its residents is not recorded.');
        const placeNames = typeof PlaceNames !== 'undefined' ? PlaceNames.describeRealm(sim, c) : '';
        if (placeNames) residents.push(placeNames);

        const relations = Object.values(sim.relations || {}), counterpart = id => realms.find(r => r?.id === id && r.alive !== false);
        const partners = flag => [...new Set(relations.filter(r => r && r[flag] && (r.a === c.id || r.b === c.id)).map(r => counterpart(r.a === c.id ? r.b : r.a)?.name).filter(Boolean))].sort();
        const trade = partners('trade'), allies = partners('alliance');
        const economy = [];
        if (finite(c.foodRatio)) economy.push(`${c.foodRatio < 1 ? 'Food is in short supply' : c.foodRatio > 1 ? 'Food supplies exceed current needs' : 'Food supplies meet current needs'}, covering ${number(Math.max(0, c.foodRatio) * 100, 1)}% of demand.`);
        if (positive(c.imports)) economy.push('Food imports contribute to provisioning its residents.');
        const provincialMean = key => {
            let sum = 0, total = 0;
            for (const p of held) if (finite(p[key])) { const a = landArea(world, [p]); sum += p[key] * a; total += a; }
            return total ? sum / total : null;
        };
        const ore = provincialMean('ore'), forest = provincialMean('forest'), fertility = provincialMean('fertility');
        if (fertility !== null) economy.push(fertility > .4 ? 'Fertile farmland supports its rural economy.' : fertility > .2 ? 'Farming is part of its rural economy.' : 'Limited fertile land constrains farming.');
        if (forest !== null) economy.push(`Woodland covers roughly ${number(Math.max(0, forest) * 100, 1)}% of provincial land.`);
        if (ore !== null) economy.push(ore < .33 ? 'Mineral resources are limited.' : ore < .6 ? 'It has moderate mineral resources.' : 'Mineral resources are plentiful.');
        economy.push(trade.length ? `Trade agreements connect it with ${list(trade)}.` : 'No trade agreements are recorded.');
        if (finite(c.income)) economy.push(`Annual revenue is ${number(c.income, 1)} treasury units${finite(c.tradeIncome) ? `, including ${number(c.tradeIncome, 1)} from trade` : ''}${finite(c.treasury) ? `; reserves stand at ${number(c.treasury, 1)}` : ''}.`);

        const defense = [];
        if (finite(c.army)) defense.push(`Its field army numbers ${number(Math.max(0, c.army), 1)} thousand${finite(c.navy) ? `, supported by ${number(Math.max(0, c.navy), 1)} naval flotillas` : ''}.`);
        if (finite(c.arcana)) defense.push(`Its arcane institutions have reached level ${number(c.arcana, 2)}.`);
        defense.push(allies.length ? `Defensive allies are ${list(allies)}.` : 'It has no recorded defensive allies.');
        const wars = (sim.wars || []).filter(w => w && !w.ended && (w.a === c.id || w.b === c.id) && counterpart(w.a === c.id ? w.b : w.a));
        defense.push(wars.length ? `It is at war with ${list(wars.map(w => `${counterpart(w.a === c.id ? w.b : w.a).name}${finite(w.start) ? ` (since ${w.start})` : ''}`))}.` : 'It is not involved in any recorded active war.');
        const events = (sim.events || []).map((e, index) => ({ e, index })).filter(({ e }) => e && finite(e.year) && (!finite(sim.year) || e.year <= sim.year) && typeof e.text === 'string' && (e.actors?.includes(c.id) || e.details?.supporters?.includes(c.id)))
            .sort((a, b) => b.e.year - a.e.year || b.index - a.index).slice(0, 6).map(({ e }) => ({ year: e.year, type: e.type || 'event', text: e.text }));
        return { title, summary, sections: [
            { title: 'Origins and identity', text: founding.join(' ') },
            { title: 'Land and climate', text: terrain.join(' ') },
            { title: 'Peoples and faiths', text: residents.join(' ') },
            { title: 'Hinterland and exchange', text: economy.join(' ') },
            { title: 'Power and diplomacy', text: defense.join(' ') }
        ], facts, events };
    }
    return Object.freeze({ landArea, create });
})();
