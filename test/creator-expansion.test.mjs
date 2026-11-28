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

test('skills are shown with a readable name and the training with its bonus, not "rank 1"', async () => {
    const { trainingText, readableSkillName } = await import('../src/module/rules/skill-training.mjs');
    assert.equal(trainingText(1), 'Known (+0)');
    assert.equal(trainingText(2), 'Trained (+10)');
    assert.equal(trainingText(4), 'Veteran (+30)');
    assert.equal(trainingText(0), 'Unknown (-20)');
    assert.equal(readableSkillName('techUse', 'Tech Use'), 'Tech Use');
    assert.equal(readableSkillName('commonLore'), 'Common Lore');
    assert.equal(readableSkillName('acrobatics'), 'Acrobatics');
    // the labels of the actor template are what the wizard shows
    const { acolyteDefaults } = await import('./creator-helpers.mjs');
    const skills = acolyteDefaults().skills;
    assert.equal(skills.acrobatics.label, 'Acrobatics');
    assert.ok(skills.forbiddenLore.label.length > 0);
});

test('wounds: with the Imperium Maledictum rule nothing is rolled and the maximum is calculated; without it the roll is needed', async () => {
    const d = complete('Hive World', 'Outcast', 'Seeker');
    d.wounds.roll = null;
    // normal rule: the wounds roll is missing
    assert.equal(ch.computeCharacter(d, env).wounds, null);
    // IM rule: no roll needed, the step is complete without it
    const imEnv = { ...env, derivedWounds: true };
    const s = ch.computeCharacter(d, imEnv);
    assert.deepEqual(s.wounds, { derived: true, max: null, value: null, roll: null });
    assert.equal(ch.stepStatus(s, d).vitals, true);
    assert.equal(ch.stepBlockers ? ch.stepBlockers(s, d).vitals?.some((t) => /wounds/i.test(t)) ?? false : false, false);
    // finalize: max and value come from the characteristics (SB + 2 TB + WPB, tens digits), not from a roll
    const { data: actor } = await fin.buildCharacterData(d, imEnv, resolve);
    const c = actor.system.characteristics;
    const tens = (k) => Math.floor((c[k].base + c[k].advance * 5 + (c[k].modifier || 0)) / 10);
    const expected = tens('strength') + 2 * tens('toughness') + tens('willpower');
    assert.equal(actor.system.wounds.max, expected);
    assert.equal(actor.system.wounds.value, expected);
    assert.equal(actor.system.wounds.rolled, false);
    // the normal rule still uses the roll
    d.wounds.roll = 2;
    const normal = await fin.buildCharacterData(d, env, resolve);
    assert.equal(normal.data.system.wounds.rolled, true);
});

test('divination: the chosen characteristics change by the stated amount', () => {
    const d = complete('Hive World', 'Outcast', 'Seeker');
    d.divination.roll = 45; // "Increase Toughness or Willpower by 3, reduce Fellowship or Strength by 3"
    d.choices['div-inc'] = undefined;
    const base = ch.computeCharacter(complete('Hive World', 'Outcast', 'Seeker'), env).characteristics;
    const s0 = ch.computeCharacter(d, env);
    const open = s0.choices.filter((c) => c.id.startsWith('div-'));
    assert.equal(open.length, 2, 'two choices: which to increase and which to reduce');
    const inc = open.find((c) => /Increase/.test(c.label));
    const red = open.find((c) => /Reduce/.test(c.label));
    d.choices[inc.id] = 'toughness';
    d.choices[red.id] = 'fellowship';
    const after = ch.computeCharacter(d, env).characteristics;
    assert.equal(after.toughness, base.toughness + 3);
    assert.equal(after.fellowship, base.fellowship - 3);
    assert.equal(after.strength, base.strength, 'the other options stay');
    assert.equal(after.willpower, base.willpower);
});
