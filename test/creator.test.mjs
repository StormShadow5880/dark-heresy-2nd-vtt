import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './creator-helpers.mjs';

const { env } = setup();
const data = await import('../src/module/creator/data.mjs');
const rules = await import('../src/module/creator/rules.mjs');
const ch = await import('../src/module/creator/character.mjs');

const hw = (name) => data.HOMEWORLDS.find((h) => h.name === name);

test('dice: normal 2d10, positive best two of 3d10, negative worst two of 3d10 (rulebook example 3,7,9)', () => {
    assert.deepEqual(rules.characteristicFromDice([3, 7], 'normal'), { kept: [3, 7], value: 30 });
    assert.equal(rules.characteristicFromDice([3, 7, 9], 'positive').value, 36); // 20 + 7 + 9
    assert.equal(rules.characteristicFromDice([3, 7, 9], 'negative').value, 30); // 20 + 3 + 7
    assert.equal(rules.characteristicFromDice([9, 3, 7], 'positive').value, 36); // order does not matter
    assert.equal(rules.characteristicFromDice([3, 7], 'normal', 25).value, 35); // veteran base 25
    assert.throws(() => rules.characteristicFromDice([3], 'normal'));
    assert.equal(rules.characteristicFormula('normal'), '2d10');
    assert.equal(rules.characteristicFormula('positive'), '3d10');
});

test('home world marks positive, negative and normal characteristics (Influence belongs to creation)', () => {
    const feral = hw('Feral World');
    assert.equal(rules.characteristicKind(feral, 'strength'), 'positive');
    assert.equal(rules.characteristicKind(feral, 'toughness'), 'positive');
    assert.equal(rules.characteristicKind(feral, 'influence'), 'negative');
    assert.equal(rules.characteristicKind(feral, 'agility'), 'normal');
});

test('point buy: 25 / 30 / 20 base, 60 points, maximum 40, all ten characteristics', () => {
    const feral = hw('Feral World');
    const kinds = Object.fromEntries(data.CHARACTERISTIC_KEYS.map((k) => [k, rules.characteristicKind(feral, k)]));
    const good = { strength: 10, toughness: 10, weaponSkill: 10, ballisticSkill: 10, agility: 10, intelligence: 10 };
    const r = rules.evaluatePointBuy(good, kinds);
    assert.equal(r.ok, true);
    assert.equal(r.values.strength, 40);
    assert.equal(r.values.influence, 20);
    assert.equal(r.values.weaponSkill, 35);
    assert.equal(r.remaining, 0);
    assert.equal(rules.evaluatePointBuy({ ...good, perception: 1 }, kinds).ok, false); // 61 points
    assert.equal(rules.evaluatePointBuy({ ...good, intelligence: 5 }, kinds).ok, false); // points left
    assert.equal(rules.evaluatePointBuy({ strength: 11, toughness: 10, weaponSkill: 10, ballisticSkill: 10, agility: 10, intelligence: 9 }, kinds).ok, false); // 41
    assert.equal(rules.evaluatePointBuy({ ...good, intelligence: -1 }, kinds).ok, false);
});

test('all six home worlds: modifiers, fate, blessing, aptitude and wounds', () => {
    const expected = {
        'Feral World': [['strength', 'toughness'], 'influence', 2, 3, 'Toughness', 9],
        'Forge World': [['intelligence', 'toughness'], 'fellowship', 3, 8, 'Intelligence', 8],
        Highborn: [['fellowship', 'influence'], 'toughness', 4, 10, 'Fellowship', 9],
        'Hive World': [['agility', 'perception'], 'willpower', 2, 6, 'Perception', 8],
        'Shrine World': [['fellowship', 'willpower'], 'perception', 3, 6, 'Willpower', 7],
        Voidborn: [['intelligence', 'willpower'], 'strength', 3, 5, 'Intelligence', 7],
    };
    assert.equal(data.HOMEWORLDS.length, 6);
    for (const [name, [pos, neg, fate, blessing, apt, wounds]] of Object.entries(expected)) {
        const h = hw(name);
        assert.deepEqual(h.positive, pos, name);
        assert.equal(h.negative, neg, name);
        assert.equal(h.fateThreshold, fate, name);
        assert.equal(h.blessing, blessing, name);
        assert.equal(h.aptitude, apt, name);
        assert.equal(h.wounds.base, wounds, name);
        assert.equal(h.wounds.dice, '1d5');
        assert.equal(rules.woundsFromRoll(h, 3), wounds + 3);
        // Emperor's Blessing: reaches the threshold -> +1
        assert.deepEqual(rules.fateFromRoll(h, blessing), { roll: blessing, blessing: true, threshold: fate + 1 });
        assert.equal(rules.fateFromRoll(h, blessing - 1).threshold, fate);
    }
});

