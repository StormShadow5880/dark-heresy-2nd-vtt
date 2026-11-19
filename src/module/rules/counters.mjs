/**
 * Simple counters on the sheet (Fatigue, Fate, Corruption, Insanity) are changed with plus/minus buttons.
 * The stored maximum values (where the system has one) are respected, nothing becomes negative.
 *
 * @param current {number}
 * @param delta {number} usually +1 / -1
 * @param max {number|null|undefined} maximum, a missing or zero maximum means "no upper limit"
 * @returns {number} the new value
 */
export function stepCounter(current, delta, max) {
    const cur = Number.isFinite(Number(current)) ? Number(current) : 0;
    let next = cur + Number(delta);
    if (!Number.isFinite(next)) return cur;
    if (next < 0) next = 0;
    const limit = Number(max);
    if (Number.isFinite(limit) && limit > 0 && next > limit) next = limit;
    return next;
}
