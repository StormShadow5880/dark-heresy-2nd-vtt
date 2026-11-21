import test from 'node:test';
import assert from 'node:assert/strict';
import { pushClass, pushStatus } from '../src/module/rules/psychic-push.mjs';

test('push limits by kind of psyker: bound +2, unbound +4, daemonic +3', () => {
    assert.equal(pushClass('bound').limit, 2);
    assert.equal(pushClass('Bound (sanctioned)').limit, 2);
    assert.equal(pushClass('unbound').limit, 4);
    assert.equal(pushClass('Unsanctioned').limit, 4);
    assert.equal(pushClass('Daemonic').limit, 3);
    assert.equal(pushClass('Daemon host').limit, 3);
    assert.equal(pushClass('whatever'), null);
    assert.equal(pushClass(''), null);
});

test('no push at or below the current rating, push with a hint above it', () => {
    const base = { available: 3, baseRating: 3, psyClass: 'bound' };
    assert.equal(pushStatus({ ...base, pr: 2 }).pushing, false);
    assert.equal(pushStatus({ ...base, pr: 3 }).pushing, false);
    assert.equal(pushStatus({ ...base, pr: 3 }).message, '');
    const p = pushStatus({ ...base, pr: 4 });
    assert.equal(p.pushing, true);
    assert.equal(p.extra, 1);
    assert.equal(p.max, 5);
    assert.equal(p.over, false);
    assert.match(p.message, /pushing/i);
});

test('the maximum is base rating + limit; sustained powers do not lower it, but make pushing start earlier', () => {
    // base 4, two powers sustained: free rating 2
    const s = { available: 2, baseRating: 4, psyClass: 'bound' };
    assert.equal(pushStatus({ ...s, pr: 3 }).pushing, true);
    assert.equal(pushStatus({ ...s, pr: 6 }).over, false);
    assert.equal(pushStatus({ ...s, pr: 7 }).over, true);
    assert.equal(pushStatus({ available: 3, baseRating: 3, psyClass: 'unbound', pr: 7 }).over, false);
    assert.equal(pushStatus({ available: 3, baseRating: 3, psyClass: 'unbound', pr: 8 }).over, true);
    assert.equal(pushStatus({ available: 3, baseRating: 3, psyClass: 'daemonic', pr: 6 }).over, false);
    assert.equal(pushStatus({ available: 3, baseRating: 3, psyClass: 'daemonic', pr: 7 }).over, true);
});

test('an unknown kind of psyker is not limited, but the player is told', () => {
    const p = pushStatus({ pr: 9, available: 3, baseRating: 3, psyClass: 'Navigator' });
    assert.equal(p.over, false);
    assert.equal(p.unknownClass, true);
    assert.match(p.message, /not checked/);
});