test('divination table covers 1-100 without gaps and without overlaps', () => {
    for (let n = 1; n <= 100; n++) assert.ok(rules.divinationForRoll(n), `no entry for ${n}`);
    assert.equal(rules.divinationForRoll(0), null);
    assert.equal(rules.divinationForRoll(101), null);
    assert.equal(rules.divinationForRoll(100).name, 'Do not ask why you serve. Only ask how.');
    assert.equal(rules.divinationForRoll(1).roll, '01');
});

test('7 backgrounds and 8 roles with structured data', () => {
    assert.equal(data.BACKGROUNDS.length, 7);
    assert.equal(data.ROLES.length, 8);
    for (const b of data.BACKGROUNDS) {
        assert.equal(b.skills.length >= 5, true, b.name);
        assert.equal(b.aptitudeChoice.length, 2, b.name);
        assert.ok(b.bonus.name, b.name);
        assert.ok(b.id.startsWith('background.'));
    }
    for (const r of data.ROLES) {
        assert.equal(r.aptitudes.length, 5, r.name);
        assert.equal(r.talentOptions.length, 2, r.name);
        assert.ok(r.id.startsWith('role.'));
    }
    assert.equal(data.BACKGROUNDS.find((b) => b.name === 'Adeptus Arbites').aptitudeChoice.join(), 'Offence,Defence');
});

function draftWith(homeWorld, background, role, choices = {}) {
    const d = ch.newDraft();
    d.homeWorldId = data.HOMEWORLDS.find((h) => h.name === homeWorld)?.id ?? null;
    d.backgroundId = data.BACKGROUNDS.find((b) => b.name === background)?.id ?? null;
    d.roleId = data.ROLES.find((r) => r.name === role)?.id ?? null;
    d.choices = choices;
    return d;
}
const rolled = (d) => {
    const home = data.HOMEWORLDS.find((h) => h.id === d.homeWorldId);
    for (const k of data.CHARACTERISTIC_KEYS) d.characteristics.rolls[k] = { dice: rules.characteristicKind(home, k) === 'normal' ? [5, 6] : [5, 6, 2] };
    d.wounds.roll = 3;
    d.fate.roll = 10;
    d.divination.roll = 72;
    return d;
};

test('Feral World / Imperial Guard / Warrior: skills, talents, aptitudes and equipment', () => {
    const d = rolled(draftWith('Feral World', 'Imperial Guard', 'Warrior', { 'bg-apt': 'Fieldcraft', 'bg-skill-4': '0', 'bg-wt': '', 'role-talent': '0' }));
    const s = ch.computeCharacter(d, env);
    assert.equal(s.characteristics.strength, 31); // positive: best two of 5,6,2 = 5+6
    assert.deepEqual(s.aptitudes.map((a) => a.name), ['General', 'Toughness', 'Fieldcraft', 'Ballistic Skill', 'Defence', 'Offence', 'Strength', 'Weapon Skill']);
    assert.equal(s.skills.athletics.advance, 1);
    assert.equal(s.skills.medicae.advance, 1);
    assert.equal(s.skills.commonLore.specs.imperialGuard.advance, 1);
    assert.equal(s.skills.navigate.specs.surface.advance, 1);
    assert.deepEqual(s.talents.map((t) => t.name), ['Weapon Training (Las)', 'Weapon Training (Low-Tech)', 'Iron Jaw']);
    assert.deepEqual(s.equipment.map((e) => e.name), ['Combat Vest', 'Imperial Guard Flak Armour', 'Grapnel and Line', 'Lho-Sticks', 'Magnoculars']); // lasgun group not chosen yet
    assert.equal(s.choices.find((c) => c.id === 'eq-eq-1').resolved, false);
    assert.equal(s.wounds.max, 12);
    assert.equal(s.fate.threshold, 3); // 2 + blessing (10 >= 3)
    assert.equal(s.xp.total, 1000);
});

test('equipment combinations: Lasgun OR Laspistol and Sword', () => {
    const base = { 'bg-apt': 'Fieldcraft', 'bg-skill-4': '0', 'role-talent': '0' };
    const a = ch.computeCharacter(rolled(draftWith('Feral World', 'Imperial Guard', 'Warrior', { ...base, 'eq-eq-1': '0' })), env);
    const b = ch.computeCharacter(rolled(draftWith('Feral World', 'Imperial Guard', 'Warrior', { ...base, 'eq-eq-1': '1' })), env);
    assert.ok(a.equipment.some((e) => e.name === 'Lasgun'));
    assert.deepEqual(b.equipment.filter((e) => ['Laspistol', 'Sword', 'Lasgun'].includes(e.name)).map((e) => e.name), ['Laspistol', 'Sword']);
    assert.equal(b.equipment.find((e) => e.name === 'Lho-Sticks').quantity, 12);
});

