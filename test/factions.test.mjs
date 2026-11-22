import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FACTIONS, addCustomFaction, buildRegistry, factionName, findById, findByName, linkRows, optionsFor, removeCustomFaction, renameCustomFaction } from '../src/module/rules/factions.mjs';

test('the system brings the standard factions', () => {
    const names = DEFAULT_FACTIONS.map((f) => f.name);
    for (const n of ['Adeptus Mechanicus', 'Adeptus Arbites', 'Administratum', 'Inquisition', 'Imperial Navy', 'Rogue Trader Dynasties']) assert.ok(names.includes(n), n);
    assert.ok(names.some((n) => /Ministorum/.test(n)));
    assert.equal(new Set(DEFAULT_FACTIONS.map((f) => f.id)).size, DEFAULT_FACTIONS.length);
});

test('registry: defaults first, custom factions added once for everybody, sorted', () => {
    const r = buildRegistry([{ id: 'c2', name: 'Zeta Cult' }, { id: 'c1', name: 'Ash Gang' }]);
    assert.equal(r.length, DEFAULT_FACTIONS.length + 2);
    assert.deepEqual(r.slice(-2).map((f) => f.name), ['Ash Gang', 'Zeta Cult']);
    assert.equal(r.at(-1).custom, true);
    assert.equal(r[0].custom, false);
});

test('custom factions: no duplicates (also not of a default faction, any case), rename, remove', () => {
    let { custom, error } = addCustomFaction([], 'House Volscen');
    assert.equal(error, null);
    assert.equal(custom.length, 1);
    assert.match(addCustomFaction(custom, ' house   volscen ').error, /exists/);
    assert.match(addCustomFaction(custom, 'adeptus mechanicus').error, /exists/);
    assert.match(addCustomFaction(custom, '   ').error, /name/);
    const id = custom[0].id;
    ({ custom, error } = renameCustomFaction(custom, id, 'House Volscen Prime'));
    assert.equal(findById(buildRegistry(custom), id).name, 'House Volscen Prime');
    assert.match(renameCustomFaction(custom, id, 'Inquisition').error, /exists/);
    assert.deepEqual(removeCustomFaction(custom, id), []);
});

test('the name of a row: the registry name (a rename reaches everybody), else the snapshot', () => {
    const reg = buildRegistry([{ id: 'c1', name: 'Renamed' }]);
    assert.equal(factionName(reg, { factionId: 'c1', name: 'Old name' }), 'Renamed');
    assert.equal(factionName(reg, { factionId: 'gone', name: 'Deleted cult' }), 'Deleted cult'); // a removed faction is not lost
    assert.equal(factionName(reg, { faction: 'Free text' }), 'Free text');
    assert.equal(factionName(reg, {}), '');
});

test('earlier rows with free text are linked to the list when the name matches, otherwise they stay', () => {
    const reg = buildRegistry([]);
    const rows = linkRows([{ id: 'a', name: 'adeptus mechanicus', level: -1 }, { id: 'b', name: 'My own gang', level: 2 }, { id: 'c', factionId: 'inquisition', name: 'x', level: 0 }], reg);
    assert.equal(rows[0].factionId, 'adeptus-mechanicus');
    assert.equal(rows[0].level, -1);
    assert.equal(rows[1].factionId, undefined);
    assert.equal(rows[1].name, 'My own gang');
    assert.equal(rows[2].factionId, 'inquisition');
});

test('choice: a faction is offered once per character, the own one stays selectable', () => {
    const reg = buildRegistry([]);
    const rows = [{ factionId: 'inquisition' }, { factionId: 'administratum' }];
    const options = optionsFor(reg, rows, 'inquisition').map((f) => f.id);
    assert.ok(options.includes('inquisition'));
    assert.ok(!options.includes('administratum'));
    assert.ok(options.includes('imperial-navy'));
    assert.equal(findByName(reg, 'Administratum').id, 'administratum');
});
