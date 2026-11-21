import test from 'node:test';
import assert from 'node:assert/strict';
import { installFoundryStubs, makeActor } from './helpers.mjs';

const notes = installFoundryStubs();
const adv = await import('../src/module/rules/advancement.mjs');
const data = await import('../src/module/rules/advancement-data.mjs');
const { purchaseAdvancement } = await import('../src/module/rules/experience.mjs');

test.beforeEach(() => {
    notes.warnings.length = 0;
});

test('aptitude names become stable ids, spelling variants and case do not matter', () => {
    assert.equal(adv.aptitudeId('Weapon Skill'), 'weaponSkill');
    assert.equal(adv.aptitudeId('ballistic skill'), 'ballisticSkill');
    assert.equal(adv.aptitudeId('Defense'), 'defence');
    assert.equal(adv.aptitudeId('Defence'), 'defence');
    assert.equal(adv.aptitudeId('Nonsense'), null);
});

test('requirements: alternatives with "/" and duplicates', () => {
    assert.deepEqual(adv.parseRequirement('Weapon Skill/Ballistic Skill, Finesse'), [['weaponSkill', 'ballisticSkill'], ['finesse']]);
    assert.deepEqual(adv.parseRequirement('Weapon Skill /Ballistic Skill, Offence'), [['weaponSkill', 'ballisticSkill'], ['offence']]);
    assert.equal(adv.parseRequirement('Finesse, Finesse').length, 1);
});

test('matching aptitudes: 0, 1 and 2, duplicates give no extra advantage', () => {
    const owned = (...names) => adv.ownedAptitudes(makeActor({ aptitudes: names }));
    assert.equal(adv.matchAptitudes(['ballisticSkill', 'finesse'], owned()).matches, 0);
    assert.equal(adv.matchAptitudes(['ballisticSkill', 'finesse'], owned('Finesse')).matches, 1);
    assert.equal(adv.matchAptitudes(['ballisticSkill', 'finesse'], owned('Finesse', 'Ballistic Skill')).matches, 2);
    // duplicate items of the same aptitude count once
    assert.equal(adv.matchAptitudes(['ballisticSkill', 'finesse'], owned('Finesse', 'finesse', 'FINESSE')).matches, 1);
    // a requirement that names the same aptitude twice cannot give 2
    assert.equal(adv.matchAptitudes(['finesse', 'finesse'], owned('Finesse')).matches, 1);
});

test('General is implicit for every character', () => {
    const q = adv.skillQuote(makeActor(), 'awareness');
    assert.equal(adv.skillQuote(makeActor({ aptitudes: [] }), 'awareness').matches, 0);
    assert.ok(adv.ownedAptitudes(makeActor()).has('general'));
    assert.equal(q.required.length, 2);
});

test('characteristic costs: every level and every number of matches', () => {
    const rows = { 2: [100, 250, 500, 750, 1250], 1: [250, 500, 750, 1000, 1500], 0: [500, 750, 1000, 1500, 2500] };
    for (const matches of [0, 1, 2]) {
        const aptitudes = ['Ballistic Skill', 'Finesse'].slice(0, matches);
        for (let level = 0; level < 5; level++) {
            const actor = makeActor({ charAdvance: level, aptitudes });
            const q = adv.characteristicQuote(actor, 'ballisticSkill');
            assert.equal(q.matches, matches);
            assert.equal(q.cost, rows[matches][level], `matches ${matches}, level ${level}`);
        }
    }
});

test('skill costs: every level and every number of matches', () => {
    const rows = { 2: [100, 200, 300, 400], 1: [200, 400, 600, 800], 0: [300, 600, 900, 1200] };
    for (const matches of [0, 1, 2]) {
        const aptitudes = ['Perception', 'Fieldcraft'].slice(0, matches);
        for (let level = 0; level < 4; level++) {
            const q = adv.skillQuote(makeActor({ skillAdvance: level, aptitudes }), 'awareness');
            assert.equal(q.cost, rows[matches][level], `matches ${matches}, level ${level}`);
        }
    }
});

