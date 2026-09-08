/* Read-only facts for place cards. Provincial people and faith arrays contain
 * proportions of the district population, not counts or urban-only mixtures.
 * Keep gaps in those records visible instead of renormalizing them to 100%.
 */
const PlaceVitals = (() => {
    const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const population = value => Number.isFinite(value) && value >= 0 ? value : null;
    const metric = (key, label, value) => ({ key, label, value });
    function coverage(districts) {
        let recordedPopulation = 0, recordedDistricts = 0;
        for (const p of districts) {
            const count = population(p.pop);
            if (count === null) continue;
            recordedPopulation += count;
            recordedDistricts++;
        }
        return { districts: districts.length, recordedDistricts, missingDistricts: districts.length - recordedDistricts,
            recordedPopulation: Number.isFinite(recordedPopulation) ? recordedPopulation : null };
    }
    function mixture(districts, field, definitions, covered) {
        const totals = definitions.map(() => 0);
        for (const p of districts) {
            const count = population(p.pop), input = p[field];
            if (!count || !(Array.isArray(input) || ArrayBuffer.isView(input))) continue;
            const weights = Array.from(input, value => Number.isFinite(value) && value > 0 ? value : 0);
            const sum = weights.reduce((a, b) => a + b, 0);
            // Only overfull records are scaled down. Unknown definition indices
            // still occupy a share, so they cannot inflate the known communities.
            const largest = sum === Infinity ? weights.reduce((n, value) => Math.max(n, value), 0) : 1;
            const divisor = sum === Infinity ? weights.reduce((n, value) => n + value / largest, 0) : Math.max(1, sum);
            for (let id = 0; id < definitions.length; id++) if (definitions[id]) totals[id] += count * ((weights[id] || 0) / largest / divisor);
        }
        const knownCount = totals.reduce((a, b) => a + b, 0), complete = covered.missingDistricts === 0 && covered.recordedPopulation !== null;
        const total = complete ? covered.recordedPopulation : null;
        let known = Number.isFinite(knownCount) ? (total === null ? knownCount : Math.min(total, knownCount)) : null;
        let unknown = total === null ? null : Math.max(0, total - known);
        // Normalized simulation fractions can leave a few floating-point ulps;
        // those are not a previously unrecorded community of residents.
        if (total !== null && unknown <= total * 1e-12) { known = total; unknown = 0; }
        // A missing district population leaves the whole denominator unknown.
        // Keep its recorded counts, but do not present misleading percentages.
        const shares = total > 0 ? totals.map((count, id) => ({ id, name: definitions[id]?.name, color: definitions[id]?.color,
            count, share: Math.min(1, count / total) })).filter(s => s.count > 0 && definitions[s.id])
            .sort((a, b) => b.count - a.count || a.id - b.id) : [];
        return { total, known, shares, unknown };
    }
    function facts(kind, districts, metrics, indicators) {
        const covered = coverage(districts);
        return { kind, metrics, peoples: mixture(districts, 'people', PEOPLES, covered),
            faiths: mixture(districts, 'faith', FAITHS, covered), indicators, coverage: covered };
    }
    function city(sim, p) {
        if (!record(p)) return null;
        return facts('city', [p], [metric('townPopulation', 'Town residents', population(p.urbanPop)),
            metric('districtPopulation', 'District residents', population(p.pop))], []);
    }
    function realm(sim, c) {
        if (!record(c) || !Number.isInteger(c.id) || c.id < 0 || !Array.isArray(sim?.provinces)) return null;
        const held = sim.provinces.filter(p => record(p) && p.owner === c.id);
        const covered = coverage(held), total = covered.missingDistricts ? null : covered.recordedPopulation;
        const food = population(c.foodRatio), stability = population(c.stability);
        const indicators = [
            { key: 'foodRatio', label: 'Food supply', value: food !== null && Number.isFinite(food * 100) ? food * 100 : null, target: 100, max: 200, unit: '%' },
            { key: 'stability', label: 'Stability', value: stability === null ? null : Math.min(100, stability), target: null, max: 100, unit: '%' }
        ];
        return facts('realm', held, [metric('population', 'Residents', total),
            metric('towns', 'Towns', held.filter(p => p.settled === true || p.city === true).length), metric('districts', 'Districts', held.length)], indicators);
    }
    return Object.freeze({ city, realm });
})();
