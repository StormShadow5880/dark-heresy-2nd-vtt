import test from 'node:test';
import assert from 'node:assert/strict';
import { IM_IMPORTS, maxWounds, maxWoundsBreakdown, reconcileWounds } from '../src/module/rules/imperium-maledictum.mjs';

test('IM-001: Max Wounds = Strength Bonus + 2 x Toughness Bonus + Willpower Bonus', () => {
    assert.equal(maxWounds({ strength: 4, toughness: 3, willpower: 4 }), 14); // 4 + 6 + 4
    assert.equal(maxWounds({ strength: 3, toughness: 3, willpower: 3 }), 12);
    assert.equal(maxWounds({ strength: 0, toughness: 0, willpower: 0 }), 0);
});

test('IM-001: toughness counts twice, so a power that raises Toughness by 1 raises the maximum by 2', () => {
    const before = maxWounds({ strength: 4, toughness: 3, willpower: 4 });
    const after = maxWounds({ strength: 4, toughness: 4, willpower: 4 });
    assert.equal(after - before, 2);
    // Iron Arm at PR 5: Toughness +3 and Strength +3 -> +9 wounds
    assert.equal(maxWounds({ strength: 7, toughness: 6, willpower: 4 }) - before, 9);
});

test('IM-001: modifier, rounding and lower limit', () => {
    assert.equal(maxWounds({ strength: 4, toughness: 3, willpower: 4 }, 2), 16);
    assert.equal(maxWounds({ strength: 4, toughness: 3, willpower: 4 }, -20), 0); // never below 0
    assert.equal(maxWounds({ strength: '4', toughness: '3', willpower: 'x' }), 10); // bad input counts as 0
});

test('IM-001: breakdown text for the tooltip', () => {
    assert.equal(maxWoundsBreakdown({ strength: 4, toughness: 3, willpower: 4 }), 'SB 4 + 2 × TB 3 + WPB 4 = 14');
    assert.equal(maxWoundsBreakdown({ strength: 4, toughness: 3, willpower: 4 }, -2), 'SB 4 + 2 × TB 3 + WPB 4 − 2 = 12');
});

test('a new character (max 0, wounds 0) starts undamaged with the calculated maximum', () => {
    assert.deepEqual(reconcileWounds({ persistedMax: 0, computedMax: 14, value: 0 }), { max: 14, value: 14 });
});

test('a changed maximum keeps the damage: remaining wounds move with it', () => {
    // undamaged character, a power raises the maximum 12 -> 21
    assert.deepEqual(reconcileWounds({ persistedMax: 12, computedMax: 21, value: 12 }), { max: 21, value: 21 });
    // 4 damage taken (8 of 12 remaining), maximum 12 -> 21: still 4 damage
    assert.deepEqual(reconcileWounds({ persistedMax: 12, computedMax: 21, value: 8 }), { max: 21, value: 17 });
    // the power ends again: back to 8 of 12 remaining
    assert.deepEqual(reconcileWounds({ persistedMax: 21, computedMax: 12, value: 17 }), { max: 12, value: 8 });
});

test('when the maximum drops below the damage the remaining wounds stop at 0, never negative', () => {
    assert.deepEqual(reconcileWounds({ persistedMax: 21, computedMax: 12, value: 5 }), { max: 12, value: 0 });
});

test('nothing to do when stored and calculated maximum are equal', () => {
    assert.equal(reconcileWounds({ persistedMax: 14, computedMax: 14, value: 9 }), null);
});

test('the import is registered with source and setting', () => {
    assert.equal(IM_IMPORTS['IM-001'].since, '1.9.0');
    assert.match(IM_IMPORTS['IM-001'].formula, /Strength Bonus \+ \(2 × Toughness Bonus\) \+ Willpower Bonus/);
});
