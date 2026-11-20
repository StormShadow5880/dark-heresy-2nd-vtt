/**
 * Central advancement calculation of Dark Heresy 2E: which aptitudes an advance needs, how many of them the
 * character has, and what it costs. Everything is derived from the actor data and the tables in
 * advancement-data.mjs. No UI code, no document updates (see purchase.mjs / experience.mjs for those).
 *
 * A "quote" describes one possible next advance:
 *   { kind, key, label, fromName, toName, maxed, advanceable, required: [names], matched: [names], matches, cost, error }
 */
import {
    APTITUDES,
    APTITUDE_ALIASES,
    CHARACTERISTIC_APTITUDES,
    CHARACTERISTIC_COSTS,
    CHARACTERISTIC_LEVELS,
    IMPLICIT_APTITUDES,
    MULTIPLE_TALENTS,
    SKILL_APTITUDES,
    SKILL_COSTS,
    SKILL_LEVELS,
    TALENT_COSTS,
} from './advancement-data.mjs';

export const MAX_CHARACTERISTIC_LEVEL = CHARACTERISTIC_LEVELS.length - 1;
export const MAX_SKILL_LEVEL = SKILL_LEVELS.length - 1;
export const MAX_TALENT_TIER = 3;

/** Number that never is NaN: undefined, '' and text count as 0 */
export function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

/** "Weapon Skill", "weapon skill", "Defense" -> stable aptitude id ("weaponSkill", "defence") */
export function aptitudeId(name) {
    const flat = String(name ?? '')
        .toLowerCase()
        .replace(/[^a-z]/g, '');
    const id = APTITUDE_ALIASES[flat] ?? flat;
    return Object.keys(APTITUDES).find((key) => key.toLowerCase() === id) ?? null;
}

export function aptitudeName(id) {
    return APTITUDES[id] ?? id;
}

/**
 * Aptitudes an advance asks for. A text such as "Weapon Skill/Ballistic Skill, Finesse" or an array of ids.
 * Each entry is a group of alternatives (any of them counts), duplicates are dropped.
 * @returns {string[][]} groups of aptitude ids
 */
export function parseRequirement(requirement) {
    const entries = Array.isArray(requirement) ? requirement : String(requirement ?? '').split(',');
    const groups = [];
    for (const entry of entries) {
        const alternatives = [...new Set(String(entry).split('/').map(aptitudeId).filter(Boolean))];
        if (!alternatives.length) continue;
        if (!groups.some((g) => g.join('|') === alternatives.join('|'))) groups.push(alternatives);
    }
    return groups;
}

/** Unique aptitude ids of the character: the aptitude items on the actor plus the ones everyone has */
export function ownedAptitudes(actor) {
    const owned = new Set(IMPLICIT_APTITUDES);
    for (const item of actor.items ?? []) {
        if (item.type !== 'aptitude') continue;
        const id = aptitudeId(item.name);
        if (id) owned.add(id);
    }
    return owned;
}

/** Matching aptitudes (never more than 2, duplicates do not count twice) */
export function matchAptitudes(requirement, owned) {
    const groups = parseRequirement(requirement);
    const matchedGroups = groups.filter((group) => group.some((id) => owned.has(id)));
    return {
        required: groups.map((g) => g.map(aptitudeName).join(' / ')),
        matched: matchedGroups.map((g) => g.map(aptitudeName).join(' / ')),
        matches: Math.min(2, matchedGroups.length),
    };
}

/** Price from a cost table; null if the level does not exist */
export function lookupCost(table, matches, level) {
    const row = table[Math.max(0, Math.min(2, matches))];
    const cost = row?.[level - 1];
    return Number.isFinite(cost) ? cost : null;
}

function base(kind, key, label) {
    return { kind, key, label, advanceable: true, maxed: false, required: [], matched: [], matches: 0, cost: null, error: null, fromName: '', toName: '' };
}

