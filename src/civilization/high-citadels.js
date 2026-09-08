/** Rare mountain courts founded by existing district residents on real ground.
 * The reserve comes from retained rural carrying capacity, never from a second
 * allocation of the market surplus already assigned to ordinary towns. */
const HighCitadels = (() => {
    const version = 2, surveySpan = 2.16, minimumElevation = 3500, maximumPopulation = 1100;
    function site(w, p) {
        if (!p || !Number.isInteger(p.i) || p.i < 0 || p.i >= GN || w.height[p.i] < minimumElevation ||
            w.height[p.i] <= 0 || w.lake[p.i] >= 0 || w.ice[p.i] > 25 || w.temp[p.i] <= -13) return null;
        const span = surveySpan * CityEnvironment.cityFootprint, rx = span / 2, ry = rx * CityEnvironment.cityDimensions.depth / CityEnvironment.cityDimensions.width;
        if (p.x - rx < 1 || p.x + rx >= GW - 1 || p.y - ry < 1 || p.y + ry >= GH - 1) return null;
        // All supporting parent corners must be dry: a small water fraction is
        // unsuitable even when the general town classifier still calls it land.
        for (let y = Math.floor(p.y - ry); y <= Math.ceil(p.y + ry); y++) for (let x = Math.floor(p.x - rx); x <= Math.ceil(p.x + rx); x++) {
            const i = y * GW + x; if (w.height[i] <= 0 || w.lake[i] >= 0) return null;
        }
        let maximumGrade = 0;
        for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
            const gx = p.x + x * rx / 4, gy = p.y + y * ry / 4, e = CityEnvironment.sampleSite(w, gx, gy);
            if (e.water || e.ice > 25 || e.snow > .5) return null;
            maximumGrade = Math.max(maximumGrade, CityEnvironment.atlasGrade(w, gx, gy));
        }
        const grade = CityEnvironment.atlasGrade(w, p.x, p.y);
        if (grade > .65 || maximumGrade > .95) return null;
        return {elevation: w.height[p.i], grade, maximumGrade, surveySpan, terrainSpan: span};
    }
    function type(p) { return p.highCitadel?.kind === 'dragon' ? "Dragon King's Aerie" : 'High Sanctuary'; }
    function cap(p, value) { return p.highCitadel ? Math.min(value, p.highCitadel.populationCap) : value; }
    function historyOptions(sim, overrides = {}) {
        // Old saves predate rare founding. Replaying their political or social
        // history must keep the original founding rules and settlement signature.
        const highCitadelsVersion = sim.options?.highCitadelsVersion ?? Math.max(0, ...sim.provinces.map(p => p.highCitadel?.version || 0));
        return {...sim.options, highCitadelsVersion, ...overrides};
    }
    function validate(sim, w) {
        const selected = sim.options?.highCitadelsVersion;
        if (selected !== undefined && ![0, 1, 2].includes(selected)) throw Error('Invalid high citadel founding version.');
        let count = 0;
        for (const p of sim.provinces) {
            const h = p.highCitadel; if (h === undefined) continue;
            if (!h || ![1, 2].includes(h.version) || (selected !== undefined && selected !== h.version) || !['dragon', 'holy'].includes(h.kind) || ++count > 2 ||
                h.sourceCell !== p.i || !Number.isInteger(p.i) || p.i < 0 || p.i >= GN ||
                !Number.isFinite(h.elevation) || h.elevation < minimumElevation || h.elevation !== w.height[p.i] ||
                typeof h.originalName !== 'string' || !h.originalName.length || h.originalName.length > 120 ||
                !Number.isInteger(h.founded) || h.founded > sim.year ||
                !Number.isInteger(h.populationCap) || h.populationCap < 650 || h.populationCap > maximumPopulation ||
                ![h.support, h.ruralSupportBefore, h.ruralSupportAfter, h.grade, h.maximumGrade].every(Number.isFinite) ||
                h.support <= 0 || h.ruralSupportAfter < 0 || h.grade < 0 || h.maximumGrade < h.grade ||
                Math.abs(h.ruralSupportBefore - h.ruralSupportAfter - h.support) > 1e-7 ||
                !Number.isFinite(p.urbanPop) || p.urbanPop < 0 || p.urbanPop > h.populationCap)
                throw Error('Invalid high citadel in saved simulation.');
            if (h.version === 2 && (
                !Number.isInteger(h.originalCell) || h.originalCell < 0 || h.originalCell >= GN ||
                p.x !== p.i % GW || p.y !== Math.floor(p.i / GW) ||
                w.provinceId[p.i] !== p.id || w.provinceId[h.originalCell] !== p.id ||
                !p.cells.includes(p.i) || !p.cells.includes(h.originalCell)))
                throw Error('Invalid high citadel platform in saved simulation.');
        }
        return true;
    }
    function found(sim, w) {
        const existing = sim.provinces.filter(p => p.highCitadel), candidates = [];
        if (existing.length >= 2) return [];
        for (const p of sim.provinces) {
            if (p.settled || p.urbanPop > 0 || p.urbanSupport > 0 || p.highCitadel) continue;
            // 24% of rural capacity has already entered the shared market pool.
            // A reserve of at most 20% is carved from the separate retained 70%,
            // leaving capacity and population totals unchanged for this district.
            const ruralSupport = p.ruralCapacity * .70, localWater = w.human?.waterCapacity?.[p.i] || 0;
            const population = Math.floor(Math.min(maximumPopulation, p.ruralPop * .30, p.ruralCapacity * .20 * .75,
                localWater * .75, Math.max(0, ruralSupport - p.ruralPop) * .75));
            if (population < 650) continue;
            const ground = site(w, p); if (!ground) continue;
            candidates.push({p, ground, population, support: population / .75, ruralSupport});
        }
        // No draws enter settlement, culture or politics RNG streams. Height
        // chooses an extreme site; source-cell order resolves equal elevations.
        candidates.sort((a, b) => b.ground.elevation - a.ground.elevation || a.p.i - b.p.i);
        const chosen = existing.slice(), founded = [];
        for (const c of candidates) {
            const p = c.p;
            if (chosen.some(q => Math.hypot(p.x - q.x, p.y - q.y) < 2)) continue;
            const kind = chosen.some(q => q.highCitadel.kind === 'dragon') ? 'holy' : 'dragon', originalName = p.name;
            // Use the city planner's exact parcels and dry approaches before
            // committing residents or support to an otherwise plausible slope.
            if (typeof HighCitadelPlan !== 'undefined' && !HighCitadelPlan.viable(w, sim, p, kind)) continue;
            p.highCitadel = {version: 1, kind, originalName, sourceCell: p.i, founded: sim.year, ...c.ground,
                populationCap: c.population, support: c.support, ruralSupportBefore: c.ruralSupport, ruralSupportAfter: c.ruralSupport - c.support};
            p.urbanPop = c.population; p.ruralPop = p.pop - p.urbanPop; p.urbanSupport = c.support;
            p.settled = true; p.city = false; p.settlementType = type(p); p.name = `${originalName} · ${type(p)}`;
            p.siteReason = `${p.settlementType} at ${Math.round(c.ground.elevation).toLocaleString('en-US')} m. ${c.population.toLocaleString('en-US')} existing district residents gather here; ${Math.round(c.support).toLocaleString('en-US')} people of carrying capacity are reserved from the retained rural budget, with local modeled water supply. The original mountain surface and total population are unchanged.`;
            const budget = sim.settlementBudget;
            budget.available += c.support; budget.allocated += c.support; budget.retained += c.support;
            budget.reservedFromRural = (budget.reservedFromRural || 0) + c.support;
            logEvent(sim, 'founding', `${p.name} is established on its existing highland site by ${c.population.toLocaleString('en-US')} local residents.`, [], {province: p.id, highCitadel: kind, elevation: c.ground.elevation});
            chosen.push(p); founded.push(p);
            if (chosen.length >= 2) break;
        }
        return founded;
    }
    // Version 2 runs after countries and cultural origins have been established.
    // Administrative centres are accounting choices, often in the low valley;
    // search the SAME owned district for a dry, supported high mountain platform.
    // Neither existing towns nor district ownership are relocated or rewritten.
    function foundPlatforms(sim, w) {
        const chosen = sim.provinces.filter(p => p.highCitadel), candidates = [], founded = [];
        if (chosen.length >= 2) return founded;
        for (const p of sim.provinces) {
            if (p.settled || p.urbanPop > 0 || p.urbanSupport > 0 || p.highCitadel || !sim.realms[p.owner]?.alive ||
                sim.realms.some(c => c.alive && c.capital === p.id)) continue;
            const ruralSupport = p.ruralCapacity * .70;
            const budget = Math.floor(Math.min(maximumPopulation, p.ruralPop * .30, p.ruralCapacity * .20 * .75,
                Math.max(0, ruralSupport - p.ruralPop) * .75));
            if (budget < 650) continue;
            for (const i of p.cells) {
                if (w.provinceId[i] !== p.id || w.height[i] < minimumElevation) continue;
                const population = Math.floor(Math.min(budget, (w.human?.waterCapacity?.[i] || 0) * .75));
                if (population < 650) continue;
                const candidate = {...p, i, x: i % GW, y: Math.floor(i / GW)}, ground = site(w, candidate);
                if (!ground) continue;
                // The compact precinct must not physically enter an existing
                // town's surveyed terrain even if this province is very large.
                if (sim.provinces.some(q => q.settled && q.urbanPop >= 650 && !q.highCitadel &&
                    Math.hypot(q.x - candidate.x, q.y - candidate.y) < (citySurvey(sim, q).terrainSpan + ground.terrainSpan) * .75 + .12)) continue;
                candidates.push({p, candidate, ground, population, support: population / .75, ruralSupport});
            }
        }
        candidates.sort((a, b) => b.ground.elevation - a.ground.elevation || a.candidate.i - b.candidate.i);
        for (const c of candidates) {
            const p = c.p, candidate = c.candidate;
            if (p.settled || chosen.some(q => Math.hypot(candidate.x - q.x, candidate.y - q.y) < 2)) continue;
            const kind = chosen.some(q => q.highCitadel.kind === 'dragon') ? 'holy' : 'dragon';
            if (typeof HighCitadelPlan === 'undefined' || !HighCitadelPlan.viable(w, sim, candidate, kind)) continue;
            const originalName = p.name, originalCell = p.i;
            p.i = candidate.i; p.x = candidate.x; p.y = candidate.y;
            p.highCitadel = {version: 2, kind, originalName, originalCell, sourceCell: p.i, founded: sim.year, ...c.ground,
                populationCap: c.population, support: c.support, ruralSupportBefore: c.ruralSupport, ruralSupportAfter: c.ruralSupport - c.support};
            p.urbanPop = c.population; p.ruralPop = p.pop - p.urbanPop; p.urbanSupport = p.detailSupport = c.support;
            p.settled = true; p.city = false; p.settlementType = type(p); p.name = `${originalName} · ${type(p)}`;
            p.siteReason = `${p.settlementType} on a surveyed ${Math.round(c.ground.elevation).toLocaleString('en-US')} m platform inside its original district. ${c.population.toLocaleString('en-US')} existing residents gather here, supported by modeled local water and a reserve from the district's retained rural capacity. No existing town, country, population or terrain is moved.`;
            const budget = sim.settlementBudget;
            budget.available += c.support; budget.allocated += c.support; budget.retained += c.support;
            budget.reservedFromRural = (budget.reservedFromRural || 0) + c.support;
            logEvent(sim, 'founding', `${p.name} is established on a high platform within its existing district by ${c.population.toLocaleString('en-US')} local residents.`, [p.owner], {province: p.id, highCitadel: kind, elevation: c.ground.elevation, originalCell, cell: p.i});
            chosen.push(p); founded.push(p); if (chosen.length >= 2) break;
        }
        return founded;
    }
    return {version, surveySpan, minimumElevation, maximumPopulation, site, found, foundPlatforms, cap, type, historyOptions, validate};
})();
