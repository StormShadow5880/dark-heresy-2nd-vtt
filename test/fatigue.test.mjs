import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFatigue, fatigueMax, bonusOf } from '../src/module/rules/fatigue.mjs';

const chars = () => ({
    toughness: { total: 40, unnatural: 0, bonus: 4 },
    willpower: { total: 30, unnatural: 0, bonus: 3 },
    agility: { total: 35, unnatural: 0, bonus: 3 },
});

function run(fatigue) {
    const c = chars();
    for (const x of Object.values(c)) applyFatigue(x, fatigue);
    return { c, max: fatigueMax(c) };
}

test('the fatigue limit does not shrink while the fatigue rises', () => {
    const limits = [0, 1, 3, 4, 5, 6, 7, 8].map((f) => run(f).max);
    assert.deepEqual([...new Set(limits)], [7]);
});

test('a counter can be raised past the old stopping point (5 of 6)', () => {
    // with the old calculation Toughness was halved at fatigue 5 and the limit fell below the value
    const { max } = run(5);
    assert.ok(max >= 7);
    assert.ok(run(6).max >= 7);
});

test('a characteristic whose bonus is below the fatigue is halved, the others stay', () => {
    const { c } = run(4);
    assert.equal(c.willpower.total, 15, 'Willpower bonus 3 < 4: halved');
    assert.equal(c.agility.total, 18, 'Agility bonus 3 < 4: halved');
    assert.equal(c.toughness.total, 40, 'Toughness bonus 4 is not below 4');
    assert.equal(run(2).c.willpower.total, 30);
});

test('unnatural bonus stays after halving and bonuses are remembered', () => {
    const c = { total: 40, unnatural: 2, bonus: 6 };
    applyFatigue(c, 7);
    assert.equal(c.bonusBeforeFatigue, 6);
    assert.equal(c.total, 20);
    assert.equal(c.bonus, 4);
    assert.equal(bonusOf(20, 2), 4);
});

import { fatigueState, wakeUpValue, crossing } from '../src/module/rules/fatigue.mjs';

test('levels: tired, limit, unconscious above the limit, dead above twice the limit', () => {
    const lvl = (value) => fatigueState({ value, max: 7, toughnessBonus: 3 }).level;
    assert.deepEqual([0, 1, 7, 8, 14, 15].map(lvl), ['ok', 'tired', 'limit', 'unconscious', 'unconscious', 'dead']);
    assert.equal(fatigueState({ value: 8, max: 7, toughnessBonus: 3 }).minutes, 7, '10 − Toughness Bonus minutes');
    assert.equal(fatigueState({ value: 8, max: 7, toughnessBonus: 12 }).minutes, 0);
});

test('waking up: fatigue drops by the Toughness Bonus, at most one level below the limit', () => {
    assert.equal(wakeUpValue({ value: 8, max: 7, toughnessBonus: 3 }), 5);
    assert.equal(wakeUpValue({ value: 13, max: 7, toughnessBonus: 3 }), 6, 'still above the limit: limit − 1');
    assert.equal(wakeUpValue({ value: 2, max: 7, toughnessBonus: 3 }), 0);
});

test('crossing the limit is reported once', () => {
    assert.equal(crossing(7, 8, 7), 'unconscious');
    assert.equal(crossing(8, 9, 7), null);
    assert.equal(crossing(14, 15, 7), 'dead');
    assert.equal(crossing(3, 4, 7), null);
});

test('halved characteristics are flagged', () => {
    const c = { total: 30, unnatural: 0, bonus: 3 };
    applyFatigue(c, 4);
    assert.equal(c.fatigued, true);
    assert.equal(c.totalBeforeFatigue, 30);
    const d = { total: 30, unnatural: 0, bonus: 3 };
    applyFatigue(d, 3);
    assert.equal(d.fatigued, false);
});

import { unconsciousTimer, timerView, restRecovery } from '../src/module/rules/fatigue.mjs';

test('the unconscious timer follows the world time', () => {
    const t = unconsciousTimer(1000, 7);
    assert.deepEqual(t, { since: 1000, until: 1000 + 420 });
    assert.equal(timerView(t, 1000).ready, false);
    assert.equal(timerView(t, 1000).text, '7 min');
    assert.equal(timerView(t, 1000 + 400).text, '20 s');
    assert.equal(timerView(t, 1000 + 420).ready, true);
    assert.equal(timerView(t, 99999).text, 'ready to wake up');
    assert.equal(timerView(null, 0).active, false);
});

test('rest: 1 hour removes 1 level, 6 hours everything', () => {
    assert.deepEqual(restRecovery({ value: 5, hours: 1 }), { before: 5, removed: 1, after: 4, all: false });
    assert.equal(restRecovery({ value: 5, hours: 3 }).after, 2);
    assert.equal(restRecovery({ value: 5, hours: 6 }).after, 0);
    assert.equal(restRecovery({ value: 2, hours: 5 }).after, 0, 'never below 0');
    assert.equal(restRecovery({ value: 5, hours: 0.9 }).after, 5, 'only whole hours count');
});