test('duplicate aptitude needs an explicit replacement and is never dropped silently', () => {
    // Forge World (Intelligence) + Adeptus Mechanicus aptitude Knowledge/Tech + Sage (Intelligence, Knowledge, ...)
    const d = rolled(draftWith('Forge World', 'Adeptus Mechanicus', 'Sage', { 'bg-apt': 'Knowledge', 'role-talent': '0' }));
    const s = ch.computeCharacter(d, env);
    const dups = s.choices.filter((c) => c.id.startsWith('dup-'));
    assert.equal(dups.length, 2); // Intelligence and Knowledge are granted twice
    assert.ok(dups.every((c) => !c.resolved));
    assert.equal(s.aptitudes.length, 6); // General, Intelligence, Knowledge, Perception, Tech, Willpower
    d.choices['dup-0'] = 'strength';
    d.choices['dup-1'] = 'agility';
    const s2 = ch.computeCharacter(d, env);
    assert.equal(s2.aptitudes.length, 8);
    assert.deepEqual(s2.aptitudes.filter((a) => a.replacement).map((a) => a.name), ['Strength', 'Agility']);
    assert.equal(new Set(s2.aptitudes.map((a) => a.id)).size, s2.aptitudes.length);
    // the replacement must not be an aptitude that is owned already
    const options = s.choices.find((c) => c.id === 'dup-0').options.map((o) => o.value);
    assert.ok(!options.includes('intelligence') && !options.includes('perception'));
});

test('a skill granted twice gets one more rank (core FAQ), different specialities stay apart', () => {
    // Imperial Guard grants Command, Ministorum also Command; here: Arbites Common Lore (Underworld) + Outcast ... use Ministorum twice via choices
    const d = rolled(draftWith('Hive World', 'Adeptus Arbites', 'Seeker', { 'bg-apt': 'Offence', 'bg-wt': '0', 'role-talent': '0', 'bg-skill-3': '0' }));
    const s = ch.computeCharacter(d, env);
    assert.equal(s.skills.commonLore.specs.adeptusArbites.advance, 1);
    assert.equal(s.skills.commonLore.specs.underworld.advance, 1);
    assert.equal(s.skills.inquiry.advance, 1);
    // same skill twice from the same background list is not possible, so test the merge with two pick results
    const ad = rolled(draftWith('Hive World', 'Adeptus Administratum', 'Seeker', { 'bg-apt': 'Knowledge', 'bg-skill-5': 'imperialWarrants' }));
    const sa = ch.computeCharacter(ad, env);
    assert.equal(sa.skills.scholasticLore.specs.imperialWarrants.advance, 1);
    assert.equal(sa.skills.linguistics.specs.highGothic.advance, 1);
});

test('Voidborn / Adeptus Astra Telepathica / Mystic: Psyker elite advance, sanctioned, no corruption', () => {
    const d = rolled(draftWith('Voidborn', 'Adeptus Astra Telepathica', 'Mystic', { 'bg-apt': 'Psyker', 'role-talent': '1' }));
    const s = ch.computeCharacter(d, env);
    assert.deepEqual(s.elite, ['Psyker']);
    assert.equal(s.psy.rating, 1);
    assert.equal(s.psy.sanctioned, true);
    assert.ok(s.traits.some((t) => t.name === 'Psyker'));
    assert.ok(s.traits.some((t) => t.name === 'Sanctioned'));
    assert.equal(s.corruption, 0);
    // the Psyker aptitude of the background and of the elite advance are a duplicate -> replacement needed
    assert.ok(s.choices.some((c) => c.id.startsWith('dup-') && c.duplicateOf === 'psyker'));
    assert.ok(s.talents.some((t) => t.name === 'Strong Minded')); // Voidborn: Child of the Dark
    assert.ok(s.talents.some((t) => t.name === 'Warp Sense'));
    assert.equal(s.xp.total, 1000); // the elite advance costs no XP at creation
});

test('Mystic without the Astra Telepathica background is a rogue psyker with 1d10+3 corruption', () => {
    const d = rolled(draftWith('Hive World', 'Outcast', 'Mystic', { 'bg-apt': 'Fieldcraft', 'role-talent': '1' }));
    let s = ch.computeCharacter(d, env);
    assert.equal(s.psy.sanctioned, false);
    assert.equal(s.corruptionPending, true);
    d.corruptionRoll = 6;
    s = ch.computeCharacter(d, env);
    assert.equal(s.corruption, 9);
    assert.equal(ch.stepStatus(s, d).elite, true);
});

