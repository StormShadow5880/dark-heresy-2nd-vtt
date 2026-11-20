import test from 'node:test';
import assert from 'node:assert/strict';
import { installFoundryStubs, makeActor } from './helpers.mjs';

installFoundryStubs();
const ctx = await import('../src/module/sheets/actor/dossier-context.mjs');

test('characteristics are listed in book order with effective value and bonus', () => {
    const actor = makeActor({ charAdvance: 2 });
    const chars = ctx.buildCharacteristics(actor);
    assert.deepEqual(chars.map((c) => c.short), ['WS', 'BS', 'S', 'T', 'Ag', 'Int', 'Per', 'WP', 'Fel', 'Inf']);
    assert.equal(chars[0].total, 40);
    assert.equal(chars[0].advanceLabel, 'Intermediate');
});

test('skills: training bonus comes from the actor rules, not a flat +10', () => {
    const actor = makeActor({ skillAdvance: 0 });
    const rows = ctx.buildSkills(actor);
    const awareness = rows.find((r) => r.id === 'awareness');
    assert.equal(awareness.trainingBonus, -20);
    assert.equal(awareness.trained, false);
    actor.skills.awareness.advance = 3;
    const trained = ctx.buildSkills(actor).find((r) => r.id === 'awareness');
    assert.equal(trained.trainingBonus, 20);
    assert.equal(trained.training, 'Experienced');
    assert.equal(trained.trained, true);
});

test('skills: only taken specialities are listed', () => {
    const rows = ctx.buildSkills(makeActor());
    assert.ok(rows.some((r) => r.id === 'commonLore:imperium'));
    assert.ok(!rows.some((r) => r.id === 'commonLore:tech'));
    const groups = ctx.buildSpecialistGroups(makeActor());
    assert.equal(groups[0].specialities.length, 2);
});

test('favourites default to the example skills and can be overridden by a flag', () => {
    const actor = makeActor();
    assert.deepEqual(ctx.getFavoriteSkills(actor), ['awareness', 'dodge', 'inquiry', 'techUse']);
    actor.flags.favoriteSkills = ['commonLore:imperium'];
    const rows = ctx.buildSkills(actor);
    assert.equal(rows.find((r) => r.id === 'commonLore:imperium').favorite, true);
    assert.deepEqual(ctx.buildQuickSkills(actor, rows).map((r) => r.id), ['commonLore:imperium']);
});

test('development summary computes the progress and sorts the log newest first', () => {
    const actor = makeActor({ total: 1000, used: 250 });
    actor.experience = { total: 1000, used: 250, available: 750, calculatedTotal: 200 };
    actor.flags.xpLog = [
        { id: 'a', timestamp: 1000, type: 'award', cost: 5 },
        { id: 'b', timestamp: 2000, type: 'spend', cost: 5 },
    ];
    const dev = ctx.buildDevelopment(actor);
    assert.equal(dev.pct, 25);
    assert.equal(dev.mismatch, true);
    assert.deepEqual(dev.log.map((e) => e.id), ['b', 'a']);
    assert.equal(dev.log[0].isSpend, true);
});


test('resources expose the damage bar', () => {
    const actor = makeActor();
    actor.system.wounds = { value: 8, max: 16, critical: 0 };
    actor.system.fatigue = { value: 0, max: 5 };
    actor.system.fate = { value: 2, max: 3 };
    const wounds = ctx.buildResources(actor).find((r) => r.id === 'wounds');
    assert.equal(wounds.bar.cells.length, 16);
    assert.equal(wounds.bar.damage, 8);
    assert.equal(wounds.bar.minorLimit, 6); // toughness bonus of the test actor is 3
});

test('sustained powers: only active powers are listed, with the effect text at the psy rating they were cast at', () => {
    const actor = makeActor();
    actor.psy = { rating: 5 };
    const ironArm = { id: 'a', name: 'Iron Arm', system: {}, getFlag: () => undefined };
    actor.items = new Map([['a', ironArm]]);
    actor.items.get = Map.prototype.get.bind(actor.items);
    actor.effects = [{ getFlag: () => ({ powerId: 'a', pr: 4 }) }];
    actor.effects.find = Array.prototype.find.bind(actor.effects);
    const powers = [
        { id: 'a', name: 'Iron Arm', active: true, hasEffect: true, discipline: 'Biomancy', sustained: 'Free Action' },
        { id: 'b', name: 'Smite', active: false, hasEffect: false },
    ];
    const list = ctx.buildSustainedPowers(actor, powers);
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'Iron Arm');
    assert.equal(list[0].pr, 4);
    assert.equal(list[0].effectText, 'Unnatural Toughness +2, Unnatural Strength +2, Agility -10');
});
