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

const MUTANT_TRAITS = [
    ['Amphibious', undefined],
    ['Dark-sight', undefined],
    ['Natural Weapons', undefined],
    ['Sonar Sense', undefined],
    ['Sturdy', undefined],
    ['Toxic', 1],
    ['Unnatural Agility', 1],
    ['Unnatural Strength', 1],
    ['Unnatural Toughness', 1],
];

function mutantDraft(index) {
    const d = complete('Hive World', 'Mutant', 'Seeker');
    d.choices['bg-mutant-trait'] = String(index);
    return d;
}

test('Mutant: the player chooses exactly ONE starting trait; every option gives that trait with its parameter', () => {
    const open = complete('Hive World', 'Mutant', 'Seeker');
    delete open.choices['bg-mutant-trait'];
    const s0 = ch.computeCharacter(open, env);
    const choice = s0.choices.find((c) => c.id === 'bg-mutant-trait');
    assert.equal(choice.required, true);
    assert.equal(choice.resolved, false);
    assert.deepEqual(choice.options.map((o) => o.label), ['Amphibious', 'Dark-sight', 'Natural Weapons', 'Sonar Sense', 'Sturdy', 'Toxic (1)', 'Unnatural Agility (1)', 'Unnatural Strength (1)', 'Unnatural Toughness (1)']);
    assert.equal(s0.traits.filter((t) => t.source === 'Mutant').length, 0, 'nothing is given before the choice');
    assert.equal(ch.stepStatus(s0, open).skills, false, 'the step is not complete without the choice');
    MUTANT_TRAITS.forEach(([name, level], i) => {
        const s = ch.computeCharacter(mutantDraft(i), env);
        const mine = s.traits.filter((t) => t.source === 'Mutant');
        assert.equal(mine.length, 1, `${name}: exactly one`);
        assert.equal(mine[0].name, name);
        assert.equal(mine[0].level, level, `${name}: parameter`);
    });
});

test('Mutant: going back and forward gives the trait once; changing the choice replaces it', () => {
    const d = mutantDraft(5);
    for (let i = 0; i < 4; i++) assert.equal(ch.computeCharacter(d, env).traits.filter((t) => t.name === 'Toxic').length, 1);
    d.choices['bg-mutant-trait'] = '0';
    const s = ch.computeCharacter(d, env);
    assert.deepEqual(s.traits.filter((t) => t.source === 'Mutant').map((t) => t.name), ['Amphibious']);
});

test('changing the background leaves no orphan trait and no stored choice of the Mutant', async () => {
    const d = mutantDraft(7); // Unnatural Strength (1)
    assert.ok(ch.computeCharacter(d, env).traits.some((t) => t.name === 'Unnatural Strength'));
    dr.setBackground(d, data.BACKGROUNDS.find((b) => b.name === 'Outcast').id);
    await dr.pruneChoices(d, env);
    const s = ch.computeCharacter(d, env);
    assert.equal(s.traits.some((t) => t.source === 'Mutant'), false);
    assert.equal('bg-mutant-trait' in d.choices, false, 'the stored choice is dropped');
    assert.equal(s.corruption, 0, 'the 10 Corruption of the Mutant goes with the background');
    assert.equal(s.consequences.some((c) => c.source === 'Mutant'), false);
    // and the final character has no trace of the Mutant
    for (let i = 0; i < 10; i++) {
        const open = ch.computeCharacter(d, env).choices.filter((c) => c.required && !c.resolved);
        if (!open.length) break;
        for (const c of open) d.choices[c.id] = c.text ? 'Test' : c.options[0].value;
    }
    d.biography = { name: 'Test' };
    const { data: actor } = await fin.buildCharacterData(d, env, resolve);
    assert.equal(actor.items.some((i) => i.type === 'trait' && /Unnatural Strength/.test(i.name)), false);
    assert.equal(actor.system.characteristics.strength.unnatural, 0);
});

