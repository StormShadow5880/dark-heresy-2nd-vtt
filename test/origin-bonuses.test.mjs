import test from 'node:test';
import assert from 'node:assert/strict';
import { applicableOriginBonuses, applyOriginResult, planOriginRoll } from '../src/module/rules/origin-bonuses.mjs';

const hive = { homeWorld: 'Hive World', background: 'Adeptus Ministorum', role: 'Hierophant' };

test('only named bonuses of the own origin and the skill apply, nothing blanket', () => {
    const a = applicableOriginBonuses(hive, 'navigate', 'surface');
    assert.deepEqual(a.modifiers.map((b) => b.id), ['hive-navigate']);
    assert.equal(applicableOriginBonuses(hive, 'navigate', 'air').modifiers.length, 0);
    assert.equal(applicableOriginBonuses({}, 'navigate', 'surface').modifiers.length, 0);
});

test('Ministorum replaces the standard +10 Fate bonus instead of adding to it', () => {
    const a = applicableOriginBonuses(hive, 'charm');
    assert.deepEqual(a.fate.map((f) => f.id).sort(), ['hierophant-fate', 'ministorum-plus20']);
    const p = planOriginRoll({ bio: hive, skillKey: 'charm', fateId: 'ministorum-plus20', fatePoints: 1 });
    assert.deepEqual(p.modifiers, { 'Fate (Adeptus Ministorum)': 20 });
});

test('selection is explicit: unticked bonuses and no Fate choice give an empty plan', () => {
    const p = planOriginRoll({ bio: hive, skillKey: 'navigate', specKey: 'surface' });
    assert.deepEqual(p, { modifiers: {}, degrees: [], fate: null, errors: [] });
    const q = planOriginRoll({ bio: hive, skillKey: 'navigate', specKey: 'surface', selected: ['hive-navigate', 'hive-navigate'] });
    assert.deepEqual(q.modifiers, { 'Hive World': 20 }, 'a bonus counts once');
});

test('a bonus that does not apply is refused, not applied', () => {
    const p = planOriginRoll({ bio: hive, skillKey: 'charm', selected: ['hive-navigate'] });
    assert.deepEqual(p.modifiers, {});
    assert.equal(p.errors.length, 1);
});

test('Fate options need a Fate Point', () => {
    const p = planOriginRoll({ bio: hive, skillKey: 'charm', fateId: 'hierophant-fate', fatePoints: 0 });
    assert.equal(p.fate, null);
    assert.match(p.errors[0], /Fate Point/);
});

test('automatic success: degrees = characteristic bonus, Fate Point spent once', () => {
    const plan = planOriginRoll({ bio: hive, skillKey: 'charm', fateId: 'hierophant-fate', fatePoints: 2 });
    const r = applyOriginResult({ success: false, dos: 0, dof: 2 }, plan, 4);
    assert.deepEqual([r.success, r.dos, r.dof, r.spendFate], [true, 4, 0, true]);
});

test('Chirurgeon only on a failed test: no cost when it succeeded', () => {
    const bio = { role: 'Chirurgeon' };
    const plan = planOriginRoll({ bio, skillKey: 'medicae', fateId: 'chirurgeon-fate', fatePoints: 1 });
    const ok = applyOriginResult({ success: true, dos: 1, dof: 0 }, plan, 3);
    assert.equal(ok.spendFate, false);
    assert.equal(ok.dos, 1);
    const bad = applyOriginResult({ success: false, dos: 0, dof: 1 }, plan, 3);
    assert.deepEqual([bad.success, bad.dos, bad.spendFate], [true, 3, true]);
});

test('Fate +10 bonus costs a Point and Forraliss adds a degree only on success', () => {
    const bio = { homeWorld: 'Forraliss' };
    const plan = planOriginRoll({ bio, skillKey: 'deceive', selected: ['forraliss-degree'], fateId: 'fate-plus10', fatePoints: 1 });
    assert.equal(plan.modifiers['Fate (Fate Point)'], 10);
    const win = applyOriginResult({ success: true, dos: 1, dof: 0 }, plan);
    assert.deepEqual([win.dos, win.spendFate], [2, true]);
    const lose = applyOriginResult({ success: false, dos: 0, dof: 1 }, plan);
    assert.equal(lose.dos, 0);
});
