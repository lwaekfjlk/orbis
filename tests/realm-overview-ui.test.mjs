import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/ui/onemap-ui.js', import.meta.url), 'utf8');

// Run the public OneMap API, including its real selection, drawer and keyboard
// handlers. Only browser surfaces and the external realm renderer are replaced.
function harness() {
    const nodes = new Map(), listeners = new Map(), calls = { profiles: [], focus: [], pauses: 0, placeOrigins: [], realmOrigins: [] };
    const document = { body: { dataset: {} }, activeElement: null,
        getElementById: node, querySelectorAll: () => [],
        addEventListener(type, handler) { listeners.set(type, handler); } };
    function node(id) {
        if (!nodes.has(id)) {
            const classes = new Set(['hidden']);
            nodes.set(id, { id, innerHTML: '', textContent: '', open: false, isConnected: true,
                dataset: {}, style: {}, checked: true, value: '',
                classList: {
                    toggle(name, force) { const enabled = force ?? !classes.has(name); if (enabled) classes.add(name); else classes.delete(name); },
                    contains: name => classes.has(name),
                },
                setAttribute() {}, addEventListener() {}, querySelectorAll: () => [],
                querySelector: selector => selector === '.om-drawer-body' ? node('drawerBody') : null,
                close() { this.open = false; },
                focus() { document.activeElement = this; calls.focus.push(id); },
            });
        }
        return nodes.get(id);
    }
    const sim = { year: 400, events: [],
        provinces: [
            { id: 0, i: 0, x: 20, y: 20, settled: true, city: true, name: 'Stonefall', owner: 0, urbanPop: 200, settlementType: 'Town' },
            { id: 1, i: 1, x: 40, y: 20, settled: true, city: true, name: 'Moonford', owner: 1, urbanPop: 100, settlementType: 'Town' },
        ],
        realms: [
            { id: 0, name: 'Asgard', title: 'Kingdom of Asgard', alive: true, capital: 0, population: 300 },
            { id: 1, name: 'Annwn', title: 'League of Annwn', alive: true, capital: 1, population: 150 },
        ] };
    const world = { params: { seed: 'Realm-overview' }, continents: [], features: [], legends: [], basins: [],
        provinceId: [0, 1, -1], height: [100, 150, -10], temp: [15, 12, 10],
        arid: [.5, .6, .8], biome: [0, 0, 0], lake: [-1, -1, -1], lakeId: [-1, -1, -1] };
    const context = { document, window: { addEventListener() {} }, world, sim,
        busy: false, simAdvancing: false, playing: false, selectedRealm: 0,
        renderer: { canvas: node('map') }, CityUI: {}, LandmarkUI: { registry: [] },
        RealmNames: { fullName: c => c?.title || c?.name || '' },
        TownCatalog: { native: () => 'town' }, BIOME: [['Temperate forest']],
        CityEnvironment: { band: () => 'Mild upland' }, fmtPop: String,
        escapeHTML: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
        PlaceVitals: {city: (s,p) => ({year:s.year,pop:p.urbanPop})},
        placeVitalsHTML: v => `<div class="place-vitals">${v.year}/${v.pop}</div>`,
        placeNameOriginHTML(p) { calls.placeOrigins.push(p); return p?.originMarkup || ''; },
        realmNameOriginHTML(c) { calls.realmOrigins.push(c); return c?.originMarkup || ''; },
        pause() { calls.pauses++; context.playing = false; },
        renderRealmOverview(id) {
            const realm = sim.realms[id];
            calls.profiles.push({ id, year: sim.year, title: realm.title });
            node('inspector').textContent = `${realm.title} / ${sim.year}`;
        },
    };
    runInNewContext(source, context, { filename: 'src/ui/onemap-ui.js' });
    const ui = context.window.OneMap;
    document.activeElement = node('map');
    ui.bind();
    ui.onWorldUpdate(); // Establish the current world, just as startup does.
    function resetCalls() { calls.profiles.length = 0; calls.focus.length = 0; calls.pauses = 0; calls.placeOrigins.length = 0; calls.realmOrigins.length = 0; }
    resetCalls();
    return { ui, context, sim, node, calls, document, resetCalls,
        escape() { listeners.get('keydown')({ key: 'Escape', preventDefault() {}, stopImmediatePropagation() {} }); } };
}

test('Selecting a realm opens its overview without presenting its capital as the selection', () => {
    const h = harness();
    h.ui.inspectRealm(1);
    assert.equal(h.ui.panel, 'realm');
    assert(!h.node('omDrawer').classList.contains('hidden'));
    assert(!h.node('omWorldDetail').classList.contains('hidden'));
    assert.equal(h.node('omDrawerTitle').textContent, 'League of Annwn');
    assert.deepEqual(h.calls.profiles, [{ id: 1, year: 400, title: 'League of Annwn' }]);
    assert(h.node('omSelection').classList.contains('hidden'));
    assert.equal(h.node('omSelectionBody').innerHTML, '');
    assert.equal(h.document.activeElement, h.node('omDrawerClose'));
});

test('inspecting any cell of a named landform shows its region and material identity', () => {
    const h = harness(), uiSource = readFileSync(new URL('../src/ui/world-ui.js', import.meta.url), 'utf8');
    const helpers = uiSource.slice(uiSource.indexOf('function landformRegionAt('), uiSource.indexOf('/** Default presentation'));
    h.context.landformRegionAt = new Function(helpers + 'return landformRegionAt;')();
    Object.assign(h.context.world, { landformRegion: [-1, -1, 5],
        landformRegions: [{ id: 5, name: 'Ember Tablelands', kind: 'RED-ROCK PLATEAU & CANYONS' }] });
    h.context.world.height[2] = 1700;
    h.ui.inspectWorld(2);
    assert(h.node('omSelectionBody').innerHTML.includes('Ember Tablelands'));
    assert(h.node('omSelectionBody').innerHTML.includes('RED ROCK PLATEAU &amp; CANYONS'));
});

