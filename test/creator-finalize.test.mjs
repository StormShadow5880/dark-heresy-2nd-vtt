import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './creator-helpers.mjs';

const { env } = setup();
const data = await import('../src/module/creator/data.mjs');
const rules = await import('../src/module/creator/rules.mjs');
const ch = await import('../src/module/creator/character.mjs');
const dr = await import('../src/module/creator/draft.mjs');
const fin = await import('../src/module/creator/finalize.mjs');

function guardDraft() {
    const d = ch.newDraft();
    dr.setHomeWorld(d, 'homeworld.feral-world');
    dr.setBackground(d, 'background.imperial-guard');
    dr.setRole(d, 'role.warrior');
    const home = data.HOMEWORLDS[0];
    for (const k of data.CHARACTERISTIC_KEYS) dr.setCharacteristicRoll(d, k, rules.characteristicKind(home, k) === 'normal' ? [5, 6] : [5, 6, 2]);
    Object.assign(d.choices, { 'bg-apt': 'Fieldcraft', 'bg-skill-4': '0', 'role-talent': '0', 'eq-eq-1': '0' });
    d.wounds.roll = 4;
    d.fate.roll = 1;
    d.divination.roll = 60;
    d.biography = { name: 'Aurelian Voss', gender: 'M', age: '30', appearance: 'Tall', personality: 'Stern', history: 'Born on a feral world' };
    return d;
}

// fake compendium: knows a few names only
const known = {
    'talent:iron jaw': { name: 'Iron Jaw', type: 'talent', img: 'x.png', system: { aptitudes: 'Toughness, Defence', tier: '1', cost: 0 } },
    'equipment:lasgun': { name: 'Lasgun', type: 'weapon', system: { class: 'Basic' } },
    'aptitude:general': { name: 'General', type: 'aptitude', system: {} },
};
const resolve = async (kind, name) => known[`${kind}:${fin.normalizeName(name)}`] ?? null;

function containsNaN(o) {
    if (typeof o === 'number') return Number.isNaN(o);
    if (o && typeof o === 'object') return Object.values(o).some(containsNaN);
    return false;
}

test('complete draft -> actor data: characteristics, wounds, fate, XP, items, no NaN', async () => {
    const d = guardDraft();
    const { data: actor, missing, state } = await fin.buildCharacterData(d, env, resolve);
    assert.equal(actor.name, 'Aurelian Voss');
    assert.equal(actor.type, 'acolyte');
    assert.equal(actor.system.characteristics.strength.base, 31);
    assert.equal(actor.system.characteristics.strength.advance, 0);
    assert.equal(actor.system.wounds.max, 13); // 9 + 4
    assert.equal(actor.system.wounds.value, 13);
    assert.equal(actor.system.fate.max, 2);
    assert.equal(actor.system.fate.value, 2);
    assert.equal(actor.system.experience.total, 1000);
    assert.equal(actor.system.experience.used, 0); // free start abilities cost nothing
    assert.equal(actor.system.bio.homeWorld, 'Feral World');
    assert.equal(actor.system.bio.role, 'Warrior');
    assert.equal(actor.system.bio.divination, state.divination.name);
    assert.equal(actor.system.skills.athletics.advance, 1);
    assert.equal(actor.system.skills.commonLore.specialities.imperialGuard.taken, true);
    assert.equal(actor.system.skills.commonLore.specialities.imperialGuard.advance, 1);
    const types = actor.items.reduce((m, i) => ({ ...m, [i.type]: (m[i.type] ?? 0) + 1 }), {});
    assert.equal(types.aptitude, 8);
    assert.equal(types.talent, 3);
    assert.ok(actor.items.filter((i) => i.type === 'talent').every((t) => t.system.cost === 0));
    assert.equal(containsNaN(actor), false);
    // items not in the (fake) compendium are listed, never invented silently
    assert.ok(missing.includes('Equipment: Magnoculars'));
    assert.ok(actor.items.some((i) => i.type === 'gear' && i.name === 'Lho-Sticks (×12)'));
    assert.ok(actor.items.some((i) => i.type === 'weapon' && i.name === 'Lasgun'));
    assert.equal(actor.flags['dark-heresy-2nd'].xpLog[0].cost, 1000);
    assert.equal(actor.flags['dark-heresy-2nd'].creator.aptitudes.length, 8);
});

test('XP purchases in the draft use the same cost function as advancement and are logged', async () => {
    const d = guardDraft();
    // aptitudes: General, Toughness, Fieldcraft, Ballistic Skill, Defence, Offence, Strength, Weapon Skill
    d.advances.push({ kind: 'char', key: 'ballisticSkill' }); // BS + Offence?? BS + Finesse: 1 match -> 250
    d.advances.push({ kind: 'skill', key: 'awareness' }); // Perception, Fieldcraft: 1 match -> 200
    const { data: actor, spent } = await fin.buildCharacterData(d, env, resolve);
    assert.equal(actor.system.characteristics.ballisticSkill.advance, 1);
    assert.equal(actor.system.characteristics.ballisticSkill.cost, 250);
    assert.equal(actor.system.skills.awareness.advance, 1);
    assert.equal(spent, 450);
    assert.equal(actor.system.experience.used, 450);
    const log = actor.flags['dark-heresy-2nd'].xpLog;
    assert.equal(log.length, 3); // starting XP + 2 purchases
    assert.equal(log.filter((e) => e.type === 'spend').reduce((s, e) => s + e.cost, 0), 450);
});

