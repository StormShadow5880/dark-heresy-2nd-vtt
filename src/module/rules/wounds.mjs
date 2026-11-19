/**
 * Damage track of the character sheet.
 *
 * Data model of the system (unchanged): `wounds.value` are the REMAINING wounds, `wounds.max` the maximum and
 * `wounds.critical` the accumulated critical damage. The sheet presents this as a DAMAGE track:
 * damage = max - value, it starts at 0 and fills up to the maximum; further damage is counted as critical damage
 * which is listed separately, 10 critical damage mean the character is dead.
 *
 * "Minor damage" (as described by the group's reading of the rules): the first 2 x toughness bonus points of damage;
 * anything beyond means the character is seriously injured. This is display only, no roll or mechanic uses it.
 */

export const MAX_CRITICAL = 10;
export const MAX_WOUND_CELLS = 40;

function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

/**
 * @param value {number} remaining wounds
 * @param max {number} maximum wounds
 * @param critical {number} critical damage
 * @param toughnessBonus {number}
 */
export function woundBar(value, max, critical, toughnessBonus) {
    const m = Math.max(0, Math.floor(toNumber(max)));
    const v = Math.min(m, Math.max(0, Math.floor(toNumber(value))));
    const damage = m - v;
    const crit = Math.min(MAX_CRITICAL, Math.max(0, Math.floor(toNumber(critical))));
    const minorLimit = Math.min(m, Math.max(0, 2 * Math.floor(toNumber(toughnessBonus))));
    const count = Math.min(m, MAX_WOUND_CELLS);
    const per = count ? m / count : 1;
    const cells = [];
    for (let i = 0; i < count; i++) {
        const start = i * per;
        cells.push({
            filled: start < damage,
            minor: start < minorLimit,
            gap: false,
        });
    }
    // the gap sits between the minor and the serious zone
    const firstSerious = cells.findIndex((c) => !c.minor);
    if (firstSerious > 0) cells[firstSerious].gap = true;

    const dead = crit >= MAX_CRITICAL;
    return {
        cells,
        damage,
        max: m,
        minorLimit,
        minorCells: cells.filter((c) => c.minor).length,
        seriousCells: cells.filter((c) => !c.minor).length,
        hasDamage: damage > 0,
        serious: m > 0 && damage > minorLimit,
        full: m > 0 && damage >= m,
        critical: crit,
        criticalPips: Array.from({ length: MAX_CRITICAL }, (_, i) => ({ level: i + 1, filled: i < crit })),
        dead,
        state: dead ? 'dead' : crit > 0 ? 'critical' : damage > minorLimit ? 'serious' : damage > 0 ? 'minor' : 'unharmed',
    };
}

/**
 * Applies one step of damage (delta > 0) or healing (delta < 0).
 *
 * Damage is applied to the wounds first; once the maximum wounds are reached every further point of damage
 * is counted as critical damage (capped at MAX_CRITICAL). Healing runs exactly the other way round:
 * critical damage is reduced first, then the wounds. Nothing becomes negative.
 *
 * Critical damage here is only the excess damage that is tracked on the sheet. Critical injuries and their
 * effects are still handled by the existing critical damage rules of the system.
 *
 * @returns {{value?: number, critical?: number} | null} the update to apply, or null when nothing changes
 */
export function adjustDamage({ value, max, critical }, delta) {
    const m = Math.max(0, Math.floor(toNumber(max)));
    const v = Math.min(m, Math.max(0, Math.floor(toNumber(value))));
    const c = Math.min(MAX_CRITICAL, Math.max(0, Math.floor(toNumber(critical))));
    const step = Math.sign(delta);
    if (step > 0) {
        if (v > 0) return { value: v - 1 };
        if (c < MAX_CRITICAL) return { critical: c + 1 };
        return null;
    }
    if (step < 0) {
        if (c > 0) return { critical: c - 1 };
        if (v < m) return { value: v + 1 };
        return null;
    }
    return null;
}

/**
 * A damage amount typed into the wounds field: the wounds take up to their maximum, everything above that is
 * entered as critical damage. A value within the maximum leaves the critical damage untouched.
 * @returns {{value: number, critical: number}} remaining wounds and critical damage to store
 */
export function applyTypedDamage(typed, max, critical) {
    const m = Math.max(0, Math.floor(toNumber(max)));
    const d = Math.max(0, Math.floor(toNumber(typed)));
    const c = Math.min(MAX_CRITICAL, Math.max(0, Math.floor(toNumber(critical))));
    return {
        value: m - Math.min(m, d),
        critical: d > m ? Math.min(MAX_CRITICAL, d - m) : c,
    };
}
