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
export function defenceChoices(actor, { melee = false } = {}) {
    const choices = [];
    for (const [id, def] of Object.entries(DEFENCES)) {
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
