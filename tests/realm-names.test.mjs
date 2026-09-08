import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadEngine, defaults, root } from './engine-loader.mjs';

const E = loadEngine();
function fixture(count = 160) {
    return { seed: 'Mythic-atlas', options: { politySeed: 'Councils' },
        provinces: Array.from({ length: count }, (_, id) => ({ id, name: `Town ${id}`, x: id % 30 * 10, y: Math.floor(id / 30) * 30, landmass: id % 6 })),
        realms: Array.from({ length: count }, (_, id) => ({ id, capital: id, gov: id % 8, alive: true, founded: 400 })) };
}
function assertOrigin(c) {
    assert.equal(c.namedFor, 'mythology');
    const o = c.nameOrigin, b = E.RealmNames.bases.find(b => b.id === o.baseId);
    assert(b, `${c.name} needs a known tradition`);
    assert.equal(o.tradition, b.tradition);
    assert(b.names.some(n => n.name === o.source && n.meaning === o.meaning));
    assert(c.name.includes(o.source), `${c.name} lost its mythic source`);
    assert(c.title.includes(c.name));
    assert(!/\d/.test(c.name), 'collisions must retain a readable name');
    assert(E.RealmNames.describe(c).includes(o.meaning));
}
test('Mythological countries are unique, meaningful and reproducible beyond 128 realms', () => {
    const a = fixture(), b = fixture();
    E.RealmNames.generate(a);
    E.RealmNames.generate(b);
    assert.deepEqual(a, b);
    assert.equal(new Set(a.realms.map(c => c.name.toLowerCase())).size, a.realms.length);
    a.realms.forEach(assertOrigin);
    assert(new Set(a.realms.map(c => c.nameOrigin.baseId)).size >= 8);
    assert(a.realms.some(c => c.nameOrigin.qualifier), 'exercise exhausted base names');
    E.RealmNames.generate(a);
    assert.deepEqual(a, b, 'rerunning the naming pass must be stable');
    const alternative = fixture(); alternative.seed += ' changed';
    E.RealmNames.generate(alternative);
    assert.notDeepEqual(a.realms.map(c => c.name), alternative.realms.map(c => c.name));
});
test('Requested tradition, custom names and historical names survive allocation', () => {
    const s = fixture(3), c = s.realms[2];
    s.realms[0] = { ...s.realms[0], alive: false, name: 'ASGARD' };
    s.realms[1] = { ...s.realms[1], name: '  MIDGARD  ', title: 'My kingdom', namedFor: 'custom' };
    const kept = structuredClone(s.realms.slice(0, 2));
    E.RealmNames.assign(s, c, { baseId: 'norse' });
    assert.equal(c.nameOrigin.baseId, 'norse');
    assert(!['ASGARD', 'MIDGARD'].includes(c.name.toUpperCase()));
    E.RealmNames.generate(s);
    assert.deepEqual(s.realms.slice(0, 2), kept);
    assert.equal(E.RealmNames.describe(s.realms[1]), '');
    assert.equal(E.RealmNames.describe({ name: 'Old save', namedFor: 'plate' }), '');
    assert.equal(E.RealmNames.describe(null), '');
});
test('Founding and secession use mythological names, with stable saves and unchanged founding geography', async () => {
    const w = await E.generateWorld(defaults), s = E.createCivilization(w, { realms: 18, historySeed: 'First-dawn' });
    assert.equal(E.physicalFingerprint(w), '440ae5d0');
    assert.equal(E.settlementFingerprint(s), '6b6c5ea8');
    assert.equal(E.politicalFingerprint(s), 'd8ba763d');
    s.realms.forEach(assertOrigin);
    const saved = JSON.parse(JSON.stringify(s));
    assert.deepEqual(saved.realms, s.realms);
    const withoutNames = sim => JSON.stringify({ ...sim, realms: sim.realms.map(({ name, title, namedFor, nameOrigin, ...other }) => other) });
    const before = withoutNames(s);
    E.nameRealms(s, w);
    assert.equal(withoutNames(s), before, 'naming must not change politics, resources or events');
    assert.equal(E.physicalFingerprint(w), '440ae5d0');
    const edited = s.realms[0];
    assert(E.civilizationAction(s, 'rename', edited.id, -1, 'My chosen realm').ok);
    assert.equal(edited.name, 'My chosen realm');
    assert.equal(edited.namedFor, 'custom');
    assert.equal(edited.nameOrigin, null);
    assert.equal(E.RealmNames.describe(edited), '');
    const count = s.realms.length;
    for (let year = 0; year < 40 && s.realms.length === count; year++) {
        for (const p of s.provinces) { p.unrest = 100; p.occupation = 0; }
        E.stepCivilization(s, w);
    }
    assert(s.realms.length > count, 'the stressed fixture should secede');
    for (const c of s.realms.slice(count)) {
        assertOrigin(c);
        assert(s.events.some(e => e.type === 'secession' && e.text.includes(c.title)));
        assert.equal(s.realms.filter(r => r.name === c.name).length, 1);
    }
});
test('Origin markup escapes imported text and long labels use actual rendered width', () => {
    const src = readFileSync(`${root}/src/ui/world-ui.js`, 'utf8');
    const helper = src.slice(src.indexOf('function realmNameOriginHTML('), src.indexOf('function renderInspector('));
    const escapeHTML = v => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const originHTML = new Function('RealmNames', 'escapeHTML', helper + ';return realmNameOriginHTML;')(E.RealmNames, escapeHTML);
    assert.equal(originHTML({ name: 'Legacy realm' }), '');
    const html = originHTML({ namedFor: 'mythology', nameOrigin: { tradition: '<script>', source: 'A', meaning: 'B' } });
    assert(!html.includes('<script>'));
    assert(html.includes('&lt;script&gt;'));
    const position = src.slice(src.indexOf('function positionLabels()'), src.indexOf('function makeGeoJumps()'));
    const dom = { labels: { classList: { toggle() {} } }, names: { checked: true }, compass: { style: {} } };
    const label = (x, width) => ({ element: { offsetWidth: width, offsetHeight: 40, style: {} }, feature: { name: 'Chicomoztoc', x, y: 200, realm: 0 } });
    const items = [label(300, 230), label(480, 220)];
    const renderer = { width: 1000, height: 600, azimuth: 0, zoom: 1, screen: (x, y) => [x, y] };
    new Function('$', 'renderer', 'world', 'labelItems', position + ';positionLabels();')(id => dom[id], renderer, {}, items);
    assert.equal(items[0].element.style.opacity, '1');
    assert.equal(items[1].element.style.opacity, '0', 'long adjacent names must not overlap');
});

