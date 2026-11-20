import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChanges, canSustain, effectRows, normalizeDefinition, computeValue, describeEffects, getEffectDefinitions, hasEffect, MODE_ADD } from '../src/module/rules/psychic-effects.mjs';
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
    assert.deepEqual(text, { active: true, text: 'Unnatural Toughness +3, Unnatural Strength +3, Agility -10' });
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

test('sustainable means the Sustained field is not "No" - independent of effect definitions', () => {
    for (const v of ['Free Action', 'Half Action', 'Full Action', 'Special']) assert.equal(canSustain({ system: { sustained: v } }), true, v);
    for (const v of ['No', 'no', '', undefined, null]) assert.equal(canSustain({ system: { sustained: v } }), false, String(v));
    assert.equal(canSustain({}), false);
});

test('a sustainable power without effect definitions is switched on: sustained +1, marker set, no Active Effect', async () => {
    const actor = fakeActor(0);
    let flagged = null;
    const aura = { id: 'p2', name: 'Aura of Fear', img: 'x', uuid: 'u2', system: { sustained: 'Half Action' }, setFlag: async (s, k, v) => (flagged = v), getFlag: () => flagged, unsetFlag: async () => (flagged = null) };
    actor.items.set('p2', aura);
    const result = await mgr.activatePsychicPower(actor, aura, 3);
    assert.deepEqual(result, { active: true, text: '' });
    assert.equal(actor.effects.length, 0);
    assert.equal(actor.system.psy.sustained, 1);
    assert.equal(flagged, true);
    // casting it again does not count twice
    await mgr.activatePsychicPower(actor, aura, 3);
    assert.equal(actor.system.psy.sustained, 1);
    // ending it by hand reduces the count again
    await mgr.deactivatePsychicEffect(actor, 'p2');
    assert.equal(actor.system.psy.sustained, 0);
    assert.equal(flagged, null);
});

test('a power with Sustained "No" and no effect cannot be switched on', async () => {
    const actor = fakeActor(0);
    const smite = { id: 'p3', name: 'Smite', system: { sustained: 'No' }, getFlag: () => undefined };
    assert.equal(await mgr.activatePsychicPower(actor, smite, 3), null);
    assert.equal(actor.system.psy.sustained, 0);
});

test('a power without effect definitions changes nothing', async () => {
    const actor = fakeActor(0);
    assert.equal(await mgr.activatePsychicEffect(actor, { id: 'x', name: 'Smite', system: {} }, 3), null);
    assert.equal(actor.effects.length, 0);
    assert.equal(actor.system.psy.sustained, 0);
});

test('item sheet rows (characteristic + field) become definitions; a blank fixed value means "from the psy rating"', () => {
    const power = {
        name: 'Test',
        system: {
            autoEffects: [
                { characteristic: 'toughness', field: 'unnatural', value: '', pr: { divide: 2, round: 'up' } },
                { characteristic: 'agility', field: 'modifier', value: -10 },
            ],
        },
    };
    const defs = getEffectDefinitions(power);
    assert.equal(defs[0].path, 'system.characteristics.toughness.unnatural');
    assert.equal(defs[1].path, 'system.characteristics.agility.modifier');
    assert.equal(defs[0].label, 'Unnatural Toughness');
    assert.equal(defs[1].label, 'Agility modifier');
    assert.deepEqual(buildChanges(power, 5).map((c) => c.value), ['3', '-10']);
    assert.equal(describeEffects(power, 5), 'Unnatural Toughness +3, Agility modifier -10');
});

test('rows that came back from a form as an object keyed by index are understood, empty rows are ignored', () => {
    const power = { name: 'Test', system: { autoEffects: { 1: { characteristic: 'strength', field: 'unnatural', value: 2 }, 0: { characteristic: 'toughness', field: 'unnatural', value: 1 }, 2: {} } } };
    assert.deepEqual(getEffectDefinitions(power).map((d) => d.path), ['system.characteristics.toughness.unnatural', 'system.characteristics.strength.unnatural']);
    assert.equal(effectRows(power).length, 3);
});

test('item data wins over the registry, so the compendium entry can define the effects of Iron Arm itself', () => {
    const own = { name: 'Iron Arm', system: { autoEffects: [{ characteristic: 'strength', field: 'unnatural', value: 1 }] } };
    assert.deepEqual(getEffectDefinitions(own).map((d) => d.path), ['system.characteristics.strength.unnatural']);
    assert.equal(normalizeDefinition({ path: 'system.foo', value: 3 }).label, 'system.foo');
});
