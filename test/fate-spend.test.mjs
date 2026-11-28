import test from 'node:test';
import assert from 'node:assert/strict';
import { fateCost, spendFatePoint, describeSpend } from '../src/module/rules/fate.mjs';

const actor = (homeWorld, fate = 3, id = 'a') => ({
    id,
    system: { fate: { value: fate }, bio: { homeWorld } },
    async update(d) {
        this.system.fate.value = d['system.fate.value'];
    },
});
const noChat = async () => {};

test('fate cost: only Shrine World on a 1 is free', () => {
    for (const d of [1, 2, 5, 10]) assert.equal(fateCost({ homeWorld: 'Hive World' }, d), 1);
    assert.equal(fateCost({ homeWorld: 'Shrine World' }, 1), 0);
    for (const d of [2, 3, 9, 10]) assert.equal(fateCost({ homeWorld: 'Shrine World' }, d), 1);
});

test('Shrine World: 1 spends nothing, 2-10 spends one, the effect happens either way', async () => {
    const a = actor('Shrine World');
    const free = await spendFatePoint(a, { roll: async () => 1, announce: noChat });
    assert.deepEqual([free.ok, free.cost, free.free, a.system.fate.value], [true, 0, true, 3]);
    const paid = await spendFatePoint(a, { roll: async () => 2, announce: noChat });
    assert.deepEqual([paid.ok, paid.cost, a.system.fate.value], [true, 1, 2]);
    assert.match(describeSpend(free), /1d10 = 1.*not spent/);
});

test('a Fate Point must be available, also for a possible free spend', async () => {
    const a = actor('Shrine World', 0);
    let rolled = false;
    const r = await spendFatePoint(a, { roll: async () => ((rolled = true), 1), announce: noChat });
    assert.equal(r.ok, false);
    assert.equal(rolled, false, 'no d10 without a Point');
});

test('other home worlds roll nothing and spend one', async () => {
    const a = actor('Hive World');
    let rolled = false;
    const r = await spendFatePoint(a, { roll: async () => ((rolled = true), 1), announce: noChat });
    assert.deepEqual([r.cost, r.d10, a.system.fate.value, rolled], [1, null, 2, false]);
});

test('the same request id spends once; a second click during a spend is refused', async () => {
    const a = actor('Hive World');
    const first = await spendFatePoint(a, { requestId: 'r1', announce: noChat });
    const again = await spendFatePoint(a, { requestId: 'r1', announce: noChat });
    assert.equal(again.repeated, true);
    assert.equal(a.system.fate.value, 2);
    assert.equal(first.cost, again.cost);
    const b = actor('Hive World', 3, 'b');
    const slow = spendFatePoint(b, { roll: async () => 5, announce: noChat });
    const click = await spendFatePoint(b, { announce: noChat });
    await slow;
    assert.equal(click.ok, false);
    assert.equal(b.system.fate.value, 2);
});

test('a repeated free Shrine spend stays free and is not rolled again', async () => {
    const a = actor('Shrine World');
    let rolls = 0;
    const roll = async () => (rolls++, 1);
    await spendFatePoint(a, { requestId: 'x', roll, announce: noChat });
    const second = await spendFatePoint(a, { requestId: 'x', roll, announce: noChat });
    assert.equal(rolls, 1);
    assert.equal(second.free, true);
    assert.equal(a.system.fate.value, 3);
});
