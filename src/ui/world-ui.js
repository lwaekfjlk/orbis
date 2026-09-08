'use strict';
const $ = id => document.getElementById(id), escapeHTML = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtPop = v => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'k' : Math.round(v).toString();
const fmt = v => Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : '—';
const GEN_DEFAULTS = { seed: 'Aereth-47', form: 'global', plates: 24, continents: 6, islands: 1.2, volcanism: .85, uplift: 1.2, sea: 0, aridity: .85, current: 1, erosion: .7, temperature: 0, glaciation: 1.2 };
const DEFAULT_WORLD_LAYER = 'realms';
let world = null, sim = null, renderer = null, busy = false, playing = false, timer = null, currentLayer = DEFAULT_WORLD_LAYER, selectedRealm = 0, selectedCell = -1, labelItems = [], diplomacyTarget = -1, lastError = null, simAdvancing = false;
const POLITICAL = ['realms', 'faiths', 'peoples', 'diplomacy', 'wealth', 'magic'];
const layerTitles = { potential: 'SETTLEMENT POTENTIAL', settlements: 'SETTLEMENTS / BEFORE STATES', realms: 'THE REALMS', relief: 'PHYSICAL LANDSCAPE', faiths: 'LOCAL FAITHS', peoples: 'LOCAL PEOPLES', diplomacy: 'DIPLOMACY & SEA LANES', water: 'WATERSHEDS & BASINS', plates: 'LITHOSPHERE / MOTION', ice: 'CRYOSPHERE', aridity: 'DESERT CAUSES', rain: 'RAINFALL', ocean: 'OCEAN HEAT', wealth: 'PROVINCIAL DEVELOPMENT', magic: 'ARCANE CAPACITY' };
function toast(text) { $('toast').textContent = text; $('toast').classList.remove('hidden'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').classList.add('hidden'), 4800); }
function pause() { playing = false; clearTimeout(timer); timer = null; $('play').textContent = '▶ Play'; window.OneMap?.onPlayback(); }
function setBusy(value) { busy = value; if (value) renderer?.setHoveredRealm(null); for (const id of ['generate', 'play', 'step1', 'step10', 'step50', 'resetAge', 'exportToggle', 'forgeButton'])
    $(id).disabled = value; $('loading').classList.toggle('hidden', !value); window.OneMap?.onBusy(value); }
async function stageProgress(text) { $('loadingText').textContent = text; await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); }
/** Default presentation for a newly generated/restored world, not a model update. */
function resetWorldPresentation() {
    currentLayer = DEFAULT_WORLD_LAYER;
    renderer.layer = currentLayer;
    for (const id of ['settlements', 'frontiers', 'roads', 'folk', 'names']) {
        $(id).checked = true;
        if (id !== 'names') renderer.options[id] = true;
    }
    $('realmSearch').value = '';
    $('moreLayer').value = '';
}
function generationReport(w, s) {
    const report = {
        seed: w.params.seed, year: s.year,
        realms: s.realms.filter(c => c.alive).length,
        towns: s.provinces.filter(p => p.city).length,
        settlements: s.provinces.filter(p => p.settled).length,
        population: s.provinces.reduce((n, p) => n + p.pop, 0),
        layer: renderer.layer,
        rendererBound: renderer.world === w && renderer.sim === s,
        settlementVertices: renderer.meshes.settlements?.count || 0,
        frontierVertices: renderer.meshes.frontiers?.count || 0,
        settlementsVisible: renderer.visible('settlements'),
        frontiersVisible: renderer.visible('frontiers')
    };
    if (!report.rendererBound || (report.settlements && !report.settlementVertices))
        throw Error('The civilization was generated but its map geometry did not attach.');
    return report;
}
async function buildWorld(params = GEN_DEFAULTS, opts = { realms: 18, conflict: 1 }, restored = null) {
    if (busy || simAdvancing)
        return;
    const previous = world && sim ? {
        world, sim, layer: currentLayer, selectedRealm, selectedCell, diplomacyTarget,
        continent: focusedContinent, report: window.__generationReport,
        options: { ...renderer.options }, names: $('names').checked,
        camera: { target: renderer.target.slice(), zoom: renderer.zoom,
            azimuth: renderer.azimuth, elevation: renderer.elevation }
    } : null;
    window.ContinuousMap?.beforeWorldBuild();
    window.CityUI?.close();
    window.LandmarkUI?.close();
    pause();
    setBusy(true);
    window.__ready = false;
    window.__error = null;
    window.__generationReport = null;
    $('loadingTitle').textContent = 'A world taking shape.';
    $('spinner').classList.remove('hidden');
    let landmarkPreload = null;
    try {
        focusedContinent = null;
        const start = performance.now(), w = await generateWorld({ ...GEN_DEFAULTS, ...params }, stageProgress);
        await stageProgress('08 / Water, food capacity, villages and market networks');
        const initial = createCivilization(w, opts);
        let next = initial;
        if (restored) {
            if (restored.gridSignature !== initial.gridSignature)
                throw Error('The saved geography does not match this engine version.');
            next = restored;
            validateSimulation(next, w);
            aggregateRealms(next);
        }
        else {
            await stageProgress('09 / Connected realms and local administrations');
        }
        validateSimulation(next, w);
        // Independent site queries can run while the atlas attaches its meshes.
        landmarkPreload = typeof SacredCityKit !== 'undefined' ? SacredCityKit.preload(w, next) : null;
        await stageProgress('10 / Attaching towns, realms and borders to the map');
        world = w;
        sim = next;
        window.world = w;
        window.sim = sim;
        selectedRealm = sim.realms[0]?.alive ? 0 : sim.realms.find(c => c.alive)?.id ?? 0;
        selectedCell = sim.provinces[sim.realms[selectedRealm]?.capital ?? 0]?.i ?? Math.floor(GN / 2);
        diplomacyTarget = -1;
        resetWorldPresentation();
        renderer.sim = sim;
        renderer.reset();
        renderer.focusRealm = selectedRealm;
        // Reset the streaming layer before attaching geometry. Resetting it in
        // refreshAll would invalidate the terrain that setWorld just uploaded.
        window.ContinuousMap?.layer?.bind(world, sim);
        renderer.setWorld(world);
        renderer.buildCivilization();
        window.__generationReport = generationReport(world, sim);
        await stageProgress('11 / Locating landmarks and their town entrances');
        if (landmarkPreload) await landmarkPreload.promise;
        refreshAll(false);
        makeGeoJumps();
        document.querySelectorAll('[data-layer]').forEach(b => { b.classList.toggle('active', b.dataset.layer === currentLayer); b.setAttribute('aria-selected', String(b.dataset.layer === currentLayer)); });
        // Include the directory and UI attachment: until those finish the map
        // still has its loading screen and cannot accept input.
        window.lastGenerationMs = performance.now() - start;
        setBusy(false);
        renderer.request();
        window.__ready = true;
        window.__error = null;
        lastError = null;
        return window.__generationReport;
    }
    catch (e) {
        landmarkPreload?.cancel();
        console.error(e);
        lastError = e.message;
        // Keep the previous inhabited world usable if any generation stage fails.
        // A failed build must not publish a half-built terrain-only world.
        let recovered = false;
        if (previous) {
            try {
                world = previous.world; sim = previous.sim;
                window.world = world; window.sim = sim;
                currentLayer = previous.layer; selectedRealm = previous.selectedRealm;
                selectedCell = previous.selectedCell; diplomacyTarget = previous.diplomacyTarget;
                focusedContinent = previous.continent;
                renderer.options = { ...previous.options }; renderer.layer = currentLayer;
                renderer.sim = sim; renderer.focusRealm = selectedRealm;
                for (const id of ['settlements', 'frontiers']) $(id).checked = renderer.options[id] !== false;
                $('names').checked = previous.names;
                Object.assign(renderer, previous.camera);
                window.ContinuousMap?.layer?.bind(world, sim);
                renderer.setWorld(world); renderer.buildCivilization();
                refreshAll(false); makeGeoJumps();
                document.querySelectorAll('[data-layer]').forEach(b => {
                    b.classList.toggle('active', b.dataset.layer === currentLayer);
                    b.setAttribute('aria-selected', String(b.dataset.layer === currentLayer));
                });
                window.__generationReport = previous.report;
                renderer.request(); recovered = true;
            } catch (restoreError) { console.error('Could not restore the previous map:', restoreError); }
        }
        setBusy(false);
        $('loading').classList.toggle('hidden', recovered);
        $('spinner').classList.add('hidden');
        $('loadingTitle').textContent = 'Generation stopped.';
        $('loadingText').textContent = e.message;
        window.__ready = recovered;
        window.__error = e.message;
        toast(recovered ? 'Generation failed. Your previous world and history are unchanged. ' + e.message : e.message);
        return null;
    }
}
function validateSimulation(s, w) {
    if (!s || s.version !== 6 || !Array.isArray(s.provinces) || !Array.isArray(s.realms) || !Array.isArray(s.routes) || !Array.isArray(s.events) || !Array.isArray(s.wars) || !Number.isInteger(s.year) || s.provinces.length !== Math.max(...w.provinceId) + 1 || s.realms.length > 512)
        throw Error('Invalid or incompatible simulation data.');
    for (let k = 0; k < s.provinces.length; k++) {
        const p = s.provinces[k];
        if (p.id !== k || !Number.isFinite(p.pop) || p.pop < 0 || !Array.isArray(p.people) || p.people.length !== PEOPLES.length || !Array.isArray(p.faith) || p.faith.length !== FAITHS.length || !Array.isArray(p.cells) || p.cells.some(i => !Number.isInteger(i) || i < 0 || i >= GN) || p.owner >= s.realms.length || p.owner < -1)
            throw Error('Invalid province in saved simulation.');
    }
    for (let k = 0; k < s.realms.length; k++) {
        const c = s.realms[k];
        if (c.id !== k || !s.provinces[c.capital] || typeof c.name !== 'string' || c.name.length > 100 || !/^#[0-9a-f]{6}$/i.test(c.color) || !FAITHS[c.faith] || !GOVERNMENTS[c.gov])
            throw Error('Invalid realm in saved simulation.');
    }
    validateCityState(s);
    HighCitadels.validate(s, w);
    if(s.townRecipes){
        if(typeof s.townRecipes!=='object'||Array.isArray(s.townRecipes)||Object.keys(s.townRecipes).length>4096)throw Error('Invalid town recipes.');
        for(const [id,r] of Object.entries(s.townRecipes)){TownCatalog.validate(r);const p=s.provinces[+id];if(!p?.settled||+id!==r.provinceId||!TownCatalog.allowed(p,w,r.style))throw Error('Town recipe does not match a valid existing settlement.');}
    }
    if (s.landmarkRecipes) {
        if (typeof s.landmarkRecipes !== 'object' || Array.isArray(s.landmarkRecipes) || Object.keys(s.landmarkRecipes).length > 4096)
            throw Error('Invalid landmark recipe collection.');
        for (const [id, recipe] of Object.entries(s.landmarkRecipes)) {
            const valid = LandmarkCatalog.validate(recipe);
            if (valid.id !== id) throw Error('A landmark recipe has an inconsistent site identifier.');
            s.landmarkRecipes[id] = valid;
        }
    }
    const a = auditCivilization(s, w);
    if (a.invalidOwners || a.badPop || a.badShares || !a.finiteRealms)
        throw Error('Saved simulation fails numerical checks.');
}
function refreshAll(rebuild = true) {
    if (!world || !sim)
        return;
    aggregateRealms(sim);
    if (rebuild) {
        renderer.sim = sim;
        renderer.focusRealm = selectedRealm;
        renderer.prepareTerritory();
        renderer.buildTerrain();
        renderer.buildCivilization();
    }
    const alive = sim.realms.filter(c => c.alive), pop = sim.provinces.reduce((a, p) => a + p.pop, 0), pacts = Object.values(sim.relations).filter(r => r.alliance && sim.realms[r.a]?.alive && sim.realms[r.b]?.alive).length, wars = sim.wars.filter(w => !w.ended).length;
    $('year').textContent = sim.year;
    $('statPopulation').textContent = fmtPop(pop);
    $('statRealms').textContent = alive.length;
    $('statAlliances').textContent = pacts;
    $('statWars').textContent = wars;
    $('realmCount').textContent = alive.length + ' / ' + sim.realms.length;
    $('worldSubtitle').textContent = `${world.stats.continents} continents · ${world.stats.islands} islands · ${world.hydrologyStats.lakes} inland lakes · ${PEOPLES.length} peoples · ${FAITHS.length} traditions`;
    $('navWorldStats').textContent = `${sim.provinces.length} provinces · ${world.stats.volcanoes} volcanic centers (${world.stats.active} active) · ${world.hydrologyStats.fjords} fjords`;
    $('footerStatus').textContent = `TELLURIC VI · Seed ${world.params.seed} · ${sim.year - 400} simulated years · ${sim.totalConquests} territorial transfers`;
    $('simStatus').textContent = playing ? 'History is advancing' : 'Paused · changes are reproducible';
    const audit = auditCivilization(sim, world);
    window.__audit = audit;
    $('auditText').textContent = `Year ${sim.year}: invalid owners ${audit.invalidOwners}; invalid population mixtures ${audit.badShares}; invalid capital ownership ${audit.badCapitals}; inhabited province cells on water ${audit.waterClaims}; sea-route land crossings ${audit.routeErrors}; finite realm values ${audit.finiteRealms ? 'PASS' : 'FAIL'}. Basin storage residual ${world.waterBudgetError.toExponential(2)}. Inland lake territory is derived separately from inhabited provinces. These checks concern internal consistency, not scientific validation.`;
    renderRealmList();
    renderChronicle();
    renderPower();
    renderInspector();
    legend();
    makeLabels();
    renderSettlementReport();
    renderContinentalPolitics();
    renderer.request();
    window.CityUI?.onWorldUpdate();
    window.LandmarkUI?.onWorldUpdate();
    window.OneMap?.onWorldUpdate();
    window.ContinuousMap?.onWorldUpdate();
}
function renderRealmList() {
    const search = $('realmSearch').value.toLowerCase().trim(), key = $('sortRealms').value, items = sim.realms.filter(c => c.alive && (`${c.name} ${c.title}`).toLowerCase().includes(search)).sort((a, b) => b[key] - a[key]);
    $('realmList').innerHTML = items.map(c => `<button class="realmitem ${c.id === selectedRealm ? 'active' : ''}" data-realm="${c.id}" title="${escapeHTML(RealmNames.fullName(c))}"><span class="shield" style="background:${c.color}">${c.gov === 2 ? '✦' : c.gov === 1 ? '✧' : c.gov === 4 ? '≈' : '♜'}</span><span><span class="name">${escapeHTML(RealmNames.fullName(c))}</span><small>${escapeHTML(GOVERNMENTS[c.gov])}</small></span><b>${key === 'population' ? fmtPop(c.population) : fmt(c[key])}</b></button>`).join('');
    $('realmList').querySelectorAll('[data-realm]').forEach(b => b.onclick = () => selectRealm(+b.dataset.realm));
}
function selectRealm(id, focus = false) { const c = sim?.realms[id]; if (!c?.alive)
    return;
    const repaint = renderer.focusRealm !== id && renderer.hoveredRealm == null;
    selectedRealm = id; selectedCell = sim.provinces[c.capital].i; renderer.focusRealm = id; renderer.select(selectedCell); renderRealmList(); renderInspector(); if (focus) {
    const p = sim.provinces[c.capital];
    renderer.focus(p.x, p.y);
} makeLabels();
    // A sidebar or keyboard selection has no preceding hover to clear. Refresh
    // the selected territory immediately, including the country's inland water.
    if (repaint) {
        if (renderer.continuousLayer?.recolorTerrain) renderer.continuousLayer.recolorTerrain();
        else renderer.buildTerrain();
    }
    showLocation(selectedCell); window.CityUI?.offerCity(sim.provinces[c.capital]); window.OneMap?.inspectRealm(id); }
function mixtureHTML(values, defs) { const sorted = values.map((v, k) => ({ v, k })).sort((a, b) => b.v - a.v); return `<div class="stacked">${values.map((v, k) => `<span style="width:${v * 100}%;background:${defs[k].color}" title="${escapeHTML(defs[k].name)}: ${(v * 100).toFixed(1)}%"></span>`).join('')}</div><div class="breaklabels">${sorted.slice(0, 4).map(({ v, k }) => `<span><i style="background:${defs[k].color}"></i>${escapeHTML(defs[k].name)} ${Math.round(v * 100)}%</span>`).join('')}<span>+ ${Math.round(sorted.slice(4).reduce((a, v) => a + v.v, 0) * 100)}% others</span></div>`; }
function realmNameOriginHTML(c) {
    const origin = RealmNames.describe(c);
    return origin ? `<p class="realm-name-origin"><strong>Name origin</strong><br>${escapeHTML(origin)}</p>` : '';
}
function renderInspector(forceRealm = false) {
    if (!forceRealm && !POLITICAL.includes(currentLayer) && selectedCell >= 0)
        return renderGeography(selectedCell, sim?.provinces[world.provinceId[selectedCell]]);
    const c = sim?.realms[selectedRealm];
    if (!c?.alive) {
        const p = selectedCell >= 0 ? sim?.provinces[world.provinceId[selectedCell]] : null;
        return renderGeography(selectedCell, p);
    }
    const cap = sim.provinces[c.capital], allies = [], foes = [];
    for (const r of Object.values(sim.relations))
        if (r.alliance && (r.a === c.id || r.b === c.id)) {
            const b = sim.realms[r.a === c.id ? r.b : r.a];
            if (b.alive)
                allies.push(b.name);
        }
    for (const war of sim.wars)
        if (!war.ended && (war.a === c.id || war.b === c.id))
            foes.push(sim.realms[war.a === c.id ? war.b : war.a].name);
    const tradePartners = Object.values(sim.relations).filter(r => r.trade && (r.a === c.id || r.b === c.id) && sim.realms[r.a]?.alive && sim.realms[r.b]?.alive).length;
    const rivals = sim.realms.filter(n => n.alive && n.id !== c.id);
    if (!rivals.some(n => n.id === diplomacyTarget)) {
        const conn = realmConnections(sim);
        diplomacyTarget = rivals.find(n => conn.has(cPair(c.id, n.id)))?.id ?? rivals[0]?.id ?? -1;
    }
    $('inspector').innerHTML = `<div class="overline">REALM DOSSIER / YEAR ${sim.year}</div><div class="inspecttop"><span class="shield bigshield" style="background:${c.color}">${c.gov === 2 ? '✦' : c.gov === 1 ? '✧' : '♜'}</span><div><h2>${escapeHTML(RealmNames.fullName(c))}</h2><div class="government">${escapeHTML(GOVERNMENTS[c.gov])} · ${c.provinces.length} provinces</div></div></div>${realmNameOriginHTML(c)}<p class="identity">${escapeHTML(c.identity)}</p><div class="metrics"><div><b>${fmtPop(c.population)}</b><small>POPULATION</small></div><div><b>${fmt(c.strength)}</b><small>POWER INDEX</small></div><div><b>${c.army.toFixed(1)}k</b><small>FIELD ARMY</small></div><div><b>${c.income.toFixed(1)}</b><small>ANNUAL REVENUE</small></div><div><b>${c.arcana.toFixed(2)}</b><small>ARCANE LEVEL</small></div><div><b>${c.treasury.toFixed(0)}</b><small>TREASURY</small></div></div><div class="captionrow"><span>Stability</span><span>${Math.round(c.stability)} / 100</span></div><div class="meter"><div style="width:${c.stability}%;background:${c.stability < 45 ? '#bd9474' : '#91a581'}"></div></div><div class="captionrow"><span>Food availability / demand</span><span>${Math.round(c.foodRatio * 100)}%</span></div><div class="meter"><div style="width:${Math.min(100, c.foodRatio * 65)}%;background:${c.foodRatio < 1 ? '#c19b72' : '#8aab94'}"></div></div><div class="breakdown"><div class="overline">PEOPLES / POPULATION MIX</div>${mixtureHTML(c.people, PEOPLES)}</div><div class="breakdown"><div class="overline">FAITHS / NOT THE STATE RELIGION</div>${mixtureHTML(c.faithMix, FAITHS)}</div><div class="diplotext"><strong>Capital</strong> ${escapeHTML(cap.name)}<br><strong>Allies</strong> ${escapeHTML(allies.join(', ') || 'No defensive pact')}<br><strong>At war</strong> ${escapeHTML(foes.join(', ') || 'At peace')}<br><strong>Trade agreements</strong> ${tradePartners}</div><div class="inspectbuttons"><button id="focusCapital">Go to capital</button><button id="viewDiplomacy">See diplomacy</button></div><div class="field"><label for="policy">GOVERNING PRIORITY</label><select id="policy">${['Prosperity', 'Scholarship', 'Expansion', 'Concord'].map(v => `<option ${v === c.policy ? 'selected' : ''}>${v}</option>`).join('')}</select></div><div class="field"><label for="stateFaith">STATE TRADITION</label><select id="stateFaith">${FAITHS.map((f, k) => `<option value="${k}" ${c.faith === k ? 'selected' : ''}>${escapeHTML(f.name)}</option>`).join('')}</select></div><div class="diplomacybox"><div class="overline">DIPLOMATIC ACTIONS</div><div class="field"><select id="diplomacyTarget" aria-label="Diplomatic target">${rivals.map(n => `<option value="${n.id}" ${n.id === diplomacyTarget ? 'selected' : ''}>${escapeHTML(n.name)}</option>`).join('')}</select></div><div class="relationNote" id="relationNote"></div><div class="diplobuttons"><button data-action="rapprochement">Send delegation</button><button data-action="alliance">Offer alliance</button><button data-action="war" class="danger">Declare war</button><button data-action="peace">Broker peace</button></div></div><details><summary>Founding geography & territorial limits</summary><p class="identity">Territory grows through connected land from existing local centers. Districts beyond the central command range or administration budget retain local administration within their realm. Sea trade does not annex land, and isolated communities can remain independent.</p><table class="detailTable"><tr><td>Founding districts</td><td>${c.foundingProvinces ?? "—"}</td></tr><tr><td>Founding command range / model units</td><td>${Number.isFinite(c.commandRange) ? c.commandRange.toFixed(1) : "—"}</td></tr><tr><td>Founding administration / budget</td><td>${Number.isFinite(c.adminBudget) ? c.adminUsed.toFixed(1) + " / " + c.adminBudget.toFixed(1) : "—"}</td></tr></table><p class="identity">Later conquest and secession may change these initial holdings; the founding budget is not an annual fiscal account.</p></details><details><summary>Economy, forces & realm name</summary><table class="detailTable"><tr><td>Technology level</td><td>${c.tech.toFixed(2)}</td></tr><tr><td>Trade revenue</td><td>${c.tradeIncome.toFixed(1)}</td></tr><tr><td>Imported food / people-equivalent</td><td>${fmtPop(c.imports)}</td></tr><tr><td>Navy / flotillas</td><td>${c.navy.toFixed(1)}</td></tr><tr><td>Magic power index</td><td>${c.magicPower.toFixed(1)}</td></tr><tr><td>War weariness</td><td>${Math.round(c.warWeariness)}</td></tr><tr><td>Local tolerance parameter</td><td>${Math.round(c.tolerance * 100)}%</td></tr></table><div class="field"><label for="realmNameEdit">Rename this realm</label><input id="realmNameEdit" value="${escapeHTML(c.name)}" maxlength="65"></div><button id="renameRealm" style="font-size:9px">Apply name</button></details><p class="smallnote">Revenue and reserves use abstract treasury units. Military and arcane indices are game rules, not real-world measurements.</p>`;
    $('focusCapital').onclick = () => selectRealm(c.id, true);
    $('viewDiplomacy').onclick = () => setLayer('diplomacy');
    $('policy').onchange = () => applyAction('policy', -1, $('policy').value);
    $('stateFaith').onchange = () => applyAction('faith', -1, +$('stateFaith').value);
    $('diplomacyTarget').onchange = () => { diplomacyTarget = +$('diplomacyTarget').value; relationNote(); };
    $('inspector').querySelectorAll('[data-action]').forEach(b => b.onclick = () => applyAction(b.dataset.action, diplomacyTarget));
    $('renameRealm').onclick = () => applyAction('rename', -1, $('realmNameEdit').value);
    relationNote();
}
function renderRealmOverview(id) {
    const profile = RealmProfile.create(world, sim, id), c = sim?.realms[id];
    if (!profile || !c?.alive) return;
    const { facts } = profile;
    $('inspector').innerHTML = `<article class="realm-overview" data-realm-id="${id}">
        <div class="overline">${escapeHTML(GOVERNMENTS[c.gov])} · YEAR ${sim.year}</div>
        <p class="realm-lead">${escapeHTML(profile.summary)}</p>
        <div class="realm-facts">
            <div><b>${fmtPop(facts.population)}</b><small>Residents</small></div>
            <div><b>${(facts.areaShare * 100).toFixed(1)}%</b><small>Of the world's land</small></div>
            <div><b>${facts.provinceCount}</b><small>Provinces · ${facts.townCount} towns</small></div>
            <div><b>${escapeHTML(facts.capital || 'No capital')}</b><small>Capital</small></div>
        </div>
        ${facts.primaryPeople ? `<p class="realm-community"><strong>${escapeHTML(facts.primaryPeople)}</strong> · ${(facts.primaryPeopleShare * 100).toFixed(1)}% of residents · ${facts.primaryPeopleShare > .5 ? 'majority community' : 'largest community'}</p>` : ''}
        <div class="inspectbuttons"><button id="realmVisitCapital">Visit capital</button><button id="realmGovernment">Government & diplomacy</button></div>
        ${profile.sections.map(section => `<section><h3>${escapeHTML(section.title)}</h3><p>${escapeHTML(section.text)}</p></section>`).join('')}
        <section><h3>From the chronicle</h3>${profile.events.length ? `<ol class="realm-history">${profile.events.map(event => `<li><time>Year ${event.year}</time>${escapeHTML(event.text)}</li>`).join('')}</ol>` : '<p>No events have yet been recorded for this realm.</p>'}</section>
    </article>`;
    $('realmVisitCapital').disabled = !sim.provinces[c.capital]?.settled;
    $('realmVisitCapital').onclick = () => window.OneMap?.enterTown(c.capital);
    $('realmGovernment').onclick = () => { selectedRealm = id; setLayer('diplomacy'); renderInspector(true); window.OneMap?.openDrawer('detail'); };
}
function relationNote() { const el = $('relationNote'); if (!el || diplomacyTarget < 0)
    return; const r = cRelation(sim, selectedRealm, diplomacyTarget), edge = realmConnections(sim).get(cPair(selectedRealm, diplomacyTarget)); el.textContent = `Relations ${Math.round(r.score)} · ${r.alliance ? 'Allied' : warBetween(sim, selectedRealm, diplomacyTarget) ? 'At war' : 'No pact'} · ${edge ? (edge.land ? 'Land frontier' : 'Sea contact') : 'No direct route'}`; }
function applyAction(action, target = -1, value = null) { if (busy)
    return; pause(); const result = civilizationAction(sim, action, selectedRealm, target, value); toast(result.message); refreshAll(); }
function showLocation(i) {
    if (!world || i < 0)
        return;
    const pid = world.provinceId[i], p = sim?.provinces[pid], b = world.basins[world.basinTarget[i]], extra = world.lake[i] > 0 ? `${world.basins[world.lakeId[i]]?.kind || 'Inland lake'} · water surface ${fmt(world.lake[i])} m` : b?.closed ? 'Inland drainage → ' + b.name : 'Drainage toward an ocean or an overflowing basin';
    const sovereignty = typeof PoliticalLand !== 'undefined' ? PoliticalLand.status(world, sim, i) : null;
    $('locationNote').textContent = `${p ? p.name + ' · ' : ''}${sovereignty && sovereignty.kind !== 'water' ? sovereignty.label + ' · ' : ''}${BIOME[world.biome[i]][0]} · ${CityEnvironment.band(world.temp[i], world.arid[i], world.height[i])} · bed ${fmt(world.height[i])} m · ${world.temp[i].toFixed(1)} °C · ${extra}`;
}
function inspectCell(i) { selectedCell = i; const p = sim?.provinces[world.provinceId[i]]; renderer.select(i); showLocation(i); if (POLITICAL.includes(currentLayer) && p?.owner >= 0) {
    selectedRealm = p.owner;
    renderRealmList();
    renderInspector();
}
else
    renderGeography(i, p); window.CityUI?.offerCity(p);  window.OneMap?.inspectWorld(i); }
function renderGeography(i, p = null) {
    if (!world || i < 0)
        return;
    const w = world, b = w.basins[w.lakeId[i]], target = w.basins[w.basinTarget[i]], country = typeof PoliticalLand !== 'undefined' ? PoliticalLand.status(w, sim, i).realm : p ? sim.realms[p.owner] : null, feature = w.features.find(f => f.i === i), plate = w.plates[w.plate[i]], isFjord = w.fjord[i] > 0;
    const title = feature?.name || b?.name || (isFjord ? 'Glacial fjord' : BIOME[w.biome[i]][0]);
    let cause = feature?.text || '';
    if (!cause) {
        if (b)
            cause = `${b.kind}. Water arrives from a catchment of ${b.catchment} grid cells. Rain and evaporation modify stored water; ${b.closed ? 'no sustained overflow reaches the sea.' : 'surplus water feeds a downstream river.'}`;
        else if (isFjord)
            cause = 'A coastal trough carved below sea level during a prescribed former glacial episode. The ocean floods the bed, leaving high shoulders.';
        else if (w.height[i] <= 0)
            cause = 'Ocean floor, generated from continental crust, plate boundaries and ocean heat transport. Diplomatic links are not shipping paths.';
        else if ([18, 19, 20].includes(w.biome[i]))
            cause = 'Low terrain slope and convergent runoff or lake proximity keep this ground wet. These cells affect agricultural potential and overland travel.';
        else if ([3, 4, 13, 14].includes(w.biome[i]))
            cause = ['', 'The model attributes dryness mainly to an upwind mountain barrier.', 'Subtropical circulation contributes to dry conditions.', 'A cold coastal influence contributes to dry conditions.', 'Interior water-vapor supply is limited.'][w.cause[i]];
        else
            cause = 'Temperature, transported rainfall, elevation and evaporative demand determine this biome. Civilizations inherit these constraints rather than placing the biome themselves.';
    }
    $('inspector').innerHTML = `<div class="overline">LANDSCAPE DOSSIER</div><h2 class="geoTitle">${escapeHTML(title)}</h2><p class="identity">${escapeHTML(cause)}</p><div class="metrics"><div><b>${fmt(w.height[i])}</b><small>BED / MODEL M</small></div><div><b>${w.temp[i].toFixed(1)}°</b><small>TEMPERATURE</small></div><div><b>${w.rain[i].toFixed(2)}</b><small>RAINFALL INDEX</small></div><div><b>${w.arid[i].toFixed(2)}</b><small>WATER / DEMAND</small></div><div><b>${fmt(w.ice[i])}</b><small>ICE / MODEL M</small></div><div><b>${w.flow[i].toFixed(1)}</b><small>RUNOFF INDEX</small></div></div><p class="geoStat">${escapeHTML(plate.name)} Plate<br>${escapeHTML(BOUNDARY[w.boundaryType[i]] || 'Plate interior')}<br>${target ? 'Catchment: ' + escapeHTML(target.name) : 'No significant closed basin downstream'}</p>${b ? `<table class="detailTable"><tr><td>Water surface / model m</td><td>${fmt(b.level)}</td></tr><tr><td>Water area / grid cells</td><td>${b.area}</td></tr><tr><td>Catchment / grid cells</td><td>${b.catchment}</td></tr><tr><td>Stored volume / model units</td><td>${b.volume.toFixed(2)}</td></tr><tr><td>Annual overflow index</td><td>${b.overflow.toFixed(3)}</td></tr><tr><td>Storage budget residual</td><td>${b.budget.residual.toExponential(1)}</td></tr></table>` : ''}${p ? `<div class="breakdown"><div class="overline">${escapeHTML(p.name)} / ${escapeHTML(country?.name || 'UNALIGNED COMMUNITIES')}</div><div class="miniheading">PEOPLES</div>${mixtureHTML(p.people, PEOPLES)}<div class="miniheading">FAITHS</div>${mixtureHTML(p.faith, FAITHS)}<p class="geoStat" style="margin-top:10px">Population ${fmtPop(p.pop)}<br>Unrest ${Math.round(p.unrest)} / 100</p></div>` : ''}<div class="inspectbuttons"><button id="backRealm">Realm dossier</button><button id="waterLayer">Water layer</button></div><p class="smallnote">Lake surfaces are separate from bedrock. Basins and fjords are explicit design-conditioned landforms; measurements use an uncalibrated rectangular grid.</p>`;
    if (typeof PoliticalLand !== 'undefined' && PoliticalLand.status(w, sim, i).kind !== 'water') {
        const note = document.createElement('p');
        note.className = 'identity';
        note.textContent = PoliticalLand.description(w, sim, i);
        $('inspector').querySelector('.geoTitle').after(note);
    }
    if (w.human && habitable(w, i)) {
        const g = w.human, source = g.lake[i] > .25 ? 'Freshwater lakeshore' : g.river[i] > .35 ? 'Stream / river access' : g.rainwater[i] > .28 ? 'Rain collection / rain-fed land' : g.salt[i] > .25 ? 'Salt lake nearby, but no freshwater bonus' : 'No reliable local freshwater';
        const div = document.createElement('div');
        div.className = 'causaldossier';
        div.innerHTML = `<div class="overline">WHY PEOPLE CAN / CANNOT SETTLE HERE</div><h3>${escapeHTML(source)}</h3><table class="detailTable"><tr><td>Freshwater access</td><td>${(g.fresh[i] * 100).toFixed(0)} / 100</td></tr><tr><td>Cultivation potential</td><td>${(g.farm[i] * 100).toFixed(0)} / 100</td></tr><tr><td>Harbor suitability</td><td>${(g.harbor[i] * 100).toFixed(0)} / 100</td></tr><tr><td>Local carrying capacity</td><td>${fmt(g.capacity[i])}</td></tr><tr><td>Settlement potential</td><td>${(g.potential[i] * 100).toFixed(0)} / 100</td></tr></table>${p ? `<p class="identity"><strong>${escapeHTML(p.settlementType)}</strong> · concentrated population ${fmtPop(p.urbanPop)}; dispersed hinterland population ${fmtPop(p.ruralPop)}.</p><p class="smallnote">${escapeHTML(p.siteReason)}</p>` : ''}<p class="smallnote">Indices and population scale are uncalibrated. Province centers are accounting sites, not automatic cities.</p>`;
        $('inspector').prepend(div);
    }
    $('backRealm').onclick = () => { setLayer('realms'); if (country)
        selectRealm(country.id); };
    $('waterLayer').onclick = () => setLayer('water');
}
function setLayer(layer) { if (!renderer || !layerTitles[layer])
    return; currentLayer = layer; renderer.setLayer(layer); document.querySelectorAll('[data-layer]').forEach(b => { const active = b.dataset.layer === layer; b.classList.toggle('active', active); b.setAttribute('aria-selected', String(active)); }); $('moreLayer').value = [...$('moreLayer').options].some(o => o.value === layer) ? layer : ''; legend(); makeLabels(); renderSettlementReport(); renderContinentalPolitics(); if (selectedCell >= 0) {
    if (POLITICAL.includes(layer))
        renderInspector();
    else
        renderGeography(selectedCell, sim?.provinces[world.provinceId[selectedCell]]);
} }
function legend() {
    if (!world || !sim)
        return;
    let items = [];
    if (currentLayer === 'potential')
        items = [['#d3c3a7', 'Limited water / food / access'], ['#388c79', 'Strong settlement support'], ['#79b7c5', 'Water is not automatically freshwater']];
    else if (currentLayer === 'settlements')
        items = [['#d3c3a7', 'Sparse hinterland'], ['#388c79', 'Productive hinterland'], ['#e4d7b5', 'Sized villages & towns — no state symbols']];
    else if (currentLayer === 'realms')
        items = [['#b8a17a', 'Hover a country name to see its territory'], ['#465457', 'Solid line: national border'], ['#766750', 'Dashed line: unclaimed wilderness boundary'], ['#74b4c1', 'Inland lake']];
    else if (currentLayer === 'faiths')
        items = FAITHS.map(f => [f.color, f.name]);
    else if (currentLayer === 'peoples')
        items = PEOPLES.map(f => [f.color, f.name]);
    else if (currentLayer === 'diplomacy')
        items = [['#bad8bf', 'Defensive pact (schematic)'], ['#d48064', 'War (schematic)'], ['#c5d9c6', 'Ocean-traced trade lane']];
    else if (currentLayer === 'water')
        items = [['#68b6cb', 'Overflow lake'], ['#74a7c2', 'Closed inland lake'], ['#589a89', 'Wetland / floodplain'], ['#346e91', 'Glacial fjord'], ['#e1eeee', 'Ice']];
    else if (currentLayer === 'plates')
        items = [['#9e4f4a', 'Collision'], ['#d47847', 'Subduction / arc'], ['#338e94', 'Divergence'], ['#86718b', 'Transform']];
    else if (currentLayer === 'ice')
        items = [['#eef3ee', 'Thick grounded ice'], ['#9cd4de', 'Flowing ice'], ['#d1ebee', 'Sea ice']];
    else if (currentLayer === 'aridity')
        items = [['#b78a92', 'Rain shadow'], ['#e0b25e', 'Subtropical'], ['#68a7ac', 'Cold coast'], ['#bf8060', 'Continental interior']];
    else if (currentLayer === 'rain')
        items = [['#e2bf83', 'Dry'], ['#b9bc86', 'Moderate'], ['#689d89', 'Wet'], ['#326b7b', 'Very wet']];
    else if (currentLayer === 'ocean')
        items = [['#729fb2', 'Cold anomaly'], ['#aecbc7', 'Reference'], ['#d69a73', 'Warm anomaly']];
    else if (currentLayer === 'wealth')
        items = [['#c7b88e', 'Low development'], ['#3f8f85', 'High development']];
    else if (currentLayer === 'magic')
        items = [['#e7d9c6', 'Limited infrastructure'], ['#8665ab', 'Strong local arcane capacity']];
    else
        items = [['#4e7f7a', 'Boreal forest'], ['#6f9a6a', 'Temperate forest'], ['#3d7f4c', 'Tropical rainforest'], ['#ddab5f', 'Sand desert'], ['#c0b273', 'Dry steppe'], ['#9fa89b', 'Tundra'], ['#939589', 'Alpine rock'], ['#74b4c1', 'Inland lake'], ['#679a8d', 'Wetland'], ['#d9eff0', 'Glacier'], ['Ground tone grades with temperature and aridity inside each biome.']].map(a => a.length === 1 ? [null, a[0]] : a);
    $('legend').innerHTML = items.map(([c, t]) => `<span>${c ? `<i style="background:${c}"></i>` : ''}${escapeHTML(t)}</span>`).join('') + (['faiths', 'peoples'].includes(currentLayer) ? '<span>Color: local majority, not uniform belief or ancestry.</span>' : '');
    $('mapStamp').textContent = layerTitles[currentLayer] + ' / ' + sim.year;
}
// Candidate positions belong to the realm's land, independently of its towns.
// Prefer the interior and leave space around settlements; screen-space fitting
// below chooses a candidate after the actual lettering has been measured.
function realmLabelAnchors(held) {
    const cells = held.flatMap(p => p.cells).filter(i => world.height[i] > 0 && world.lake[i] <= 0);
    if (!cells.length) return [];
    const owned = new Set(cells), towns = held.filter(p => p.settled);
    const cx = cells.reduce((s, i) => s + i % GW, 0) / cells.length;
    const cy = cells.reduce((s, i) => s + Math.floor(i / GW), 0) / cells.length;
    const candidates = cells.map(i => {
        const x = i % GW, y = Math.floor(i / GW);
        const townDistance = Math.min(8, ...towns.map(p => Math.hypot(p.x - x, p.y - y)));
        let interior = 0;
        for (const [dx, dy] of [[-3,0],[3,0],[0,-3],[0,3]])
            if (x+dx >= 0 && x+dx < GW && owned.has(i+dy*GW+dx)) interior++;
        return { x, y, i, score: interior * 2 + townDistance - Math.hypot(x-cx, y-cy) * .3 };
    }).sort((a,b) => b.score-a.score || a.i-b.i);
    const anchors = [];
    for (const p of candidates) {
        if (anchors.every(a => Math.hypot(a.x-p.x, a.y-p.y) >= 3)) anchors.push(p);
        if (anchors.length === 40) break;
    }
    // The highest-scoring forty positions can all occupy the same interior.
    // Keep a candidate in each part of the territory, including separate islands,
    // so approaching a peripheral district does not erase its country's name.
    const xs=cells.map(i=>i%GW),ys=cells.map(i=>Math.floor(i/GW));
    const x0=Math.min(...xs),y0=Math.min(...ys),dx=Math.max(1,(Math.max(...xs)-x0+1)/8),dy=Math.max(1,(Math.max(...ys)-y0+1)/8);
    const coverage=new Map(),seen=new Set(anchors.map(a=>a.i));
    for(const p of candidates){const key=Math.floor((p.x-x0)/dx)+','+Math.floor((p.y-y0)/dy);if(!coverage.has(key))coverage.set(key,p);}
    for(const p of coverage.values())if(!seen.has(p.i)){anchors.push(p);seen.add(p.i);}
    return anchors;
}
// Named wonders only appear when the legend layer itself is switched on.
function legendLabels() { return $('legends')?.checked === false ? [] : (world.legends || []); }
// Loaded lettering changes the label bounds, so re-run collision placement.
document.fonts?.addEventListener('loadingdone', () => { positionLabels(); renderer?.request(); });
window.addEventListener('blur', () => renderer?.setHoveredRealm(null));
function makeLabels() {
    renderer?.setHoveredRealm(null);
    $('labels').innerHTML = '';
    labelItems = [];
    if (!world || !sim)
        return;
    const capitals = new Set(sim.realms.filter(c => c.alive).map(c => c.capital));
    // Settlement labels describe the inhabited map, independently of whether a
    // town is large enough to stream a detailed city model.
    const towns = sim.provinces.filter(p => p.settled).sort((a, b) => b.urbanPop - a.urbanPop || a.id - b.id)
        .map(p => ({ x:p.x, y:p.y, i:p.i, provinceId:p.id, name:p.name, highCitadel:p.highCitadel,
            kind:capitals.has(p.id)?'CAPITAL':(p.settlementType || 'town').toUpperCase(), town:true }));
    let list = [];
    if (currentLayer === 'settlements')
        list = towns;
    else if (currentLayer === 'potential')
        list = world.continents;
    else if (currentLayer === 'plates')
        list = world.plates.map(p => ({ x: p.x, y: p.y, i: cell(p.x, p.y), name: p.name + ' Plate', kind: '', plate: true }));
    else if (POLITICAL.includes(currentLayer)) {
        // Realm lettering has its own land positions and no settlement marker.
        // Country names have priority; town lettering fills the remaining space.
        const realms = sim.realms.filter(c => c.alive).sort((a, b) => (b.id === selectedRealm ? 1e9 : 0) + b.strength - (a.id === selectedRealm ? 1e9 : 0) - a.strength);
        const territories = realms.map(c => {
            const held = sim.provinces.filter(p => p.owner === c.id);
            return { c, held, area: RealmProfile.landArea(world, held) };
        });
        const largest = Math.max(1, ...territories.map(t => t.area));
        list = territories.map(({ c, held, area }) => {
            const anchors = realmLabelAnchors(held), anchor = anchors[0] || sim.provinces[c.capital];
            return { x: anchor.x, y: anchor.y, i: anchor.i, name: RealmNames.fullName(c), shortName:c.name, realm: c.id, anchors, area,
                labelSize: 14 + 10 * Math.sqrt(area / largest) };
        });
        list.push(...towns);
        if(typeof PoliticalLand!=='undefined')list.push(...PoliticalLand.labels(world,sim));
    }
    else if (currentLayer === 'relief')
        // Continents claim their names first — they are the coarsest "where am I"
        // layer and there are only a handful. Wonders come next so they outrank
        // towns; putting them ahead of the continents cost three continent names.
        list = [...world.continents,
            ...legendLabels(),
            ...towns,
            ...world.features];
    else if (currentLayer === 'water')
        list = world.features.filter(f => f.id.startsWith('lake') || f.id.startsWith('fjord') || f.id === 'wetland');
    else if (currentLayer === 'ice')
        list = world.features.filter(f => ['glacier', 'alpine'].includes(f.id)).concat(world.continents.filter(c => Math.abs(world.lat[c.i]) > 60));
    else
        list = [...world.continents, ...legendLabels(), ...world.features];
    // Thematic colours change the map's subject, not the names of its towns.
    if (!list.some(f => f.town)) list = [...list, ...towns];
    for (const f of list) {
        const b = document.createElement('button');
        b.className = 'maplabel' + (f.realm != null ? ' realmLabel' : '') + (f.plate ? ' plateLabel' : '') + (f.legend ? ' legendLabel' : '') + (f.town ? ' townLabel cm-town-pin' : '') + (f.wilderness ? ' wildernessLabel' : '');
        b.innerHTML = f.realm != null
            ? `<em class="realmFullName">${escapeHTML(f.name)}</em><em class="realmCompactName" aria-hidden="true">${escapeHTML(f.shortName||f.name)}</em><span class="realmMarker" aria-hidden="true">${f.realm+1}</span>`
            : `<small>${escapeHTML(f.kind || '')}</small><em>${escapeHTML(f.name)}</em>`;
        if (f.realm != null) {
            b.dataset.realmId = f.realm;
            b.style.setProperty('--realm-label-size', f.labelSize.toFixed(2) + 'px');
            b.style.setProperty('--realm-mark', sim.realms[f.realm].color || '#786c50');
            b.setAttribute('aria-label', 'Read about ' + f.name);
            b.onpointerenter = e => {
                if (!busy && e.pointerType !== 'touch' && $('names').checked && b.style.opacity === '1')
                    renderer.setHoveredRealm(f.realm);
            };
            b.onpointerleave = b.onpointercancel = () => {
                if (renderer.hoveredRealm === f.realm) renderer.setHoveredRealm(null);
            };
        }
        b.title = 'Inspect ' + f.name + (f.kind ? ' · ' + f.kind : '');
        if (f.town) {
            b.dataset.provinceId = f.provinceId;
            if (f.highCitadel && typeof LandmarkBinding !== 'undefined')
                b.title = f.name + ' · ' + LandmarkBinding.highCitadelLabel(f) + ' · ' + Math.round(f.highCitadel.elevation).toLocaleString() + ' m';
            b.ondblclick = e => { e.stopPropagation(); window.ContinuousMap?.focusTown(f.provinceId); };
        }
        b.onclick = () => { if (f.realm != null) {
            selectRealm(f.realm);
        }
        else if (f.town && window.ContinuousMap?.active && (f.highCitadel || renderer.zoom >= AtlasSpace.TOWN_ZOOM))
            window.ContinuousMap.focusTown(f.provinceId);
        else
            inspectCell(f.i); };
        $('labels').appendChild(b);
        labelItems.push({ element: b, feature: f });
    }
    positionLabels();
}
function positionLabels() {
    if (!renderer || !world)
        return;
    // Also runs directly for the names toggle and font loading, outside the
    // renderer callback. Restore each pin's current camera/layer visibility
    // before deciding whether country lettering needs its space this time.
    if(typeof window!=='undefined')window.LandmarkUI?.positionWorldPins();
    $('labels').classList.toggle('hidden', !$('names').checked);
    if (!$('names').checked) {
        renderer.setHoveredRealm(null);
        return;
    }
    const local = renderer.continuousLayer && renderer.zoom >= AtlasSpace.TOWN_ZOOM;
    if (local) renderer.setHoveredRealm(null);
    const boxes = [];
    // All three country forms remain measurable. Batch these reads before any
    // placement writes; a camera frame must not relayout once per candidate.
    const measured = labelItems.filter(({element:e,feature:f}) => {
        if (local && !f.town) { e.style.opacity='0'; e.style.pointerEvents='none'; e.tabIndex=-1; return false; }
        return true;
    }).map(item => {
        const {element:e,feature:f}=item,region=f.realm!=null,full=e.querySelector?.('.realmFullName');
        const variants=[];
        if(region&&full){
            const font=typeof getComputedStyle==='function'?parseFloat(getComputedStyle(full).fontSize):f.labelSize||18;
            for(const scale of [1,.9,Math.max(.78,10.5/font)].filter((v,i,a)=>v<=1&&a.indexOf(v)===i))
                variants.push({kind:'full',scale,width:full.offsetWidth+22,height:full.offsetHeight+10});
            const compact=e.querySelector('.realmCompactName'),marker=e.querySelector('.realmMarker');
            if(compact)variants.push({kind:'compact',scale:1,width:compact.offsetWidth+22,height:compact.offsetHeight+10});
            if(marker)variants.push({kind:'marker',scale:1,width:marker.offsetWidth+4,height:marker.offsetHeight+4});
        }else variants.push({kind:'full',scale:1,width:e.offsetWidth+6,height:e.offsetHeight+4});
        return {...item,region,variants};
    });
    const overlaps = (a, b, gap = 0) => a.x < b.x+b.w+gap && a.x+a.w > b.x-gap && a.y < b.y+b.h+gap && a.y+a.h > b.y-gap;
    const screenPositions=new Map();
    const at = (f, width, height, anchor = f) => {
        if(!screenPositions.has(anchor))screenPositions.set(anchor,renderer.screen(anchor.x,anchor.y,f.town?0:f.legend?1.9:.6));
        const [x,y] = screenPositions.get(anchor);
        return { x:x-width/2, y:y-(f.realm != null ? height/2 : height), w:width, h:height, left:x, top:y, anchor:anchor.i };
    };
    const inside = b => b.x >= 8 && b.x+b.w <= renderer.width-8 && b.y >= 8 && b.y+b.h <= renderer.height-22 && !(b.x < 210 && b.y < 75);
    const obstacles=[],labelRect=$('labels').getBoundingClientRect?.();
    // Pins are siblings of this layer and can otherwise cover a perfectly
    // fitted name. Convert viewport DOM bounds back to map-local coordinates.
    if(labelRect&&typeof document!=='undefined')for(const selector of local?['#cmLabels .cm-building-pin']:['#worldLandmarkPins .world-landmark-pin']){
        for(const pin of document.querySelectorAll(selector)){
            if(pin.style.display==='none'||pin.style.visibility==='hidden'||pin.style.opacity==='0')continue;
            const b=pin.getBoundingClientRect();
            if(b.width&&b.height)obstacles.push({x:b.left-labelRect.left-2,y:b.top-labelRect.top-2,w:b.width+4,h:b.height+4,pin});
        }
    }
    // Countries answer the primary political question. Town names use the space
    // left over, rather than reserving a capital-sized hole in every small realm.
    // A constrained island gets its turn before a large country with many anchors.
    for(const v of measured){const f=v.feature;v.anchors=v.region?(f.anchors?.length?f.anchors:[f]):[f];
        v.visibleAnchors=v.region?v.anchors.filter(a=>inside(at(f,18,18,a))).length:0;}
    measured.sort((a,b)=>Number(b.region)-Number(a.region)||(a.region&&b.region?a.visibleAnchors-b.visibleAnchors:0));
    const townBoxes=measured.filter(v=>v.feature.town).map(v=>at(v.feature,v.variants[0].width,v.variants[0].height)).filter(inside);
    const fit=(v,occupied,limit=1)=>{
        const {feature:f,variants,anchors}=v;
        let fitted=variants[0],box=at(f,fitted.width,fitted.height),show=false;
        const allowed=variants.filter(a=>a.kind!=='full'||a.scale<=limit);
        if(!f.minZoom||renderer.zoom>=f.minZoom)for(const variant of allowed.length?allowed:[variants.at(-1)]){
            // Prefer keeping both names when an alternative is available. This
            // is a preference, never a town's veto over the country's only place.
            for(const leaveTownRoom of v.region?[true,false]:[false]){
                for(const anchor of anchors){
                    const candidate=at(f,variant.width*variant.scale,variant.height*variant.scale,anchor);
                    if(!inside(candidate)||occupied.some(b=>overlaps(candidate,b)))continue;
                    if(leaveTownRoom&&townBoxes.some(b=>overlaps(candidate,b,4)))continue;
                    box=candidate;fitted=variant;show=true;break;
                }
                if(show)break;
            }
            if(show)break;
        }
        if(show)occupied.push(box);
        return{box,fitted,show};
    };
    const regions=measured.filter(v=>v.region),visibleRegions=regions.filter(v=>v.visibleAnchors).length;
    const arrange=limit=>{const occupied=[],placements=new Map();let count=0,named=0;for(const v of regions){const p=fit(v,occupied,limit);placements.set(v,p);if(p.show){count++;if(p.fitted.kind!=='marker')named++;}}return{occupied,placements,count,named};};
    let layout=arrange(1);
    // Do not let an early wide name permanently consume the only anchor of a
    // neighbour. Retry the set in smaller forms only when it restores a country.
    for(const limit of [.9,.78,0]){if(layout.count>=visibleRegions&&layout.named>=visibleRegions)break;const candidate=arrange(limit);if(candidate.count>layout.count||(candidate.count===layout.count&&candidate.named>layout.named))layout=candidate;}
    if(layout.count<visibleRegions){
        // On a phone several countries may share a few dozen screen pixels.
        // Reserve a valid minimum footprint for each country before expanding
        // any name: shrinking only the next name cannot undo an earlier choice.
        const entries=regions.map(v=>{
            const fitted=v.variants.reduce((a,b)=>a.width*a.height*a.scale*a.scale<=b.width*b.height*b.scale*b.scale?a:b);
            const candidates=v.anchors.map(a=>at(v.feature,fitted.width*fitted.scale,fitted.height*fitted.scale,a)).filter(inside);
            return{v,fitted,candidates};
        }).filter(e=>e.candidates.length);
        const minimum=new Map(),occupied=[];let visits=0;
        const reserve=pending=>{
            if(!pending.length)return true;
            if(++visits>256)return false;
            let chosen=null,available=null;
            for(const entry of pending){
                const free=entry.candidates.filter(c=>!occupied.some(b=>overlaps(c,b)));
                if(!free.length)return false;
                if(!available||free.length<available.length){chosen=entry;available=free;}
            }
            const rest=pending.filter(e=>e!==chosen);
            for(const box of available){
                occupied.push(box);minimum.set(chosen.v,{box,fitted:chosen.fitted,show:true});
                if(reserve(rest))return true;
                occupied.pop();minimum.delete(chosen.v);
                if(visits>256)break;
            }
            return false;
        };
        if(reserve(entries)){
            const placements=new Map(layout.placements);
            for(const [v,p] of minimum)placements.set(v,p);
            for(const {v} of entries){
                const other=[...placements].filter(([key,p])=>key!==v&&p.show).map(([,p])=>p.box);
                const expanded=fit(v,other);
                if(expanded.show)placements.set(v,expanded);
            }
            const shown=[...placements.values()].filter(p=>p.show),candidate={placements,occupied:shown.map(p=>p.box),count:shown.length,named:shown.filter(p=>p.fitted.kind!=='marker').length};
            if(candidate.count>layout.count||(candidate.count===layout.count&&candidate.named>layout.named))layout=candidate;
        }
    }
    // An optional monument icon cannot veto a small country's only anchor.
    // Restore it next placement, then suppress only icons intersecting a chosen
    // country label. Towns subsequently avoid all the icons that remain.
    if(!local)for(let i=obstacles.length-1;i>=0;i--)if(layout.occupied.some(b=>overlaps(obstacles[i],b))){
        obstacles[i].pin.style.display='none';obstacles.splice(i,1);
    }
    boxes.push(...obstacles,...layout.occupied);
    // Move lettering around its settlement rather than dropping a name when it
    // collides. The small leader keeps an offset label tied to the actual town.
    // A spatial index keeps crowded overview placement cheap while panning.
    const buckets=new Map(),bucketSize=48;
    const cells=b=>{const out=[];for(let y=Math.floor(b.y/bucketSize);y<=Math.floor((b.y+b.h)/bucketSize);y++)for(let x=Math.floor(b.x/bucketSize);x<=Math.floor((b.x+b.w)/bucketSize);x++)out.push(x+','+y);return out;};
    const remember=b=>{for(const key of cells(b)){if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(b);}};
    for(const b of boxes)remember(b);
    const nearby=b=>{const found=new Set();for(const key of cells(b))for(const other of buckets.get(key)||[])found.add(other);return found;};
    const fitTown=v=>{
        const fitted=v.variants[0],origin=at(v.feature,fitted.width,fitted.height);
        if(!Number.isFinite(origin.left+origin.top)||origin.left<0||origin.left>renderer.width||origin.top<0||origin.top>renderer.height)
            return{box:origin,fitted,show:false};
        const candidate=(dx,dy)=>{
            const x=Math.max(8,Math.min(renderer.width-8-origin.w,origin.x+dx));
            let y=Math.max(8,Math.min(renderer.height-22-origin.h,origin.y+dy));
            if(x<210&&y<75)y=75;
            return{...origin,x,y,left:x+origin.w/2,top:y+origin.h};
        };
        let best=null,bestCost=Infinity;
        const consider=(dx,dy)=>{
            const b=candidate(dx,dy);let overlap=0;
            for(const a of nearby(b))if(overlaps(b,a,1))overlap+=(Math.min(b.x+b.w,a.x+a.w+1)-Math.max(b.x,a.x-1))*(Math.min(b.y+b.h,a.y+a.h+1)-Math.max(b.y,a.y-1));
            const cost=overlap*1e5+Math.hypot(b.left-origin.left,b.top-origin.top);
            if(cost<bestCost){best=b;bestCost=cost;}
            return overlap===0;
        };
        let free=consider(0,0);
        const stepY=Math.max(12,Math.min(18,origin.h*.8)),stepX=stepY;
        for(let ring=1;!free&&ring<=24;ring++){
            const offsets=[];
            for(let x=-ring;x<=ring;x++)offsets.push([x*stepX,-ring*stepY],[x*stepX,ring*stepY]);
            for(let y=1-ring;y<ring;y++)offsets.push([-ring*stepX,y*stepY],[ring*stepX,y*stepY]);
            offsets.sort((a,b)=>Math.hypot(...a)-Math.hypot(...b));
            for(const [dx,dy] of offsets)if(consider(dx,dy)){free=true;break;}
        }
        // On a very crowded imported map every name still remains available;
        // choose the least overlap if the surrounding screen is already full.
        remember(best);boxes.push(best);
        return{box:best,fitted,show:true,origin};
    };
    // Towns use the remaining space before optional geographic annotations.
    const townPlacements=new Map();
    // Long and distinctive names have fewer nearby fits. Give them their place
    // before the small labels, instead of pushing the smallest high cities away
    // from their mountains merely because the population sort put them last.
    const townOrder=measured.filter(v=>v.feature.town).sort((a,b)=>Number(!!b.feature.highCitadel)-Number(!!a.feature.highCitadel)||b.variants[0].width-a.variants[0].width);
    for(const v of townOrder)townPlacements.set(v,fitTown(v));
    for (const v of measured) {
        const {element:e,feature:f,region}=v,{box,fitted,show,origin}=region?layout.placements.get(v):f.town?townPlacements.get(v):fit(v,boxes);
        if(f.town&&origin){
            const dx=origin.left-box.left,dy=origin.top-box.top;
            const values={'--town-anchor-x':dx+'px','--town-anchor-y':dy+'px','--town-leader-length':Math.hypot(dx,dy)+'px','--town-leader-angle':Math.atan2(dy,dx)+'rad'};
            for(const [key,value] of Object.entries(values))if(e.style.setProperty)e.style.setProperty(key,value);else e.style[key]=value;
        }
        if(region&&e.querySelector?.('.realmFullName')){
            e.dataset.labelVariant=fitted.kind;
            if(Number.isInteger(box.anchor))e.dataset.anchorCell=String(box.anchor);
            e.style.width=(fitted.width-6)+'px';e.style.height=(fitted.height-4)+'px';
            e.style.transform=`translate(-50%,-50%) scale(${fitted.scale})`;
            // The compact form and marker still announce the complete state name.
            e.title=fitted.kind==='full'?'Inspect '+f.name:f.name+' · Click for country details';
        }
        e.style.opacity = show ? '1' : '0';
        e.style.pointerEvents = show ? 'auto' : 'none';
        e.tabIndex=show?0:-1;
        e.style.left = box.left+'px';
        e.style.top = box.top+'px';
        if (!show && region && renderer.hoveredRealm === f.realm) renderer.setHoveredRealm(null);
    }
    $('compass').style.transform = `rotate(${-renderer.azimuth * 180 / Math.PI}deg)`;
}
function makeGeoJumps() {
    const targets = [['Great lake', world.features.find(f => f.id.startsWith('lake-'))], ['Closed basin', world.features.find(f => f.id.startsWith('lake-') && f.kind.includes('TERMINAL')) || world.features.find(f => f.kind.includes('CLOSED'))], ['Fjords', world.features.find(f => f.id.startsWith('fjord-'))], ['Rainforest', world.features.find(f => f.id === 'jungle')], ['Wetlands', world.features.find(f => f.id === 'wetland')], ['Desert', world.features.find(f => f.id === 'desert')], ['Glaciers', world.features.find(f => f.id === 'alpine')]];
    $('geoJumps').innerHTML = '<span>TRAVEL TO</span>';
    for (const [name, f] of targets) {
        if (!f)
            continue;
        const b = document.createElement('button');
        b.textContent = name;
        b.onclick = () => { setLayer(['Great lake', 'Closed basin', 'Fjords', 'Wetlands'].includes(name) ? 'water' : name === 'Glaciers' ? 'ice' : 'relief'); inspectCell(f.i); renderer.focus(f.x, f.y); };
        $('geoJumps').appendChild(b);
    }
}
function renderChronicle() {
    const filter = $('eventFilter').value, categories = { conflict: ['war', 'battle', 'conquest', 'peace', 'fall', 'secession'], diplomacy: ['alliance', 'diplomacy', 'trade', 'policy', 'reform'], discovery: ['magic', 'discovery', 'prosperity'] };
    const items = sim.events.map((e, i) => ({ ...e, index: i })).filter(e => filter === 'all' || categories[filter]?.includes(e.type)).slice(-36).reverse();
    $('events').innerHTML = items.map(e => `<div class="event ${escapeHTML(e.type)}"><span class="when">${e.year}</span><span class="etype"></span><button class="eventtext" data-event="${e.index}">${escapeHTML(e.text)}</button></div>`).join('') || '<p class="smallnote">No events of this type have been recorded yet.</p>';
    $('events').querySelectorAll('[data-event]').forEach(b => b.onclick = () => { const e = sim.events[+b.dataset.event]; const living = e.actors.find(id => sim.realms[id]?.alive); if (living != null)
        selectRealm(living); if (e.details?.province != null) {
        const p = sim.provinces[e.details.province];
        renderer.focus(p.x, p.y);
        inspectCell(p.i);
    } });
}
function renderPower() { const top = sim.realms.filter(c => c.alive).sort((a, b) => b.strength - a.strength).slice(0, 5), max = top[0]?.strength || 1; $('powerRanking').innerHTML = top.map(c => `<div class="powerrow"><div class="top"><span>${escapeHTML(c.name)}</span><span>${fmt(c.strength)}</span></div><div class="powertrack"><div style="background:${c.color};width:${c.strength / max * 100}%"></div></div></div>`).join(''); }
async function advance(years, auto = false) { if (!sim || busy || simAdvancing)
    return; if (!auto)
    pause(); simAdvancing=true; window.OneMap?.onAdvancing(true); for (const id of ['step1', 'step10', 'step50', 'resetAge'])
    $(id).disabled = true; try {
    for (let k = 0; k < years; k++) {
        stepCivilization(sim, world);
        stepCityProjects(sim, world);
        if (k % 5 === 4 && k < years - 1) await new Promise(r=>setTimeout(r,0));
    }
    if (!sim.realms[selectedRealm]?.alive)
        selectedRealm = sim.realms.find(c => c.alive)?.id ?? 0;
    refreshAll();
    window.sim = sim;
}
catch (e) {
    pause();
    window.__error = e.message;
    console.error(e);
    toast(e.message);
}
finally {
    simAdvancing=false; window.OneMap?.onAdvancing(false);
    for (const id of ['step1', 'step10', 'step50', 'resetAge'])
        $(id).disabled = false;
} }
async function playLoop() { if (!playing || busy)
    return; await advance(1, true); if (playing)
    timer = setTimeout(playLoop, +$('speed').value); }
function togglePlay() { if (busy || !sim)
    return; if (playing) {
    pause();
    $('simStatus').textContent = 'Paused · changes are reproducible';
}
else {
    playing = true;
    $('play').textContent = 'Ⅱ Pause';
    window.OneMap?.onPlayback();
    playLoop();
} }
function resetHistory() { if (!world || busy)
    return; pause(); sim = createCivilization(world, HighCitadels.historyOptions(sim)); window.sim = sim; selectedRealm = 0; diplomacyTarget = -1; refreshAll(); toast('History reset to year 400. The natural world is unchanged.'); }
function rerollSocieties() { if (!world || busy)
    return; pause(); const before = physicalFingerprint(world); sim = createCivilization(world, HighCitadels.historyOptions(sim, {historySeed: sim.options.historySeed + '*'})); window.sim = sim; selectedRealm = 0; selectedCell = sim.provinces[sim.realms[0]?.capital ?? 0].i; diplomacyTarget = -1; refreshAll(); setLayer('settlements'); toast('New settlement history; physical hash ' + before + ' → ' + physicalFingerprint(world) + '.'); }
function renderSettlementReport() {
    if (!sim || !world)
        return;
    const data = settlementDistribution(sim, world), same = physicalFingerprint(world) === sim.physicalHash;
    document.body.dataset.layer = currentLayer;
    document.querySelector('.navhead h2').textContent = POLITICAL.includes(currentLayer) ? 'Realms' : 'World layers';
    $('realmCount').textContent = POLITICAL.includes(currentLayer) ? sim.realms.filter(c => c.alive).length + ' / ' + sim.realms.length : 'GEOGRAPHY FIRST';
    $('geoLock').innerHTML = `<b>${same ? 'TERRAIN LOCKED' : 'TERRAIN CHANGED'}</b><span>${sim.physicalHash}</span><small>History seed: ${escapeHTML(sim.options.historySeed)}<br>Neither settlement generation nor state formation edits natural fields. Political seed: ${escapeHTML(sim.options.politySeed || 'First-councils')}</small>`;
    const groups = ['freshwater', 'coast', 'dry'];
    $('settlementReport').innerHTML = `<div class="panelheading"><div><div class="overline">GEOGRAPHY → CAPACITY → SETTLEMENTS → POLITIES</div><h3>A world does not owe you a kingdom.</h3></div><span>${sim.provinces.filter(p => p.city).length} towns / cities · ${sim.provinces.filter(p => p.settled && !p.city).length} villages</span></div><div class="densitycards">${groups.map(k => { const d = data[k]; return `<div><strong>${d.citiesPer100Cells.toFixed(2)}</strong><span>${escapeHTML(d.label)}</span><small>Towns per 100 area-weighted land cells<br>${d.cities} towns · ${fmt(d.area)} land-cell units</small></div>`; }).join('')}</div><p class="smallnote">Coastal and freshwater groups can overlap; this is a model diagnostic, not a claim about Earth. Dispersed households are separate from towns. ${sim.initialRealmCount} initial polities were formed around existing towns; no nation type was required.</p>`;
}
let focusedContinent = null;
function focusContinent(id) {
    if (!world || !sim)
        return;
    const land = world.continents.find(l => l.id === id);
    if (!land)
        return;
    focusedContinent = id;
    pause();
    setLayer('realms');
    const local = sim.realms.filter(c => c.alive && sim.provinces[c.capital].landmass === id).sort((a, b) => b.strength - a.strength);
    if (local.length && !local.some(c => c.id === selectedRealm))
        selectRealm(local[0].id);
    const points = [];
    for (let i = 0; i < GN; i++)
        if (world.landmassId[i] === id)
            points.push(i);
    if (!points.length)
        return;
    let minX = GW, maxX = 0, minY = GH, maxY = 0;
    for (const i of points) {
        const x = i % GW, y = i / GW | 0;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    }
    renderer.azimuth = 0;
    renderer.elevation = 1.05;
    renderer.target = renderer.coord((minX + maxX) * .5, (minY + maxY) * .5, 0);
    renderer.target[1] = 0;
    const aspect = renderer.width / renderer.height, baseH = Math.max(42, 83 / aspect);
    const ww = (maxX - minX + 15) / GW * MAP_X, hh = (maxY - minY + 16) / GH * MAP_Z * Math.sin(renderer.elevation) + 7;
    renderer.zoom = clamp(Math.min(baseH * 2 * aspect / ww, baseH * 2 / hh), 1, 4);
    renderer.dirtyShadow = true;
    renderer.request();
    renderContinentalPolitics();
}
function renderContinentalPolitics() {
    if (!sim || !world || !$('continentalReport'))
        return;
    const d = politicalDiagnostics(sim, world);
    window.__politicalDiagnostics = d;
    const populated = d.continents.filter(c => c.towns > 0);
    const focus = populated.find(c => c.id === focusedContinent);
    $('mapName').textContent = focus ? focus.name : 'Many Crowns, One World';
    if (focus && currentLayer === 'realms')
        $('mapStamp').textContent = focus.polities + ' SOVEREIGN POLITIES / YEAR ' + sim.year;
    $('continentalReport').innerHTML = `<div class="panelheading"><div><div class="overline">POLITICAL TOPOLOGY / YEAR ${sim.year}</div><h3>One continent. Several sovereign neighbors.</h3></div><div class="summary">${d.realms} living polities · ${populated.length} town-bearing continents<br>Click a continent to inspect its internal borders.</div></div><div class="continentcards">${populated.map(c => `<button class="continentcard" data-continent="${c.id}"><strong>${escapeHTML(c.name)}</strong><b>${c.polities}</b><span>polities</span><small>${c.towns} towns · ${c.internalFrontiers} neighboring state pairs<br>Largest share: ${(c.largestShare * 100).toFixed(1)}%</small></button>`).join('')}</div><p class="frontiernote">Shares use this continent's habitable district area, including unincorporated communities. Multiple states arise from local towns and travel costs, not by assigning a fixed quota to a landmass. Polar land without towns receives no artificial kingdom. New political history restarts at year 400 with the original towns and populations; save first to keep a later timeline.</p><div class="politicstools"><button id="wholePoliticalWorld">Whole world</button><button id="newCouncilHistory">New political history · same towns</button>${focus ? `<span class="continentmapnote">Exploring ${escapeHTML(focus.name)} · ${focus.polities} polities</span>` : ''}</div>${focus ? `<div class="localpolities">${focus.realmIds.map(id => { const c = sim.realms[id]; return `<button data-local-realm="${id}"><i style="background:${c.color}"></i>${escapeHTML(c.name)}</button>`; }).join('')}</div>` : ''}`;
    $('continentalReport').querySelectorAll('[data-continent]').forEach(b => b.onclick = () => focusContinent(+b.dataset.continent));
    $('continentalReport').querySelectorAll('[data-local-realm]').forEach(b => b.onclick = () => selectRealm(+b.dataset.localRealm));
    $('wholePoliticalWorld').onclick = () => { focusedContinent = null; renderer.reset(); renderContinentalPolitics(); legend(); };
    $('newCouncilHistory').onclick = rerollPolitics;
}
function rerollPolitics() {
    if (!world || busy)
        return;
    pause();
    const before = physicalFingerprint(world), towns = sim.settlementSignature;
    const next = createCivilization(world, HighCitadels.historyOptions(sim, {politySeed: (sim.options.politySeed || 'First-councils') + '*'}));
    if (physicalFingerprint(world) !== before || next.settlementSignature !== towns)
        throw Error('Political reroll altered terrain or initial towns.');
    sim = next;
    window.sim = sim;
    selectedRealm = sim.realms[0]?.id ?? 0;
    selectedCell = sim.provinces[sim.realms[0]?.capital ?? 0]?.i ?? 0;
    diplomacyTarget = -1;
    refreshAll();
    setLayer('realms');
    toast('New founding history at year 400. Terrain, initial towns, populations and cultures unchanged.');
}
function saveBlob(blob, name) { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 12000); }
const slug = () => world.params.seed.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 50) || 'world';
function makeSave() { return { format: 'telluric-civilization', version: 7, engine: '9.0.0', parameters: world.params, options: sim.options, simulation: sim, note: 'Rebuilds deterministic geography with the bundled engine; city projects, town-assembly recipes and optional landmark recipes are included. All quantities are qualitative model units.' }; }
function saveSimulation() { if (!sim || busy)
    return; pause(); saveBlob(new Blob([JSON.stringify(makeSave())], { type: 'application/json' }), `telluric-${slug()}-year-${sim.year}.json`); $('exportMenu').classList.add('hidden'); toast('Simulation saved, including population mixtures, treaties, wars and history.'); }
