import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChanges, computeValue, describeEffects, getEffectDefinitions, hasEffect, MODE_ADD } from '../src/module/rules/psychic-effects.mjs';
import { installFoundryStubs } from './helpers.mjs';

installFoundryStubs();
globalThis.Actor = class {};
const mgr = await import('../src/module/actions/psychic-effect-manager.mjs');

const ironArm = { id: 'p1', name: 'Iron Arm', img: 'x.png', uuid: 'Actor.a.Item.p1', system: {}, flags: {}, setFlag: async () => {}, getFlag: () => undefined };

test('Iron Arm: half the psy rating rounded UP for Toughness and Strength, -10 Agility', () => {
    const byPr = (pr) => Object.fromEntries(buildChanges(ironArm, pr).map((c) => [c.key.split('.').slice(-2).join('.'), c.value]));
    assert.deepEqual(byPr(5), { 'toughness.unnatural': '3', 'strength.unnatural': '3', 'agility.modifier': '-10' });
    assert.equal(byPr(4)['toughness.unnatural'], '2');
    assert.equal(byPr(1)['strength.unnatural'], '1');
    assert.equal(byPr(0)['toughness.unnatural'], '0');
    assert.ok(buildChanges(ironArm, 3).every((c) => c.mode === MODE_ADD));
});

test('value calculation: fixed values, rounding variants', () => {
    assert.equal(computeValue({ value: -10 }, 7), -10);
    assert.equal(computeValue({ pr: { divide: 2, round: 'up' } }, 5), 3);
    assert.equal(computeValue({ pr: { divide: 2, round: 'down' } }, 5), 2);
    assert.equal(computeValue({ pr: { multiply: 10 } }, 3), 30);
    assert.equal(computeValue({ pr: { divide: 2, round: 'up' } }, -4), 0);
});

test('definitions: item data overrides the registry, powers without effects are ignored', () => {
    assert.equal(hasEffect(ironArm), true);
    assert.equal(hasEffect({ name: 'Smite', system: {} }), false);
    const custom = { name: 'Iron Arm', system: { autoEffects: [{ path: 'system.characteristics.strength.modifier', value: 5 }] } };
    assert.equal(getEffectDefinitions(custom).length, 1);
});

test('chat text lists every change with its sign', () => {
    assert.equal(describeEffects(ironArm, 5), 'Unnatural Toughness +3, Unnatural Strength +3, Agility -10');
});

function fakeActor(sustained = 0, rating = 5) {
    const effects = [];
    const actor = Object.assign(new Actor(), {
        name: 'Test',
        system: { psy: { sustained, rating } },
        effects,
        items: new Map(),
        async createEmbeddedDocuments(type, data) {
            for (const d of data) {
                const e = { ...d, getFlag: (s, k) => d.flags?.[s]?.[k], async update(u) { Object.assign(e, { changes: u.changes ?? e.changes }); }, async delete() { effects.splice(effects.indexOf(e), 1); await mgr.onPsychicEffectRemoved(e); } };
                e.parent = actor;
                effects.push(e);
            }
        },
        async update(data) {
            if ('system.psy.sustained' in data) this.system.psy.sustained = data['system.psy.sustained'];
        },
    });
    actor.items.set('p1', Object.assign(ironArm, { flagged: false }));
    return actor;
}

test('switching on: creates one effect, counts the power as sustained (psy rating reduced), marks the power', async () => {
    const actor = fakeActor(0);
    let flagged = null;
    const power = { ...ironArm, setFlag: async (s, k, v) => (flagged = v), getFlag: () => flagged, unsetFlag: async () => (flagged = null) };
    actor.items.set('p1', power);
    const text = await mgr.activatePsychicEffect(actor, power, 5);
    assert.equal(text, 'Unnatural Toughness +3, Unnatural Strength +3, Agility -10');
    assert.equal(actor.effects.length, 1);
    assert.equal(actor.system.psy.sustained, 1);
    assert.equal(flagged, true);
    assert.equal(actor.effects[0].changes.length, 3);
});

test('casting again only refreshes the values, the power is not counted twice', async () => {
    const actor = fakeActor(0);
    await mgr.activatePsychicEffect(actor, ironArm, 3);
    await mgr.activatePsychicEffect(actor, ironArm, 5);
    assert.equal(actor.effects.length, 1);
    assert.equal(actor.system.psy.sustained, 1);
    assert.equal(actor.effects[0].changes.find((c) => c.key.includes('toughness')).value, '3');
});

test('ending by hand removes the effect and reduces the sustained count, never below 0', async () => {
    const actor = fakeActor(2);
    await mgr.activatePsychicEffect(actor, ironArm, 5);
    assert.equal(actor.system.psy.sustained, 3);
    await mgr.deactivatePsychicEffect(actor, 'p1');
    assert.equal(actor.effects.length, 0);
    assert.equal(actor.system.psy.sustained, 2);
    const low = fakeActor(0);
    await mgr.activatePsychicEffect(low, ironArm, 2);
    low.system.psy.sustained = 0; // edited by hand in the meantime
    await mgr.deactivatePsychicEffect(low, 'p1');
    assert.equal(low.system.psy.sustained, 0);
});

test('a power without effect definitions changes nothing', async () => {
    const actor = fakeActor(0);
    assert.equal(await mgr.activatePsychicEffect(actor, { id: 'x', name: 'Smite', system: {} }, 3), null);
    assert.equal(actor.effects.length, 0);
    assert.equal(actor.system.psy.sustained, 0);
});
