/**
 * Degrees of success and failure of a percentile test.
 *
 * The degrees are the DIFFERENCE OF THE TENS DIGITS of target number and roll:
 *   success: tens(target) - tens(roll)      e.g. roll 69 vs 70 -> 7 - 6 = 1 degree
 *   failure: tens(roll) - tens(target)      e.g. roll 83 vs 40 -> 8 - 4 = 4 degrees
 * Same tens digit = 0 degrees (the test still succeeds / fails). Before system version 1.9.0 one degree was added to
 * both (69 vs 70 gave 2); see CHANGELOG.md.
 *
 * Two numbers are kept on a roll:
 *   dos / dof          the degrees as shown (chat card, opposed comparison): difference of the tens digits
 *   ruleDos / ruleDof  the count the Dark Heresy 2E rule texts are written for: 1 degree for the success itself plus the
 *                      tens difference. Burst fire, Twin-Linked, Accurate, Razor Sharp, Lance, Eye of Vengeance and the
 *                      opposed knock-down thresholds use this one, so their behaviour is unchanged by the display rule.
 */
const tens = (n) => Math.floor(Number(n) / 10);

/** @returns {number} 0 or more */
export function degreesOfSuccess(roll, target) {
    return Math.max(0, tens(target) - tens(roll));
}

/** @returns {number} 0 or more */
export function degreesOfFailure(roll, target) {
    return Math.max(0, tens(roll) - tens(target));
}

/** The Dark Heresy 2E rule count for a shown degree: success counts one degree itself, plus the tens difference */
export const toRuleDegrees = (shown) => Math.max(0, Number(shown) || 0) + 1;