test('Mutant: starting mutation 5d10 is saved and stays open (no table entry invented); Corruption 10; Twisted Flesh stays a separate ability', () => {
    const d = mutantDraft(0);
    let s = ch.computeCharacter(d, env);
    assert.equal(s.corruption, 10);
    const m = s.consequences.find((c) => c.id.endsWith(':mutation'));
    assert.equal(m.status, 'open');
    assert.equal(m.formula, '5d10');
    assert.match(m.blocked, /Table 8-16/);
    d.consequenceRolls = { [m.id]: { formula: '5d10', dice: [3, 8, 2, 9, 5], total: 27 } };
    s = ch.computeCharacter(d, env);
    const m2 = s.consequences.find((c) => c.id === m.id);
    assert.equal(m2.status, 'table-open', 'rolled but the concrete mutation is still open');
    assert.equal(m2.result.total, 27);
    assert.equal(s.corruption, 10, 'the roll is not corruption');
    assert.ok(s.bonuses.some((b) => b.name === 'Twisted Flesh'), 'Twisted Flesh is the background ability, not the trait choice');
    assert.equal(s.traits.some((t) => t.name === 'Twisted Flesh'), false);
});

test('Mutant at the end: one trait item with its level, once, even when finalizing twice; the open mutation is written to the character', async () => {
    const d = mutantDraft(5); // Toxic (1)
    const ids = ch.computeCharacter(d, env).consequences.find((c) => c.id.endsWith(':mutation')).id;
    d.consequenceRolls = { [ids]: { formula: '5d10', dice: [3, 8, 2, 9, 5], total: 27 } };
    d.biography = { name: 'Test' };
    for (let k = 0; k < 2; k++) {
        const { data: actor } = await fin.buildCharacterData(d, env, resolve);
        const traits = actor.items.filter((i) => i.type === 'trait' && i.name === 'Toxic');
        assert.equal(traits.length, 1);
        assert.equal(traits[0].system.level, 1);
        assert.equal(actor.system.corruption, 10);
        assert.match(actor.system.bio.notes, /rolled 5d10 = 27/);
        assert.match(actor.system.bio.notes, /Table 8-16/);
    }
});

test('Unnatural traits also set the unnatural bonus of the characteristic (level 1); other traits change no characteristic', async () => {
    const base = (await fin.buildCharacterData(Object.assign(mutantDraft(0), { biography: { name: 'T' } }), env, resolve)).data.system.characteristics;
    for (const [i, key] of [[6, 'agility'], [7, 'strength'], [8, 'toughness']]) {
        const d = mutantDraft(i);
        d.biography = { name: 'T' };
        const c = (await fin.buildCharacterData(d, env, resolve)).data.system.characteristics;
        assert.equal(c[key].unnatural, (base[key].unnatural || 0) + 1, key);
        for (const other of Object.keys(c)) if (other !== key) assert.equal(c[other].unnatural, base[other].unnatural, `${other} unchanged`);
    }
});

test('Pellenne: exactly one of Hatred (Mutants) or Dark-sight is given, once; changing the home world takes it back', async () => {
    const pell = data.HOMEWORLDS.find((h) => h.name === 'Pellenne');
    const d = complete('Pellenne', 'Outcast', 'Seeker');
    // the wizard answers with the first option: Hatred (Mutants)
    let s = ch.computeCharacter(d, env);
    const c = s.choices.find((x) => x.id === 'hw-hatred-darksight');
    assert.deepEqual(c.options.map((o) => o.label), ['Hatred (Mutants)', 'Dark-sight']);
    assert.ok(s.talents.some((t) => t.name === 'Hatred (Mutants)' && t.source === 'Pellenne'));
    assert.equal(s.traits.some((t) => t.name === 'Dark-sight'), false);
    // going back and forward: still one
    for (let i = 0; i < 3; i++) assert.equal(ch.computeCharacter(d, env).talents.filter((t) => t.name === 'Hatred (Mutants)').length, 1);
    // the other option replaces it
    d.choices['hw-hatred-darksight'] = '1';
    s = ch.computeCharacter(d, env);
    assert.ok(s.traits.some((t) => t.name === 'Dark-sight' && t.source === 'Pellenne'));
    assert.equal(s.talents.some((t) => t.name === 'Hatred (Mutants)'), false);
    // nothing is given before the choice
    delete d.choices['hw-hatred-darksight'];
    s = ch.computeCharacter(d, env);
    assert.equal(s.traits.some((t) => t.name === 'Dark-sight'), false);
    assert.equal(s.talents.some((t) => /Hatred/.test(t.name)), false);
    // the other fixed grants stay (Resistance (Radiation), Trade (Prospector))
    assert.ok(s.talents.some((t) => t.name === 'Resistance (Radiation)'));
    // change of the home world: no orphan of the Pellenne choice
    d.choices['hw-hatred-darksight'] = '1';
    dr.setHomeWorld(d, pell.id);
    dr.setHomeWorld(d, data.HOMEWORLDS.find((h) => h.name === 'Hive World').id);
    await dr.pruneChoices(d, env);
    assert.equal('hw-hatred-darksight' in d.choices, false);
    s = ch.computeCharacter(d, env);
    assert.equal(s.traits.some((t) => t.name === 'Dark-sight'), false);
    assert.equal(s.talents.some((t) => t.source === 'Pellenne'), false);
});

