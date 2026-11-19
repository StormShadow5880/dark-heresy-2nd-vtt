import test from 'node:test';
import assert from 'node:assert/strict';
import { stepCounter } from '../src/module/rules/counters.mjs';
import { installFoundryStubs, makeActor } from './helpers.mjs';

installFoundryStubs();
const ctx = await import('../src/module/sheets/actor/dossier-context.mjs');

test('counter buttons count up and down by one', () => {
    assert.equal(stepCounter(2, 1, 5), 3);
    assert.equal(stepCounter(2, -1, 5), 1);
});

test('counters never become negative', () => {
    assert.equal(stepCounter(0, -1, 5), 0);
    assert.equal(stepCounter(0, -1, null), 0);
    assert.equal(stepCounter(undefined, -1, 5), 0);
});

test('counters respect the stored maximum', () => {
    assert.equal(stepCounter(3, 1, 3), 3); // fate 3 / 3
    assert.equal(stepCounter(7, 1, '7'), 7); // data attributes are strings
});

test('corruption and insanity have no maximum', () => {
    assert.equal(stepCounter(99, 1, null), 100);
    assert.equal(stepCounter(99, 1, ''), 100);
    assert.equal(stepCounter(99, 1, undefined), 100);
    assert.equal(stepCounter(99, 1, 0), 100);
});

test('status tiles: one tile per counter with value, max and data path', () => {
    const actor = makeActor();
    actor.system.wounds = { value: 5, max: 12, critical: 0 };
    actor.system.fatigue = { value: 2, max: 7 };
    actor.system.fate = { value: 3, max: 3 };
    actor.system.corruption = 4;
    actor.system.insanity = 6;
    actor.system.corruptionBonus = 0;
    actor.system.insanityBonus = 0;
    const tiles = ctx.buildStatusTiles(actor);
    assert.deepEqual(tiles.map((t) => t.id), ['fatigue', 'fate', 'corruption', 'insanity']);
    const byId = Object.fromEntries(tiles.map((t) => [t.id, t]));
    assert.equal(byId.fatigue.value, 2);
    assert.equal(byId.fatigue.max, 7);
    assert.equal(byId.fatigue.path, 'system.fatigue.value');
    assert.equal(byId.fate.maxPath, 'system.fate.max');
    assert.equal(byId.corruption.path, 'system.corruption');
    assert.equal(byId.corruption.max, null);
    assert.equal(byId.insanity.value, 6);
    assert.match(byId.fate.tooltip, /3 \/ 3/);
});
