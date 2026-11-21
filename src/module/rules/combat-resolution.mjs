/**
 * Rules of the automated attack resolution (pure, no Foundry): what a defender may choose and how the hits of an attack are
 * applied to the target. The chat flow that uses it is in actions/combat-resolution-manager.mjs.
 *
 *   attack hits a target -> the target's owner chooses Dodge / Parry / no defence in the chat
 *   -> an evasion test (reaction): success = the attack is avoided
 *   -> otherwise every hit is reduced by armour (minus penetration) and toughness bonus and applied: wounds first,
 *      the rest becomes critical damage (AssignDamageData) -> one summary of the damage
 */
import { AssignDamageData } from '../rolls/assign-damage-data.mjs';

export const DEFENCES = {
    dodge: { label: 'Dodge', icon: 'fa-person-running', skill: 'dodge', meleeOnly: false },
    parry: { label: 'Parry', icon: 'fa-shield-halved', skill: 'parry', meleeOnly: true },
    none: { label: 'Take the hit', icon: 'fa-burst', skill: null, meleeOnly: false },
};

/**
 * The defences of an actor against an attack: dodge always, parry only against melee attacks. Each with the target
 * number of the evasion test; defences without a trained skill or a value are not offered.
 */
export function defenceChoices(actor, { melee = false, noDodge = false } = {}) {
    const choices = [];
    for (const [id, def] of Object.entries(DEFENCES)) {
        if (id === 'dodge' && noDodge) continue;
        if (!def.skill) {
            choices.push({ id, label: def.label, icon: def.icon, target: null });
            continue;
        }
        if (def.meleeOnly && !melee) continue;
        const target = Number(actor?.skills?.[def.skill]?.current);
        if (!Number.isFinite(target) || target <= 0) continue;
        choices.push({ id, label: def.label, icon: def.icon, target });
    }
    return choices;
}

/** A hit as it travels in a chat message flag (plain data) */
export function serializeHit(hit) {
    return {
        location: hit.location ?? 'Body',
        totalDamage: Number(hit.totalDamage) || 0,
        totalPenetration: Number(hit.totalPenetration) || 0,
        totalFatigue: Number(hit.totalFatigue) || 0,
        damageType: hit.damageType ?? 'Impact',
        fury: (hit.righteousFury ?? []).map((r) => r.effect).filter(Boolean),
    };
}

/**
 * Applies the hits one after the other (the wounds left after the first hit are the start of the next one).
 * @param actor target actor (needs update())
 * @param hits {object[]} serialized hits
 * @returns {Promise<{hits: object[], damage: number, critical: number, fatigue: number, wounds: number, criticalTotal: number}>}
 */
export async function applyHits(actor, hits) {
    const results = [];
    let damage = 0;
    let critical = 0;
    let fatigue = 0;
    for (const hit of hits) {
        const data = new AssignDamageData(actor, { ...hit });
        await data.update();
        await data.finalize();
        await data.apply();
        damage += data.damageTaken;
        critical += data.criticalDamageTaken;
        fatigue += data.fatigueTaken;
        results.push({
            location: hit.location,
            damageType: hit.damageType,
            rawDamage: hit.totalDamage,
            penetration: hit.totalPenetration,
            armour: data.armour,
            usableArmour: data.usableArmour,
            toughnessBonus: data.tb,
            reduction: data.reduction,
            wounds: data.damageTaken,
            critical: data.criticalDamageTaken,
            criticalEffect: data.criticalEffect,
            fatigue: data.fatigueTaken,
            fury: hit.fury ?? [],
        });
    }
    return {
        hits: results,
        damage,
        critical,
        fatigue,
        wounds: actor.system.wounds.value,
        criticalTotal: actor.system.wounds.critical,
    };
}

/**
 * Which attacks the automation handles.
 *  - weapon attacks
 *  - Psychic Bolt: "can be dodged as if it were any other ranged attack. A successful Dodge test is sufficient to avoid a normal
 *    Psychic Bolt" (core rulebook, Psychic Powers)
 *  - Psychic Barrage and Storm: the first hit strikes the chosen target, further hits may strike it or other targets within two
 *    metres (`spread`). A target that receives ONE hit answers it like a bolt (dodge); several hits on one target follow the
 *    auto-fire dodging rules (rulebook page 220), not in the system data yet: those stay with the manual hit buttons.
 *  - Psychic Blast: aimed at one target, everyone within the blast radius around it is hit (`blast`). The radius is the power's
 *    `special.blast` (e.g. "@pr"); the affected tokens are listed and can be checked before the damage is applied. Dodging a blast
 *    follows the area effect rules (page 220), not in the system data yet.
 * @param attackItem a weapon or psychic power item
 * @returns {{automated: boolean, ranged: boolean, melee: boolean, reason?: string}}
 */
