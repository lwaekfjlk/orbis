import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { loadEngine } from './engine-loader.mjs';

const E = loadEngine();
const source = readFileSync(new URL('../src/ui/world-ui.js', import.meta.url), 'utf8');
const labelsSource = source.slice(source.indexOf('function legendLabels()'), source.indexOf('function makeGeoJumps()'));

function harness(withProbes = false) {
    const listeners = new Map(), calls = { select: [], inspect: [], terrain: 0 };
    const element = () => ({ children: [], dataset: {}, offsetWidth: 180, offsetHeight: 30,
        style: { setProperty(name, value) { this[name] = value; } },
        classList: { toggle() {} }, setAttribute() {},
        set innerHTML(value) { this.html = value; this.children.length = 0; },
        get innerHTML() { return this.html || ''; },
        appendChild(child) { this.children.push(child); },
    });
    const createElement = () => {
        const e = element();
        if (withProbes) e.querySelector = selector => ({
            '.realmFullName': { offsetWidth: 580, offsetHeight: 44 },
            '.realmCompactName': { offsetWidth: 240, offsetHeight: 20 },
            '.realmMarker': { offsetWidth: 18, offsetHeight: 18 },
        })[selector];
        return e;
    };
    const dom = { labels: element(), names: { checked: true }, compass: element() };
    const sim = {
        realms: [0, 1].map(id => ({ id, alive: true, capital: id, strength: 10, title: `Kingdom ${id}` })),
        provinces: [0, 1].map(id => ({ id, owner: id, x: 300 + id * 350, y: 400,
            settled: true, urbanPop: 200, name: `Town ${id}`, cells: [id],
            anchors: [{ x: 300 + id * 350, y: 200, i: id }] })),
    };
    const world = {}, renderer = Object.create(E.AtlasRenderer.prototype);
    Object.assign(renderer, { world, sim, width: 1000, height: 600, zoom: 1, azimuth: 0,
        hoveredRealm: null, focusRealm: 0, selected: 10, screen: (x, y) => [x, y],
        buildTerrain() { calls.terrain++; }, buildRealmHover() {}, request() {},
    });
    const context = { renderer, sim, world, busy: false, selectedRealm: 0, currentLayer: 'realms', labelItems: [],
        $: id => dom[id], AtlasSpace: E.AtlasSpace,
        POLITICAL: ['realms', 'diplomacy', 'faiths', 'peoples', 'wealth', 'magic'],
        RealmNames: { fullName: c => c.title }, RealmProfile: { landArea: (_, held) => held.length },
        realmLabelAnchors: held => held.flatMap(p => p.anchors),
        escapeHTML: String, fmtPop: String,
        selectRealm(id) { calls.select.push(id); }, inspectCell(i) { calls.inspect.push(i); },
        document: { createElement, fonts: { addEventListener() {} } },
        window: { addEventListener(type, callback) { listeners.set(type, callback); } },
    };
    runInNewContext(labelsSource, context, { filename: 'src/ui/world-ui.js:labels' });
    context.makeLabels();
    const label = id => dom.labels.children.find(b => b.dataset.realmId === id);
    return { context, renderer, calls, dom, label, blur: () => listeners.get('blur')() };
}

test('Country label pointer hover is temporary and leaves country clicks independent', () => {
    const h = harness(), label = h.label(1);
    assert.equal(label.style.opacity, '1');
    label.onpointerenter({ pointerType: 'mouse' });
    assert.equal(h.renderer.hoveredRealm, 1);
    assert.equal(h.renderer.focusRealm, 0);
    assert.equal(h.renderer.selected, 10);
    assert.equal(h.context.selectedRealm, 0);
    assert.deepEqual(h.calls.select, [], 'hover must not select the country or open its overview');
    label.onpointerleave();
    assert.equal(h.renderer.hoveredRealm, null);
    label.onpointerenter({ pointerType: 'touch' });
    assert.equal(h.renderer.hoveredRealm, null, 'a touch does not leave a sticky hover');
    label.onpointerenter({ pointerType: 'pen' });
    label.onpointercancel();
    assert.equal(h.renderer.hoveredRealm, null);
    label.onclick();
    assert.deepEqual(h.calls.select, [1], 'click still opens the clicked country');
    assert.deepEqual(h.calls.inspect, [], 'the country label never becomes a town click');
});