function positionMapLabels(items, zoom = 1, {width=1000,height=600}={}) {
    const src = readFileSync(`${root}/src/ui/world-ui.js`, 'utf8');
    const position = src.slice(src.indexOf('function positionLabels()'), src.indexOf('function makeGeoJumps()'));
    const dom = { labels: { classList: { toggle() {} } }, names: { checked: true }, compass: { style: {} } };
    const renderer = { width, height, azimuth: 0, zoom, screen: (x, y) => [x, y] };
    new Function('$', 'renderer', 'world', 'labelItems', position + ';positionLabels();')(id => dom[id], renderer, {}, items);
}
function mapLabel(feature, width, height) {
    return { element: { offsetWidth: width, offsetHeight: height, style: {} }, feature };
}

test('Realm label candidates remain on owned dry land and prefer space away from cities', () => {
    const src = readFileSync(`${root}/src/ui/world-ui.js`, 'utf8');
    const helper = src.slice(src.indexOf('function realmLabelAnchors('), src.indexOf('function legendLabels('));
    const width = 30, world = { height: Array(900).fill(1), lake: Array(900).fill(-1) };
    const cells = [];
    for (let y = 3; y <= 24; y++)
        for (let x = 3; x <= 24; x++) cells.push(y * width + x);
    world.height[12 * width + 15] = 0;
    world.lake[15 * width + 12] = 1;
    const town = { x: 13.5, y: 13.5, settled: true, cells };
    const anchorsFor = new Function('world', 'GW', helper + ';return realmLabelAnchors;')(world, width);
    const anchors = anchorsFor([town]), owned = new Set(cells);
    assert(anchors.length > 1, 'the realm needs alternatives when its first position is occupied');
    for (const anchor of anchors) {
        assert(owned.has(anchor.i), 'neighboring land cannot host this realm name');
        assert(world.height[anchor.i] > 0 && world.lake[anchor.i] <= 0, 'water cannot host realm lettering');
        assert.equal(anchor.i, anchor.y * width + anchor.x);
    }
    assert(Math.hypot(anchors[0].x - town.x, anchors[0].y - town.y) >= 7,
        'the preferred position should leave the central city room for its own label');
    assert.deepEqual(anchorsFor([{ cells: [12 * width + 15, 15 * width + 12] }]), [],
        'a realm without dry land has no valid land candidate');
});

