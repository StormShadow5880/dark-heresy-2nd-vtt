import test from 'node:test';
import assert from 'node:assert/strict';
import { installFoundryStubs } from './helpers.mjs';

installFoundryStubs();
const { originLocked, changedOrigin, isCreated } = await import('../src/module/rules/origin-lock.mjs');

const actor = (created, bio = { homeWorld: 'Hive World', background: 'Outcast', role: 'Seeker' }) => ({ system: { bio }, getFlag: (scope, key) => (created && key === 'creator' ? { done: true } : undefined) });
const gm = { isGM: true };
const player = { isGM: false };

test('a created character: the player cannot change the origin, the GM can', () => {
    assert.equal(isCreated(actor(true)), true);
    assert.equal(originLocked(actor(true), player), true);
    assert.equal(originLocked(actor(true), gm), false);
});

test('a character that was not made with the wizard stays editable', () => {
    assert.equal(originLocked(actor(false), player), false);
});

test('only real changes of home world, background or role count', () => {
    const a = actor(true);
    assert.deepEqual(changedOrigin(a, { system: { bio: { role: 'Mystic' } } }), ['role']);
    assert.deepEqual(changedOrigin(a, { system: { bio: { role: 'Seeker', age: '30' } } }), [], 'same value is no change');
    assert.deepEqual(changedOrigin(a, { system: { bio: { gender: 'x' } } }), []);
    assert.deepEqual(changedOrigin(a, { 'system.bio.homeWorld': 'Feral World', 'system.bio.background': 'Mutant' }), ['homeWorld', 'background']);
});
