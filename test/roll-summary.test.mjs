import test from 'node:test';
import assert from 'node:assert/strict';
import { signed, summariseModifiers } from '../src/module/rules/roll-summary.mjs';

test('signed shows + and a real minus, 0 as +0', () => {
    assert.equal(signed(10), '+10');
    assert.equal(signed(-20), '−20');
    assert.equal(signed(0), '+0');
});

test('the result line lists only real modifiers and the target', () => {
    const s = summariseModifiers(50, { bonus: 10, focus: 0, power: '', difficulty: -10, modifier: '5' });
    assert.deepEqual(s.lines.map((l) => l.text), ['+10', '−10', '+5']);
    assert.equal(s.target, 55);
    assert.equal(s.text, '50 +10 Rating Bonus −10 Difficulty +5 Modifier = 55');
});

test('the sum is limited to +-60 like the roll itself', () => {
    const hi = summariseModifiers(30, { a: 50, b: 30 });
    assert.deepEqual([hi.sum, hi.applied, hi.capped, hi.target], [80, 60, true, 90]);
    const lo = summariseModifiers(30, { a: -50, b: -30 });
    assert.deepEqual([lo.applied, lo.target], [-60, -30]);
});

test('no modifiers: just the base; junk values are ignored', () => {
    assert.equal(summariseModifiers(40, {}).text, '40 = 40');
    assert.equal(summariseModifiers(40, { x: 'abc', y: null }).target, 40);
});
