import test from 'node:test';
import assert from 'node:assert/strict';
import { installFoundryStubs } from './helpers.mjs';

installFoundryStubs();
const { originLocked, changedOrigin, isUnlocked } = await import('../src/module/rules/origin-lock.mjs');

const actor = (flags = {}, bio = { homeWorld: 'Hive World', background: 'Outcast', role: 'Seeker' }) => ({ type: 'acolyte', system: { bio }, getFlag: (scope, key) => flags[key] });
const gm = { isGM: true };
const player = { isGM: false };

test('the origin is locked for players on every character, the GM can always change it', () => {
    assert.equal(originLocked(actor(), player), true);
    assert.equal(originLocked(actor({ creator: { done: true } }), player), true);
    assert.equal(originLocked(actor(), gm), false);
});

test('the GM lifts the lock of one character (flag), and it can be locked again', () => {
    assert.equal(isUnlocked(actor({ originUnlocked: true })), true);
    assert.equal(originLocked(actor({ originUnlocked: true }), player), false);
    assert.equal(originLocked(actor({ originUnlocked: false }), player), true);
});

test('only real changes of home world, background or role count', () => {
    const a = actor();
    assert.deepEqual(changedOrigin(a, { system: { bio: { role: 'Mystic' } } }), ['role']);
    assert.deepEqual(changedOrigin(a, { system: { bio: { role: 'Seeker', age: '30' } } }), [], 'same value is no change');
    assert.deepEqual(changedOrigin(a, { system: { bio: { gender: 'x' } } }), []);
    assert.deepEqual(changedOrigin(a, { 'system.bio.homeWorld': 'Feral World', 'system.bio.background': 'Mutant' }), ['homeWorld', 'background']);
});
