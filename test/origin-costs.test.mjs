import test from 'node:test';
import assert from 'node:assert/strict';
import { fearInsanityBonus, halveDurationRoundedUp, influenceLoss, insanityRemoval } from '../src/module/rules/origin-costs.mjs';

const highborn = { homeWorld: 'Highborn' };

test('Highborn: a rule-based loss N becomes max(1, N-1)', () => {
    for (const [n, loss] of [[1, 1], [2, 1], [3, 2], [10, 9]]) assert.equal(influenceLoss(highborn, n, 'rule').loss, loss);
    assert.equal(influenceLoss(highborn, 2).reduced, true);
    assert.equal(influenceLoss(highborn, 1).reduced, false);
});

test('Highborn: no change for gains, zero, voluntary costs and admin corrections; others pay in full', () => {
    assert.equal(influenceLoss(highborn, 0).loss, 0);
    assert.equal(influenceLoss(highborn, -3).loss, 0);
    assert.equal(influenceLoss(highborn, 'x').loss, 0);
    assert.equal(influenceLoss(highborn, 4, 'voluntary').loss, 4);
    assert.equal(influenceLoss(highborn, 4, 'admin').loss, 4);
    assert.equal(influenceLoss({ homeWorld: 'Hive World' }, 4, 'rule').loss, 4);
    assert.equal(influenceLoss(undefined, 4).loss, 4);
});

const garden = { homeWorld: 'Garden World' };

test('Garden World: 50 XP per point, GM approval, own XP, limits', () => {
    const base = { bio: garden, insanity: 3, xpAvailable: 100, points: 2, approved: true };
    assert.deepEqual(insanityRemoval(base), { ok: true, cost: 100, points: 2, error: null });
    assert.equal(insanityRemoval({ ...base, approved: false }).ok, false, 'no approval, no removal');
    assert.equal(insanityRemoval({ ...base, points: 3 }).ok, false, 'not enough XP');
    assert.equal(insanityRemoval({ ...base, points: 4, xpAvailable: 999 }).ok, false, 'more than the Insanity');
    assert.equal(insanityRemoval({ ...base, points: 0 }).ok, false);
    assert.equal(insanityRemoval({ ...base, points: 1.5 }).points, 1, 'whole points');
    assert.equal(insanityRemoval({ ...base, bio: { homeWorld: 'Hive World' } }).ok, false);
    assert.equal(insanityRemoval({ ...base, points: 1, xpAvailable: 50 }).ok, true, 'exactly enough');
    assert.equal(insanityRemoval({ ...base, points: 1, xpAvailable: 49 }).ok, false);
});

test('durations are halved rounded up; no sensible duration gives nothing', () => {
    assert.equal(halveDurationRoundedUp(1), 1);
    assert.equal(halveDurationRoundedUp(2), 1);
    assert.equal(halveDurationRoundedUp(5), 3);
    assert.equal(halveDurationRoundedUp(10), 5);
    for (const v of [0, -1, 1.5, null, undefined, 'until healed']) assert.equal(halveDurationRoundedUp(v), null);
});

test('Exorcised: the Insanity Bonus counts 2 higher for avoiding Fear only', () => {
    assert.equal(fearInsanityBonus({ background: 'Exorcised' }, 3), 5);
    assert.equal(fearInsanityBonus({ background: 'Exorcised' }, 0), 2);
    assert.equal(fearInsanityBonus({ background: 'Heretek' }, 3), 3);
    assert.equal(fearInsanityBonus(undefined, undefined), 0);
});