test('talent costs per tier', () => {
    const rows = { 2: [200, 300, 400], 1: [300, 450, 600], 0: [600, 900, 1200] };
    for (const matches of [0, 1, 2]) {
        const aptitudes = ['Agility', 'Defence'].slice(0, matches);
        for (const tier of [1, 2, 3]) {
            const q = adv.talentQuote(makeActor({ aptitudes }), { name: 'Bodyguard', aptitudes: 'Agility, Defence', tier: String(tier) });
            assert.equal(q.cost, rows[matches][tier - 1]);
        }
    }
});

test('aptitude changes are picked up immediately (computed from the actor each time)', () => {
    const actor = makeActor({ aptitudes: ['Finesse'] });
    assert.equal(adv.characteristicQuote(actor, 'ballisticSkill').cost, 250);
    actor.items.push({ type: 'aptitude', name: 'Ballistic Skill' });
    assert.equal(adv.characteristicQuote(actor, 'ballisticSkill').cost, 100);
    actor.items = actor.items.filter((i) => i.name !== 'Finesse' && i.name !== 'Ballistic Skill');
    assert.equal(adv.characteristicQuote(actor, 'ballisticSkill').cost, 500);
});

test('maximum levels can not be bought', async () => {
    const maxChar = makeActor({ charAdvance: 5 });
    const q = adv.characteristicQuote(maxChar, 'strength');
    assert.equal(q.maxed, true);
    assert.equal(q.toName, 'Maximum');
    assert.equal(adv.checkPurchase(maxChar, q).ok, false);
    assert.equal((await purchaseAdvancement(maxChar, { kind: 'char', key: 'strength' })).ok, false);
    assert.equal(maxChar.updates.length, 0);
    const maxSkill = makeActor({ skillAdvance: 4 });
    assert.equal(adv.skillQuote(maxSkill, 'awareness').maxed, true);
});

test('Influence cannot be advanced', () => {
    const q = adv.characteristicQuote(makeActor(), 'influence');
    assert.equal(q.advanceable, false);
});

test('specialist skills: only the chosen speciality changes', async () => {
    const actor = makeActor({ total: 5000, aptitudes: ['Intelligence', 'Knowledge'] });
    const q = adv.skillQuote(actor, 'commonLore', 'imperium');
    assert.equal(q.fromName, 'Known');
    assert.equal(q.toName, 'Trained');
    assert.equal(q.cost, 200); // 2 matches, level 2
    assert.equal(adv.skillQuote(actor, 'commonLore').advanceable, false); // choose a speciality
    assert.equal(adv.skillQuote(actor, 'commonLore', 'tech').advanceable, false); // not taken
    const result = await purchaseAdvancement(actor, { kind: 'spec', key: 'commonLore.imperium' });
    assert.equal(result.ok, true);
    assert.equal(actor.skills.commonLore.specialities.imperium.advance, 2);
    assert.equal(actor.skills.commonLore.specialities.tech.advance, 0);
    assert.equal(actor.skills.commonLore.specialities.imperium.cost, 200);
});

test('purchase: advance, spent XP and log are written in ONE update', async () => {
    const actor = makeActor({ total: 1000, used: 100, aptitudes: ['Ballistic Skill'] });
    const result = await purchaseAdvancement(actor, { kind: 'char', key: 'ballisticSkill' });
    assert.equal(result.ok, true);
    assert.equal(actor.updates.length, 1);
    assert.equal(actor.characteristics.ballisticSkill.advance, 1);
    assert.equal(actor.characteristics.ballisticSkill.cost, 250);
    assert.equal(actor.system.experience.used, 350);
    const entry = actor.flags.xpLog[0];
    assert.equal(entry.cost, 250);
    assert.equal(entry.user, 'Tester');
    assert.ok(entry.timestamp > 0);
    assert.match(entry.label, /None → Simple/);
});

