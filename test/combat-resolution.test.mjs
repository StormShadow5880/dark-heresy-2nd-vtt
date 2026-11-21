import test from 'node:test';
import assert from 'node:assert/strict';
import { SPREAD_RANGE_M, defenceChoices, serializeHit, applyHits, groupHitsByTarget, withinSpread, inBlastRadius } from '../src/module/rules/combat-resolution.mjs';

const actor = (over = {}) => {
    const a = {
        skills: { dodge: { current: 45 }, parry: { current: 38 } },
        system: {
            wounds: { value: 12, max: 12, critical: 0 },
            fatigue: { value: 0, max: 6 },
            armour: { body: { value: 4, toughnessBonus: 3 }, head: { value: 2, toughnessBonus: 3 }, leftArm: { value: 0, toughnessBonus: 3 } },
            ...over,
        },
        hasTalent: () => false,
        async update(data) {
            const s = data.system;
            a.system.wounds.value = s.wounds.value;
            a.system.wounds.critical = s.wounds.critical;
            a.system.fatigue.value = s.fatigue.value;
            return a;
        },
    };
    return a;
};

test('defences: dodge always, parry only against melee, "take the hit" always', () => {
    assert.deepEqual(defenceChoices(actor(), { melee: false }).map((c) => c.id), ['dodge', 'none']);
    assert.deepEqual(defenceChoices(actor(), { melee: true }).map((c) => [c.id, c.target]), [['dodge', 45], ['parry', 38], ['none', null]]);
    // no skill value -> not offered
    assert.deepEqual(defenceChoices({ skills: {} }, { melee: true }).map((c) => c.id), ['none']);
    assert.deepEqual(defenceChoices({ skills: { dodge: { current: 0 } } }).map((c) => c.id), ['none']);
});

test('hits are serialized to plain data', () => {
    const hit = { location: 'Head', totalDamage: '9', totalPenetration: 2, totalFatigue: 0, damageType: 'Energy', righteousFury: [{ effect: 'x' }, {}] };
    const s = serializeHit(hit);
    assert.deepEqual({ location: s.location, totalDamage: s.totalDamage, totalPenetration: s.totalPenetration, totalFatigue: s.totalFatigue, damageType: s.damageType, fury: s.fury }, { location: 'Head', totalDamage: 9, totalPenetration: 2, totalFatigue: 0, damageType: 'Energy', fury: ['x'] });
    // no dice information without a roll: nothing is invented
    assert.equal(s.damageFormula, null);
    assert.deepEqual(s.damageModifiers, []);
});

test('a hit is reduced by armour (minus penetration) and toughness bonus, then taken from the wounds', async () => {
    const a = actor();
    const r = await applyHits(a, [{ location: 'Body', totalDamage: 12, totalPenetration: 1, totalFatigue: 0, damageType: 'Impact' }]);
    // armour 4 - pen 1 = 3, + TB 3 = 6 -> 6 wounds
    assert.equal(r.hits[0].usableArmour, 3);
    assert.equal(r.hits[0].reduction, 6);
    assert.equal(r.damage, 6);
    assert.equal(a.system.wounds.value, 6);
    assert.equal(r.wounds, 6);
});

test('several hits: the wounds left after one hit are the start of the next, the excess becomes critical damage', async () => {
    const a = actor();
    a.system.wounds.value = 5;
    const r = await applyHits(a, [
        { location: 'Head', totalDamage: 12, totalPenetration: 0, damageType: 'Energy' }, // 12 - 2 - 3 = 7: 5 wounds + 2 critical
        { location: 'Body', totalDamage: 9, totalPenetration: 0, damageType: 'Energy' }, // 9 - 4 - 3 = 2: all critical
    ]);
    assert.equal(r.hits[0].wounds, 5);
    assert.equal(r.hits[0].critical, 2);
    assert.equal(r.hits[1].wounds, 0);
    assert.equal(r.hits[1].critical, 2);
    assert.equal(a.system.wounds.value, 0);
    assert.equal(a.system.wounds.critical, 4);
    assert.equal(r.critical, 4);
});

