import test from 'node:test';
import assert from 'node:assert/strict';
import { installFoundryStubs, makeActor } from './helpers.mjs';

const notes = installFoundryStubs();
const { spendExperience, awardExperience, resolvePurchase, removeLogEntry, MAX_CHARACTERISTIC_ADVANCE, MAX_SKILL_ADVANCE } = await import('../src/module/rules/experience.mjs');

test.beforeEach(() => {
    notes.warnings.length = 0;
});

test('spending EP on a characteristic raises advance, cost and EP used and writes a log entry', async () => {
    const actor = makeActor({ total: 1000, used: 100 });
    const ok = await spendExperience(actor, { target: 'char:strength', cost: 250 });
    assert.equal(ok, true);
    assert.equal(actor.system.characteristics.strength.advance, 1);
    assert.equal(actor.system.characteristics.strength.cost, 250);
    assert.equal(actor.system.experience.used, 350);
    assert.equal(actor.flags.xpLog.length, 1);
    assert.equal(actor.flags.xpLog[0].type, 'spend');
    assert.equal(actor.flags.xpLog[0].cost, 250);
});

test('cannot spend more EP than available', async () => {
    const actor = makeActor({ total: 100, used: 0 });
    assert.equal(await spendExperience(actor, { target: 'skill:awareness', cost: 200 }), false);
    assert.equal(actor.system.experience.used, 0);
    assert.equal(actor.updates.length, 0);
    assert.match(notes.warnings[0], /Not enough EP/);
});

test('a GM may override the available EP, a player may not', async () => {
    const player = makeActor({ total: 100 });
    assert.equal(await spendExperience(player, { target: 'skill:awareness', cost: 200, gmOverride: true }), false);

    game.user.isGM = true;
    const gmActor = makeActor({ total: 100 });
    assert.equal(await spendExperience(gmActor, { target: 'skill:awareness', cost: 200, gmOverride: true }), true);
    assert.equal(gmActor.flags.xpLog[0].override, true);
    game.user.isGM = false;
});

test('rejects invalid costs', async () => {
    const actor = makeActor();
    for (const cost of [0, -5, 'abc', NaN]) {
        assert.equal(await spendExperience(actor, { target: 'char:strength', cost }), false);
    }
    assert.equal(actor.updates.length, 0);
});

test('maximum advances are enforced for characteristics and skills', async () => {
    const maxedChar = makeActor({ charAdvance: MAX_CHARACTERISTIC_ADVANCE });
    assert.equal(await spendExperience(maxedChar, { target: 'char:strength', cost: 100 }), false);
    const maxedSkill = makeActor({ skillAdvance: MAX_SKILL_ADVANCE });
    assert.equal(await spendExperience(maxedSkill, { target: 'skill:awareness', cost: 100 }), false);
    assert.match(notes.warnings.join(' '), /maximum advance/);
});

test('specialities must be taken before they can be advanced', () => {
    const actor = makeActor();
    assert.match(resolvePurchase(actor, 'spec:commonLore.tech').error, /not taken/);
    const ok = resolvePurchase(actor, 'spec:commonLore.imperium');
    assert.equal(ok.error, null);
    assert.deepEqual(ok.update(50), {
        'system.skills.commonLore.specialities.imperium.advance': 2,
        'system.skills.commonLore.specialities.imperium.cost': 50,
    });
});

test('talents and free entries need a name, they only deduct EP', async () => {
    const actor = makeActor({ total: 500 });
    assert.equal(await spendExperience(actor, { target: 'talent', cost: 100 }), false);
    assert.equal(await spendExperience(actor, { target: 'talent', cost: 100, customLabel: 'Quick Draw' }), true);
    assert.equal(actor.system.experience.used, 100);
    assert.equal(actor.flags.xpLog[0].label, 'Quick Draw');
});

test('awarding EP increases the total and is logged', async () => {
    const actor = makeActor({ total: 100 });
    assert.equal(await awardExperience(actor, { amount: 400, note: 'Session 3' }), true);
    assert.equal(actor.system.experience.total, 500);
    assert.equal(actor.flags.xpLog[0].type, 'award');
    assert.equal(await awardExperience(actor, { amount: 0 }), false);
});

test('removing a log entry only removes the entry', async () => {
    const actor = makeActor({ total: 500 });
    await spendExperience(actor, { target: 'char:strength', cost: 100 });
    const id = actor.flags.xpLog[0].id;
    await removeLogEntry(actor, id);
    assert.equal(actor.flags.xpLog.length, 0);
    assert.equal(actor.system.experience.used, 100);
});
