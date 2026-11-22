import test from 'node:test';
import assert from 'node:assert/strict';
import { sustainCost, sustainEntries, planSustain, budgetLabel, TURN_BUDGET, turnKey } from '../src/module/rules/sustain-turn.mjs';

const entries = sustainEntries([
    { id: 'a', name: 'Iron Arm', sustained: 'Free Action' },
    { id: 'b', name: 'Mind Link', sustained: 'Half Action' },
    { id: 'c', name: 'Warp Storm', sustained: 'Full Action' },
    { id: 'd', name: 'Odd', sustained: 'Special' },
]);

test('costs in half actions', () => {
    assert.equal(sustainCost('Free Action'), 0);
    assert.equal(sustainCost('half action'), 1);
    assert.equal(sustainCost('Full Action'), 2);
    assert.equal(sustainCost('Special'), null);
    assert.equal(sustainCost(''), null);
    assert.equal(TURN_BUDGET, 2);
    assert.equal(entries[3].manual, true);
});

test('free powers cost nothing, the account is 1 Full Action', () => {
    const p = planSustain(entries, ['a', 'b']);
    assert.equal(p.spent, 1);
    assert.equal(p.remaining, 1);
    assert.ok(p.ok);
    assert.deepEqual(p.dropped.map((e) => e.id), ['c', 'd']);
});

test('a Full Action power uses the whole account, two Half Actions fit, three do not', () => {
    assert.equal(planSustain(entries, ['c']).remaining, 0);
    assert.ok(planSustain(entries, ['c', 'a']).ok);
    assert.equal(planSustain(entries, ['b', 'c']).ok, false);
    assert.match(planSustain(entries, ['b', 'c']).error, /Not enough actions/);
    const two = sustainEntries([{ id: 'x', sustained: 'Half Action' }, { id: 'y', sustained: 'Half Action' }, { id: 'z', sustained: 'Half Action' }]);
    assert.ok(planSustain(two, ['x', 'y']).ok);
    assert.equal(planSustain(two, ['x', 'y', 'z']).ok, false);
});

test('nothing ticked: everything ends, the whole account is left', () => {
    const p = planSustain(entries, []);
    assert.equal(p.kept.length, 0);
    assert.equal(p.dropped.length, 4);
    assert.equal(p.remaining, 2);
});

test('labels and turn marker', () => {
    assert.equal(budgetLabel(2), '1 Full Action (= 2 Half Actions)');
    assert.equal(budgetLabel(1), '1 Half Action');
    assert.equal(budgetLabel(0), 'no action');
    assert.equal(turnKey(3, 1), '3:1');
});
