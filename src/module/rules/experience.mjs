/**
 * Experience point (EP) handling for the character sheet.
 *
 * Characteristic, skill and talent advances are priced automatically (advancement.mjs) and bought with
 * purchaseAdvancement(). spendExperience() is the manual path for everything that has no automatic price yet
 * (psychic powers, other entries): the cost is entered by hand there.
 */
import { SYSTEM_ID } from '../system-id.mjs';
import { CHARACTERISTIC_ORDER } from '../sheets/actor/dossier-context.mjs';
import { availableXp, characteristicQuote, checkPurchase, num, powerQuote, skillQuote, talentQuote } from './advancement.mjs';

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

const purchasesRunning = new Set();

/**
 * Buys the next advance of a characteristic, skill (speciality) or a talent at the automatically calculated price.
 * Validates against fresh actor data, then applies advance, spent XP and the log entry in ONE actor update, so a
 * failed purchase leaves nothing half changed. A talent is created first and removed again if that update fails.
 *
 * @param actor
 * @param purchase {{kind: 'char'|'skill'|'spec'|'talent', key: string, talent?: object, choice?: string,
 *                    prerequisitesConfirmed?: boolean, note?: string}}
 * @returns {Promise<{ok: boolean, errors: string[], quote?: object}>}
 */
export async function purchaseAdvancement(actor, { kind, key, talent = null, power = null, choice = '', prerequisitesConfirmed = false, gmOverride = false, note = '', silent = false }) {
    const lock = `${actor.id ?? actor.name}`;
    if (purchasesRunning.has(lock)) return { ok: false, errors: ['Another purchase is still being processed.'] };
    purchasesRunning.add(lock);
    try {
        let quote;
        if (kind === 'char') quote = characteristicQuote(actor, key);
        else if (kind === 'skill') quote = skillQuote(actor, key);
        else if (kind === 'spec') {
            const [skillKey, specKey] = key.split('.');
            quote = skillQuote(actor, skillKey, specKey);
        } else if (kind === 'talent' && talent) quote = talentQuote(actor, talent, choice);
        else if (kind === 'power' && power) quote = powerQuote(actor, power);
        else return fail(['Unknown advancement.']);

        // only a GM can override an unmet prerequisite
        const check = checkPurchase(actor, quote, { prerequisitesConfirmed, gmOverride: gmOverride && !!game.user?.isGM });
        if (!check.ok) return fail(check.errors, quote);

        const cost = quote.cost;
        const used = num(actor.system.experience.used) + cost;
        const entry = {
            id: foundry.utils.randomID(),
            timestamp: Date.now(),
            user: game.user.name,
            type: 'spend',
            category: kind === 'char' ? 'Characteristic' : kind === 'talent' ? 'Talent' : kind === 'power' ? 'Psychic Power' : 'Skill',
            label: kind === 'talent' ? `${quote.label} (tier ${quote.tier})` : kind === 'power' ? quote.label : `${quote.label} advance (${quote.fromName} → ${quote.toName})`,
            cost,
            note,
            matches: quote.matches,
            auto: true,
        };
        const log = [...(actor.getFlag(SYSTEM_ID, 'xpLog') ?? []), entry];
        const update = { 'system.experience.used': used, [`flags.${SYSTEM_ID}.xpLog`]: log };

        if (kind === 'char') {
            const c = actor.system.characteristics[key];
            update[`system.characteristics.${key}.advance`] = num(c.advance) + 1;
            update[`system.characteristics.${key}.cost`] = num(c.cost) + cost;
        } else if (kind === 'skill') {
            const s = actor.system.skills[key];
            update[`system.skills.${key}.advance`] = num(s.advance) + 1;
            update[`system.skills.${key}.cost`] = num(s.cost) + cost;
        } else if (kind === 'spec') {
            const [skillKey, specKey] = key.split('.');
            const s = actor.system.skills[skillKey].specialities[specKey];
            update[`system.skills.${skillKey}.specialities.${specKey}.advance`] = num(s.advance) + 1;
            update[`system.skills.${skillKey}.specialities.${specKey}.cost`] = num(s.cost) + cost;
        }

        let created = null;
        try {
            if (kind === 'power') {
                // the power of the compendium as a new item of the character (without the identity of the compendium entry)
                const { _id, folder, sort, ownership, _stats, ...rest } = power.data ?? {};
                const data = { ...rest, system: { ...(rest.system ?? {}), cost } };
                [created] = await actor.createEmbeddedDocuments('Item', [data]);
            }
            if (kind === 'talent') {
                const data = {
                    name: quote.label,
                    type: 'talent',
                    img: talent.img,
                    system: { ...(talent.system ?? {}), aptitudes: talent.aptitudes, tier: String(quote.tier), prerequisites: quote.prerequisites, cost },
                };
                [created] = await actor.createEmbeddedDocuments('Item', [data]);
            }
            await actor.update(update);
        } catch (error) {
            if (created) await actor.deleteEmbeddedDocuments('Item', [created.id]).catch(() => {});
            console.error('Dark Heresy 2e | advancement failed', error);
            return fail(['The purchase failed, nothing was changed.'], quote);
        }
        return { ok: true, errors: [], quote };
    } finally {
        purchasesRunning.delete(lock);
    }

    function fail(errors, quote) {
        if (!silent) for (const message of errors) ui.notifications.warn(message);
        return { ok: false, errors, quote };
    }
}

export { availableXp };