/** Next advance of a characteristic */
export function characteristicQuote(actor, key, owned = ownedAptitudes(actor)) {
    const c = actor.system.characteristics?.[key];
    const quote = base('char', key, c?.label ?? key);
    if (!c) return { ...quote, advanceable: false, error: 'Unknown characteristic.' };
    const requirement = CHARACTERISTIC_APTITUDES[key];
    if (!requirement) return { ...quote, advanceable: false, error: `${c.label} cannot be advanced.` };
    const level = Math.max(0, Math.floor(num(c.advance)));
    Object.assign(quote, matchAptitudes(requirement, owned), { level, fromName: CHARACTERISTIC_LEVELS[level] ?? String(level) });
    if (level >= MAX_CHARACTERISTIC_LEVEL) return { ...quote, maxed: true, toName: 'Maximum' };
    quote.toName = CHARACTERISTIC_LEVELS[level + 1];
    quote.cost = lookupCost(CHARACTERISTIC_COSTS, quote.matches, level + 1);
    quote.gain = '+5';
    return quote;
}

/** Next advance of a skill, or of one speciality of a specialist skill */
export function skillQuote(actor, key, specKey = null, owned = ownedAptitudes(actor)) {
    const skill = actor.system.skills?.[key];
    const quote = base(specKey ? 'spec' : 'skill', specKey ? `${key}.${specKey}` : key, skill?.label ?? key);
    if (!skill) return { ...quote, advanceable: false, error: 'Unknown skill.' };
    let target = skill;
    if (skill.isSpecialist) {
        if (!specKey) return { ...quote, advanceable: false, error: `${skill.label}: choose a speciality.` };
        target = skill.specialities?.[specKey];
        if (!target) return { ...quote, advanceable: false, error: 'Unknown speciality.' };
        quote.label = `${skill.label}: ${target.label}`;
        if (!target.taken) return { ...quote, advanceable: false, error: `${quote.label} is not taken yet. Add the speciality first.` };
    }
    const requirement = SKILL_APTITUDES[key];
    if (!requirement) return { ...quote, advanceable: false, error: `No aptitudes are defined for ${skill.label}.` };
    const level = Math.max(0, Math.floor(num(target.advance)));
    Object.assign(quote, matchAptitudes(requirement, owned), { level, fromName: SKILL_LEVELS[level] ?? String(level) });
    if (level >= MAX_SKILL_LEVEL) return { ...quote, maxed: true, toName: 'Maximum' };
    quote.toName = SKILL_LEVELS[level + 1];
    quote.cost = lookupCost(SKILL_COSTS, quote.matches, level + 1);
    return quote;
}

/** Talents of the actor by lower case name */
export function ownedTalentNames(actor) {
    const names = new Set();
    for (const item of actor.items ?? []) if (item.type === 'talent') names.add(String(item.name).trim().toLowerCase());
    return names;
}

export function isMultipleTalent(name) {
    const base = String(name ?? '').replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase();
    return MULTIPLE_TALENTS.some((t) => t.toLowerCase() === base);
}

/**
 * Cost and state of buying a talent.
 * @param talent {{name: string, aptitudes: string, tier: number|string, prerequisites?: string}}
 * @param choice {string} the choice of a multiple talent, e.g. "Las" for Weapon Training
 */
export function talentQuote(actor, talent, choice = '', owned = ownedAptitudes(actor)) {
    const multiple = isMultipleTalent(talent.name);
    const name = multiple && choice ? `${talent.name} (${choice})` : talent.name;
    const quote = { ...base('talent', talent.name, name), multiple, prerequisites: String(talent.prerequisites ?? '').trim() };
    const tier = Math.floor(num(talent.tier));
    quote.tier = tier;
    Object.assign(quote, matchAptitudes(talent.aptitudes, owned), { fromName: 'Not learned', toName: `Tier ${tier}` });
    if (tier < 1 || tier > MAX_TALENT_TIER) return { ...quote, advanceable: false, error: `${talent.name} has no valid tier (${talent.tier}).` };
    if (!parseRequirement(talent.aptitudes).length) return { ...quote, advanceable: false, error: `${talent.name} has no aptitudes defined.` };
    if (multiple && !choice) return { ...quote, advanceable: false, error: `${talent.name} needs a choice, for example a weapon group.` };
    if (ownedTalentNames(actor).has(name.trim().toLowerCase())) {
        return { ...quote, advanceable: false, maxed: true, error: `${name} is already learned.` };
    }
    quote.cost = lookupCost(TALENT_COSTS, quote.matches, tier);
    return quote;
}

