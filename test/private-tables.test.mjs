import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './creator-helpers.mjs';

const { env } = setup();
const data = await import('../src/module/creator/data.mjs');
const rules = await import('../src/module/creator/rules.mjs');
const ch = await import('../src/module/creator/character.mjs');
const dr = await import('../src/module/creator/draft.mjs');
const fin = await import('../src/module/creator/finalize.mjs');
const { lookupRoll, tableEntries } = await import('../src/module/rules/private-tables.mjs');

function complete(homeWorld, background, role, e = env) {
    const d = ch.newDraft();
    dr.setHomeWorld(d, data.HOMEWORLDS.find((h) => h.name === homeWorld).id);
    dr.setBackground(d, data.BACKGROUNDS.find((b) => b.name === background).id);
    dr.setRole(d, data.ROLES.find((r) => r.name === role).id);
    const home = data.HOMEWORLDS.find((h) => h.name === homeWorld);
    for (const k of data.CHARACTERISTIC_KEYS) dr.setCharacteristicRoll(d, k, rules.characteristicKind(home, k) === 'normal' ? [6, 5] : [8, 5, 3]);
    d.wounds.roll = 2;
    d.fate.roll = 5;
    d.divination.roll = 50;
    d.corruptionRoll = 4;
    d.biography = { name: 'Test' };
    for (let i = 0; i < 40; i++) {
        const open = ch.computeCharacter(d, e).choices.filter((c) => c.required && !c.resolved);
        if (!open.length) break;
        for (const c of open) d.choices[c.id] = c.text ? 'Test' : c.options[0].value;
    }
    return d;
}

test('table entries: only valid data counts, roll lookup includes both bounds', () => {
    assert.equal(tableEntries({}, '8-15'), null);
    assert.equal(tableEntries({ privateTables: { '8-15': [] } }, '8-15'), null);
    assert.equal(tableEntries({ privateTables: { '8-15': [{ text: 'no name' }] } }, '8-15'), null);
    const e = [{ name: 'A', min: 5, max: 10 }, { name: 'B', min: 11, max: 20 }];
    assert.equal(lookupRoll(e, 5).name, 'A');
    assert.equal(lookupRoll(e, 11).name, 'B');
    assert.equal(lookupRoll(e, 4), null);
    assert.equal(lookupRoll(e, 'x'), null);
});

test('Exorcised without the table: one chosen malignancy stays open and visible, nothing is picked', () => {
    const d = complete('Daemon World', 'Exorcised', 'Seeker');
    const c = ch.computeCharacter(d, env).consequences.find((x) => x.table === undefined && /Malignancy/.test(x.label));
    assert.equal(c.status, 'table-open');
    assert.match(c.label, /CHOSEN/);
    assert.equal(c.formula, null, 'it is not a roll');
});

test('Exorcised with the table: exactly one choice, no automatic result, written to the notes', async () => {
    const e = { ...env, privateTables: { '8-15': [{ name: 'Test Malignancy A' }, { name: 'Test Malignancy B' }] } };
    const d = complete('Daemon World', 'Exorcised', 'Seeker', e);
    // the helper picked the first option for every open choice; clear it to see the open state
    const choiceId = ch.computeCharacter(d, e).choices.find((c) => c.id.startsWith('table-')).id;
    delete d.choices[choiceId];
    let s = ch.computeCharacter(d, e);
    assert.equal(s.consequences.find((c) => c.table === '8-15').status, 'open');
    assert.equal(s.choices.filter((c) => c.id.startsWith('table-')).length, 1);
    d.choices[choiceId] = '1';
    s = ch.computeCharacter(d, e);
    const c = s.consequences.find((x) => x.table === '8-15');
    assert.equal(c.status, 'resolved');
    assert.equal(c.result.total, 'Test Malignancy B');
    const { data: actor } = await fin.buildCharacterData(d, e, async () => null);
    assert.match(actor.system.bio.notes, /Test Malignancy B \(Table 8-15, chosen\)/);
});

test('Mutant roll with the table maps the stored 5d10 result; a gap stays open', () => {
    const e = { ...env, privateTables: { '8-16': [{ name: 'Mutation X', min: 5, max: 25 }] } };
    const d = complete('Hive World', 'Mutant', 'Seeker', e);
    const id = ch.computeCharacter(d, e).consequences.find((c) => c.table === '8-16').id;
    d.consequenceRolls = { [id]: { formula: '5d10', dice: [5, 5, 5, 5, 5], total: 25 } };
    assert.equal(ch.computeCharacter(d, e).consequences.find((c) => c.id === id).result.entry, 'Mutation X');
    d.consequenceRolls[id].total = 40;
    const c = ch.computeCharacter(d, e).consequences.find((x) => x.id === id);
    assert.notEqual(c.status, 'resolved');
    assert.match(c.blocked, /not covered/);
});