test('purchase fails without enough XP and changes nothing', async () => {
    const actor = makeActor({ total: 100, used: 0, aptitudes: [] });
    const result = await purchaseAdvancement(actor, { kind: 'char', key: 'strength' });
    assert.equal(result.ok, false);
    assert.equal(actor.updates.length, 0);
    assert.equal(actor.characteristics.strength.advance, 0);
    assert.match(notes.warnings.join(' '), /Not enough EP/);
});

test('available XP never goes negative, repeated purchases are priced one level at a time', async () => {
    const actor = makeActor({ total: 700, used: 0, aptitudes: ['Strength', 'Offence'] });
    assert.equal((await purchaseAdvancement(actor, { kind: 'char', key: 'strength' })).ok, true); // 100
    assert.equal((await purchaseAdvancement(actor, { kind: 'char', key: 'strength' })).ok, true); // 250
    assert.equal(actor.system.experience.used, 350);
    assert.equal((await purchaseAdvancement(actor, { kind: 'char', key: 'strength' })).ok, false); // 500 needed, 350 left
    assert.equal(actor.characteristics.strength.advance, 2);
    assert.ok(actor.system.experience.total - actor.system.experience.used >= 0);
});

test('a second purchase attempt at the same moment is refused', async () => {
    const actor = makeActor({ total: 5000, aptitudes: [] });
    const [a, b] = await Promise.all([
        purchaseAdvancement(actor, { kind: 'char', key: 'strength' }),
        purchaseAdvancement(actor, { kind: 'char', key: 'strength' }),
    ]);
    assert.equal([a, b].filter((r) => r.ok).length, 1);
    assert.equal(actor.characteristics.strength.advance, 1);
});

test('a failed update leaves the actor unchanged (talent is removed again)', async () => {
    const actor = makeActor({ total: 5000, aptitudes: ['Agility', 'Defence'] });
    actor.failNextUpdate = true;
    const talent = { name: 'Bodyguard', aptitudes: 'Agility, Defence', tier: '1', prerequisites: '' };
    const result = await purchaseAdvancement(actor, { kind: 'talent', key: 'Bodyguard', talent });
    assert.equal(result.ok, false);
    assert.equal(actor.items.filter((i) => i.type === 'talent').length, 0);
    assert.equal(actor.system.experience.used, 0);
});

test('talents: purchase creates the item with its price, duplicates are blocked', async () => {
    const actor = makeActor({ total: 5000, aptitudes: ['Agility'] });
    const talent = { name: 'Bodyguard', aptitudes: 'Agility, Defence', tier: '1', prerequisites: '' };
    const first = await purchaseAdvancement(actor, { kind: 'talent', key: 'Bodyguard', talent });
    assert.equal(first.ok, true);
    const item = actor.items.find((i) => i.type === 'talent');
    assert.equal(item.system.cost, 300); // 1 match, tier 1
    assert.equal(actor.system.experience.used, 300);
    const again = await purchaseAdvancement(actor, { kind: 'talent', key: 'Bodyguard', talent });
    assert.equal(again.ok, false);
    assert.equal(actor.items.filter((i) => i.type === 'talent').length, 1);
});

test('multiple talents need a choice and can be bought for different choices', async () => {
    const actor = makeActor({ total: 5000, aptitudes: ['General', 'Finesse'] });
    const talent = { name: 'Weapon Training', aptitudes: 'General, Finesse', tier: '1', prerequisites: '' };
    assert.equal((await purchaseAdvancement(actor, { kind: 'talent', key: 'Weapon Training', talent })).ok, false); // no choice
    assert.equal((await purchaseAdvancement(actor, { kind: 'talent', key: 'Weapon Training', talent, choice: 'Las' })).ok, true);
    assert.equal((await purchaseAdvancement(actor, { kind: 'talent', key: 'Weapon Training', talent, choice: 'Las' })).ok, false); // same choice
    assert.equal((await purchaseAdvancement(actor, { kind: 'talent', key: 'Weapon Training', talent, choice: 'Bolt' })).ok, true);
    assert.deepEqual(actor.items.filter((i) => i.type === 'talent').map((i) => i.name), ['Weapon Training (Las)', 'Weapon Training (Bolt)']);
});