async function loadSimulation(file) { if (!file || busy)
    return; try {
    if (file.size > 20 * 1024 * 1024)
        throw Error('This save is larger than the 20 MB safety limit.');
    const payload = JSON.parse(await file.text());
    if (payload.format !== 'telluric-civilization' || !([6, 7].includes(payload.version)) || !(['6.0.0', '7.0.0', '8.0.0', '9.0.0'].includes(payload.engine)) || !payload.parameters || typeof payload.parameters.seed !== 'string' || !payload.simulation)
        throw Error('Choose a Telluric VI–IX simulation save, not a map image or an older terrain export.');
    const p = payload.parameters;
    if (!Number.isFinite(p.plates) || p.plates < 10 || p.plates > 30 || !Number.isFinite(p.continents) || p.continents < 4 || p.continents > 8)
        throw Error('Invalid geography settings in save.');
    await buildWorld(p, payload.options, payload.simulation);
    if (!window.__error)
        toast(`Restored year ${sim.year}.`);
}
catch (e) {
    toast('Load failed: ' + e.message);
}
finally {
    $('importFile').value = '';
} }
async function savePNG() {
    if (!world || busy)
        return;
    pause();
    await document.fonts?.ready;
    positionLabels();
    const canvas = renderer.canvas, ow = canvas.width, oh = canvas.height, scale = 2048 / Math.max(1, ow);
    canvas.width = Math.round(ow * scale);
    canvas.height = Math.round(oh * scale);
    renderer.render();
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height + 106;
    const ctx = out.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    const sx = canvas.width / renderer.width, sy = canvas.height / renderer.height;
    if ($('names').checked)
        for (const { element: e, feature: f } of labelItems) {
            if (e.style.opacity === '0')
                continue;
            const text = e.querySelector('em'), rect = text.getBoundingClientRect(), mapRect = canvas.getBoundingClientRect();
            const x = rect.left + rect.width/2 - mapRect.left, y = rect.top + rect.height/2 - mapRect.top;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const lettering = getComputedStyle(text);
            ctx.font = `${lettering.fontStyle} ${lettering.fontWeight} ${parseFloat(lettering.fontSize) * sx}px ${lettering.fontFamily}`;
            if ('letterSpacing' in ctx) ctx.letterSpacing = `${(parseFloat(lettering.letterSpacing) || 0) * sx}px`;
            ctx.strokeStyle = f.legend ? '#fff8e2' : '#efe9ce';
            ctx.lineWidth = 2.4 * sx;
            ctx.fillStyle = lettering.color;
            ctx.strokeText(f.name, x * sx, y * sy);
            ctx.fillText(f.name, x * sx, y * sy);
        }
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f4f5eb';
    ctx.fillRect(0, canvas.height, out.width, 106);
    ctx.fillStyle = '#304e3c';
    ctx.font = '27px Georgia';
    ctx.fillText('TELLURIC — Continuous Atlas', 27, canvas.height + 39);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#74876a';
    ctx.fillText(`YEAR ${sim.year} AC · ${layerTitles[currentLayer]} · ${sim.realms.filter(c => c.alive).length} realms · ${PEOPLES.length} peoples · ${FAITHS.length} faiths · Seed: ${world.params.seed}`, 27, canvas.height + 64);
    ctx.font = '10px sans-serif';
    ctx.fillText('Actual procedural simulation output. Relief and symbols are exaggerated. Geography and civilization rules are uncalibrated.', 27, canvas.height + 85);
    canvas.width = ow;
    canvas.height = oh;
    renderer.render();
    out.toBlob(b => { if (b)
        saveBlob(b, `telluric-${slug()}-${currentLayer}-${sim.year}.png`); }, 'image/png');
    $('exportMenu').classList.add('hidden');
}
function saveChronicle() {
    if (!sim)
        return;
    const lines = [`# The Manyfold World — Year ${sim.year} AC`, '', 'A reproducible, uncalibrated fantasy simulation. Names and institutions are generated after settlements; no named polity list is required.', `Seed: ${world.params.seed}`, `Geography: ${world.stats.continents} continents; ${world.stats.islands} islands; ${world.hydrologyStats.lakes} inland lakes; ${world.hydrologyStats.fjords} fjords.`, '', '## Realms'];
    for (const c of sim.realms.filter(c => c.alive).sort((a, b) => b.strength - a.strength)) {
        lines.push('', `### ${c.title}`, ...(RealmNames.describe(c) ? ['Name origin: ' + RealmNames.describe(c)] : []), c.identity, `Government: ${GOVERNMENTS[c.gov]}. Capital: ${sim.provinces[c.capital].name}.`, `Population ${fmtPop(c.population)}; army ${c.army.toFixed(1)} thousand; revenue ${c.income.toFixed(1)} model units; treasury ${c.treasury.toFixed(1)}; power index ${c.strength.toFixed(1)}.`, `State tradition: ${FAITHS[c.faith].name}.`, 'Peoples: ' + PEOPLES.map((p, k) => p.name + ' ' + (c.people[k] * 100).toFixed(1) + '%').join('; ') + '.', 'Local faiths: ' + FAITHS.map((f, k) => f.name + ' ' + (c.faithMix[k] * 100).toFixed(1) + '%').join('; ') + '.');
    }
    lines.push('', '## Treaties and conflict');
    for (const r of Object.values(sim.relations))
        if (r.alliance)
            lines.push(`${sim.realms[r.a].name} ↔ ${sim.realms[r.b].name}: defensive pact.`);
    for (const war of sim.wars)
        if (!war.ended)
            lines.push(`${sim.realms[war.a].name} vs ${sim.realms[war.b].name}: war since ${war.start}, over ${war.reason}.`);
    lines.push('', '## Recorded events');
    for (const e of sim.events)
        lines.push(`**${e.year} · ${e.type}** — ${e.text}`);
    saveBlob(new Blob([lines.join('\n\n')], { type: 'text/markdown' }), `telluric-${slug()}-chronicle-${sim.year}.md`);
    $('exportMenu').classList.add('hidden');
}
function bindCamera() {
    if(window.ContinuousMap)return;
    const c = $('map');
    let drag = null;
    const pointers = new Map();
    let pinch = null;
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('pointerdown', e => { if (busy)
        return; c.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pointers.size === 2) {
        const a = [...pointers.values()];
        pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), zoom: renderer.zoom };
        if (drag)
            drag.moved = 99;
        return;
    } drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: 0, rotate: e.shiftKey || e.button === 2 }; });
    c.addEventListener('pointermove', e => { if (pointers.has(e.pointerId))
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pointers.size === 2 && pinch) {
        const a = [...pointers.values()];
        renderer.zoom = clamp(pinch.zoom * Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) / Math.max(1, pinch.d), .6, 6);
        renderer.request();
        return;
    } if (!drag)
        return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy)); if (drag.rotate) {
        renderer.azimuth -= dx * .006;
        renderer.elevation = clamp(renderer.elevation + dy * .006, .4, 1.555);
        renderer.request();
    }
    else
        renderer.pan(dx, dy); drag.x = e.clientX; drag.y = e.clientY; });
    c.addEventListener('pointerup', e => { pointers.delete(e.pointerId); if (drag && drag.moved < 4 && !pinch) {
        const r = c.getBoundingClientRect(), i = renderer.pick(e.clientX - r.left, e.clientY - r.top);
        if (i >= 0)
            inspectCell(i);
    } if (!pointers.size) {
        drag = null;
        pinch = null;
    } });
    c.addEventListener('pointercancel', () => { pointers.clear(); drag = null; pinch = null; });
    c.addEventListener('wheel', e => { e.preventDefault(); if (busy)
        return; renderer.zoom = clamp(renderer.zoom * Math.exp(-e.deltaY * .0012), .6, 6); renderer.request(); }, { passive: false });
    $('zoomIn').onclick = () => { renderer.zoom = clamp(renderer.zoom * 1.25, .6, 6); renderer.request(); };
    $('zoomOut').onclick = () => { renderer.zoom = clamp(renderer.zoom / 1.25, .6, 6); renderer.request(); };
    $('resetView').onclick = () => { focusedContinent = null; renderer.reset(); $('camera').value = 'relief'; renderContinentalPolitics(); legend(); };
    $('camera').onchange = () => { renderer.elevation = { relief: 1.19, overhead: 1.555, diorama: .65 }[$('camera').value]; renderer.request(); };
    $('fullscreen').onclick = async () => { try {
        if (document.fullscreenElement)
            await document.exitFullscreen();
        else
            await $('stage').requestFullscreen();
    }
    catch (e) {
        toast('Fullscreen is not supported here.');
    } };
}
const FORGE = { realmInput: 'int', conflictInput: 'factor', continentInput: 'int', islandInput: 'factor', volcanoInput: 'factor', temperatureInput: 'temp', aridityInput: 'factor', plateInput: 'int' };
function forgeOutputs() { for (const [id, type] of Object.entries(FORGE)) {
    const v = +$(id).value;
    $(id + 'Out').textContent = type === 'int' ? v : type === 'temp' ? (v > 0 ? '+' : '') + v + ' °C' : v.toFixed(2) + '×';
} }
function readForge() { return { params: { ...GEN_DEFAULTS, seed: $('seed').value.trim() || 'Aereth-47', plates: +$('plateInput').value, continents: +$('continentInput').value, islands: +$('islandInput').value, volcanism: +$('volcanoInput').value, temperature: +$('temperatureInput').value, aridity: +$('aridityInput').value }, options: { realms: +$('realmInput').value, conflict: +$('conflictInput').value, historySeed: $('historySeed').value.trim() || 'First-dawn' } }; }
function makeGLB() {
    const meshEntries = Object.entries(renderer.meshes).filter(([name, m]) => m.count > 0 && (['terrain', 'trees', 'volcanoes', 'dunes', 'rivers', 'iceflow', 'icefloes', 'settlements', 'frontiers', 'reeds'].includes(name)||name.startsWith('cm:')) && renderer.visible(name));
    const gltf = { asset: { version: '2.0', generator: 'Telluric 5.0 / geography-first atlas', extras: { note: 'Cartographic model coordinates, not physical meters. Relief and symbols exaggerated.' } }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [{ name: 'Matte vertex colors', doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 } }], buffers: [{ byteLength: 0 }], bufferViews: [], accessors: [] };
    let offset = 0;
    const chunks = [];
    for (const [name, m] of meshEntries) {
        const count = name === 'terrain' ? m.count - 24 : m.count, data = new Float32Array(m.vertices.subarray(0, count * 9));
        let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (let k = 0; k < data.length; k += 9)
            for (let j = 0; j < 3; j++) {
                min[j] = Math.min(min[j], data[k + j]);
                max[j] = Math.max(max[j], data[k + j]);
                data[k + 6 + j] = Math.pow(data[k + 6 + j], 2.2);
            }
        const view = gltf.bufferViews.length;
        gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.byteLength, byteStride: 36, target: 34962 });
        offset += data.byteLength;
        chunks.push(new Uint8Array(data.buffer));
        const access = gltf.accessors.length;
        gltf.accessors.push({ bufferView: view, byteOffset: 0, componentType: 5126, count, type: 'VEC3', min, max }, { bufferView: view, byteOffset: 12, componentType: 5126, count, type: 'VEC3' }, { bufferView: view, byteOffset: 24, componentType: 5126, count, type: 'VEC3' });
        const id = gltf.meshes.length;
        gltf.meshes.push({ name, primitives: [{ attributes: { POSITION: access, NORMAL: access + 1, COLOR_0: access + 2 }, material: 0, mode: 4 }] });
        gltf.nodes.push({ name, mesh: id });
        gltf.scenes[0].nodes.push(id);
    }
    gltf.buffers[0].byteLength = offset;
    let json = new TextEncoder().encode(JSON.stringify(gltf)), jlen = Math.ceil(json.length / 4) * 4, blen = offset, total = 12 + 8 + jlen + 8 + blen, buffer = new ArrayBuffer(total), dv = new DataView(buffer), bytes = new Uint8Array(buffer);
    dv.setUint32(0, 0x46546C67, true);
    dv.setUint32(4, 2, true);
    dv.setUint32(8, total, true);
    dv.setUint32(12, jlen, true);
    dv.setUint32(16, 0x4E4F534A, true);
    bytes.fill(32, 20, 20 + jlen);
    bytes.set(json, 20);
    dv.setUint32(20 + jlen, blen, true);
    dv.setUint32(24 + jlen, 0x004E4942, true);
    let pos = 28 + jlen;
    for (const c of chunks) {
        bytes.set(c, pos);
        pos += c.length;
    }
    return buffer;
}
function boot() {
    try {
        renderer = new AtlasRenderer($('map'), positionLabels);
        renderer.layer = currentLayer;
        window.renderer = renderer;
    }
    catch (e) {
        window.__error = e.message;
        $('loadingTitle').textContent = 'A graphics-capable browser is needed.';
        $('loadingText').textContent = e.message;
        return;
    }
    bindCamera();
    $('play').onclick = togglePlay;
    $('step1').onclick = () => advance(1);
    $('step10').onclick = () => advance(10);
    $('step50').onclick = () => advance(50);
    $('resetAge').onclick = resetHistory;
    $('rerollSocieties').onclick = rerollSocieties;
    $('rerollPolitics').onclick = rerollPolitics;
    document.querySelectorAll('[data-layer]').forEach(b => b.onclick = () => setLayer(b.dataset.layer));
    $('moreLayer').onchange = () => { if ($('moreLayer').value)
        setLayer($('moreLayer').value); };
    for (const id of ['frontiers', 'settlements', 'trees', 'rivers', 'roads', 'folk'])
        $(id).onchange = () => { renderer.options[id] = $(id).checked; renderer.dirtyShadow = true; renderer.request(); };
    if ($('legends'))
        $('legends').onchange = () => { renderer.options.legends = $('legends').checked; renderer.dirtyShadow = true; makeLabels(); renderer.request(); };
    $('names').onchange = positionLabels;
    $('sortRealms').onchange = renderRealmList;
    $('realmSearch').oninput = () => { if (sim)
        renderRealmList(); };
    $('eventFilter').onchange = renderChronicle;
    $('forgeButton').onclick = () => { pause(); $('forge').showModal(); };
    $('closeForge').onclick = () => $('forge').close();
    for (const id of Object.keys(FORGE))
        $(id).oninput = forgeOutputs;
    forgeOutputs();
    $('generate').onclick = () => { const f = readForge(); $('forge').close(); buildWorld(f.params, f.options); };
    $('notesButton').onclick = () => { pause(); $('notes').showModal(); };
    $('closeNotes').onclick = () => $('notes').close();
    $('exportToggle').onclick = () => $('exportMenu').classList.toggle('hidden');
    document.addEventListener('click', e => { if (!e.target.closest('.exportwrap'))
        $('exportMenu').classList.add('hidden'); });
    $('saveGame').onclick = saveSimulation;
    $('savePNG').onclick = savePNG;
    $('saveLore').onclick = saveChronicle;
    $('saveGLB').onclick = () => { if (!world || busy)
        return; saveBlob(new Blob([makeGLB()], { type: 'model/gltf-binary' }), `telluric-${slug()}-year-${sim.year}.glb`); $('exportMenu').classList.add('hidden'); toast('3D geometry exported. Lighting is not baked in.'); };
    $('loadGame').onclick = () => { pause(); $('importFile').click(); $('exportMenu').classList.add('hidden'); };
    $('importFile').onchange = () => loadSimulation($('importFile').files[0]);
    $('mobileToggle').onclick = () => $('realmnav').classList.toggle('open');
    document.addEventListener('keydown', e => { if (window.OneMap || document.getElementById('cityDialog')?.open || e.target.matches('input,select,textarea,button') || $('forge').open || $('notes').open)
        return; if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
    } if (e.key === 'Escape') {
        focusedContinent = null;
        renderer.reset();
        renderContinentalPolitics();
        legend();
        legend();
    } if (e.key === '+')
        $('zoomIn').click(); if (e.key === '-')
        $('zoomOut').click(); });
    $('map').addEventListener('webglcontextlost', e => { e.preventDefault(); pause(); toast('Graphics context lost. Save if possible, then reload this file.'); window.__error = 'WebGL context lost'; });
    window.Telluric = { politicalDiagnostics, politicalFingerprint, rerollPolitics, focusContinent, initializeSettlements, formPolities, deriveHumanGeography, physicalFingerprint, settlementFingerprint, settlementDistribution, rerollSocieties, advance, stepCivilization, createCivilization, buildWorld, makeSave, validateSimulation, setLayer, inspectCell, selectRealm, audit: () => auditCivilization(sim, world), action: civilizationAction, savePNG, saveChronicle, pause, makeGLB };
    buildWorld();
}