export function automatedAttack(attackItem) {
    if (!attackItem) return { automated: false, ranged: false, melee: false };
    if (attackItem.type === 'weapon') return { automated: true, melee: !!attackItem.isMelee, ranged: !attackItem.isMelee };
    if (attackItem.type === 'psychicPower') {
        const type = String(attackItem.system?.attackType ?? '').toLowerCase();
        if (type === 'psychic bolt' || type === 'psychic-bolt') return { automated: true, melee: false, ranged: true };
        // Barrage and Storm: further hits may strike other targets near the first one (see SPREAD_RANGE)
        if (type === 'psychic barrage' || type === 'psychic storm') return { automated: true, melee: false, ranged: true, spread: true };
        // Blast: aimed at one target, everyone in the radius around it is hit (the area is checked in the chat)
        if (type === 'psychic blast') return { automated: true, melee: false, ranged: true, blast: true };
        return { automated: false, melee: false, ranged: true, reason: `${attackItem.system?.attackType || 'This power'}: the rules for dodging it are not automated yet.` };
    }
    return { automated: false, ranged: false, melee: false };
}

/** Reach of the further hits of a Psychic Barrage / Storm around the first target, in metres */
export const SPREAD_RANGE_M = 2;

export const withinSpread = (distance) => Number.isFinite(distance) && distance <= SPREAD_RANGE_M;

/**
 * Hit number i (0-based) strikes targetIds[i]. The first hit always strikes the first (initial) target.
 * @returns {{targetId: string, hits: object[]}[]} one entry per target in order of its first hit
 */
export function groupHitsByTarget(hits, targetIds) {
    if (targetIds.length !== hits.length) throw new Error('Every hit needs a target.');
    const groups = [];
    hits.forEach((hit, i) => {
        let group = groups.find((g) => g.targetId === targetIds[i]);
        if (!group) {
            group = { targetId: targetIds[i], hits: [] };
            groups.push(group);
        }
        group.hits.push(hit);
    });
    return groups;
}

/** Tokens within the blast radius: [{id, distance}] -> those with distance <= radius, nearest first */
export function inBlastRadius(tokens, radius) {
    return tokens
        .filter((t) => Number.isFinite(t.distance) && t.distance <= radius)
        .sort((a, b) => a.distance - b.distance);
}

/**
 * Hits prevented by a successful defence test (rulebook page 220).
 *  - a single hit: a success prevents it
 *  - several hits (burst, Swift / Lightning Attack, Barrage, ...): the degrees of success prevent hits, one per degree
 *  - Psychic Storm: two hits per degree
 * The degrees are the RULE count (`ruleDos`: the success itself is one degree, every further tens digit one more), so a plain
 * success always prevents at least one hit. The displayed degrees (`dos`) start at 0 and must NOT be used here.
 * @param ruleDos {number} degrees of success of the defence test in the rule count (>= 1 for a success)
 * @param total {number} hits that strike this target
 * @returns {number} never more than `total`
 */
export function preventedHits({ ruleDos, total, storm = false }) {
    const degrees = Math.max(0, Math.floor(Number(ruleDos) || 0));
    return Math.min(total, degrees * (storm ? 2 : 1));
}

/**
 * The outcome of an evasion test against the hits of one target.
 * @returns {{prevented: number, remaining: object[], missed: boolean}} the last hits are removed first; all hits prevented = the attack missed
 */
export function evasionOutcome({ success, ruleDos, hits, storm = false }) {
    const prevented = success ? preventedHits({ ruleDos, total: hits.length, storm }) : 0;
    const remaining = hits.slice(0, hits.length - prevented);
    return { prevented, remaining, missed: remaining.length === 0 };
}

/**
 * Blast and spray: a successful dodge only helps if the character can reach the edge of the area and leave it. The way to the edge
 * may not be longer than the Agility Bonus in metres; an obstacle on the way makes dodging impossible.
 * @param distanceFromCentre {number} metres from the centre of the blast
 * @param radius {number} metres
 * @param agilityBonus {number}
 * @param blocked {boolean} an obstacle is in the way
 */
export function blastDodge({ distanceFromCentre, radius, agilityBonus, blocked = false }) {
    const toEdge = Math.max(0, Math.round((radius - distanceFromCentre) * 10) / 10);
    const bonus = Math.max(0, Number(agilityBonus) || 0);
    return { toEdge, agilityBonus: bonus, blocked: !!blocked, canDodge: !blocked && toEdge <= bonus };
}

const metres = (n) => Math.round(n * 10) / 10;

/**
 * Checks a distance against what is allowed. Returns null if it is fine, otherwise the message for the user, e.g.
 * "Cultist is 3.5 m away from Brute, but only 2 m are allowed."
 * @param name {string} the token that is checked
 * @param from {string} the token or point it is measured from
 * @param distance {number} metres (NaN: could not be measured)
 * @param allowed {number} metres
 */
export function distanceProblem({ name, from, distance, allowed }) {
    if (!Number.isFinite(distance)) return `The distance between ${name} and ${from} could not be measured.`;
    if (distance <= allowed) return null;
    return `${name} is ${metres(distance)} m away from ${from}, but only ${metres(allowed)} m are allowed.`;
}