test('Pellenne at the end: one item, an existing item of the same name is not removed', async () => {
    const d = complete('Pellenne', 'Outcast', 'Seeker');
    d.choices['hw-hatred-darksight'] = '1';
    d.biography = { name: 'T' };
    const { data: actor } = await fin.buildCharacterData(d, env, resolve);
    assert.equal(actor.items.filter((i) => i.type === 'trait' && i.name === 'Dark-sight').length, 1);
    assert.equal(actor.items.some((i) => i.type === 'talent' && /Hatred/.test(i.name)), false);
});

test('Kul: free Forbidden Lore ranks = half the Intelligence Bonus (round down), never lowered, never added, capped with a hint', async () => {
    const { kulLoreRanks, applyKulLoreRanks, characteristicBonus } = await import('../src/module/rules/origin-grants.mjs');
    assert.deepEqual([0, 1, 2, 3, 4, 5, 8, 9, 10, 11].map((b) => kulLoreRanks(b).ranks), [0, 0, 1, 1, 2, 2, 4, 4, 4, 4]);
    assert.equal(kulLoreRanks(10).capped, true);
    assert.equal(kulLoreRanks(10).wanted, 5);
    assert.equal(kulLoreRanks(8).capped, false);
    assert.equal(characteristicBonus({ base: 43, advance: 2, modifier: 0, unnatural: 1 }), 6, 'tens digit of 53 plus unnatural 1');
    const skills = () => ({ forbiddenLore: { specialities: { theWarp: { advance: 0, taken: false }, daemonology: { advance: 3, taken: true } } } });
    const s = skills();
    const r = applyKulLoreRanks(s, 6); // 3 ranks
    assert.equal(s.forbiddenLore.specialities.theWarp.advance, 3);
    assert.equal(s.forbiddenLore.specialities.theWarp.taken, true);
    assert.equal(s.forbiddenLore.specialities.daemonology.advance, 3, 'already as high: unchanged');
    assert.deepEqual(r.changes.map((c) => c.key), ['theWarp']);
    // applying again changes nothing (once)
    assert.deepEqual(applyKulLoreRanks(s, 6).changes, []);
    // already higher is never lowered
    const high = { forbiddenLore: { specialities: { theWarp: { advance: 4, taken: true }, daemonology: { advance: 4, taken: true } } } };
    applyKulLoreRanks(high, 4);
    assert.equal(high.forbiddenLore.specialities.theWarp.advance, 4);
});

test('Kul at the end: the grant is written once from the final Intelligence and noted; a later Intelligence change grants nothing', async () => {
    const d = complete('Kul', 'Outcast', 'Seeker');
    d.biography = { name: 'T' };
    const { data: actor } = await fin.buildCharacterData(d, env, resolve);
    const { characteristicBonus } = await import('../src/module/rules/origin-grants.mjs');
    const ib = characteristicBonus(actor.system.characteristics.intelligence);
    const ranks = Math.min(4, Math.floor(ib / 2));
    const lore = actor.system.skills.forbiddenLore.specialities;
    assert.equal(lore.theWarp.advance >= ranks, true);
    assert.equal(lore.daemonology.advance >= ranks, true);
    assert.match(actor.system.bio.notes, /Kul: Forbidden Lore ranks/);
    const entry = actor.flags['dark-heresy-2nd'].creator.consequences.find((c) => c.id.endsWith(':lore-ranks'));
    assert.equal(entry.status, 'resolved');
    // the result is stored, not recalculated: the stored consequence does not change with the characteristic
    assert.equal(entry.result.total, ranks);
});
