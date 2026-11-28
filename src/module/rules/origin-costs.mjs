/**
 * Origin rules about losses, costs and thresholds (pure functions, no Foundry).
 */

/* ---- Highborn, "Breeding Counts": Influence losses are reduced by 1, to a minimum loss of 1 ---- */

/**
 * Sources of an Influence change:
 *  - 'rule'      a loss that a rule demands (the only one that Highborn reduces)
 *  - 'voluntary' Influence given as a cost by choice: NOT reduced (no advantage is assumed from the interaction)
 *  - 'admin'     a GM correction, a recalculation or an initial value: never reduced
 * Gains are never touched.
 * @returns {{ amount:number, loss:number, reduced:boolean }} `loss` is what is really taken
 */
export function influenceLoss(bio, amount, source = 'rule') {
    const n = Math.floor(Number(amount));
    if (!Number.isFinite(n) || n <= 0) return { amount: 0, loss: 0, reduced: false };
    if (source === 'rule' && bio?.homeWorld === 'Highborn') return { amount: n, loss: Math.max(1, n - 1), reduced: n > 1 };
    return { amount: n, loss: n, reduced: false };
}

/* ---- Garden World, "Serenity of the Green" ---- */

export const GARDEN_XP_PER_INSANITY = 50;

/** Halves a duration, rounded up. A missing or not whole duration is not invented. */
export function halveDurationRoundedUp(duration) {
    const n = Number(duration);
    if (!Number.isInteger(n) || n <= 0) return null;
    return Math.ceil(n / 2);
}

/**
 * Removing Insanity as a Garden World character: 50 XP per point from the character's own pool (project decision: only with the GM's approval).
 * No Disorder is removed by this.
 * @returns {{ ok:boolean, cost:number, points:number, error:string|null }}
 */
export function insanityRemoval({ bio, insanity, xpAvailable, points, approved }) {
    const n = Math.floor(Number(points));
    const fail = (error) => ({ ok: false, cost: 0, points: 0, error });
    if (bio?.homeWorld !== 'Garden World') return fail('Only a Garden World character can remove Insanity this way.');
    if (!Number.isFinite(n) || n < 1) return fail('Enter at least 1 point.');
    if (n > Number(insanity ?? 0)) return fail('The character does not have that much Insanity.');
    const cost = n * GARDEN_XP_PER_INSANITY;
    if (cost > Number(xpAvailable ?? 0)) return fail(`Not enough EP: ${cost} needed, ${Math.max(0, Number(xpAvailable ?? 0))} available.`);
    if (!approved) return fail('The GM has to approve this.');
    return { ok: true, cost, points: n, error: null };
}

/* ---- Exorcised, "Touched by a Daemon" ---- */

/** The Insanity Bonus that counts for avoiding Fear Tests: 2 higher for an Exorcised character. Nothing else uses it. */
export function fearInsanityBonus(bio, insanityBonus) {
    const b = Number(insanityBonus) || 0;
    return bio?.background === 'Exorcised' ? b + 2 : b;
}