test('Realm names use another land candidate while preserving the city label and location', () => {
    const city = mapLabel({ name: 'Stonefall', town: true, x: 300, y: 220 }, 110, 24);
    const realm = mapLabel({ name: 'Asgard', realm: 0, x: 300, y: 220,
        anchors: [{ x: 300, y: 220 }, { x: 550, y: 220 }] }, 180, 32);
    positionMapLabels([realm, city]);
    assert.equal(realm.element.style.opacity, '1');
    assert.equal(realm.element.style.left, '550px', 'the first candidate conflicts with the city');
    assert.equal(realm.element.style.top, '220px');
    assert.equal(city.element.style.opacity, '1', 'a realm processed first must not suppress its city');
    assert.equal(city.element.style.pointerEvents, 'auto');
    assert.equal(city.element.style.left, '300px');
    assert.equal(city.element.style.top, '220px', 'the city name must stay at its actual location');
});

test('A small country keeps its only owned label position when a town competes for it', () => {
    const city = mapLabel({ name: 'Stonefall', town: true, x: 300, y: 220 }, 110, 24);
    const realm = mapLabel({ name: 'Chicomoztoc', realm: 0, x: 650, y: 220,
        anchors: [{ x: 300, y: 220 }, { x: 995, y: 220 }] }, 240, 32);
    positionMapLabels([realm, city]);
    assert.equal(realm.element.style.opacity, '1', 'a town label must not erase its country');
    assert.equal(realm.element.style.pointerEvents, 'auto');
    assert.equal(realm.element.style.left, '300px', 'the country remains on its own valid anchor');
    assert.equal(city.element.style.opacity, '0', 'town lettering yields rather than overlapping the country name');
    assert.equal(city.element.tabIndex,-1,'invisible text is not a keyboard trap');
    assert.equal(city.element.style.left, '300px');
    assert.equal(city.element.style.top, '220px');
});

function measuredRealm(id,x,y,{full=180,compact=80,rows=2,anchors=[{x,y,i:id}],labelSize=20}={}){
    const probes={'.realmFullName':{offsetWidth:full,offsetHeight:rows*22},'.realmCompactName':{offsetWidth:compact,offsetHeight:18},'.realmMarker':{offsetWidth:18,offsetHeight:18}};
    const item=mapLabel({name:'The Kingdom of Test '+id,shortName:'Test '+id,realm:id,x,y,anchors,labelSize},full,rows*22);
    item.element.dataset={};item.element.querySelector=selector=>probes[selector];
    return item;
}
function labelBox(item){
    const {style}=item.element,scale=Number(style.transform?.match(/scale\(([^)]+)\)/)?.[1]||1),width=(parseFloat(style.width)+6)*scale,height=(parseFloat(style.height)+4)*scale;
    return{x:parseFloat(style.left)-width/2,y:parseFloat(style.top)-height/2,w:width,h:height};
}
function separated(a,b){return a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y;}

test('formal country names remain readable without overlapping at desktop and mobile widths',()=>{
    for(const width of [1440,1480,390]){
        const columns=width<700?3:6,rows=4,height=844,items=[];
        for(let k=0;k<24;k++){
            const column=k%columns,row=Math.floor(k/columns),x=35+(column+.5)*(width-70)/columns,y=130+row*80;
            items.push(measuredRealm(k,x,y,{full:width<700?118:175,compact:width<700?62:90,rows:2}));
        }
        const before=items.map(v=>v.feature.anchors[0].i);
        positionMapLabels(items,1,{width,height});
        assert(items.every(v=>v.element.style.opacity==='1'),width+' should show every fixture country');
        for(let j=0;j<items.length;j++){
            assert.equal(items[j].element.dataset.anchorCell,String(before[j]),'a label cannot move onto another country');
            const box=labelBox(items[j]);assert(box.x>=8&&box.x+box.w<=width-8);
            for(let k=0;k<j;k++)assert(separated(box,labelBox(items[k])),'country labels overlap at width '+width);
        }
        assert(items.filter(v=>v.element.dataset.labelVariant==='marker').length===0,'legible country names should fit this overview');
    }
});

