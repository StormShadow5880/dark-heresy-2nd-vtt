import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNT_SIZE, accountKey, accountView, canAfford, chargeAccount, costFromActionText, costFromTypes, readAccount, refundLast, remainingOf, shortage } from '../src/module/rules/action-account.mjs';

const fresh = () => readAccount(null, accountKey(1, 0));

test('costs from the action types', () => {
    assert.deepEqual(costFromTypes(['Half']), { cost: 1, reaction: false, variable: false });
    assert.deepEqual(costFromTypes(['Full']).cost, 2);
    assert.deepEqual(costFromTypes(['Full', 'Half']), { cost: 1, reaction: false, variable: true });
    assert.equal(costFromTypes(['Reaction']).reaction, true);
    assert.equal(costFromTypes(['Half', 'Full', '2Full']).variable, true);
    assert.equal(costFromTypes([]).cost, null);
});

test('costs of psychic powers from the Action field', () => {
    assert.equal(costFromActionText('Free Action'), 0);
    assert.equal(costFromActionText('Half Action'), 1);
    assert.equal(costFromActionText('Full Action'), 2);
    assert.equal(costFromActionText('2 Full Actions'), 4);
    assert.equal(costFromActionText('N/A'), null);
    assert.equal(costFromActionText('Special'), null);
});

test('the account holds 1 Full Action = 2 Half Actions', () => {
    let a = fresh();
    assert.equal(remainingOf(a), ACCOUNT_SIZE);
    a = chargeAccount(a, { name: 'Standard Attack', cost: 1 });
    assert.equal(remainingOf(a), 1);
    assert.ok(canAfford(a, 1));
    assert.ok(!canAfford(a, 2));
    a = chargeAccount(a, { name: 'Aim', cost: 1 });
    assert.equal(remainingOf(a), 0);
    assert.ok(!canAfford(a, 1));
    assert.ok(canAfford(a, 0), 'free actions always fit');
});

test('an action of several turns takes the whole account, an insisting player can overspend', () => {
    assert.ok(canAfford(fresh(), 4));
    assert.equal(remainingOf(chargeAccount(fresh(), { name: 'Long', cost: 4 })), 0);
    let a = chargeAccount(chargeAccount(fresh(), { name: 'a', cost: 2 }), { name: 'b', cost: 1 });
    assert.equal(remainingOf(a), -1);
    assert.equal(accountView(a).over, true);
    assert.match(accountView(a).text, /1 Half Action over/);
});

test('a new turn starts with a full account', () => {
    const used = chargeAccount(fresh(), { name: 'x', cost: 2 });
    assert.equal(remainingOf(readAccount(used, accountKey(1, 0))), 0);
    assert.equal(remainingOf(readAccount(used, accountKey(2, 0))), 2);
    assert.equal(remainingOf(readAccount(used, accountKey(1, 1))), 2);
});

test('refund takes the last paid action back', () => {
    let a = chargeAccount(fresh(), { name: 'Move', cost: 1 });
    a = chargeAccount(a, { name: 'Free thing', cost: 0 });
    a = refundLast(a);
    assert.equal(remainingOf(a), 2);
    assert.equal(refundLast(a).spent, 0);
});

test('view texts and shortage message', () => {
    assert.equal(accountView(fresh()).text, '1 Full Action left');
    assert.equal(accountView(chargeAccount(fresh(), { name: 'a', cost: 1 })).text, '1 Half Action left');
    assert.equal(accountView(chargeAccount(fresh(), { name: 'a', cost: 2 })).text, 'No action left');
    assert.deepEqual(accountView(fresh()).pips.map((p) => p.on), [true, true]);
    const a = chargeAccount(fresh(), { name: 'a', cost: 1 });
    assert.match(shortage(a, 'Charge', 2), /Charge costs Full Action, but only 1 Half Action left/);
});