export function availableXp(actor) {
    return num(actor.system.experience?.total) - num(actor.system.experience?.used);
}

/**
 * Can this quote be bought right now?
 * @returns {{ok: boolean, errors: string[], remaining: number}}
 */
export function checkPurchase(actor, quote, { prerequisitesConfirmed = false } = {}) {
    const errors = [];
    const available = availableXp(actor);
    if (quote.error) errors.push(quote.error);
    else if (quote.maxed) errors.push(`${quote.label} is already at the maximum.`);
    else if (!Number.isFinite(quote.cost) || quote.cost <= 0) errors.push('No cost could be determined.');
    if (!errors.length && quote.cost > available) errors.push(`Not enough EP: ${quote.cost} needed, ${available} available.`);
    if (!errors.length && quote.prerequisites && !prerequisitesConfirmed) errors.push(`Check the prerequisites first: ${quote.prerequisites}`);
    return { ok: errors.length === 0, errors, remaining: available - (quote.cost ?? 0) };
}

/** One line for tooltips and the dialog, e.g. "Required: Ballistic Skill + Finesse · Matching 1/2 · 250 EP" */
export function describeQuote(quote) {
    if (!quote.advanceable && quote.error) return quote.error;
    if (quote.maxed) return 'Maximum';
    return `Required: ${quote.required.join(' + ') || '—'} · Matching ${quote.matches}/2${quote.matched.length ? ` (${quote.matched.join(', ')})` : ''} · ${quote.cost ?? '?'} EP`;
}

/** Quotes for the whole advancement overview */
export function buildQuotes(actor) {
    const owned = ownedAptitudes(actor);
    const characteristics = Object.keys(CHARACTERISTIC_APTITUDES)
        .filter((key) => actor.system.characteristics?.[key])
        .map((key) => ({ ...characteristicQuote(actor, key, owned), short: actor.system.characteristics[key].short }));
    const skills = [];
    for (const [key, skill] of Object.entries(actor.system.skills ?? {})) {
        if (!skill.isSpecialist) skills.push(skillQuote(actor, key, null, owned));
        else
            for (const [specKey, spec] of Object.entries(skill.specialities ?? {})) {
                if (spec.taken) skills.push(skillQuote(actor, key, specKey, owned));
            }
    }
    return { characteristics, skills, aptitudes: [...owned].map(aptitudeName) };
}

/**
 * XP spent per category, summed from the cost fields of the actor data. Every value goes through num(), so
 * missing, empty or text values count as 0 and the sums are never NaN.
 * @param system {object} actor system data
 * @param items {Iterable<object>} items of the actor
 */
export function sumSpentXp(system, items = []) {
    let spentCharacteristics = 0;
    let spentSkills = 0;
    let spentTalents = 0;
    let spentPsychicPowers = num(system.psy?.cost);
    for (const c of Object.values(system.characteristics ?? {})) spentCharacteristics += num(c.cost);
    for (const skill of Object.values(system.skills ?? {})) {
        if (skill.isSpecialist) for (const spec of Object.values(skill.specialities ?? {})) spentSkills += num(spec.cost);
        else spentSkills += num(skill.cost);
    }
    for (const item of items) {
        if (item.type === 'talent') spentTalents += num(item.system?.cost);
        else if (item.type === 'psychicPower') spentPsychicPowers += num(item.system?.cost);
    }
    return { spentCharacteristics, spentSkills, spentTalents, spentPsychicPowers, calculatedTotal: spentCharacteristics + spentSkills + spentTalents + spentPsychicPowers };
}
