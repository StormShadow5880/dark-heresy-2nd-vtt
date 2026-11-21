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
    assert.deepEqual(serializeHit(hit), { location: 'Head', totalDamage: 9, totalPenetration: 2, totalFatigue: 0, damageType: 'Energy', fury: ['x'] });
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