test('armour does not absorb more than the damage and fatigue is added', async () => {
    const a = actor();
    const r = await applyHits(a, [{ location: 'Body', totalDamage: 3, totalPenetration: 0, totalFatigue: 1, damageType: 'Impact' }]);
    assert.equal(r.damage, 0);
    assert.equal(a.system.wounds.value, 12);
    assert.equal(r.fatigue, 1);
    assert.equal(a.system.fatigue.value, 1);
});

test('a target without armour data (npc) is damaged by toughness only', async () => {
    const a = actor({ armour: undefined });
    const r = await applyHits(a, [{ location: 'Body', totalDamage: 8, totalPenetration: 0, damageType: 'Impact' }]);
    assert.equal(r.hits[0].reduction, 0);
    assert.equal(r.damage, 8);
});

test('automated attacks: weapons and Psychic Bolt, the other psychic attacks wait for the auto-fire / area effect dodging rules', async () => {
    const { automatedAttack } = await import('../src/module/rules/combat-resolution.mjs');
    assert.deepEqual(automatedAttack({ type: 'weapon', isMelee: true }), { automated: true, melee: true, ranged: false });
    assert.deepEqual(automatedAttack({ type: 'weapon', isMelee: false }), { automated: true, melee: false, ranged: true });
    // a bolt is a ranged attack: dodge only, no parry
    const bolt = automatedAttack({ type: 'psychicPower', system: { attackType: 'Psychic Bolt' } });
    assert.deepEqual(bolt, { automated: true, melee: false, ranged: true });
    assert.deepEqual(defenceChoices(actor(), { melee: bolt.melee }).map((c) => c.id), ['dodge', 'none']);
    // Barrage and Storm: further hits may strike other targets near the first one
    for (const type of ['Psychic Barrage', 'Psychic Storm']) {
        assert.deepEqual(automatedAttack({ type: 'psychicPower', system: { attackType: type } }), { automated: true, melee: false, ranged: true, spread: true });
    }
    assert.deepEqual(automatedAttack({ type: 'psychicPower', system: { attackType: 'Psychic Blast' } }), { automated: true, melee: false, ranged: true, blast: true });
    assert.equal(automatedAttack({ type: 'psychicPower', system: { attackType: 'Something else' } }).automated, false);
    assert.equal(automatedAttack(null).automated, false);
});

test('barrage / storm: the first hit strikes the first target, further hits go to the chosen targets within 2 m', () => {
    assert.equal(SPREAD_RANGE_M, 2);
    assert.equal(withinSpread(0), true);
    assert.equal(withinSpread(2), true);
    assert.equal(withinSpread(2.1), false);
    assert.equal(withinSpread(NaN), false);
    const hits = [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }];
    const groups = groupHitsByTarget(hits, ['A', 'B', 'A', 'C']);
    assert.deepEqual(groups.map((g) => [g.targetId, g.hits.map((h) => h.n)]), [['A', [1, 3]], ['B', [2]], ['C', [4]]]);
    assert.deepEqual(groupHitsByTarget(hits, ['A', 'A', 'A', 'A']).length, 1);
    assert.throws(() => groupHitsByTarget(hits, ['A', 'B']), /Every hit needs a target/);
});

test('blast: everyone within the radius is listed, nearest first', () => {
    const tokens = [{ id: 'far', distance: 7.5 }, { id: 'centre', distance: 0 }, { id: 'edge', distance: 5 }, { id: 'near', distance: 2 }, { id: 'bad', distance: NaN }];
    assert.deepEqual(inBlastRadius(tokens, 5).map((t) => t.id), ['centre', 'near', 'edge']);
    assert.deepEqual(inBlastRadius(tokens, 1).map((t) => t.id), ['centre']);
    assert.deepEqual(inBlastRadius([], 5), []);
});