test('a purchased talent is a paid item, a free start talent is not', async () => {
    const d = guardDraft();
    d.advances.push({ kind: 'talent', key: 'Bodyguard', talent: { name: 'Bodyguard', aptitudes: 'Agility, Defence', tier: '1', prerequisites: '', img: 'b.png', system: { benefit: 'x' } } });
    const { data: actor } = await fin.buildCharacterData(d, env, resolve);
    const bodyguard = actor.items.find((i) => i.name === 'Bodyguard');
    assert.equal(bodyguard.system.cost, 300); // Defence matches: 1 of 2 -> tier 1 = 300
    assert.equal(actor.items.filter((i) => i.type === 'talent' && i.system.cost === 0).length, 3);
    assert.equal(actor.system.experience.used, 300);
});

test('not enough XP: the purchase is rejected and the draft is not applied', async () => {
    const d = guardDraft();
    for (let i = 0; i < 6; i++) d.advances.push({ kind: 'char', key: 'intelligence' }); // far more than 1000 XP
    await assert.rejects(fin.buildCharacterData(d, env, resolve), /no longer possible/);
    const failed = await dr.revalidateAdvances(d, env);
    assert.ok(failed.length > 0);
    const { spent } = await fin.buildCharacterData(d, env, resolve);
    assert.ok(spent <= 1000);
});

test('an incomplete draft cannot be finalized in guided mode', async () => {
    const d = guardDraft();
    delete d.choices['eq-eq-1'];
    await assert.rejects(fin.buildCharacterData(d, env, resolve), /not complete/);
    d.choices['eq-eq-1'] = '0';
    d.biography.name = '';
    await assert.rejects(fin.buildCharacterData(d, env, resolve), /Biography/);
});

test('changing the role re-prices and re-validates the purchases', async () => {
    const d = guardDraft();
    d.advances.push({ kind: 'char', key: 'weaponSkill' }); // Warrior has Weapon Skill + Offence aptitudes -> 100
    let { spent } = await fin.buildCharacterData(d, env, resolve);
    assert.equal(spent, 100);
    dr.setRole(d, 'role.sage');
    dr.pruneChoices(d, env);
    d.choices['role-talent'] = '0';
    ({ spent } = await fin.buildCharacterData(d, env, resolve).catch(() => ({ spent: null })));
    // Sage has neither aptitude: the price is higher now (Offence and Weapon Skill both missing: 500)
    const state = ch.computeCharacter(d, env);
    const { applied } = await ch.replayAdvances(state, d, env);
    assert.equal(applied[0].quote.cost > 100, true);
});

test('draft survives saving (JSON) and gives the identical character; recomputing adds nothing', () => {
    const d = guardDraft();
    const a = ch.computeCharacter(d, env);
    const restored = JSON.parse(JSON.stringify(d));
    assert.deepEqual(ch.computeCharacter(restored, env), a);
    assert.deepEqual(ch.computeCharacter(restored, env), a);
});

test('characteristic re-roll: only once, the second result is final, the first roll cannot be overwritten', () => {
    const d = ch.newDraft();
    dr.setHomeWorld(d, 'homeworld.feral-world');
    assert.equal(dr.setCharacteristicRoll(d, 'agility', [2, 3]), true);
    assert.equal(dr.setCharacteristicRoll(d, 'agility', [10, 10]), false);
    assert.equal(dr.rerollCharacteristic(d, 'agility', [1, 1]), true);
    assert.deepEqual(d.characteristics.rolls.agility.dice, [1, 1]);
    assert.deepEqual(d.characteristics.rolls.agility.previous, [2, 3]);
    assert.equal(dr.rerollCharacteristic(d, 'agility', [9, 9]), false);
    dr.setCharacteristicRoll(d, 'perception', [4, 4]);
    assert.equal(dr.rerollCharacteristic(d, 'perception', [9, 9]), false); // one re-roll for the whole generation
});

test('changing the home world keeps dice of unchanged characteristics and drops the others', () => {
    const d = ch.newDraft();
    dr.setHomeWorld(d, 'homeworld.feral-world');
    dr.setCharacteristicRoll(d, 'strength', [4, 5, 6]); // positive on Feral
    dr.setCharacteristicRoll(d, 'agility', [4, 5]); // normal
    dr.setHomeWorld(d, 'homeworld.hive-world'); // strength becomes normal, agility positive
    assert.equal(d.characteristics.rolls.strength, undefined);
    assert.equal(d.characteristics.rolls.agility, undefined);
    dr.setCharacteristicRoll(d, 'toughness', [4, 5]);
    dr.setHomeWorld(d, 'homeworld.voidborn'); // toughness normal on both
    assert.deepEqual(d.characteristics.rolls.toughness.dice, [4, 5]);
});

test('prune removes choices that no longer exist after the home world / background changed', () => {
    const d = guardDraft();
    d.choices['hw-talent'] = '1';
    d.choices['bg-skill-4'] = '1';
    dr.setBackground(d, 'background.outcast');
    dr.pruneChoices(d, env);
    assert.equal(d.choices['hw-talent'], undefined);
    assert.equal(d.choices['bg-skill-4'], undefined); // Outcast has no choice there
    assert.equal(d.choices['eq-eq-1'], '0'); // still a valid answer (Autopistol)
    assert.equal(d.choices['bg-apt'], 'Fieldcraft'); // Outcast offers Fieldcraft too
});

test('creation log stores the dice and the decisions', () => {
    const d = guardDraft();
    assert.ok(d.log.some((e) => /rolled 5, 6/.test(e.text)));
    assert.ok(d.log.some((e) => /Home World: Feral World/.test(e.text)));
});
