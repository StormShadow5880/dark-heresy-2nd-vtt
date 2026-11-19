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

test('wounds bar has exactly one cell per maximum wound and fills from the left', () => {
    const bar = ctx.woundBar(5, 12, 3);
    assert.equal(bar.cells.length, 12);
    assert.equal(bar.cells.filter((c) => c.filled).length, 5);
    assert.ok(bar.cells.slice(0, 5).every((c) => c.filled));
    assert.equal(ctx.woundBar(0, 0, 3).cells.length, 0);
});

test('wounds bar: the last 2 x toughness bonus cells are the minor damage zone, separated by a gap', () => {
    const bar = ctx.woundBar(12, 12, 3); // limit 6
    assert.equal(bar.minorLimit, 6);
    assert.equal(bar.minorCells, 6);
    assert.equal(bar.seriousCells, 6);
    assert.equal(bar.cells.filter((c) => c.gap).length, 1);
    assert.equal(bar.cells.findIndex((c) => c.gap), 6);
    assert.ok(bar.cells.slice(6).every((c) => c.minor));
});

test('wounds bar: seriously injured only after more damage than the minor limit', () => {
    assert.equal(ctx.woundBar(12, 12, 3).serious, false);
    assert.equal(ctx.woundBar(12, 12, 3).hasDamage, false);
    assert.equal(ctx.woundBar(6, 12, 3).serious, false); // 6 damage = exactly the limit
    assert.equal(ctx.woundBar(5, 12, 3).serious, true); // 7 damage
    assert.equal(ctx.woundBar(5, 12, 3).damage, 7);
});

test('wounds bar: minor limit larger than the wounds means everything is minor, no gap', () => {
    const bar = ctx.woundBar(2, 4, 5);
    assert.equal(bar.minorLimit, 4);
    assert.equal(bar.seriousCells, 0);
    assert.equal(bar.cells.filter((c) => c.gap).length, 0);
    assert.equal(bar.serious, false);
});

test('wounds bar: values are clamped and large pools are drawn with at most 40 cells', () => {
    assert.equal(ctx.woundBar(99, 12, 3).damage, 0);
    assert.equal(ctx.woundBar(-4, 12, 3).damage, 12);
    const big = ctx.woundBar(60, 80, 4);
    assert.equal(big.cells.length, 40);
    assert.equal(big.cells.filter((c) => c.filled).length, 30);
});

test('resources expose the wounds bar', () => {
    const actor = makeActor();
    actor.system.wounds = { value: 8, max: 16, critical: 0 };
    actor.system.fatigue = { value: 0, max: 5 };
    actor.system.fate = { value: 2, max: 3 };
    const wounds = ctx.buildResources(actor).find((r) => r.id === 'wounds');
    assert.equal(wounds.bar.cells.length, 16);
    assert.equal(wounds.bar.minorLimit, 6); // toughness bonus of the test actor is 3
});
