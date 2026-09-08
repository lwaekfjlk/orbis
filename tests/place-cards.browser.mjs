// ORBIS: actual offline place cards, live simulation data and mobile actions.
// Run after npm run build. Supports PLAYWRIGHT_MODULE, CHROMIUM_PATH and ORBIS_CARDS_OUTPUT.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const out = process.env.ORBIS_CARDS_OUTPUT || join(tmpdir(), 'orbis-place-cards-browser');
await mkdir(out, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'orbis-place-cards-chrome-'));
const child = spawn(process.env.CHROMIUM_PATH || chromium.executablePath(), [
    '--headless', '--no-first-run', '--no-default-browser-check', '--no-sandbox',
    '--remote-debugging-port=0', '--user-data-dir=' + profile,
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank',
], { stdio: 'ignore', detached: true });
child.unref();
let browser;
const report = { product: 'ORBIS', cities: [], realms: [], actions: [], layouts: [], screenshots: [], errors: [], consoleErrors: [], externalRequests: [] };
const close = (actual, expected, message, tolerance = 1e-10) => {
    assert(Number.isFinite(actual), message + ': nonfinite value');
    assert(Math.abs(actual - expected) <= Math.max(1, Math.abs(expected)) * tolerance,
        `${message}: ${actual} != ${expected}`);
};