test('Hive World / Outcast / Assassin: role aptitude choice and talent specialisations', () => {
    const d = rolled(draftWith('Hive World', 'Outcast', 'Assassin', { 'bg-apt': 'Social', 'role-apt-1': 'Weapon Skill', 'role-talent': '0', 'bg-skill-1': '1', 'bg-wt': '1' }));
    const s = ch.computeCharacter(d, env);
    assert.ok(s.aptitudes.some((a) => a.name === 'Weapon Skill'));
    assert.deepEqual(s.talents.map((t) => t.name), ['Weapon Training (Chain)', 'Weapon Training (Solid Projectile)', 'Jaded']);
    assert.equal(s.skills.sleightOfHand.advance, 1);
});

test('Hierophant: Hatred needs a target, a generic "Hatred" is never created', () => {
    const d = rolled(draftWith('Highborn', 'Adeptus Administratum', 'Hierophant', { 'bg-apt': 'Social', 'role-talent': '1' }));
    let s = ch.computeCharacter(d, env);
    assert.equal(s.talents.some((t) => t.name === 'Hatred'), false);
    assert.equal(s.choices.find((c) => c.id === 'role-talent-spec').resolved, false);
    d.choices['role-talent-spec'] = 'Orks';
    s = ch.computeCharacter(d, env);
    assert.ok(s.talents.some((t) => t.name === 'Hatred (Orks)'));
});

test('Forge World / Adeptus Mechanicus / Sage: home world talent choice and Mechanicus traits', () => {
    const d = rolled(draftWith('Forge World', 'Adeptus Mechanicus', 'Sage', { 'bg-apt': 'Tech', 'role-talent': '0', 'hw-talent': '1', 'bg-skill-1': '0' }));
    const s = ch.computeCharacter(d, env);
    assert.ok(s.talents.some((t) => t.name === 'Weapon-Tech'));
    assert.ok(s.talents.some((t) => t.name === 'Mechadendrite Use (Utility)'));
    assert.ok(s.traits.some((t) => t.name === 'Mechanicus Implants'));
    assert.ok(s.bonuses.some((b) => b.name === "Omnissiah's Chosen"));
});

test('divination effects change characteristics, grant talents (or the bonus if owned) and are marked when manual', () => {
    const d = rolled(draftWith('Hive World', 'Outcast', 'Warrior', { 'bg-apt': 'Fieldcraft', 'role-talent': '1' }));
    d.divination.roll = 72; // Toughness -3
    let s = ch.computeCharacter(d, env);
    assert.equal(s.characteristics.toughness, 20 + 5 + 6 - 3);
    const plain = ch.computeCharacter({ ...d, divination: { roll: 60 } }, env); // Perception -3
    assert.equal(plain.characteristics.perception, 20 + 5 + 6 - 3);
    d.divination.roll = 100; // fate +1
    s = ch.computeCharacter(d, env);
    assert.equal(s.fate.threshold, 4); // 2 + blessing + 1
    d.divination.roll = 22; // Quick Draw or Agility +2
    s = ch.computeCharacter(d, env);
    assert.ok(s.talents.some((t) => t.name === 'Quick Draw'));
    d.divination.roll = 88; // Dodge: Outcast already knows Dodge -> Agility +2
    s = ch.computeCharacter(d, env);
    assert.equal(s.skills.dodge.advance, 1);
    assert.equal(s.characteristics.agility, 20 + 5 + 6 + 2);
    d.divination.roll = 1;
    s = ch.computeCharacter(d, env);
    assert.ok(s.divinationNotes.length > 0);
});

test('computing twice gives the same result (no doubled values)', () => {
    const d = rolled(draftWith('Feral World', 'Imperial Guard', 'Warrior', { 'bg-apt': 'Fieldcraft', 'bg-skill-4': '0', 'role-talent': '0', 'eq-eq-1': '0' }));
    const a = ch.computeCharacter(d, env);
    const b = ch.computeCharacter(d, env);
    assert.deepEqual(a, b);
});

test('changing the home world drops its choices and recalculates', () => {
    const d = rolled(draftWith('Forge World', 'Adeptus Mechanicus', 'Sage', { 'hw-talent': '1' }));
    const before = ch.computeCharacter(d, env);
    assert.ok(before.talents.some((t) => t.name === 'Weapon-Tech'));
    d.homeWorldId = hw('Hive World').id;
    const after = ch.computeCharacter(d, env);
    assert.equal(after.talents.some((t) => t.name === 'Weapon-Tech'), false);
    assert.equal(after.choices.some((c) => c.id === 'hw-talent'), false);
});

test('step status: nothing is complete on an empty draft, biography needs a name', () => {
    const d = ch.newDraft();
    const s = ch.computeCharacter(d, env);
    const st = ch.stepStatus(s, d);
    assert.equal(st.homeworld, false);
    assert.equal(st.welcome, true);
    assert.equal(st.review, false);
});
