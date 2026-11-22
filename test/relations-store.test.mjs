import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal fake of the Foundry parts the store uses: journals (the confidential store, old patrons), actors (patrons and characters)
function setup({ gm = true } = {}) {
    let nextId = 1;
    const journals = new Map();
    const actorsMap = new Map();
    const flagsApi = (doc) => ({
        getFlag(scope, key) { return doc.flags?.[scope]?.[key]; },
        async setFlag(scope, key, value) { ((doc.flags ??= {})[scope] ??= {})[key] = value; },
        async unsetFlag(scope, key) { delete doc.flags?.[scope]?.[key]; },
    });
    const makeJournal = (data) => {
        const doc = { id: `j${nextId++}`, name: data.name, ownership: data.ownership ?? {}, flags: structuredClone(data.flags ?? {}), async delete() { journals.delete(this.id); } };
        Object.assign(doc, flagsApi(doc));
        journals.set(doc.id, doc);
        return doc;
    };
    const makeActor = (data, owners = []) => {
        const doc = {
            id: data.id ?? `x${nextId++}`,
            name: data.name,
            img: data.img,
            type: data.type ?? 'acolyte',
            system: structuredClone(data.system ?? {}),
            ownership: data.ownership ?? { default: 0 },
            flags: {},
            testUserPermission: (u) => owners.includes(u.id),
            async update(d) {
                for (const [k, v] of Object.entries(d)) {
                    if (k === 'ownership') this.ownership = v;
                    else if (k === 'system') this.system = { ...this.system, ...structuredClone(v) };
                    else if (k.startsWith('system.')) this.system[k.slice(7)] = structuredClone(v);
                    else this[k] = v;
                }
            },
            async delete() { actorsMap.delete(this.id); },
        };
        Object.assign(doc, flagsApi(doc));
        actorsMap.set(doc.id, doc);
        return doc;
    };
    const journal = { get: (id) => journals.get(id), filter: (f) => [...journals.values()].filter(f), find: (f) => [...journals.values()].find(f) };
    const actors = { get: (id) => actorsMap.get(id), filter: (f) => [...actorsMap.values()].filter(f) };
    globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2 } };
    globalThis.foundry = { utils: { deepClone: (o) => structuredClone(o) } };
    globalThis.JournalEntry = { create: async (d) => makeJournal(d) };
    globalThis.Actor = { create: async (d) => makeActor(d) };
    globalThis.game = {
        user: { isGM: gm, id: gm ? 'gm' : 'u1' },
        journal,
        actors,
        users: [{ id: 'gm', isGM: true }, { id: 'u1', isGM: false }, { id: 'u2', isGM: false }, { id: 'u3', isGM: false }],
    };
    return { journals, actors, journal, character: (id, owners) => makeActor({ id, name: id, type: 'acolyte' }, owners), makeJournal };
}

