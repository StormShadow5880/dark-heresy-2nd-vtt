/**
 * Fatigue. Pure rules, no Foundry access.
 *
 * - The fatigue limit (maximum) is Toughness Bonus + Willpower Bonus **without** the effect of fatigue itself. It must not shrink
 *   while the fatigue rises, otherwise the counter blocks itself (a higher fatigue halves Toughness, the halved Toughness lowers
 *   the limit, the limit stops the counter).
 * - A characteristic whose bonus is lower than the fatigue is halved (rule of the system as it was).
 */

/** Bonus of a characteristic from its total and the unnatural bonus */
export function bonusOf(total, unnatural = 0) {
    return Math.floor(Number(total) / 10) + (Number(unnatural) || 0);
}

/**
 * Applies fatigue to one characteristic (it has `total`, `bonus`, `unnatural`). Remembers the bonus before the penalty in
 * `bonusBeforeFatigue` and halves total and bonus when the fatigue is higher than the bonus.
 */
export function applyFatigue(characteristic, fatigue) {
    characteristic.bonusBeforeFatigue = characteristic.bonus;
    if (Number(fatigue) > characteristic.bonus) {
        characteristic.total = Math.ceil(characteristic.total / 2);
        characteristic.bonus = bonusOf(characteristic.total, characteristic.unnatural);
    }
    return characteristic;
}

/** The fatigue limit from the bonuses before fatigue */
export function fatigueMax(characteristics) {
    const t = characteristics?.toughness;
    const w = characteristics?.willpower;
    return (Number(t?.bonusBeforeFatigue ?? t?.bonus) || 0) + (Number(w?.bonusBeforeFatigue ?? w?.bonus) || 0);
}
