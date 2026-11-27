import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './creator-helpers.mjs';

const { env } = setup();
const data = await import('../src/module/creator/data.mjs');
const rules = await import('../src/module/creator/rules.mjs');
const ch = await import('../src/module/creator/character.mjs');
const dr = await import('../src/module/creator/draft.mjs');
const fin = await import('../src/module/creator/finalize.mjs');
const resolve = async () => null;

function complete(homeWorld, background, role) {
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
    d.biography = { name: `${role} ${background}` };
    for (let i = 0; i < 40; i++) {
        const open = ch.computeCharacter(d, env).choices.filter((c) => c.required && !c.resolved);
        if (!open.length) break;
        for (const c of open) d.choices[c.id] = c.text ? 'Test' : c.options[0].value;
    }
    return d;
}

test('fixed skills, talents and traits of an expansion home world are granted once', () => {
    const d = complete('Vouxis Prime', 'Outcast', 'Seeker');
    const s = ch.computeCharacter(d, env);
    assert.equal(s.skills.trade.specs.sculptor.advance, 2, 'Trade (Sculptor) rank 2');
    assert.ok(s.talents.some((t) => t.name.startsWith('Blind Fighting') && t.source === 'Vouxis Prime'));
    // the same draft computed again gives the same result (going back and forward grants nothing twice)
    const again = ch.computeCharacter(d, env);
    assert.deepEqual(again.skills.trade, s.skills.trade);
    assert.equal(again.talents.filter((t) => t.name.startsWith('Blind Fighting')).length, 1);
});

test('a skill granted by the home world and the background gets one more rank (existing rule)', () => {
    const d = complete("Snope's World", 'Adeptus Mechanicus', 'Seeker');
    const s = ch.computeCharacter(d, env);
    assert.equal(s.skills.scrutiny.advance, 1);
    const d2 = complete("Snope's World", 'Adeptus Arbites', 'Seeker'); // Arbites also grants Scrutiny
    assert.equal(ch.computeCharacter(d2, env).skills.scrutiny.advance, 2);
});

test('Penal Colony: skills and the Peer talent', () => {
    const s = ch.computeCharacter(complete('Penal Colony', 'Outcast', 'Seeker'), env);
    assert.equal(s.skills.commonLore.specs.underworld.advance >= 1, true);
    assert.ok(s.talents.some((t) => t.name === 'Peer (Criminal Cartels)'));
});

test('Agri-World grants the trait Brutal Charge at level 2', () => {
    const s = ch.computeCharacter(complete('Agri-World', 'Outcast', 'Seeker'), env);
    assert.deepEqual(s.traits.find((t) => t.name === 'Brutal Charge'), { name: 'Brutal Charge', level: 2, source: 'Agri-World' });
});

test('a roll of the origin is open until it is rolled, then stored and applied once', () => {
    const d = complete('Daemon World', 'Outcast', 'Seeker');
    let s = ch.computeCharacter(d, env);
    const cq = s.consequences.find((c) => c.source === 'Daemon World' && c.id.endsWith(':corruption'));
    assert.equal(cq.status, 'open');
    assert.equal(s.corruption, 0);
    d.consequenceRolls = { [cq.id]: { formula: '1d10+5', dice: [4], total: 9 } };
    s = ch.computeCharacter(d, env);
    assert.equal(s.corruption, 9);
    assert.equal(s.consequences.find((c) => c.id === cq.id).status, 'resolved');
    assert.equal(ch.computeCharacter(d, env).corruption, 9, 'computing again does not add it twice');
});

test('Mutant: fixed Corruption 10; the mutation roll is shown as open because the table is missing', () => {
    const s = ch.computeCharacter(complete('Hive World', 'Mutant', 'Seeker'), env);
    assert.equal(s.corruption, 10);
    const mutation = s.consequences.find((c) => c.id.endsWith(':mutation'));
    assert.equal(mutation.status, 'blocked');
    assert.match(mutation.blocked, /table/);
    assert.ok(s.consequences.some((c) => c.status === 'manual'));
});

test('open consequences are written to the character (flags and notes), a rolled one is not', async () => {
    const d = complete('Daemon World', 'Exorcised', 'Seeker');
    d.biography = { name: 'Test' };
    const { data: actor } = await fin.buildCharacterData(d, env, resolve);
    const notes = actor.system.bio.notes;
    assert.match(notes, /Open rules from the character creation/);
    assert.match(notes, /Malignancy/);
    assert.ok(actor.flags['dark-heresy-2nd'].creator.consequences.length >= 2);
    assert.ok(actor.flags['dark-heresy-2nd'].creator.consequences.every((c) => c.status !== 'resolved'));
});

test('an old draft without stored consequence rolls still opens', () => {
    const d = complete('Hive World', 'Outcast', 'Seeker');
    delete d.consequenceRolls;
    assert.doesNotThrow(() => ch.computeCharacter(d, env));
});
