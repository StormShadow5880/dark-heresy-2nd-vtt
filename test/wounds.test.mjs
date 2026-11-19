import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CRITICAL, adjustDamage, valueForDamage, woundBar } from '../src/module/rules/wounds.mjs';

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

test('adjustDamage: +1 damage lowers the remaining wounds, healing raises them', () => {
    assert.deepEqual(adjustDamage({ value: 10, max: 12, critical: 0 }, 1), { value: 9 });
    assert.deepEqual(adjustDamage({ value: 10, max: 12, critical: 0 }, -1), { value: 11 });
    assert.equal(adjustDamage({ value: 12, max: 12, critical: 0 }, -1), null); // nothing to heal
});

test('adjustDamage: damage beyond the maximum becomes critical damage, capped at ten', () => {
    assert.deepEqual(adjustDamage({ value: 0, max: 12, critical: 3 }, 1), { critical: 4 });
    assert.equal(adjustDamage({ value: 0, max: 12, critical: 10 }, 1), null);
    // healing never touches the critical damage
    assert.deepEqual(adjustDamage({ value: 0, max: 12, critical: 3 }, -1), { value: 1 });
});

test('valueForDamage converts an entered damage into the stored remaining wounds', () => {
    assert.equal(valueForDamage(0, 12), 12);
    assert.equal(valueForDamage(5, 12), 7);
    assert.equal(valueForDamage(99, 12), 0);
    assert.equal(valueForDamage(-3, 12), 12);
    assert.equal(valueForDamage('abc', 12), 12);
});
