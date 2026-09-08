import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './engine-loader.mjs';

const E = loadEngine();

test('concentrated homelands have enough names to distinguish residents and recurring warlords', () => {
    // A large homeland can produce hundreds of protagonists from the same people.
    // Keep this independent of today's political borders and population mixture.
    for (let people = 0; people < E.PEOPLES.length; people++) {
        const residents = Array.from({ length: 512 }, (_, id) => ({
            i: 71 + id * 79,
            people: E.PEOPLES.map((_, k) => Number(k === people))
        }));
        const original = JSON.stringify(residents);
        const names = new Set(residents.map(p => E.Saga.personOf(p, 101, people).name));
        assert(names.size > residents.length * .95, `${E.PEOPLES[people].name}: only ${names.size} distinct residents`);

        const sim = { realms: Array.from({ length: 64 }, (_, id) => ({
            id, capital: id * 3 + 17, originPeople: people, name: `Realm ${id}`, gov: 0
        })) };
        const saved = JSON.stringify(sim);
        const lords = new Set();
        for (const realm of sim.realms) {
            const events = [{ type: 'conquest', actors: [realm.id], year: 400 }];
            const first = E.Saga.adversary({}, sim, { name: 'First town' }, events).lord;
            const second = E.Saga.adversary({}, sim, { name: 'Second town' }, events).lord;
            assert.deepEqual(first, second, 'a recurring warlord belongs to the realm, not to the defender');
            lords.add(first.name);
        }
        assert(lords.size > sim.realms.length * .95, 'distinct realms need distinct recurring characters');
        assert([...lords].filter(name => names.has(name)).length <= 2, 'residents and opposing warlords should not repeatedly share an identity');
        assert.deepEqual(residents.map(p => E.Saga.personOf(p, 101, people)),
            JSON.parse(original).map(p => E.Saga.personOf(p, 101, people)), 'identity depends on inputs, not lookup order or random-stream state');
        assert.equal(JSON.stringify(residents), original);
        assert.equal(JSON.stringify(sim), saved);
    }
});
