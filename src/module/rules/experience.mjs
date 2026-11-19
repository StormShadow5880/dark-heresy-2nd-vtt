/**
 * Experience point (EP) handling for the character sheet.
 *
 * NOTE: The system does not ship the Dark Heresy 2E advancement cost tables, therefore costs are NOT
 * derived automatically - the player/GM enters the cost they paid according to the rulebook.
 * What IS enforced here are the structural limits that exist in the actor data model
 * (characteristics: advance 0-5, skills: advance 0-4) and the available EP.
 */
import { SYSTEM_ID } from '../system-id.mjs';
import { CHARACTERISTIC_ORDER } from '../sheets/actor/dossier-context.mjs';

export const MAX_CHARACTERISTIC_ADVANCE = 5;
export const MAX_SKILL_ADVANCE = 4;

/**
 * Resolves a purchase target key such as `char:strength`, `skill:awareness`, `spec:commonLore.adeptusArbites`,
 * `talent`, `psy`, `other`.
 * @returns {{label: string, category: string, update: object|null, error: string|null}}
 */
export function resolvePurchase(actor, target, customLabel = '') {
    const [kind, ref] = target.split(':');
    switch (kind) {
        case 'char': {
            const c = actor.system.characteristics[ref];
            if (!c) return fail('Unknown characteristic.');
            if (c.advance >= MAX_CHARACTERISTIC_ADVANCE) return fail(`${c.label} is already at the maximum advance.`);
            return {
                category: 'Characteristic',
                label: `${c.label} advance (${c.advance} → ${c.advance + 1})`,
                update: (cost) => ({
                    [`system.characteristics.${ref}.advance`]: c.advance + 1,
                    [`system.characteristics.${ref}.cost`]: Number(c.cost || 0) + cost,
                }),
                error: null,
            };
        }
        case 'skill': {
            const s = actor.system.skills[ref];
            if (!s || s.isSpecialist) return fail('Unknown skill.');
            if (s.advance >= MAX_SKILL_ADVANCE) return fail(`${s.label} is already at the maximum advance.`);
            return {
                category: 'Skill',
                label: `${s.label} advance (${s.advance} → ${Number(s.advance) + 1})`,
                update: (cost) => ({
                    [`system.skills.${ref}.advance`]: Number(s.advance) + 1,
                    [`system.skills.${ref}.cost`]: Number(s.cost || 0) + cost,
                }),
                error: null,
            };
        }
        case 'spec': {
            const [skillKey, specKey] = ref.split('.');
            const parent = actor.system.skills[skillKey];
            const s = parent?.specialities?.[specKey];
            if (!s) return fail('Unknown speciality.');
            if (!s.taken) return fail(`${parent.label}: ${s.label} is not taken yet. Add the speciality first.`);
            if (s.advance >= MAX_SKILL_ADVANCE) return fail(`${parent.label}: ${s.label} is already at the maximum advance.`);
            return {
                category: 'Skill',
                label: `${parent.label}: ${s.label} advance (${s.advance} → ${Number(s.advance) + 1})`,
                update: (cost) => ({
                    [`system.skills.${skillKey}.specialities.${specKey}.advance`]: Number(s.advance) + 1,
                    [`system.skills.${skillKey}.specialities.${specKey}.cost`]: Number(s.cost || 0) + cost,
                }),
                error: null,
            };
        }
        case 'psy':
            return {
                category: 'Psy Rating',
                label: customLabel || 'Psy Rating',
                update: (cost) => ({ 'system.psy.cost': Number(actor.system.psy.cost || 0) + cost }),
                error: null,
            };
        case 'talent':
            return { category: 'Talent', label: customLabel || 'Talent', update: () => ({}), error: customLabel ? null : 'Enter the talent name.' };
        default:
            return { category: 'Other', label: customLabel || 'Other', update: () => ({}), error: customLabel ? null : 'Enter a description.' };
    }

    function fail(error) {
        return { category: '', label: '', update: null, error };
    }
}

/**
 * Spends EP: validates, updates the actor and writes the log entry.
 * @returns {Promise<boolean>} true if the purchase was applied
 */
export async function spendExperience(actor, { target, cost, note = '', customLabel = '', gmOverride = false }) {
    cost = Math.floor(Number(cost));
    if (!Number.isFinite(cost) || cost <= 0) {
        ui.notifications.warn('Enter a positive EP cost.');
        return false;
    }
    const available = actor.system.experience.total - actor.system.experience.used;
    if (cost > available && !(gmOverride && game.user.isGM)) {
        ui.notifications.warn(`Not enough EP available (${available}).`);
        return false;
    }
    const purchase = resolvePurchase(actor, target, customLabel);
    if (purchase.error) {
        ui.notifications.warn(purchase.error);
        return false;
    }
    await actor.update({
        ...purchase.update(cost),
        'system.experience.used': actor.system.experience.used + cost,
    });
    await appendLog(actor, { type: 'spend', category: purchase.category, label: purchase.label, cost, note, override: gmOverride && cost > available });
    return true;
}

export async function awardExperience(actor, { amount, note = '' }) {
    amount = Math.floor(Number(amount));
    if (!Number.isFinite(amount) || amount <= 0) {
        ui.notifications.warn('Enter a positive EP amount.');
        return false;
    }
    await actor.update({ 'system.experience.total': actor.system.experience.total + amount });
    await appendLog(actor, { type: 'award', category: 'Award', label: 'Experience awarded', cost: amount, note });
    return true;
}

export async function appendLog(actor, entry) {
    const log = [...(actor.getFlag(SYSTEM_ID, 'xpLog') ?? [])];
    log.push({
        id: foundry.utils.randomID(),
        timestamp: Date.now(),
        user: game.user.name,
        note: '',
        ...entry,
    });
    await actor.setFlag(SYSTEM_ID, 'xpLog', log);
}

export async function removeLogEntry(actor, id) {
    const log = (actor.getFlag(SYSTEM_ID, 'xpLog') ?? []).filter((e) => e.id !== id);
    await actor.setFlag(SYSTEM_ID, 'xpLog', log);
}

/** Options for the purchase target select */
export function purchaseTargets(actor) {
    const chars = CHARACTERISTIC_ORDER.filter((k) => actor.system.characteristics[k]).map((k) => ({
        value: `char:${k}`,
        label: actor.system.characteristics[k].label,
    }));
    const skills = [];
    const specs = [];
    for (const [key, skill] of Object.entries(actor.system.skills)) {
        if (!skill.isSpecialist) {
            skills.push({ value: `skill:${key}`, label: skill.label });
        } else {
            for (const [specKey, spec] of Object.entries(skill.specialities ?? {})) {
                if (spec.taken) specs.push({ value: `spec:${key}.${specKey}`, label: `${skill.label}: ${spec.label}` });
            }
        }
    }
    return { chars, skills, specs };
}
