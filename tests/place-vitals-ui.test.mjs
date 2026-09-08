import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const dataSource = read('../src/civilization/place-vitals.js');
const uiSource = read('../src/ui/place-vitals.js');
// Use the same escaping helper as the production card, including quoted attrs.
const escapeDeclaration = read('../src/ui/world-ui.js').split('\n').find(line => line.startsWith('const $ ='));
const escapeHTML = new Function(escapeDeclaration + '\nreturn escapeHTML;')();
const render = new Function('escapeHTML', uiSource + '\nreturn placeVitalsHTML;')(escapeHTML);
const peoples = [{ name: 'Humans', color: '#bc9062' }, { name: 'Sylvans', color: '#538a62' }];
const faiths = [{ name: 'Dawn Communion', color: '#d2ac52' }, { name: 'Veil of Stars', color: '#987abc' }];
const engine = (p = peoples, f = faiths) => new Function('PEOPLES', 'FAITHS', dataSource + '\nreturn PlaceVitals;')(p, f);
const Vitals = engine();
const imageLabels = html => [...html.matchAll(/role="img" aria-label="([^"]*)"/g)].map(match => match[1]);

test('Missing census and recorded zero population remain distinct without fabricated proportions', () => {
    assert.equal(render(null), '');
    const missing = render(Vitals.city({}, { people: [1], faith: [1] }));
    assert(missing.includes('Census incomplete'));
    assert(missing.includes('>—</b>'));
    const zero = render(Vitals.city({}, { pop: 0, urbanPop: 0, people: [1], faith: [1] }));
    assert(zero.includes('No residents recorded'));
    assert(zero.includes('data-value="0"'));
    for (const html of [missing, zero]) {
        assert(!/NaN|Infinity/.test(html));
        assert(!/width:\s*100%/.test(html), 'no population does not imply a complete demographic share');
        assert(!imageLabels(html).some(label => /\d%/.test(label)));
    }
});

test('Partial district peoples and faiths show their population-based shares and an Unrecorded segment', () => {
    const html = render(Vitals.city({}, { pop: 100, urbanPop: 25, people: [.4, .1], faith: [.2, .3] }));
    const labels = imageLabels(html);
    assert(labels.includes('Peoples: Humans 40%, Sylvans 10%, Unrecorded 50%'));
    assert(labels.includes('Faiths: Veil of Stars 30%, Dawn Communion 20%, Unrecorded 50%'));
    assert.equal((html.match(/data-id="unknown" style="width:50%;/g) || []).length, 2);
    assert(html.includes('District census'), 'city mixtures describe all district residents');
    assert(!html.includes('Humans 80%'), 'known residents must not become the percentage denominator');
    assert(!/NaN|Infinity/.test(html));
});

test('Food surplus stays at 250% while the gauge saturates and demand remains halfway along its scale', () => {
    const sim = { provinces: [{ id: 0, owner: 0, pop: 100, settled: true, people: [1], faith: [1] }] };
    const html = render(Vitals.realm(sim, { id: 0, foodRatio: 2.5, stability: 70 }));
    const food = html.slice(html.indexOf('data-vital="foodRatio"'), html.indexOf('data-vital="stability"'));
    assert(food.includes('data-value="250"'));
    assert(food.includes('>250%</b>'));
    assert(imageLabels(food).includes('Food supply: 250%; demand 100%'));
    assert(/<span style="width:100%;/.test(food));
    assert(/<i style="left:50%"/.test(food));
    assert(!/width:(?:125|250)%/.test(food));
});

test('Names are escaped in text and attributes, and only valid hexadecimal colors reach styles', () => {
    const name = '\"><img src=x onerror=alert(1)> & Clan';
    const colors = ['#abc', '#abcd', '#a1b2c3', '#a1b2c3d4', '#12345', '#1234567', '#abc; background:url(evil)', '\" onmouseover=alert(1)'];
    const definitions = colors.map((color, id) => ({ name: id === 0 ? name : `Group ${id}`, color }));
    const card = engine(definitions).city({}, { pop: 800, urbanPop: 200, people: colors.map(() => 1 / colors.length), faith: [1] });
    const html = render(card);
    assert(!html.includes('<img'));
    assert(html.includes('&quot;&gt;&lt;img src=x onerror=alert(1)&gt; &amp; Clan'));
    assert(imageLabels(html).some(label => label.includes('&quot;&gt;&lt;img src=x onerror=alert(1)&gt; &amp; Clan 12.5%')));
    assert(!html.includes('background:url(evil)'));
    assert(!html.includes('onmouseover=alert(1)'));
    const styleColors = [...html.matchAll(/--vital-color:([^;"\s]+)/g)].map(match => match[1]);
    for (const color of colors.slice(0, 4)) assert(styleColors.includes(color), `${color} is a valid CSS hex color`);
    assert(styleColors.includes('#8b968b'), 'invalid colors use the neutral fallback');
    for (const color of styleColors) assert(/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(color), `${color} is not a valid color`);
});