test('store: the patron actor never holds a secret; the confidential store is GM only', async () => {
    const env = setup();
    const store = await import('../src/module/relations/store.mjs');
    const doc = await store.createPatron();
    assert.equal(doc.type, 'patron');
    const full = await store.fullPatron(doc);
    full.name = 'Voss';
    full.gmNotes = 'GM SECRET NOTE';
    full.liabilities = [{ id: 'l1', text: 'open', secret: false }, { id: 'l2', text: 'HIDDEN SIN', secret: true }];
    full.relations = [{ id: 'r1', faction: 'Mechanicus', level: 2, secret: false }, { id: 'r2', faction: 'Ecclesiarchy', level: -3, secret: true }];
    await store.savePatron(doc.id, full);
    const publicData = JSON.stringify({ name: doc.name, img: doc.img, system: doc.system, flags: doc.flags, ownership: doc.ownership });
    assert.doesNotMatch(publicData, /GM SECRET NOTE|HIDDEN SIN|-3/);
    const secretStore = [...env.journals.values()].find((d) => d.getFlag('dark-heresy-2nd', 'secretStore'));
    assert.equal(secretStore.ownership.default, 0); // nobody
    assert.match(secretStore.getFlag('dark-heresy-2nd', 'secretsJson'), /GM SECRET NOTE/);
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

test('store: one patron actor for several characters, visible only to their owners; the stats are read, not copied', async () => {
    const env = setup();
    const store = await import('../src/module/relations/store.mjs');
    const a1 = env.character('a1', ['u1']);
    const a2 = env.character('a2', ['u2']);
    env.character('a3', ['u3']);
    const doc = await store.createPatron();
    await doc.update({ system: { relations: [{ id: 'r1', faction: 'Mechanicus', level: 2, secret: false }] } });
    await store.assignPatron(a1, doc.id);
    await store.assignPatron(a2, doc.id);
    assert.deepEqual(store.publicPatron(doc).assigned.sort(), ['a1', 'a2']);
    assert.equal(store.actorPatronId(a1), doc.id);
    assert.equal(store.actorPatronDoc(a2), doc);
    assert.deepEqual(doc.ownership, { default: 0, u1: 2, u2: 2 }); // u3 owns an unassigned character: no access
    // the characters hold only a pointer, the stats exist once
    assert.equal(JSON.stringify(a1.flags).includes('Mechanicus'), false);
    assert.equal(store.publicPatron(store.actorPatronDoc(a1)).relations[0].level, 2);
    await doc.update({ system: { relations: [{ id: 'r1', faction: 'Mechanicus', level: 3, secret: false }] } });
    assert.equal(store.publicPatron(store.actorPatronDoc(a2)).relations[0].level, 3); // a change of the patron reaches every character
    assert.equal(env.actors.filter((a) => a.type === 'patron').length, 1);
    await store.assignPatron(a2, null);
    assert.deepEqual(store.publicPatron(doc).assigned, ['a1']);
    assert.deepEqual(doc.ownership, { default: 0, u1: 2 });
    assert.equal(store.actorPatronId(a2), null);
    const other = await store.createPatron();
    await store.assignPatron(a1, other.id);
    assert.deepEqual(store.publicPatron(doc).assigned, []);
    assert.deepEqual(store.publicPatron(other).assigned, ['a1']);
});

test('store: a player cannot create, assign, save or delete', async () => {
    const env = setup({ gm: false });
    const store = await import('../src/module/relations/store.mjs');
    assert.equal(await store.createPatron(), null);
    const a1 = env.character('a1', ['u1']);
    await store.assignPatron(a1, 'whatever');
    assert.equal(store.actorPatronId(a1), null);
});

test('migration: a patron journal of an earlier version becomes a patron actor, the characters and the secrets follow', async () => {
    const env = setup();
    const store = await import('../src/module/relations/store.mjs');
    const a1 = env.character('a1', ['u1']);
    const old = env.makeJournal({
        name: 'Old Voss',
        flags: { 'dark-heresy-2nd': { patronJson: JSON.stringify({ dynasty: 'House Voss', faction: 'Ordo', boons: [{ id: 'b', text: 'armoury' }], liabilities: [], relations: [{ id: 'r2', faction: 'X', secret: true }], affiliation: 'known', assigned: ['a1'] }) } },
    });
    await old.setFlag('dark-heresy-2nd', 'patronJson', old.getFlag('dark-heresy-2nd', 'patronJson'));
    const secretDoc = env.makeJournal({ name: 'store', flags: { 'dark-heresy-2nd': { secretStore: true, secretsJson: JSON.stringify({ patrons: { [old.id]: { notes: 'GM note', liabilities: [], relationLevels: { r2: -2 } } }, contacts: {} }) } } });
    assert.ok(secretDoc);
    const n = await store.migrateJournalPatrons();
    assert.equal(n, 1);
    assert.equal(env.journal.filter((j) => j.getFlag('dark-heresy-2nd', 'patronJson') !== undefined).length, 0); // the old journal is gone
    const patron = env.actors.filter((a) => a.type === 'patron')[0];
    assert.equal(patron.name, 'Old Voss');
    assert.equal(patron.system.dynasty, 'House Voss');
    assert.equal(store.actorPatronId(a1), patron.id);
    const secrets = await store.readSecrets();
    assert.equal(secrets.patrons[patron.id].relationLevels.r2, -2); // the confidential part moved to the new id
    assert.equal(secrets.patrons[old.id], undefined);
    assert.doesNotMatch(JSON.stringify(patron.system), /GM note|-2/);
    assert.equal(await store.migrateJournalPatrons(), 0); // runs once
});
