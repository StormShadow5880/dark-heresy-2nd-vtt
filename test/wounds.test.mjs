import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CRITICAL, adjustDamage, applyTypedDamage, woundBar } from '../src/module/rules/wounds.mjs';

test('the track starts without damage: nothing is filled', () => {
    const bar = woundBar(12, 12, 0, 3);
    assert.equal(bar.cells.length, 12);
    assert.equal(bar.damage, 0);
    assert.equal(bar.hasDamage, false);
    assert.equal(bar.cells.filter((c) => c.filled).length, 0);
    assert.equal(bar.state, 'unharmed');
});

test('damage fills the cells from the left; remaining wounds are the stored value', () => {
    const bar = woundBar(7, 12, 0, 3); // 5 damage
    assert.equal(bar.damage, 5);
    assert.ok(bar.cells.slice(0, 5).every((c) => c.filled));
    assert.ok(bar.cells.slice(5).every((c) => !c.filled));
});

test('the first 2 x toughness bonus cells are the minor zone, a gap separates the serious zone', () => {
    const bar = woundBar(12, 12, 0, 3); // limit 6
    assert.equal(bar.minorLimit, 6);
    assert.equal(bar.minorCells, 6);
    assert.equal(bar.seriousCells, 6);
    assert.ok(bar.cells.slice(0, 6).every((c) => c.minor));
    assert.equal(bar.cells.findIndex((c) => c.gap), 6);
    assert.equal(bar.cells.filter((c) => c.gap).length, 1);
});

test('seriously injured only after more damage than the minor limit', () => {
    assert.equal(woundBar(6, 12, 0, 3).serious, false); // 6 damage = exactly the limit
    assert.equal(woundBar(6, 12, 0, 3).state, 'minor');
    assert.equal(woundBar(5, 12, 0, 3).serious, true); // 7 damage
    assert.equal(woundBar(5, 12, 0, 3).state, 'serious');
});

test('minor limit larger than the wounds: everything is minor, no gap', () => {
    const bar = woundBar(0, 4, 0, 5);
    assert.equal(bar.seriousCells, 0);
    assert.equal(bar.cells.filter((c) => c.gap).length, 0);
    assert.equal(bar.serious, false);
    assert.equal(bar.full, true);
});

test('critical damage is listed separately and ten means dead', () => {
    const bar = woundBar(0, 12, 4, 3);
    assert.equal(bar.critical, 4);
    assert.equal(bar.criticalPips.filter((p) => p.filled).length, 4);
    assert.equal(bar.criticalPips.length, MAX_CRITICAL);
    assert.equal(bar.dead, false);
    assert.equal(bar.state, 'critical');
    const dead = woundBar(0, 12, 10, 3);
    assert.equal(dead.dead, true);
    assert.equal(dead.state, 'dead');
    // values above ten are capped
    assert.equal(woundBar(0, 12, 14, 3).critical, 10);
});

test('values are clamped and big pools use at most 40 cells', () => {
    assert.equal(woundBar(99, 12, 0, 3).damage, 0);
    assert.equal(woundBar(-4, 12, 0, 3).damage, 12);
    assert.equal(woundBar(0, 0, 0, 3).cells.length, 0);
    const big = woundBar(20, 80, 0, 4); // 60 damage
    assert.equal(big.cells.length, 40);
    assert.equal(big.cells.filter((c) => c.filled).length, 30);
});

test('adjustDamage: damage lowers the remaining wounds first', () => {
    assert.deepEqual(adjustDamage({ value: 10, max: 12, critical: 0 }, 1), { value: 9 });
    assert.deepEqual(adjustDamage({ value: 1, max: 12, critical: 0 }, 1), { value: 0 });
});

test('adjustDamage: once the maximum is reached every further point becomes critical damage, capped at ten', () => {
    assert.deepEqual(adjustDamage({ value: 0, max: 12, critical: 0 }, 1), { critical: 1 });
    assert.deepEqual(adjustDamage({ value: 0, max: 12, critical: 3 }, 1), { critical: 4 });
    assert.equal(adjustDamage({ value: 0, max: 12, critical: 10 }, 1), null);
});

test('adjustDamage: healing runs the other way round - critical first, then wounds', () => {
    assert.deepEqual(adjustDamage({ value: 0, max: 12, critical: 3 }, -1), { critical: 2 });
    assert.deepEqual(adjustDamage({ value: 0, max: 12, critical: 1 }, -1), { critical: 0 });
    assert.deepEqual(adjustDamage({ value: 0, max: 12, critical: 0 }, -1), { value: 1 });
    assert.deepEqual(adjustDamage({ value: 5, max: 12, critical: 0 }, -1), { value: 6 });
    assert.equal(adjustDamage({ value: 12, max: 12, critical: 0 }, -1), null); // nothing left to heal
});

test('adjustDamage: damage and healing are exact inverses over the whole range', () => {
    let state = { value: 3, max: 3, critical: 0 };
    const apply = (delta) => {
        const u = adjustDamage(state, delta);
        if (u) state = { ...state, ...u };
        return state;
    };
    const seen = [];
    for (let i = 0; i < 3 + MAX_CRITICAL; i++) seen.push({ ...apply(1) });
    assert.deepEqual(state, { value: 0, max: 3, critical: MAX_CRITICAL });
    // walking back visits the same states in reverse order
    for (let i = seen.length - 2; i >= 0; i--) assert.deepEqual(apply(-1), seen[i]);
    apply(-1);
    assert.deepEqual(state, { value: 3, max: 3, critical: 0 });
    // never negative, never above the limits
    for (let i = 0; i < 40; i++) apply(1);
    assert.ok(state.value >= 0 && state.critical <= MAX_CRITICAL);
    for (let i = 0; i < 40; i++) apply(-1);
    assert.ok(state.value <= state.max && state.critical >= 0);
});

test('typed damage: up to the maximum it hits the wounds, above it the excess becomes critical damage', () => {
    assert.deepEqual(applyTypedDamage(5, 12, 0), { value: 7, critical: 0 });
    assert.deepEqual(applyTypedDamage(5, 12, 2), { value: 7, critical: 2 }); // within the maximum: critical untouched
    assert.deepEqual(applyTypedDamage(15, 12, 0), { value: 0, critical: 3 });
    assert.deepEqual(applyTypedDamage(99, 12, 0), { value: 0, critical: MAX_CRITICAL });
    assert.deepEqual(applyTypedDamage(-4, 12, 0), { value: 12, critical: 0 });
    assert.deepEqual(applyTypedDamage('abc', 12, 0), { value: 12, critical: 0 });
});
