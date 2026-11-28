/**
 * Named origin bonuses for skill rolls (home world, background, role).
 *
 * Only rules whose exact wording is stored in the system data (rules/homeworlds.mjs, backgrounds.mjs,
 * roles.mjs) are listed. Nothing here is a blanket "+20": every entry names its source, its effect, its condition
 * and, for Fate Point options, its cost. The player ticks an entry on purpose, the condition is theirs to judge.
 * Fate Point options are mutually exclusive (one Fate Point, one effect) and spent once, after the roll.
 */

const SOCIAL = ['charm', 'command', 'commerce', 'deceive', 'inquiry', 'intimidate'];
const LORES = ['commonLore', 'forbiddenLore', 'scholasticLore'];

/** kind 'modifier': a fixed bonus to the target. 'degree': extra degrees of success on a success. */
export const ORIGIN_BONUSES = [
    { id: 'hive-navigate', from: ['homeWorld', 'Hive World'], name: 'Hive World', kind: 'modifier', value: 20, skills: [['navigate', 'surface']], condition: 'in closed spaces' },
    { id: 'frontier-modify', from: ['homeWorld', 'Frontier World'], name: 'Frontier World', kind: 'modifier', value: 20, skills: [['techUse']], condition: 'when applying personal weapon modifications' },
    { id: 'frontier-repair', from: ['homeWorld', 'Frontier World'], name: 'Frontier World', kind: 'modifier', value: 10, skills: [['techUse']], condition: 'when repairing damaged items' },
    { id: 'yanth-craft', from: ['homeWorld', 'Yanth'], name: 'Yanth', kind: 'modifier', value: 20, skills: [['medicae'], ['survival']], condition: 'for the Crafting special uses' },
    { id: 'oath-commerce', from: ['homeWorld', 'The Oath Unspoken'], name: 'The Oath Unspoken', kind: 'modifier', value: 20, skills: [['commerce']], condition: 'opposed Commerce tests and Commerce (Evaluate)' },
    { id: 'forraliss-degree', from: ['homeWorld', 'Forraliss'], name: 'Forraliss', kind: 'degree', value: 1, skills: [['charm'], ['deceive']], condition: 'on a successful test' },
    { id: 'heretek-tech', from: ['background', 'Heretek'], name: 'Heretek', kind: 'modifier', value: 20, skills: [['techUse']], condition: 'to comprehend, use, repair or modify an unfamiliar device, with a relevant Forbidden Lore specialisation at Rank 1 or higher' },
    { id: 'trader-aliens', from: ['background', 'Rogue Trader'], name: 'Rogue Trader Fleet', kind: 'modifier', value: 20, skills: SOCIAL.map((k) => [k]), condition: 'Interaction tests with alien characters' },
    { id: 'penitent-first', from: ['role', 'Penitent'], name: 'Penitent', kind: 'modifier', value: 10, skills: 'any', condition: 'first test after suffering damage, before the end of the next turn (once; the sheet does not track it)' },
];

/** Fate Point options. 'bonus': +value to the target. 'auto': automatic success with degrees = characteristic bonus. */
export const FATE_OPTIONS = [
    { id: 'fate-plus10', from: null, name: 'Fate Point', kind: 'bonus', value: 10, skills: 'any', condition: 'spend a Fate Point for +10 to any one test' },
    { id: 'ministorum-plus20', from: ['background', 'Adeptus Ministorum'], name: 'Adeptus Ministorum', kind: 'bonus', value: 20, skills: 'any', condition: 'spend a Fate Point for +20 instead of +10', replaces: 'fate-plus10' },
    { id: 'hierophant-fate', from: ['role', 'Hierophant'], name: 'Hierophant', kind: 'auto', characteristic: 'willpower', skills: [['charm'], ['command'], ['intimidate']], condition: 'automatic success, degrees = Willpower Bonus' },
    { id: 'sage-fate', from: ['role', 'Sage'], name: 'Sage', kind: 'auto', characteristic: 'intelligence', skills: [['logic'], ...LORES.map((k) => [k])], condition: 'automatic success, degrees = Intelligence Bonus' },
    { id: 'seeker-fate', from: ['role', 'Seeker'], name: 'Seeker', kind: 'auto', characteristic: 'perception', skills: [['awareness'], ['inquiry']], condition: 'automatic success, degrees = Perception Bonus' },
    { id: 'ace-fate', from: ['role', 'Ace'], name: 'Ace', kind: 'auto', characteristic: 'agility', skills: [['operate'], ['survival']], condition: 'only for tests involving vehicles or living steeds; automatic success, degrees = Agility Bonus' },
    { id: 'chirurgeon-fate', from: ['role', 'Chirurgeon'], name: 'Chirurgeon', kind: 'auto', characteristic: 'intelligence', skills: [['medicae']], failureOnly: true, condition: 'only after a failed First Aid test; automatic success instead, degrees = Intelligence Bonus' },
];

