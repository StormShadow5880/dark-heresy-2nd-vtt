import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal fake of the Foundry parts the store uses: journals with flags, actors with flags and owners
function setup({ gm = true } = {}) {
    const docs = new Map();
    let nextId = 1;
    const make = (data) => {
        const doc = {
            id: `j${nextId++}`,
            name: data.name,
            ownership: data.ownership ?? {},
            flags: structuredClone(data.flags ?? {}),
            getFlag(scope, key) { return this.flags[scope]?.[key]; },
            async setFlag(scope, key, value) { (this.flags[scope] ??= {})[key] = value; },
            async update(d) {
                for (const [k, v] of Object.entries(d)) {
                    if (k === 'ownership') this.ownership = v;
                    else if (k.startsWith('flags.')) { const [, scope, key] = k.split('.'); (this.flags[scope] ??= {})[key] = v; }
                    else this[k] = v;
                }
            },
            async delete() { docs.delete(this.id); },
        };
        docs.set(doc.id, doc);
        return doc;
    };
    const journal = { get: (id) => docs.get(id), filter: (f) => [...docs.values()].filter(f), find: (f) => [...docs.values()].find(f) };
    const actors = new Map();
    const actor = (id, owners) => {
        const a = { id, flags: {}, getFlag(s, k) { return this.flags[s]?.[k]; }, async setFlag(s, k, v) { (this.flags[s] ??= {})[k] = v; }, async unsetFlag(s, k) { delete this.flags[s]?.[k]; }, testUserPermission: (u) => owners.includes(u.id) };
        actors.set(id, a);
        return a;
    };
    globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2 } };
    globalThis.JournalEntry = { create: async (d) => make(d) };
    globalThis.game = {
        user: { isGM: gm, id: gm ? 'gm' : 'u1' },
        journal,
        actors: { get: (id) => actors.get(id) },
        users: [{ id: 'gm', isGM: true }, { id: 'u1', isGM: false }, { id: 'u2', isGM: false }, { id: 'u3', isGM: false }],
    };
    return { docs, actor, journal };
}

test('store: the public document never holds a secret; the confidential store is GM only', async () => {
    const env = setup();
    const store = await import('../src/module/relations/store.mjs');
    const doc = await store.createPatron();
    const full = await store.fullPatron(doc);
    full.name = 'Voss';
    full.gmNotes = 'GM SECRET NOTE';
    full.liabilities = [{ id: 'l1', text: 'open', secret: false }, { id: 'l2', text: 'HIDDEN SIN', secret: true }];
    full.relations = [{ id: 'r1', faction: 'Mechanicus', level: 2, secret: false }, { id: 'r2', faction: 'Ecclesiarchy', level: -3, secret: true }];
    await store.savePatron(doc.id, full);
    const publicJson = doc.getFlag('dark-heresy-2nd', 'patronJson');
    assert.doesNotMatch(publicJson, /GM SECRET NOTE|HIDDEN SIN|-3/);
    const secretStore = [...env.docs.values()].find((d) => d.getFlag('dark-heresy-2nd', 'secretStore'));
    assert.equal(secretStore.ownership.default, 0); // nobody
    assert.match(secretStore.getFlag('dark-heresy-2nd', 'secretsJson'), /GM SECRET NOTE/);
    // the GM reads everything back
    const back = await store.fullPatron(doc);
    assert.equal(back.relations.find((r) => r.id === 'r2').level, -3);
    assert.equal(back.liabilities.length, 2);
    // a player client: reduced data, the confidential store is not even read
    globalThis.game.user = { isGM: false, id: 'u1' };
    const asPlayer = await store.fullPatron(doc);
    assert.doesNotMatch(JSON.stringify(asPlayer), /GM SECRET NOTE|HIDDEN SIN|-3/);
    assert.equal(asPlayer.relations.find((r) => r.id === 'r2').label, 'unknown');
    assert.deepEqual(await store.readSecrets(), { patrons: {}, contacts: {} });
    await store.setContactGmNotes('a1', 'i1', 'must not be written by a player'); // ignored
    globalThis.game.user = { isGM: true, id: 'gm' };
    assert.equal(await store.contactGmNotes('a1', 'i1'), '');
});

test('store: one patron for several characters, visible only to their owners', async () => {
    const env = setup();
    const store = await import('../src/module/relations/store.mjs');
    const a1 = env.actor('a1', ['u1']);
    const a2 = env.actor('a2', ['u2']);
    env.actor('a3', ['u3']);
    const doc = await store.createPatron();
    await store.assignPatron(a1, doc.id);
    await store.assignPatron(a2, doc.id);
    assert.deepEqual(store.publicPatron(doc).assigned.sort(), ['a1', 'a2']);
    assert.equal(store.actorPatronId(a1), doc.id);
    assert.equal(store.actorPatronId(a2), doc.id);
    assert.deepEqual(doc.ownership, { default: 0, u1: 2, u2: 2 }); // u3 owns an unassigned character: no access
    // the data is stored once
    assert.equal(env.journal.filter((j) => j.getFlag('dark-heresy-2nd', 'patronJson') !== undefined).length, 1);
    // unassign
    await store.assignPatron(a2, null);
    assert.deepEqual(store.publicPatron(doc).assigned, ['a1']);
    assert.deepEqual(doc.ownership, { default: 0, u1: 2 });
    assert.equal(store.actorPatronId(a2), null);
    // a different patron replaces the first one
    const other = await store.createPatron();
    await store.assignPatron(a1, other.id);
    assert.deepEqual(store.publicPatron(doc).assigned, []);
    assert.deepEqual(store.publicPatron(other).assigned, ['a1']);
});

test('store: a player cannot assign, save or delete', async () => {
    const env = setup({ gm: false });
    const store = await import('../src/module/relations/store.mjs');
    assert.equal(await store.createPatron(), null);
    const a1 = env.actor('a1', ['u1']);
    await store.assignPatron(a1, 'whatever');
    assert.equal(store.actorPatronId(a1), null);
});
