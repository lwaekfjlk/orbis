/** Optional city projects live in simulation data, never in world geometry. */
const CITY_PROJECTS = {
    granary: { name: 'Expand the granary', years: 3, share: .28, limit: 2, description: 'Reduce storage losses: +8% to the existing urban food-support budget at completion. No new farms or water are created.' },
    waterworks: { name: 'Maintain waterworks', years: 2, share: .20, limit: 2, description: 'Use existing accessible water more reliably: +0.06 development and -5 unrest. Requires a reliable local source.' },
    academy: { name: 'Endow the collegium', years: 4, share: .40, limit: 2, description: 'Fund teaching and equipment: +0.045 realm technology and +0.05 arcane capacity when completed.' },
    harbor: { name: 'Improve the waterfront', years: 4, share: .35, limit: 2, description: 'Improve an existing harbor or lakefront: +0.10 local development. Does not invent a port or a shipping route.' },
    festival: { name: 'Sponsor a civic festival', years: 1, share: .12, limit: 4, description: 'A one-time public celebration lowers unrest by 8. It does not change ancestry or belief.' }
};
function cityState(sim, id) { sim.cityState ||= {}; return sim.cityState[id] ||= { levels: {}, projects: [], events: [], lastCompletion: null }; }
function cityProjectQuote(sim, pid, key) {
    const p = sim.provinces[pid], def = CITY_PROJECTS[key], c = p ? sim.realms[p.owner] : null, s = sim.cityState?.[pid];
    if (!p?.settled || !def)
        return { ok: false, reason: 'Select an existing settlement and a valid project.' };
    if (!c?.alive)
        return { ok: false, reason: 'No living government can fund this project.' };
    if ((s?.levels[key] || 0) >= def.limit)
        return { ok: false, reason: 'This project has reached its current upgrade limit.' };
    if (s?.projects.some(p => p.key === key && p.status === 'building'))
        return { ok: false, reason: 'This project is already under construction.' };
    if (key === 'waterworks' && p.fresh < .30)
        return { ok: false, reason: 'No reliable freshwater source. Engineering cannot create water from nothing.' };
    if (key === 'harbor' && p.harbor < .12 && (p.siteLake || 0) < .25)
        return { ok: false, reason: 'No usable local coast or lakefront exists.' };
    const cost = Math.max(2, c.income * def.share) * (1 + (s?.levels[key] || 0) * .4);
    if (c.treasury < cost)
        return { ok: false, cost, reason: 'The realm treasury cannot currently afford this project.' };
    return { ok: true, cost, years: def.years, reason: def.description };
}
function startCityProject(sim, w, pid, key) {
    const q = cityProjectQuote(sim, pid, key);
    if (!q.ok)
        return { ...q, message: q.reason };
    const p = sim.provinces[pid], c = sim.realms[p.owner], def = CITY_PROJECTS[key], s = cityState(sim, pid);
    c.treasury -= q.cost;
    const project = { id: `${pid}-${sim.year}-${s.projects.length}`, key, started: sim.year, due: sim.year + q.years, cost: q.cost, status: 'building', sponsor: c.id };
    s.projects.push(project);
    const text = `${p.name} commissions ${def.name.toLowerCase()}; completion planned for ${project.due}.`;
    s.events.push({ year: sim.year, text });
    logEvent(sim, 'construction', text, [c.id], { province: pid, project: key });
    return { ok: true, message: text, cost: q.cost, due: project.due };
}
function stepCityProjects(sim, w) {
    if (!sim.cityState)
        return;
    for (const [id, s] of Object.entries(sim.cityState)) {
        const p = sim.provinces[+id];
        if (!p)
            continue;
        for (const project of s.projects) {
            if (project.status !== 'building' || project.due > sim.year)
                continue;
            const c = sim.realms[p.owner];
            if (!c?.alive) {
                project.due = sim.year + 1;
                continue;
            }
            const k = project.key;
            project.status = 'complete';
            project.completed = sim.year;
            s.levels[k] = (s.levels[k] || 0) + 1;
            s.lastCompletion = k;
            if (k === 'granary') {
                p.urbanSupport *= 1.08;
            }
            if (k === 'waterworks') {
                p.dev = clamp(p.dev + .06, .2, 2.5);
                p.unrest = Math.max(0, p.unrest - 5);
            }
            if (k === 'academy') {
                c.tech = clamp(c.tech + .045, .4, 5);
                c.arcana = clamp(c.arcana + .05, .2, 5);
            }
            if (k === 'harbor')
                p.dev = clamp(p.dev + .10, .2, 2.5);
            if (k === 'festival')
                p.unrest = Math.max(0, p.unrest - 8);
            const text = `${p.name} completes ${CITY_PROJECTS[k].name.toLowerCase()}. ${k === 'granary' ? 'Storage losses fall; the existing urban food-support budget rises by 8%.' : k === 'academy' ? 'The colleges add trained scholars to the current realm.' : k === 'festival' ? 'Public unrest eases.' : 'Local services and development improve.'}`;
            s.events.push({ year: sim.year, text });
            logEvent(sim, 'construction', text, [c.id], { province: p.id, project: k });
        }
    }
}
function validateCityState(sim) {
    if (sim.cityState === undefined)
        return true;
    if (!sim.cityState || Array.isArray(sim.cityState) || typeof sim.cityState !== 'object')
        throw Error('Invalid city project state.');
    for (const [id, s] of Object.entries(sim.cityState)) {
        if (!/^\d+$/.test(id) || !sim.provinces[+id] || !s || !Array.isArray(s.projects) || s.projects.length > 40 || !Array.isArray(s.events) || s.events.length > 200 || typeof s.levels !== 'object' || s.levels === null)
            throw Error('Invalid city record.');
        for (const [k, v] of Object.entries(s.levels))
            if (!CITY_PROJECTS[k] || !Number.isInteger(v) || v < 0 || v > CITY_PROJECTS[k].limit)
                throw Error('Invalid city upgrade.');
        for (const p of s.projects)
            if (!p || !CITY_PROJECTS[p.key] || !['building', 'complete'].includes(p.status) || ![p.started, p.due, p.cost].every(Number.isFinite) || p.cost < 0 || p.due < p.started)
                throw Error('Invalid city project.');
    }
    return true;
}
/** Shortest trip along the SAME pre-existing market graph, not a straight line. */
function planJourney(sim, from, to) {
    if (!sim.provinces[from]?.settled || !sim.provinces[to]?.settled)
        return { ok: false, reason: 'Choose two existing settlements.' };
    const dist = new Float64Array(sim.provinces.length).fill(Infinity), prev = new Int32Array(dist.length).fill(-1), heap = new MinHeap();
    dist[from] = 0;
    heap.push(from, 0);
    while (heap.length) {
        const [i, d] = heap.pop();
        if (d > dist[i] + 1e-9)
            continue;
        if (i === to)
            break;
        for (const e of sim.marketGraph[i] || []) {
            if (!Number.isFinite(e.cost) || e.cost < 0)
                continue;
            const a = sim.provinces[i], b = sim.provinces[e.to];
            if (a.owner >= 0 && b.owner >= 0 && a.owner !== b.owner && warBetween(sim, a.owner, b.owner))
                continue;
            const nd = d + e.cost;
            if (nd < dist[e.to]) {
                dist[e.to] = nd;
                prev[e.to] = i;
                heap.push(e.to, nd);
            }
        }
    }
    if (!Number.isFinite(dist[to]))
        return { ok: false, reason: 'No known connected market route; war frontiers and disconnected oceans cannot be skipped.' };
    const nodes = [];
    for (let i = to; i >= 0; i = prev[i]) {
        nodes.push(i);
        if (i === from)
            break;
    }
    nodes.reverse();
    const segments = [];
    for (let k = 1; k < nodes.length; k++) {
        const a = nodes[k - 1], b = nodes[k], e = sim.marketGraph[a].filter(e => e.to === b).sort((a, b) => a.cost - b.cost)[0];
        segments.push({ from: a, to: b, kind: e.kind, cost: e.cost });
    }
    return { ok: true, nodes, segments, cost: dist[to], note: 'Generalized travel-cost units, NOT days or a physically calibrated itinerary.' };
}
