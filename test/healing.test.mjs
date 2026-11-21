import test from 'node:test';
import assert from 'node:assert/strict';
import {
    computeFatigueRemoval, computeHealing, enduranceHealing, enduranceRadius, enduranceTargets, firstAidHealing, firstAidModifiers, firstAidStartsLock,
    healingPowerKind, injuryState, invigourateBudget, timerStatus, validateInvigourate,
} from '../src/module/rules/healing.mjs';
import { applyHits } from '../src/module/rules/combat-resolution.mjs';
import { degreesOfSuccess, toRuleDegrees } from '../src/module/rules/degrees.mjs';

const W = (value, max, critical = 0, toughnessBonus = 3) => ({ value, max, critical, toughnessBonus });

test('injury state: undamaged, lightly, heavily and critically damaged', () => {
    assert.equal(injuryState(W(12, 12)).state, 'none');
    assert.equal(injuryState(W(7, 12)).state, 'light'); // 5 damage, limit 2 x 3 = 6
    assert.equal(injuryState(W(6, 12)).state, 'light'); // exactly the limit
    assert.equal(injuryState(W(5, 12)).state, 'heavy'); // 7 damage
    assert.equal(injuryState(W(0, 12, 2)).state, 'critical');
    assert.equal(injuryState(W(0, 12, 0)).state, 'heavy'); // all wounds gone, no critical damage yet
    assert.equal(injuryState(W(12, 12, 1)).state, 'critical'); // critical damage always counts
    const s = injuryState(W(5, 12));
    assert.deepEqual([s.damage, s.minorLimit, s.label], [7, 6, 'Heavily Damaged']);
    assert.equal(injuryState(W(10, 12, 0, 0)).state, 'heavy'); // no toughness bonus: any damage is heavy
});

test('healing: critical damage first, then wounds, never above the maximum', () => {
    assert.deepEqual(computeHealing(W(0, 12, 4), 3), { requested: 3, healedCritical: 3, healedWounds: 0, healed: 3, wasted: 0, before: { value: 0, critical: 4 }, after: { value: 0, critical: 1 } });
    const both = computeHealing(W(0, 12, 2), 5);
    assert.deepEqual([both.healedCritical, both.healedWounds, both.after], [2, 3, { value: 3, critical: 0 }]);
    const over = computeHealing(W(10, 12, 0), 9);
    assert.deepEqual([over.healedWounds, over.wasted, over.after.value], [2, 7, 12]); // 9 requested, only 2 fit
    assert.equal(computeHealing(W(12, 12), 4).healed, 0);
    assert.equal(computeHealing(W(5, 12), -3).requested, 0);
    assert.equal(computeHealing(W(5, 12), 'x').healed, 0);
});

test('a source that may not heal critical damage (Fate) only heals the wounds', () => {
    const r = computeHealing(W(0, 12, 3), 4, { allowCritical: false });
    assert.deepEqual([r.healedCritical, r.healedWounds, r.after], [0, 4, { value: 4, critical: 3 }]);
    // nothing to heal in the wounds: the points are wasted, the critical damage stays
    const none = computeHealing(W(12, 12, 3), 4, { allowCritical: false });
    assert.deepEqual([none.healed, none.wasted, none.after.critical], [0, 4, 3]);
});

test('fatigue is removed up to the current level only', () => {
    assert.deepEqual(computeFatigueRemoval(3, 2), { requested: 2, removed: 2, before: 3, after: 1 });
    assert.equal(computeFatigueRemoval(1, 5).after, 0);
    assert.equal(computeFatigueRemoval(0, 2).removed, 0);
});

test('First Aid modifiers: challenging, heavily damaged -10, critically damaged -10 per critical point', () => {
    assert.equal(firstAidModifiers({ state: 'light', critical: 0 }).total, 0);
    assert.equal(firstAidModifiers({ state: 'heavy', critical: 0 }).total, -10);
    assert.equal(firstAidModifiers({ state: 'critical', critical: 3 }).total, -30);
    assert.equal(firstAidModifiers({ state: 'critical', critical: 1 }).parts.length, 2);
});

test('First Aid healing: Intelligence bonus + degrees of success, the first success is not counted twice', () => {
    // The rule count includes the success itself: a test that just succeeds (roll 44 vs 45) is ONE degree, displayed as +0.
    const shown = degreesOfSuccess(44, 45);
    const rule = toRuleDegrees(shown);
    assert.equal(shown, 0);
    assert.equal(rule, 1);
    assert.equal(firstAidHealing({ intelligenceBonus: 4, ruleDegrees: rule }).amount, 5); // 4 + 1
    // roll 21 vs 45: shown +2, rule count 3
    assert.equal(firstAidHealing({ intelligenceBonus: 4, ruleDegrees: toRuleDegrees(degreesOfSuccess(21, 45)) }).amount, 7);
    assert.equal(firstAidHealing({ intelligenceBonus: -1, ruleDegrees: 2 }).amount, 2);
});