test('A late leave from the previous country cannot cancel the current country hover', () => {
    const h = harness(), a = h.label(0), b = h.label(1);
    a.onpointerenter({ pointerType: 'mouse' });
    b.onpointerenter({ pointerType: 'mouse' });
    a.onpointerleave();
    assert.equal(h.renderer.hoveredRealm, 1);
    b.onpointerleave();
    assert.equal(h.renderer.hoveredRealm, null);
    assert.equal(h.renderer.focusRealm, 0);
});

test('Label rebuilds, hidden names, collision culling, local views and window blur clear hover', () => {
    for (const reason of ['rebuild', 'names off', 'collision', 'local view', 'blur']) {
        const h = harness(), label = h.label(1);
        label.onpointerenter({ pointerType: 'mouse' });
        assert.equal(h.renderer.hoveredRealm, 1);
        if (reason === 'rebuild') h.context.makeLabels();
        if (reason === 'names off') { h.dom.names.checked = false; h.context.positionLabels(); }
        if (reason === 'collision') {
            h.context.sim.provinces[1].anchors[0].x = 300;
            h.context.positionLabels();
            assert.equal(label.style.opacity, '0');
        }
        if (reason === 'local view') {
            h.renderer.continuousLayer = {};
            h.renderer.zoom = E.AtlasSpace.TOWN_ZOOM;
            h.context.positionLabels();
        }
        if (reason === 'blur') h.blur();
        assert.equal(h.renderer.hoveredRealm, null, `${reason} must clear hover without relying on a pointerleave`);
        assert.equal(h.renderer.focusRealm, 0, `${reason} must preserve country selection`);
        assert.deepEqual(h.calls.select, []);
        if (reason === 'rebuild') {
            // The browser may immediately enter a replacement button beneath
            // the pointer; its subsequent leave still has to clear that preview.
            const replacement = h.label(1);
            replacement.onpointerenter({ pointerType: 'mouse' });
            assert.equal(h.renderer.hoveredRealm, 1);
            replacement.onpointerleave();
            assert.equal(h.renderer.hoveredRealm, null);
        }
    }
});

test('Busy, disabled and culled labels cannot start a country hover', () => {
    for (const reason of ['busy', 'names off', 'culled']) {
        const h = harness(), label = h.label(1);
        if (reason === 'busy') h.context.busy = true;
        if (reason === 'names off') h.dom.names.checked = false;
        if (reason === 'culled') { label.offsetWidth = 2000; h.context.positionLabels(); }
        label.onpointerenter({ pointerType: 'mouse' });
        assert.equal(h.renderer.hoveredRealm, null, reason);
        assert.deepEqual(h.calls.select, []);
    }
});

test('Compact names and tiny-country markers retain the full country hover and click target', () => {
    const h = harness(true), label = h.label(1);
    assert.equal(label.dataset.labelVariant, 'compact', 'crowded full names should use the readable compact form');
    label.onpointerenter({ pointerType: 'mouse' });
    assert.equal(h.renderer.hoveredRealm, 1);
    label.onclick();
    assert.deepEqual(h.calls.select, [1]);
    label.onpointerleave();
    assert.equal(h.renderer.hoveredRealm, null);

    h.context.sim.provinces[1].anchors[0].x = 22;
    h.context.positionLabels();
    assert.equal(label.dataset.labelVariant, 'marker', 'an extremely narrow visible country keeps a marker on its own land');
    assert.match(label.title, /Kingdom 1/);
    assert.equal(label.tabIndex, 0);
    assert.equal(label.style.pointerEvents, 'auto');
    label.onpointerenter({ pointerType: 'mouse' });
    assert.equal(h.renderer.hoveredRealm, 1);
    label.onclick();
    assert.deepEqual(h.calls.select, [1, 1]);
    label.onpointercancel();
    assert.equal(h.renderer.hoveredRealm, null);
    assert.deepEqual(h.calls.inspect, [], 'fallback forms never become a settlement click');
});