test('An open overview follows its realm through advancing history and renaming without reopening', () => {
    const h = harness();
    h.ui.inspectRealm(1);
    h.resetCalls();
    h.document.activeElement = h.node('realmNameEdit');
    h.context.selectedRealm = 0; // Other map state must not choose a different profile.
    h.context.simAdvancing = true;
    h.sim.year = 401;
    h.sim.realms[1].title = 'League of the Silver Shore';
    h.ui.onWorldUpdate();
    assert.deepEqual(h.calls.profiles, [{ id: 1, year: 401, title: 'League of the Silver Shore' }]);
    assert.equal(h.node('omDrawerTitle').textContent, 'League of the Silver Shore');
    assert.equal(h.ui.panel, 'realm');
    assert.equal(h.calls.pauses, 0, 'a refresh must not pause ongoing history');
    assert.deepEqual(h.calls.focus, [], 'a refresh must not open the drawer again or take focus');
    assert.equal(h.document.activeElement, h.node('realmNameEdit'));
});

test('Escape closes the overview and restores focus; later updates keep it closed', () => {
    const h = harness();
    h.ui.inspectRealm(1);
    h.escape();
    assert.equal(h.ui.panel, null);
    assert(h.node('omDrawer').classList.contains('hidden'));
    assert.equal(h.document.activeElement, h.node('map'));
    h.resetCalls();
    h.sim.year++;
    h.ui.onWorldUpdate();
    h.ui.onWorldUpdate();
    assert.equal(h.ui.panel, null);
    assert(h.node('omDrawer').classList.contains('hidden'));
    assert.deepEqual(h.calls.profiles, []);
    assert.deepEqual(h.calls.focus, []);
    assert.equal(h.calls.pauses, 0);
});

test('A realm that falls closes its overview instead of showing a surviving realm', () => {
    const h = harness();
    h.ui.inspectRealm(1);
    h.resetCalls();
    h.sim.realms[1].alive = false;
    h.context.selectedRealm = 0;
    h.ui.onWorldUpdate();
    h.ui.onWorldUpdate();
    assert.equal(h.ui.panel, null);
    assert(h.node('omDrawer').classList.contains('hidden'));
    assert(h.node('omSelection').classList.contains('hidden'));
    assert.deepEqual(h.calls.profiles, []);
});

test('Inspecting another town dismisses the realm overview and keeps the town selected on refresh', () => {
    const h = harness();
    h.ui.inspectRealm(1);
    h.resetCalls();
    h.ui.inspectWorld(0);
    h.ui.onWorldUpdate();
    assert.equal(h.ui.panel, null);
    assert(h.node('omDrawer').classList.contains('hidden'));
    assert(!h.node('omSelection').classList.contains('hidden'));
    assert(h.node('omSelectionBody').innerHTML.includes('<h3>Stonefall</h3>'));
    assert(!h.node('omSelectionBody').innerHTML.includes('Annwn'));
    assert.deepEqual(h.calls.profiles, []);
});

test('A town card uses that town’s naming origin and a legacy town falls back to its realm', () => {
    const h = harness(), p = h.sim.provinces[0], realm = h.sim.realms[0];
    p.originMarkup = '<p>Stonefall shares its country’s naming tradition.</p>';
    realm.originMarkup = '<p>Asgard is a place from Norse mythology.</p>';
    h.ui.inspectWorld(p.i);
    assert.equal(h.calls.placeOrigins.at(-1), p, 'the card passes the selected town to the place helper');
    assert(h.node('omSelectionBody').innerHTML.includes(p.originMarkup));
    assert(!h.node('omSelectionBody').innerHTML.includes(realm.originMarkup));
    assert.deepEqual(h.calls.realmOrigins, [], 'a modern town does not substitute country provenance');
    delete p.originMarkup;
    h.resetCalls();
    h.ui.onWorldUpdate();
    assert.equal(h.calls.placeOrigins.at(-1), p);
    assert.equal(h.calls.realmOrigins.at(-1), realm);
    assert(h.node('omSelectionBody').innerHTML.includes(realm.originMarkup), 'legacy saves retain their available name explanation');
});

test('Inspecting empty ocean clears a realm overview even without a replacement place card', () => {
    const h = harness();
    h.ui.inspectRealm(1);
    h.resetCalls();
    h.ui.inspectWorld(2);
    h.ui.onWorldUpdate();
    assert.equal(h.ui.panel, null);
    assert(h.node('omDrawer').classList.contains('hidden'));
    assert(h.node('omSelection').classList.contains('hidden'));
    assert.deepEqual(h.calls.profiles, []);
});

test('Opening a different realm starts at its introduction while refresh preserves reading position', () => {
    const h = harness();
    h.node('drawerBody').scrollTop = 600;
    h.ui.inspectRealm(0);
    assert.equal(h.node('drawerBody').scrollTop, 0);
    h.node('drawerBody').scrollTop = 250;
    h.ui.onWorldUpdate();
    assert.equal(h.node('drawerBody').scrollTop, 250);
    h.ui.inspectRealm(1);
    assert.equal(h.node('drawerBody').scrollTop, 0);
});