test('prevented hits: the RULE degrees count, a plain success prevents one hit (page 220)', async () => {
    const { preventedHits, evasionOutcome } = await import('../src/module/rules/combat-resolution.mjs');
    const { degreesOfSuccess, toRuleDegrees } = await import('../src/module/rules/degrees.mjs');
    // single hit: success prevents it
    assert.equal(preventedHits({ ruleDos: 1, total: 1 }), 1);
    // the displayed degrees (tens difference) are 0 for a plain success, the rule count is 1
    const shown = degreesOfSuccess(44, 45);
    assert.equal(shown, 0);
    assert.equal(toRuleDegrees(shown), 1);
    assert.equal(preventedHits({ ruleDos: toRuleDegrees(shown), total: 3 }), 1); // roll 44 vs 45: 1 of 3 hits prevented
    assert.equal(preventedHits({ ruleDos: toRuleDegrees(degreesOfSuccess(21, 45)), total: 5 }), 3); // 21 vs 45: shown +2, rule 3
    assert.equal(preventedHits({ ruleDos: 3, total: 2 }), 2); // never more than the hits
    // storm: two per degree
    assert.equal(preventedHits({ ruleDos: 1, total: 6, storm: true }), 2);
    assert.equal(preventedHits({ ruleDos: 2, total: 3, storm: true }), 3);
    assert.equal(preventedHits({ ruleDos: 0, total: 3 }), 0);
    const hits = [{ n: 1 }, { n: 2 }, { n: 3 }];
    assert.deepEqual(evasionOutcome({ success: true, ruleDos: 1, hits }), { prevented: 1, remaining: [{ n: 1 }, { n: 2 }], missed: false });
    assert.equal(evasionOutcome({ success: true, ruleDos: 3, hits }).missed, true); // all prevented = the attack missed
    assert.deepEqual(evasionOutcome({ success: false, ruleDos: 0, hits }), { prevented: 0, remaining: hits, missed: false });
});

test('blast / spray: dodging needs a way to the edge no longer than the Agility Bonus, an obstacle prevents it', async () => {
    const { blastDodge } = await import('../src/module/rules/combat-resolution.mjs');
    assert.deepEqual(blastDodge({ distanceFromCentre: 1, radius: 4, agilityBonus: 3 }), { toEdge: 3, agilityBonus: 3, blocked: false, canDodge: true });
    assert.equal(blastDodge({ distanceFromCentre: 0, radius: 4, agilityBonus: 3 }).canDodge, false); // 4 m to the edge
    assert.equal(blastDodge({ distanceFromCentre: 3, radius: 4, agilityBonus: 1 }).canDodge, true);
    assert.equal(blastDodge({ distanceFromCentre: 1, radius: 4, agilityBonus: 3, blocked: true }).canDodge, false);
    assert.equal(blastDodge({ distanceFromCentre: 5, radius: 4, agilityBonus: 0 }).toEdge, 0); // outside: nothing to cross
    const { defenceChoices } = await import('../src/module/rules/combat-resolution.mjs');
    const a = { skills: { dodge: { current: 40 }, parry: { current: 30 } } };
    assert.deepEqual(defenceChoices(a, { melee: false, noDodge: true }).map((c) => c.id), ['none']);
});

test('distance problems name both tokens and both distances', async () => {
    const { distanceProblem } = await import('../src/module/rules/combat-resolution.mjs');
    assert.equal(distanceProblem({ name: 'Cultist', from: 'Brute', distance: 2, allowed: 2 }), null);
    assert.equal(distanceProblem({ name: 'Cultist', from: 'Brute', distance: 3.46, allowed: 2 }), 'Cultist is 3.5 m away from Brute, but only 2 m are allowed.');
    assert.equal(distanceProblem({ name: 'Cultist', from: 'Voss', distance: 25, allowed: 10 }), 'Cultist is 25 m away from Voss, but only 10 m are allowed.');
    assert.match(distanceProblem({ name: 'A', from: 'B', distance: NaN, allowed: 2 }), /could not be measured/);
});