try {
    console.log('ORBIS place cards: starting offline Chromium');
    let port;
    for (let attempt = 0; attempt < 150 && !port; attempt++) {
        try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; }
        catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert(port, 'Chromium did not start');
    browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
    const context = await browser.newContext({ viewport: { width: 1480, height: 980 }, reducedMotion: 'reduce' });
    await context.setOffline(true);
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
    page.on('request', request => { if (/^https?:/.test(request.url())) report.externalRequests.push(request.url()); });
    const stable = () => page.waitForFunction(
        'window.__ready&&!busy&&!simAdvancing&&!renderer.pending&&!ContinuousMap.moving&&!ContinuousMap.layer.loading',
        null, { timeout: 180000 });
    console.log('ORBIS place cards: generating the bundled default world');
    await page.setContent(await readFile(join(root, 'dist/orbis-onemap.html'), 'utf8'), { waitUntil: 'load', timeout: 180000 });
    await stable();
    await page.evaluate(() => document.fonts.ready);
    assert.match(await page.title(), /^ORBIS\b/);
    assert.equal((await page.locator('#omHome').innerText()).trim(), 'ORBIS');
    console.log('ORBIS place cards: default world ready; checking census data');

    const fixture = await page.evaluate(() => {
        const realm = sim.realms[selectedRealm]?.alive ? sim.realms[selectedRealm] : sim.realms.find(c => c.alive);
        const towns = sim.provinces.filter(p => p.settled && p.owner >= 0).sort((a, b) => b.urbanPop - a.urbanPop);
        const chosen = [sim.provinces[realm.capital]];
        for (const p of towns) if (!chosen.some(q => q.id === p.id || q.owner === p.owner) && chosen.length < 3) chosen.push(p);
        for (const p of towns) if (!chosen.some(q => q.id === p.id) && chosen.length < 3) chosen.push(p);
        const donor = towns.find(p => p.owner !== realm.id && p.id !== sim.realms[p.owner].capital && sim.realms[p.owner].provinces.length > 1);
        return { realmId: realm.id, townIds: chosen.map(p => p.id), donorId: donor?.id,
            otherRealmId: sim.realms.find(c => c.alive && c.id !== realm.id)?.id,
            seed: world.params.seed, year: sim.year, landformVersion: world.params.landformVersion };
    });
    assert.equal(new Set(fixture.townIds).size, 3, 'exercise three distinct actual towns');
    assert(Number.isInteger(fixture.donorId), 'the ownership refresh needs a noncapital foreign town');
    report.fixture = fixture;

    // Compute expectations directly from district records; do not call the UI
    // statistics helper or use potentially stale aggregate fields on a realm.
    const expected = (kind, id) => page.evaluate(({ kind, id }) => {
        const positive = n => Number.isFinite(n) && n > 0 ? n : 0;
        const held = kind === 'city' ? [sim.provinces[id]] : sim.provinces.filter(p => p.owner === id);
        const mixtures = {};
        for (const [group, key, definitions] of [['peoples', 'people', PEOPLES], ['faiths', 'faith', FAITHS]]) {
            const totals = definitions.map(() => 0); let known = 0;
            for (const p of held) {
                const shares = definitions.map((_, i) => positive(p[key]?.[i]));
                const sum = shares.reduce((a, b) => a + b, 0), population = positive(p.pop);
                if (!sum || !population) continue;
                known += population;
                shares.forEach((share, i) => { totals[i] += population * share / sum; });
            }
            mixtures[group] = totals.map((n, i) => ({ id: i, name: definitions[i].name, share: known ? n / known : 0 }));
        }
        const p = held[0];
        return { id, kind, name: kind === 'city' ? p.name : RealmNames.fullName(sim.realms[id]), mixtures,
            values: kind === 'city' ? { townPopulation: p.urbanPop, districtPopulation: p.pop } : {
                population: held.reduce((sum, p) => sum + positive(p.pop), 0),
                towns: held.filter(p => p.settled || p.city).length, districts: held.length,
            } };
    }, { kind, id });

    async function verifyVitals(selector, kind, id) {
        const wanted = await expected(kind, id), host = page.locator(selector);
        await host.waitFor({ state: 'visible' });
        assert.equal(await host.count(), 1, 'one visual summary per card');
        const actual = await host.evaluate(element => ({
            text: element.innerText,
            values: Object.fromEntries([...element.querySelectorAll('[data-vital]')].map(n => [n.dataset.vital, {
                value: Number(n.dataset.value), text: n.innerText.trim(),
            }])),
            mixtures: Object.fromEntries([...element.querySelectorAll('[data-mix]')].map(n => [n.dataset.mix, {
                text: n.innerText,
                segments: [...n.querySelectorAll('.vital-segment[data-id]')].map(s => ({
                    id: Number(s.dataset.id), width: parseFloat(s.style.width), percentage: s.style.width.endsWith('%'),
                    height: s.getBoundingClientRect().height,
                })),
            }])),
        }));
        for (const [key, value] of Object.entries(wanted.values)) {
            assert(actual.values[key], `${kind} is missing ${key}`);
            close(actual.values[key].value, value, `${kind} ${id} exact ${key}`);
            assert(actual.values[key].text.length > 0, 'the number must also be visible, not only stored in data attributes');
        }
        if (kind === 'city') assert.match(actual.text, /district/i, 'city composition must identify its district population scope');
        for (const [group, values] of Object.entries(wanted.mixtures)) {
            const observed = actual.mixtures[group]; assert(observed, `${kind} needs a visible ${group} composition`);
            const nonzero = values.filter(v => v.share > 0);
            assert.deepEqual(observed.segments.map(s => s.id).sort((a, b) => a - b), nonzero.map(v => v.id),
                'all recorded groups remain represented in the bar');
            for (const segment of observed.segments) {
                assert(segment.percentage && segment.height > 0, 'composition uses a rendered percentage-width segment');
                assert(Math.abs(segment.width - values[segment.id].share * 100) <= .11,
                    `${kind} ${id} ${group}/${segment.id} width disagrees with current residents`);
            }
            close(observed.segments.reduce((sum, s) => sum + s.width, 0), 100, 'composition bar totals 100%', .003);
            for (const entry of [...nonzero].sort((a, b) => b.share - a.share).slice(0, 2)) {
                const escaped = entry.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const label = observed.text.match(new RegExp(escaped + '\\s*(?:[·:]\\s*)?(\\d+(?:\\.\\d+)?)\\s*%', 'i'));
                assert(label, `${entry.name} needs a visible legend label and percentage`);
                assert(Math.abs(Number(label[1]) - entry.share * 100) <= .51, `${entry.name} legend percentage is stale`);
            }
        }
        return wanted;
    }
    const citySelector = '#omSelectionBody .place-vitals[data-kind="city"]';
    const detailSelector = '#inspector .place-vitals[data-kind="city"]';
    const realmSelector = '.realm-overview .place-vitals[data-kind="realm"]';
    async function inspectTown(id) {
        await page.evaluate(id => inspectCell(sim.provinces[id].i), id);
        await page.locator(citySelector).waitFor({ state: 'visible' });
        assert.equal((await page.locator('#omSelectionBody h3').innerText()).trim(), (await expected('city', id)).name);
        assert.deepEqual(await page.locator('#omSelectionBody .om-actions button').allTextContents(), ['Zoom', 'Story', 'Details']);
    }
    const button = name => page.locator('#omSelectionBody').getByRole('button', { name, exact: true });
    async function home() { await page.locator('#omHome').click(); await stable(); }
    async function townFocused(id) {
        await page.waitForFunction(id => window.__continuousFocus === id && ContinuousMap.layer.focusId === id && ContinuousMap.layer.models.has(id), id, { timeout: 180000 });
        await stable();
    }
    async function story(id) {
        await button('Story').click(); await townFocused(id);
        await page.locator('#inspector .cm-saga').waitFor({ state: 'visible', timeout: 180000 });
        assert.equal(await page.evaluate(() => OneMap.panel), 'detail');
        assert.equal((await page.locator('#omDrawerTitle').innerText()).trim(), (await expected('city', id)).name);
        await verifyVitals(detailSelector, 'city', id);
        await page.waitForFunction(() => {
            const story = document.querySelector('#inspector .cm-saga'), body = document.querySelector('#omDrawer .om-drawer-body');
            if (!story || !body) return false;
            const a = story.getBoundingClientRect(), b = body.getBoundingClientRect();
            return a.top >= b.top - 1 && a.top < b.bottom;
        }, null, { timeout: 15000 });
    }
    const camera = () => page.evaluate(() => ({ target: renderer.target.slice(), zoom: renderer.zoom,
        azimuth: renderer.azimuth, elevation: renderer.elevation }));
    async function details(id) {
        await stable(); const before = await camera();
        await button('Details').click();
        await page.locator('#inspector .city-overview').waitFor({ state: 'visible' });
        assert.equal(await page.evaluate(() => OneMap.panel), 'detail');
        await verifyVitals('#inspector .city-overview .place-vitals[data-kind="city"]', 'city', id);
        assert.deepEqual(await camera(), before, 'Details opens the city overview without moving the map camera');
    }
    async function screenshot(kind, size) {
        const scroll = kind === 'city' ? '#omSelectionBody' : '#omDrawer .om-drawer-body';
        await page.locator(scroll).evaluate(element => { element.scrollTop = 0; });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const file = `${kind}-${size}.png`;
        await page.screenshot({ path: join(out, file) });
        report.screenshots.push({ kind, viewport: page.viewportSize(), file });
    }

    for (const id of fixture.townIds) {
        await inspectTown(id); report.cities.push(await verifyVitals(citySelector, 'city', id));
        console.log(`ORBIS place cards: city ${id} population and both composition bars match the simulation`);
    }
    await inspectTown(fixture.townIds[0]); await screenshot('city', 'desktop');
    await page.evaluate(id => selectRealm(id), fixture.realmId);
    const originalRealm = await verifyVitals(realmSelector, 'realm', fixture.realmId);
    report.realms.push(originalRealm);
    await screenshot('country', 'desktop');
    console.log('ORBIS place cards: desktop screenshots captured; testing live country ownership refresh');
    const previous = await page.evaluate(({ donorId, realmId }) => {
        const p = sim.provinces[donorId], saved = { owner: p.owner, pop: p.pop, ruralPop: p.ruralPop };
        p.owner = realmId; p.pop += 1234.5; p.ruralPop = p.pop - p.urbanPop;
        refreshAll(); return saved;
    }, fixture);
    try {
        await stable();
        const refreshed = await verifyVitals(realmSelector, 'realm', fixture.realmId);
        assert(refreshed.values.population > originalRealm.values.population);
        assert.equal(refreshed.values.districts, originalRealm.values.districts + 1);
        assert.equal(refreshed.values.towns, originalRealm.values.towns + 1);
        report.ownerRefresh = { before: originalRealm.values, after: refreshed.values };
    } finally {
        await page.evaluate(({ id, previous }) => { Object.assign(sim.provinces[id], previous); refreshAll(); }, { id: fixture.donorId, previous });
        await stable();
    }
    assert.deepEqual(await verifyVitals(realmSelector, 'realm', fixture.realmId), originalRealm, 'restoring state restores the card exactly');
    console.log('ORBIS place cards: country population, districts and mixes refresh and restore correctly');
    await page.evaluate(id => selectRealm(id), fixture.otherRealmId);
    report.realms.push(await verifyVitals(realmSelector, 'realm', fixture.otherRealmId));
    await inspectTown(fixture.townIds[1]);
    assert(await page.locator('#omDrawer').evaluate(n => n.classList.contains('hidden')), 'switching to a town closes the previous realm dossier');

    console.log('ORBIS place cards: testing desktop Zoom, Story and Details');
    await home(); await inspectTown(fixture.townIds[0]);
    const overviewZoom = await page.evaluate(() => renderer.zoom);
    await button('Zoom').click(); await townFocused(fixture.townIds[0]);
    assert((await page.evaluate(() => renderer.zoom)) > overviewZoom);
    assert.equal(await page.evaluate(() => OneMap.panel), null, 'Zoom preserves the direct map focus behavior');
    report.actions.push('desktop Zoom focuses the selected real town');
    await home(); await inspectTown(fixture.townIds[0]); await story(fixture.townIds[0]);
    report.actions.push('desktop Story opens that town’s saga and visual summary');
    const storyTown = fixture.townIds[0], beforeStoryRefresh = await expected('city', storyTown);
    const savedStoryPopulation = await page.evaluate(id => {
        const p = sim.provinces[id], saved = { pop: p.pop, urbanPop: p.urbanPop, ruralPop: p.ruralPop };
        p.pop += 777.25; p.urbanPop += 111.5; p.ruralPop = p.pop - p.urbanPop;
        refreshAll(); return saved;
    }, storyTown);
    try {
        await stable();
        await page.locator('#inspector .cm-saga').waitFor({ state: 'visible' });
        assert.equal(await page.evaluate(() => OneMap.panel), 'detail');
        assert.equal((await page.locator('#omDrawerTitle').innerText()).trim(), beforeStoryRefresh.name);
        const refreshed = await verifyVitals(detailSelector, 'city', storyTown);
        close(refreshed.values.townPopulation, beforeStoryRefresh.values.townPopulation + 111.5, 'Story town growth');
        close(refreshed.values.districtPopulation, beforeStoryRefresh.values.districtPopulation + 777.25, 'Story district growth');
        report.storyRefresh = { before: beforeStoryRefresh.values, after: refreshed.values };
    } finally {
        await page.evaluate(({ id, saved }) => { Object.assign(sim.provinces[id], saved); refreshAll(); },
            { id: storyTown, saved: savedStoryPopulation });
        await stable();
    }
    assert.deepEqual(await verifyVitals(detailSelector, 'city', storyTown), beforeStoryRefresh);
    assert(await page.locator('#inspector .cm-saga').isVisible(), 'refresh must retain the Story detail identity');
    console.log('ORBIS place cards: open Story keeps its town and refreshes both census values');
    // Keep this operation synchronous: the missing-model state must not reach
    // the event loop and launch a real background streaming rebuild.
    const streamed = await page.evaluate(id => {
        const layer = ContinuousMap.layer, model = layer.models.get(id);
        if (!model) throw Error('The open Story needs its current streamed model');
        const snapshot = () => ({
            cityOverview: !!document.querySelector('#inspector .city-overview'),
            cityVitals: !!document.querySelector('#inspector .place-vitals[data-kind="city"]'),
            saga: !!document.querySelector('#inspector .cm-saga'),
            title: document.getElementById('omDrawerTitle').textContent.trim(),
            panel: OneMap.panel, context: OneMap.detailContext ? { ...OneMap.detailContext } : null,
            values: Object.fromEntries([...document.querySelectorAll('#inspector [data-vital]')]
                .map(n => [n.dataset.vital, Number(n.dataset.value)])),
        });
        let missing;
        try {
            layer.models.delete(id); refreshAll(); missing = snapshot();
        } finally {
            layer.models.set(id, model); layer.onChange();
        }
        return { missing, restored: snapshot() };
    }, storyTown);
    assert(streamed.missing.cityOverview && streamed.missing.cityVitals && !streamed.missing.saga,
        'an evicted Story model falls back to its own city overview');
    for (const state of [streamed.missing, streamed.restored]) {
        assert.equal(state.panel, 'detail');
        assert.equal(state.context?.kind, 'town'); assert.equal(state.context?.id, storyTown);
        assert.equal(state.title, beforeStoryRefresh.name);
        for (const [key, value] of Object.entries(beforeStoryRefresh.values)) close(state.values[key], value, `streaming ${key}`);
    }
    assert(streamed.restored.saga && !streamed.restored.cityOverview, 'the returning model restores the Story immediately');
    await verifyVitals(detailSelector, 'city', storyTown);
    report.storyStreaming = streamed;
    console.log('ORBIS place cards: temporary model eviction preserves city facts and restores the same Story');

    const layerBeforeGovernment = await page.evaluate(() => currentLayer);
    await page.evaluate(id => selectRealm(id), fixture.realmId);
    await page.getByRole('button', { name: 'Government & diplomacy', exact: true }).click();
    await page.evaluate(() => refreshAll()); await stable();
    assert.equal(await page.evaluate(() => OneMap.panel), 'detail');
    assert.equal(await page.evaluate(() => OneMap.detailContext), null, 'government details clear the former town detail identity');
    assert.equal(await page.locator('#inspector .place-vitals[data-kind="city"]').count(), 0);
    assert.equal(await page.locator('#inspector .cm-saga').count(), 0);
    assert.equal((await page.locator('#inspector h2').innerText()).trim(), originalRealm.name);
    assert(await page.locator('#inspector .government').isVisible());
    assert.equal(await page.locator('#inspector #stateFaith').count(), 1, 'the country government controls survive refresh');
    report.actions.push('Government & diplomacy clears town context and retains the country dossier after refresh');
    console.log('ORBIS place cards: Government & diplomacy survives refresh without stale city content');
    await page.evaluate(layer => setLayer(layer), layerBeforeGovernment);
    await page.locator('#omDrawerClose').click(); await home();
    await inspectTown(fixture.townIds[2]); await details(fixture.townIds[2]);
    report.actions.push('desktop Details retains the selected town');

    async function verifyLayout(selector, viewport) {
        const result = await page.locator(selector).evaluate(element => {
            const rect = element.getBoundingClientRect();
            const nodes = [element, ...element.querySelectorAll('*')];
            const scrollers = nodes.filter(n => n.clientHeight > 0 && n.scrollHeight > n.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(n).overflowY));
            const scrolls = scrollers.map(n => { const previous = n.scrollTop; n.scrollTop = n.scrollHeight; const moved = n.scrollTop > 0; n.scrollTop = previous; return moved; });
            return { viewport: [innerWidth, innerHeight], rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
                documentWidth: document.documentElement.scrollWidth, clientWidth: element.clientWidth, contentWidth: element.scrollWidth,
                contentHeight: element.scrollHeight, clientHeight: element.clientHeight, scrolls };
        });
        assert(result.documentWidth <= viewport.width + 1, 'the page must not scroll sideways');
        assert(result.rect.left >= -1 && result.rect.right <= viewport.width + 1, 'the card fits the viewport width');
        assert(result.rect.top >= -1 && result.rect.bottom <= viewport.height + 1, 'the card fits the viewport height');
        assert(result.contentWidth <= result.clientWidth + 1, 'card text and charts must not overflow horizontally');
        if (result.contentHeight > result.clientHeight + 1) assert(result.scrolls.some(Boolean), 'overflowing card content remains scrollable');
        assert(result.scrolls.every(Boolean), 'each overflowing scroll region can actually scroll');
        report.layouts.push({ selector, ...result });
    }
    for (const viewport of [{ width: 430, height: 900 }, { width: 360, height: 800 }]) {
        console.log(`ORBIS place cards: ${viewport.width}×${viewport.height} layout, scrolling and actual buttons`);
        await home(); await page.setViewportSize(viewport); await stable();
        await inspectTown(fixture.townIds[0]); await verifyVitals(citySelector, 'city', fixture.townIds[0]);
        await verifyLayout('#omSelection', viewport);
        await screenshot('city', viewport.width);
        for (const name of ['Zoom', 'Story', 'Details']) {
            await button(name).scrollIntoViewIfNeeded(); assert(await button(name).isVisible());
            await button(name).click({ trial: true });
        }
        await story(fixture.townIds[0]);
        await verifyLayout('#omDrawer', viewport);
        await page.locator('#omDrawerClose').click(); await home();
        await inspectTown(fixture.townIds[1]); await button('Zoom').click(); await townFocused(fixture.townIds[1]);
        await home(); await inspectTown(fixture.townIds[2]); await details(fixture.townIds[2]);
        await page.locator('#omDrawerClose').click(); await home();
        await page.evaluate(id => selectRealm(id), fixture.realmId);
        await verifyVitals(realmSelector, 'realm', fixture.realmId); await verifyLayout('#omDrawer', viewport);
        await screenshot('country', viewport.width);
        await page.locator('#omDrawerClose').click();
        report.actions.push(`${viewport.width}×${viewport.height}: Zoom, Story and Details remain visible and clickable`);
        console.log(`ORBIS place cards: ${viewport.width}×${viewport.height} passed; city and country screenshots captured`);
    }
    assert.deepEqual(report.errors, [], 'no uncaught browser errors');
    assert.deepEqual(report.consoleErrors, [], 'no console errors');
    assert.deepEqual(report.externalRequests, [], 'the bundled ORBIS map works without external requests');
    report.offline = true;
    await writeFile(join(out, 'checks.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('PASS ORBIS place cards: exact populations, all composition segments, live ownership refresh, selection, Zoom/Story/Details and two mobile viewports');
    console.log('Report: ' + join(out, 'checks.json'));
} catch (error) {
    report.failure = String(error?.stack || error);
    await writeFile(join(out, 'checks.json'), JSON.stringify(report, null, 2) + '\n');
    throw error;
} finally {
    if (browser) await browser.close();
    try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
