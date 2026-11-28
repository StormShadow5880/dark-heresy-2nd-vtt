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

import { fatigueOrigin, effectiveFatigue } from '../src/module/rules/fatigue.mjs';

test('origins: Outcast raises the threshold by 2 (only that), Kalto ignores the first level (stored value unchanged)', () => {
    assert.deepEqual(fatigueOrigin({ background: 'Outcast', homeWorld: 'Hive World' }), { thresholdToughnessExtra: 2, ignoredLevels: 0 });
    assert.deepEqual(fatigueOrigin({ background: 'Mutant', homeWorld: 'Kalto' }), { thresholdToughnessExtra: 0, ignoredLevels: 1 });
    assert.deepEqual(fatigueOrigin({ background: 'Outcast', homeWorld: 'Kalto' }), { thresholdToughnessExtra: 2, ignoredLevels: 1 }, 'both together');
    assert.deepEqual(fatigueOrigin({}), { thresholdToughnessExtra: 0, ignoredLevels: 0 });
    assert.deepEqual(fatigueOrigin(undefined), { thresholdToughnessExtra: 0, ignoredLevels: 0 });
});

test('Outcast: threshold = Toughness Bonus + 2 + Willpower Bonus; the Toughness Bonus itself and the unconscious time stay', () => {
    const c = () => ({ toughness: { total: 40, unnatural: 0, bonus: 4 }, willpower: { total: 30, unnatural: 0, bonus: 3 } });
    const chars = c();
    for (const x of Object.values(chars)) applyFatigue(x, 0);
    assert.equal(fatigueMax(chars), 7);
    assert.equal(fatigueMax(chars, { toughnessExtra: 2 }), 9);
    assert.equal(chars.toughness.bonus, 4, 'the Toughness Bonus used for damage reduction is not raised');
    assert.equal(fatigueState({ value: 8, max: 9, toughnessBonus: 4 }).level, 'tired', '8 is not over the Outcast threshold 9');
    assert.equal(fatigueState({ value: 10, max: 9, toughnessBonus: 4 }).minutes, 6, 'unconscious time uses the real Toughness Bonus (10 - 4)');
    // the threshold does not move while the fatigue rises
    for (const f of [0, 3, 5, 9, 10]) {
        const cc = c();
        for (const x of Object.values(cc)) applyFatigue(x, f);
        assert.equal(fatigueMax(cc, { toughnessExtra: 2 }), 9);
    }
});

test('Kalto: fatigue 0, 1, 2, 3 -> effect as 0, 0, 1, 2; the stored value is not changed', () => {
    assert.deepEqual([0, 1, 2, 3].map((f) => effectiveFatigue(f, 1)), [0, 0, 1, 2]);
    const st = (value) => fatigueState({ value, max: 7, toughnessBonus: 3, ignoredLevels: 1 });
    assert.equal(st(1).level, 'ok', 'the first level has no effect at all');
    assert.equal(st(2).level, 'tired');
    assert.equal(st(3).stored, 3);
    assert.equal(st(3).value, 2);
    assert.equal(st(3).ignored, 1);
    // threshold crossing with the effective value: stored 8 = effect 7 = at the limit, stored 9 = effect 8 = over the limit
    assert.equal(st(8).level, 'limit');
    assert.equal(st(9).level, 'unconscious');
    assert.equal(st(15).level, 'unconscious', 'effect 14 is not more than twice 7');
    assert.equal(st(16).level, 'dead', 'effect 15 is more than twice the limit');
});

test('Kalto: halving of characteristics follows the effective fatigue', () => {
    const run = (stored) => {
        const c = { total: 30, unnatural: 0, bonus: 3 };
        applyFatigue(c, effectiveFatigue(stored, 1));
        return c;
    };
    assert.equal(run(1).fatigued, false);
    assert.equal(run(3).fatigued, false, 'stored 3 = effect 2: not below the bonus 3');
    assert.equal(run(4).fatigued, false, 'effect 3 is not higher than the bonus 3');
    assert.equal(run(5).fatigued, true, 'effect 4 is higher than the bonus 3');
});

test('Kalto: waking up, recovery and Fate', async () => {
    // wake up: effective 8 (stored 9) over the limit 7, Toughness Bonus 3: effective 5, stored 6
    assert.equal(wakeUpValue({ value: 9, max: 7, toughnessBonus: 3, ignoredLevels: 1 }), 6);
    // effective still over the limit after waking: one level below the limit (effective 6 = stored 7)
    assert.equal(wakeUpValue({ value: 16, max: 7, toughnessBonus: 3, ignoredLevels: 1 }), 7);
    // a fatigue that is gone after waking stays 0
    assert.equal(wakeUpValue({ value: 2, max: 7, toughnessBonus: 3, ignoredLevels: 1 }), 0);
    // without the origin nothing changes
    assert.equal(wakeUpValue({ value: 8, max: 7, toughnessBonus: 3 }), 5);
    // recovery by rest works on the stored value (unchanged rule); a Fate Point removes everything
    assert.equal(restRecovery({ value: 3, hours: 1 }).after, 2);
    assert.equal(restRecovery({ value: 3, hours: 6 }).after, 0);
});

test('the combination: Kalto and Outcast together', () => {
    const o = fatigueOrigin({ background: 'Outcast', homeWorld: 'Kalto' });
    const chars = { toughness: { total: 40, unnatural: 0, bonus: 4 }, willpower: { total: 30, unnatural: 0, bonus: 3 } };
    for (const x of Object.values(chars)) applyFatigue(x, effectiveFatigue(9, o.ignoredLevels));
    const limit = fatigueMax(chars, { toughnessExtra: o.thresholdToughnessExtra });
    assert.equal(limit, 9);
    assert.equal(fatigueState({ value: 9, max: limit, toughnessBonus: 4, ignoredLevels: o.ignoredLevels }).level, 'tired', 'stored 9 = effect 8, limit 9');
    assert.equal(fatigueState({ value: 11, max: limit, toughnessBonus: 4, ignoredLevels: o.ignoredLevels }).level, 'unconscious');
});