test('a compact neighbouring country can displace an earlier wide name without disappearing',()=>{
    const items=[measuredRealm(0,270,200,{full:230,compact:70}),measuredRealm(1,350,200,{full:220,compact:54})];
    positionMapLabels(items);
    assert(items.every(v=>v.element.style.opacity==='1'));
    assert(items.some(v=>v.element.dataset.labelVariant==='compact'),'retry the set instead of keeping a wide label over the next country');
    assert(separated(...items.map(labelBox)));
});

test('an extremely narrow visible country keeps an owned, accessible marker with its full name',()=>{
    const item=measuredRealm(3,22,200,{full:220,compact:90});positionMapLabels([item],1,{width:390,height:844});
    assert.equal(item.element.style.opacity,'1');assert.equal(item.element.dataset.labelVariant,'marker');
    assert.equal(item.element.style.left,'22px');assert.equal(item.element.dataset.anchorCell,'3');
    assert(item.element.title.includes(item.feature.name));assert.equal(item.element.tabIndex,0);assert.equal(item.element.style.pointerEvents,'auto');
});

test('country anchor coverage includes the opposite edge and a separate island',()=>{
    const src=readFileSync(`${root}/src/ui/world-ui.js`,'utf8'),helper=src.slice(src.indexOf('function realmLabelAnchors('),src.indexOf('function legendLabels('));
    const width=140,world={height:Array(width*60).fill(1),lake:Array(width*60).fill(-1)},cells=[];
    for(let y=5;y<40;y++)for(let x=5;x<95;x++)cells.push(y*width+x);
    cells.push(50*width+130);
    const anchors=new Function('world','GW',helper+';return realmLabelAnchors;')(world,width)([{cells,settled:true,x:40,y:20}]);
    assert(anchors.some(a=>a.x>=90),'a visible peripheral district needs a label candidate');
    assert(anchors.some(a=>a.i===50*width+130),'a separate island must not lose to forty central candidates');
});

test('Formal realm names use recognizable state forms and preserve custom names', () => {
    const s = fixture(80);
    E.RealmNames.generate(s);
    for (const c of s.realms) {
        const full = E.RealmNames.fullName(c);
        assert(full.includes(c.name));
        assert(/empire|kingdom|principality|theocracy|magocracy|dominion|confederacy|confederation|federation|republic|league|commonwealth|state/i.test(full));
    }
    assert(s.realms.some(c => /Empire/.test(E.RealmNames.fullName(c))), 'the naming repertoire includes empires');
    const legacy = { name: 'Asgard', title: 'the Asgard Throne', gov: 0 };
    const before = structuredClone(legacy);
    assert.equal(E.RealmNames.fullName(legacy), 'Kingdom of Asgard');
    assert.deepEqual(legacy, before, 'displaying an old save does not rename its stored state');
    assert.equal(E.RealmNames.fullName({name:'My $& Realm',title:'My $& Realm',gov:0,namedFor:'custom'}), 'My $& Realm');
    assert.equal(E.RealmNames.fullName(null), '');
});

test('World overview leaves space for realm names and reveals minor town labels on approach', () => {
    const town = mapLabel({ name: 'Mossford', town: true, minZoom: 2, x: 300, y: 220 }, 80, 24);
    const realm = mapLabel({ name: 'Kingdom of Asgard', realm: 0, x: 300, y: 220,
        anchors: [{ x: 300, y: 220 }, { x: 550, y: 220 }] }, 150, 32);
    positionMapLabels([realm, town], 1);
    assert.equal(town.element.style.opacity, '0');
    assert.equal(realm.element.style.left, '300px');
    positionMapLabels([realm, town], 2);
    assert.equal(town.element.style.opacity, '1');
    assert.equal(realm.element.style.left, '550px');
});
