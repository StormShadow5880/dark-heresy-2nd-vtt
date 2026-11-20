/**
 * RULES IMPORTED FROM IMPERIUM MALEDICTUM (IM)
 * ============================================================================================================
 * Everything in this file is NOT original Dark Heresy 2E: it is a rule taken over from the game
 * "Imperium Maledictum" and used in this system on purpose. Keep such rules in this file, name the source,
 * and add them to docs/imperium-maledictum-imports.md and CHANGELOG.md, so it stays traceable later which
 * parts of the system come from IM and which from DH2.
 *
 * Imported so far:
 *   IM-001  Maximum wounds (introduced in system version 1.9.0)
 * ============================================================================================================
 */

/** Registry of the imports (also shown in docs/imperium-maledictum-imports.md) */
export const IM_IMPORTS = {
    'IM-001': {
        title: 'Maximum wounds',
        formula: 'Max Wounds = Strength Bonus + (2 × Toughness Bonus) + Willpower Bonus',
        since: '1.9.0',
        setting: 'wounds-formula',
    },
};

/**
 * IM-001: Maximum wounds.
 *   Max Wounds = Strength Bonus + (2 × Toughness Bonus) + Willpower Bonus
 *
 * The bonuses are the tens digits of the characteristics ("wound bonus"). The unnatural bonus and the fatigue
 * penalty are NOT included: wounds are strictly separated from them. A modifier can be added for special cases.
 *
 * @param bonuses {{strength: number, toughness: number, willpower: number}}
 * @param modifier {number} flat bonus or malus
 * @returns {number} never below 0
 */
export function maxWounds({ strength, toughness, willpower }, modifier = 0) {
    const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    return Math.max(0, Math.floor(n(strength) + 2 * n(toughness) + n(willpower) + n(modifier)));
}

/** Text for tooltips: "SB 4 + 2 × TB 3 + WPB 4 = 14" */
export function maxWoundsBreakdown({ strength, toughness, willpower }, modifier = 0) {
    const total = maxWounds({ strength, toughness, willpower }, modifier);
    const mod = Number(modifier) ? ` ${modifier > 0 ? '+' : '−'} ${Math.abs(modifier)}` : '';
    return `SB ${strength} + 2 × TB ${toughness} + WPB ${willpower}${mod} = ${total}`;
}

/**
 * The stored maximum follows the calculated maximum. Wounds are stored as REMAINING wounds, so a changed maximum
 * moves the remaining wounds by the same amount: the damage the character has taken stays the same.
 * Example: max 12 -> 15 (a power becomes active) with 12 remaining: now 15 remaining, still undamaged.
 *
 * @param persistedMax {number} maximum as stored on the actor
 * @param computedMax {number} maximum from the formula
 * @param value {number} remaining wounds as stored
 * @returns {{max: number, value: number}|null} the update to store, null if nothing changes
 */
export function reconcileWounds({ persistedMax, computedMax, value }) {
    const stored = Number(persistedMax) || 0;
    const target = Number(computedMax) || 0;
    if (stored === target) return null;
    const remaining = Number(value) || 0;
    const next = Math.min(target, Math.max(0, remaining + (target - stored)));
    return { max: target, value: next };
}