test('the damage calculation of every hit is kept for the result card', async () => {
    const a = actor();
    const hit = {
        location: 'Body', totalDamage: 12, totalPenetration: 1, damageType: 'Energy',
        damageFormula: '1d10+3', damageDice: '7 + 3', damageRolled: 10, damageModifiers: [{ name: 'strength bonus', value: 2, text: '+2' }], penetrationBase: 1, penetrationModifiers: [],
    };
    const r = await applyHits(a, [hit]);
    const h = r.hits[0];
    assert.equal(h.damageFormula, '1d10+3');
    assert.equal(h.armour, 4);
    assert.equal(h.usableArmour, 3); // 4 - 1
    assert.equal(h.toughnessBonus, 3);
    assert.equal(h.reduction, 6);
    assert.equal(h.reducedDamage, 6); // 12 - 6
    assert.equal(h.woundsBefore, 12);
    assert.equal(h.woundsAfter, 6);
    assert.equal(h.trueGrit, false);
    // serialization keeps the dice and the modifiers (zero modifiers dropped)
    const s = serializeHit({ location: 'Head', totalDamage: 9, damageRoll: { formula: '1d10+2', result: '5 + 2' }, damage: 7, modifiers: { 'strength bonus': 2, aim: 0, penalty: -1 }, penetration: 2, penetrationModifiers: {} });
    assert.equal(s.damageFormula, '1d10+2');
    assert.equal(s.damageDice, '5 + 2');
    assert.deepEqual(s.damageModifiers.map((m) => m.text), ['+2', '−1']);
    assert.equal(s.penetrationBase, 2);
});

test('True Grit reduces the critical damage and says so', async () => {
    const a = actor();
    a.hasTalent = (n) => n === 'True Grit';
    a.system.wounds.value = 1;
    const r = await applyHits(a, [{ location: 'Body', totalDamage: 20, totalPenetration: 0, damageType: 'Impact' }]); // 20 - 4 - 3 = 13: 1 wound + 12 critical -> 12 - 3 = 9
    assert.equal(r.hits[0].criticalBeforeGrit, 12);
    assert.equal(r.hits[0].critical, 9);
    assert.equal(r.hits[0].trueGrit, true);
});

test('the attack card view counts the answered targets and sums the wounds', async () => {
    const { attackCardView, newTargetEntry } = await import('../src/module/rules/combat-resolution.mjs');
    const entry = newTargetEntry({ target: { uuid: 'Actor.a', name: 'A', ...actor() }, hits: [{ location: 'Body', totalDamage: 9 }, { location: 'Head', totalDamage: 7 }], melee: true, storm: false });
    assert.equal(entry.state, 'open');
    assert.deepEqual(entry.choices.map((c) => c.id), ['dodge', 'parry', 'none']);
    assert.deepEqual(entry.notes, ['Each degree of success prevents one hit.']);
    const storm = newTargetEntry({ target: { uuid: 'Actor.b', name: 'B', ...actor() }, hits: [{}, {}], storm: true });
    assert.deepEqual(storm.notes, ['Each degree of success prevents two hits.']);
    const blocked = newTargetEntry({ target: { uuid: 'Actor.c', name: 'C', ...actor() }, hits: [{}], area: { canDodge: false, blocked: true, toEdge: 3, agilityBonus: 2 } });
    assert.deepEqual(blocked.choices.map((c) => c.id), ['none']);
    assert.match(blocked.notes[0], /obstacle/);
    const view = attackCardView({ label: 'x', weaponName: 'w', attackerName: 'a', targets: [{ ...entry, state: 'done', evasion: null, outcome: { prevented: 0, missed: false }, result: { damage: 4, critical: 1, wounds: 8, hits: [] } }, storm] });
    assert.equal(view.answered, 1);
    assert.equal(view.totalWounds, 4);
    assert.equal(view.totalCritical, 1);
    assert.equal(view.targets[0].tookHit, true);
    assert.equal(view.targets[1].open, true);
});