test('24 hour lock: world time, boundaries and the GM setting', () => {
    const H = 3600;
    assert.equal(timerStatus({ lastTime: undefined, now: 1000, hours: 24 }).ready, true);
    assert.equal(timerStatus({ lastTime: 0, now: 24 * H - 1, hours: 24 }).ready, false);
    assert.equal(timerStatus({ lastTime: 0, now: 24 * H, hours: 24 }).ready, true);
    const s = timerStatus({ lastTime: 0, now: 22 * H + 30 * 60, hours: 24 });
    assert.equal(s.text, '1 h 30 min');
    assert.equal(timerStatus({ lastTime: 100, now: 100, hours: 12 }).ready, false);
    assert.equal(firstAidStartsLock({ mode: 'success', success: false }), false);
    assert.equal(firstAidStartsLock({ mode: 'success', success: true }), true);
    assert.equal(firstAidStartsLock({ mode: 'attempt', success: false }), true);
});

test('Endurance: half the effective psy rating rounded up, 3 m per psy rating, up to PR allies', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(enduranceHealing), [1, 1, 2, 2, 3, 3]);
    assert.equal(enduranceRadius(4), 12);
    assert.equal(enduranceTargets(4), 4);
    assert.equal(enduranceRadius(0), 0);
});

test('Invigourate: at most the psy rating in fatigue levels in total', () => {
    assert.equal(invigourateBudget(3), 3);
    assert.deepEqual(validateInvigourate({ a: 2, b: 1 }, 3), { ok: true, total: 3 });
    assert.equal(validateInvigourate({ a: 2, b: 2 }, 3).ok, false);
    assert.match(validateInvigourate({ a: 2, b: 2 }, 3).error, /only 3/);
    assert.equal(validateInvigourate({ a: -1 }, 3).ok, false);
    assert.equal(validateInvigourate({ a: 1.5 }, 3).ok, false);
    assert.equal(validateInvigourate({}, 3).ok, true);
});

test('healing powers are recognized by name', () => {
    assert.equal(healingPowerKind({ name: 'Endurance' }), 'endurance');
    assert.equal(healingPowerKind({ name: ' invigourate ' }), 'invigourate');
    assert.equal(healingPowerKind({ name: 'Iron Arm' }), null);
    assert.equal(healingPowerKind(null), null);
});

// integration with the damage automation: damage from applyHits, then healing on the same data
test('damage from the attack automation and the healing use the same fields', async () => {
    const a = {
        system: { wounds: { value: 3, max: 12, critical: 0 }, fatigue: { value: 0, max: 6 }, armour: { body: { value: 2, toughnessBonus: 3 } } },
        hasTalent: () => false,
        async update(data) {
            a.system.wounds.value = data.system.wounds.value;
            a.system.wounds.critical = data.system.wounds.critical;
            a.system.fatigue.value = data.system.fatigue.value;
        },
    };
    await applyHits(a, [{ location: 'Body', totalDamage: 12, totalPenetration: 0, damageType: 'Energy' }]); // 12 - 2 - 3 = 7: 3 wounds + 4 critical
    assert.deepEqual([a.system.wounds.value, a.system.wounds.critical], [0, 4]);
    assert.equal(injuryState({ ...a.system.wounds, toughnessBonus: 3 }).state, 'critical');
    const heal = computeHealing(a.system.wounds, 6);
    assert.deepEqual([heal.healedCritical, heal.healedWounds], [4, 2]); // critical first
    a.system.wounds.value = heal.after.value;
    a.system.wounds.critical = heal.after.critical;
    assert.equal(injuryState({ ...a.system.wounds, toughnessBonus: 3 }).state, 'heavy'); // 10 damage left of 12, limit 6
});

import { healingCardView } from '../src/module/rules/healing.mjs';
import { readFileSync } from 'node:fs';
import Handlebars from 'handlebars';

test('healing card: view of results and a compilable template', () => {
    const card = {
        state: 'done',
        title: 'First Aid',
        entries: [{ name: 'A', state: 'done', op: { type: 'heal', amount: 5 }, result: { healed: 4, healedCritical: 2, healedWounds: 2, wasted: 1, after: { value: 7, critical: 0 }, max: 12, stateBefore: 'critical', stateAfter: 'light' } }],
        roll: { skill: 'Medicae', base: 50, roll: 30, target: 50, success: true, shown: 2, ruleDegrees: 3, modifiers: [{ name: 'Challenging', value: 0 }] },
    };
    const view = healingCardView(card);
    assert.equal(view.totalHealed, 4);
    assert.match(view.entries[0].stateLine, /Critically Damaged → Lightly Damaged/);
    assert.match(view.entries[0].wastedLine, /1 point/);
    const hb = Handlebars.create();
    hb.registerHelper('eq', (a, b) => a === b);
    const html = hb.compile(readFileSync('src/templates/chat/healing-card-chat.hbs', 'utf8'))(view);
    assert.match(html, /First Aid/);
    assert.match(html, /4 healed/);
});

import { firstAidRangeProblem } from '../src/module/rules/healing.mjs';

test('First Aid range: 1.5 m in an active combat only, never for self-treatment', () => {
    assert.equal(firstAidRangeProblem({ inCombat: false, distance: 20 }), null);
    assert.equal(firstAidRangeProblem({ inCombat: true, distance: 1 }), null);
    assert.equal(firstAidRangeProblem({ inCombat: true, distance: 1.5 }), null);
    assert.match(firstAidRangeProblem({ inCombat: true, distance: 2, patientName: 'Bob' }), /Bob is 2 m away/);
    assert.equal(firstAidRangeProblem({ inCombat: true, self: true, distance: 99 }), null);
    assert.match(firstAidRangeProblem({ inCombat: true, distance: NaN }), /needs a token/);
});