const matchesSkill = (skills, skillKey, specKey) => skills === 'any' || skills.some(([k, s]) => k === skillKey && (!s || s === specKey));
const ownedBy = (from, bio = {}) => !from || bio[from[0]] === from[1];

/** The bonuses and Fate options this character could use for this skill. Pure; the choice stays with the player. */
export function applicableOriginBonuses(bio, skillKey, specKey) {
    const pick = (list) => list.filter((b) => ownedBy(b.from, bio) && matchesSkill(b.skills, skillKey, specKey));
    const fate = pick(FATE_OPTIONS);
    // the Ministorum bonus replaces the standard Fate bonus
    const replaced = new Set(fate.map((f) => f.replaces).filter(Boolean));
    return { modifiers: pick(ORIGIN_BONUSES), fate: fate.filter((f) => !replaced.has(f.id)) };
}

/**
 * Turns the player's selection into roll parts.
 * @param {object} p { bio, skillKey, specKey, selected: string[], fateId: string|null, fatePoints: number }
 * @returns {{ modifiers: Object<string, number>, degrees: object[], fate: object|null, errors: string[] }}
 */
export function planOriginRoll({ bio, skillKey, specKey, selected = [], fateId = null, fatePoints = 0 }) {
    const avail = applicableOriginBonuses(bio, skillKey, specKey);
    const modifiers = {};
    const degrees = [];
    const errors = [];
    for (const id of new Set(selected)) {
        const b = avail.modifiers.find((x) => x.id === id);
        if (!b) {
            errors.push(`${id} does not apply to this test`);
            continue;
        }
        if (b.kind === 'modifier') modifiers[`${b.name}`] = (modifiers[b.name] ?? 0) + b.value;
        else degrees.push(b);
    }
    let fate = null;
    if (fateId) {
        fate = avail.fate.find((x) => x.id === fateId) ?? null;
        if (!fate) errors.push(`${fateId} does not apply to this test`);
        else if (fatePoints < 1) {
            errors.push('No Fate Point available');
            fate = null;
        } else if (fate.kind === 'bonus') modifiers[`Fate (${fate.name})`] = fate.value;
    }
    return { modifiers, degrees, fate, errors };
}

/**
 * Applies the result-side parts after the roll. Returns what changed and whether the Fate Point is spent.
 * @param {object} roll { success, dos, dof } (ruleDos is derived by the caller)
 */
export function applyOriginResult(roll, plan, characteristicBonus = 0) {
    const out = { ...roll, notes: [], spendFate: false };
    if (plan.fate) {
        if (plan.fate.kind === 'bonus') out.spendFate = true;
        else if (plan.fate.failureOnly && roll.success) out.notes.push(`${plan.fate.name} Fate Point not spent: the test succeeded`);
        else {
            out.spendFate = true;
            out.success = true;
            out.dof = 0;
            out.dos = Math.max(0, characteristicBonus);
            out.notes.push(`${plan.fate.name}: automatic success with ${out.dos} degrees`);
        }
    }
    if (out.success) {
        for (const d of plan.degrees) {
            out.dos += d.value;
            out.notes.push(`${d.name}: +${d.value} degree of success`);
        }
    }
    return out;
}