test('prerequisites are shown and must be confirmed before buying', async () => {
    const actor = makeActor({ total: 5000 });
    const talent = { name: 'Marksman', aptitudes: 'Ballistic Skill, Finesse', tier: '2', prerequisites: 'BS 35' };
    const refused = await purchaseAdvancement(actor, { kind: 'talent', key: 'Marksman', talent });
    assert.equal(refused.ok, false);
    assert.match(refused.errors[0], /prerequisites/i);
    assert.equal(actor.updates.length, 0);
    const ok = await purchaseAdvancement(actor, { kind: 'talent', key: 'Marksman', talent, prerequisitesConfirmed: true });
    assert.equal(ok.ok, true);
});

test('a talent without a valid tier or aptitudes cannot be priced', () => {
    const actor = makeActor();
    assert.equal(adv.talentQuote(actor, { name: 'X', aptitudes: 'Finesse, Offence', tier: '0' }).advanceable, false);
    assert.equal(adv.talentQuote(actor, { name: 'X', aptitudes: '', tier: '1' }).advanceable, false);
});

test('tables in the data module are complete', () => {
    for (const m of [0, 1, 2]) {
        assert.equal(data.CHARACTERISTIC_COSTS[m].length, 5);
        assert.equal(data.SKILL_COSTS[m].length, 4);
        assert.equal(data.TALENT_COSTS[m].length, 3);
    }
    assert.equal(Object.keys(data.SKILL_APTITUDES).length, 28);
    assert.equal(Object.keys(data.CHARACTERISTIC_APTITUDES).length, 9);
});

test('XP sums never produce NaN, also with missing values', async () => {
    const { num } = adv;
    assert.equal(num(undefined), 0);
    assert.equal(num('12'), 12);
    assert.equal(num('abc'), 0);
    assert.equal(num(NaN), 0);
});

test('spent XP sums: no NaN with missing psy cost, text values or items without cost', () => {
    const sums = adv.sumSpentXp(
        {
            characteristics: { a: { cost: 250 }, b: { cost: '100' }, c: {} },
            skills: { s1: { cost: 100 }, s2: { isSpecialist: true, specialities: { x: { cost: 200 }, y: {} } } },
            psy: {},
        },
        [
            { type: 'talent', system: { cost: 300 } },
            { type: 'talent', system: {} },
            { type: 'psychicPower', system: { cost: '400' } },
            { type: 'psychicPower' },
            { type: 'weapon', system: { cost: 99 } },
        ],
    );
    assert.deepEqual(sums, { spentCharacteristics: 350, spentSkills: 300, spentTalents: 300, spentPsychicPowers: 400, calculatedTotal: 1350 });
});

test('aptitudes are fixed after creation: only a GM may edit a character that was not made with the wizard', async () => {
    const { aptitudesLocked, isCreatorGranted } = await import('../src/module/rules/aptitude-lock.mjs');
    const actor = (creator) => ({ getFlag: (scope, key) => (key === 'creator' ? creator : undefined) });
    game.user.isGM = false;
    assert.equal(aptitudesLocked(actor(undefined)), true);
    game.user.isGM = true;
    assert.equal(aptitudesLocked(actor(undefined)), false); // old character, GM
    assert.equal(aptitudesLocked(actor({ version: 1 })), true); // made with the wizard: fixed, even for the GM
    game.user.isGM = false;
    assert.equal(isCreatorGranted({ flags: { 'dark-heresy-2nd': { creatorGranted: true } } }), true);
    assert.equal(isCreatorGranted({}), false);
});
