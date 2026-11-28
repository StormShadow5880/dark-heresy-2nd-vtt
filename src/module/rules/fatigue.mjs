/**
 * Fatigue. Pure rules, no Foundry access.
 *
 * - The fatigue limit (maximum) is Toughness Bonus + Willpower Bonus **without** the effect of fatigue itself. It must not shrink
 *   while the fatigue rises, otherwise the counter blocks itself (a higher fatigue halves Toughness, the halved Toughness lowers
 *   the limit, the limit stops the counter).
 * - A characteristic whose bonus is lower than the fatigue is halved (rule of the system as it was).
 */

/**
 * Origins that change how fatigue works (names as stored in `system.bio`):
 *  - Outcast (background "Never Quit"): counts the Toughness Bonus as 2 higher "for purposes of determining Fatigue". Used ONLY for the
 *    fatigue threshold (Toughness Bonus + Willpower Bonus). The Toughness Bonus for damage reduction, the unconscious time and the
 *    waking up stays as it is. OPEN RULE QUESTION: whether the wording also changes other fatigue calculations (for example which
 *    characteristics are exhausted) is not decided and not applied.
 *  - Kalto (home world "Deny Thyself"): ignores the effects of the first level of fatigue. The first level is still stored and shown;
 *    PROJECT DECISION (interpretation, not a checked statement of the rule): the effects are calculated with max(0, stored fatigue - 1).
 *    The extra +2 Toughness Bonus of Kalto is for starvation only and is NOT applied to the threshold or to damage.
 */
export function fatigueOrigin(bio) {
    return {
        thresholdToughnessExtra: bio?.background === 'Outcast' ? 2 : 0,
        ignoredLevels: bio?.homeWorld === 'Kalto' ? 1 : 0,
    };
}

/** The fatigue that has effects: the stored value minus the ignored levels (never below 0) */
export const effectiveFatigue = (value, ignoredLevels = 0) => Math.max(0, (Number(value) || 0) - (Number(ignoredLevels) || 0));

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
    characteristic.totalBeforeFatigue = characteristic.total;
    characteristic.fatigued = false;
    if (Number(fatigue) > characteristic.bonus) {
        characteristic.fatigued = true;
        characteristic.total = Math.ceil(characteristic.total / 2);
        characteristic.bonus = bonusOf(characteristic.total, characteristic.unnatural);
    }
    return characteristic;
}

/** The fatigue limit from the bonuses before fatigue */
export function fatigueMax(characteristics, { toughnessExtra = 0 } = {}) {
    const t = characteristics?.toughness;
    const w = characteristics?.willpower;
    return (Number(t?.bonusBeforeFatigue ?? t?.bonus) || 0) + (Number(toughnessExtra) || 0) + (Number(w?.bonusBeforeFatigue ?? w?.bonus) || 0);
}

/*
 * Consequences of the fatigue level (to be verified against the printed rules: the text below comes from the official errata
 * as quoted by the table, see docs/fatigue.md).
 *   - fatigue above the limit (threshold)        → unconscious
 *   - unconscious for 10 − Toughness Bonus minutes, then fatigue drops by the Toughness Bonus; if it is still above the limit
 *     the character wakes up one level below the limit
 *   - fatigue above twice the limit              → the character dies
 */

export const UNCONSCIOUS_BASE_MINUTES = 10;

/** The state for a fatigue value: level ok | tired | limit | unconscious | dead */
export function fatigueState({ value, max, toughnessBonus, ignoredLevels = 0 }) {
    const stored = Number(value) || 0;
    const v = effectiveFatigue(stored, ignoredLevels);
    const limit = Number(max) || 0;
    const tb = Number(toughnessBonus) || 0;
    const minutes = Math.max(0, UNCONSCIOUS_BASE_MINUTES - tb);
    let level = 'ok';
    if (limit > 0 && v > limit * 2) level = 'dead';
    else if (limit > 0 && v > limit) level = 'unconscious';
    else if (limit > 0 && v === limit) level = 'limit';
    else if (v > 0) level = 'tired';
    const text = {
        ok: '',
        tired: 'Tired: characteristics with a bonus below the fatigue are halved.',
        limit: 'At the fatigue limit: one more level and the character collapses.',
        unconscious: `Over the fatigue limit: unconscious for ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        dead: 'Fatigue is more than twice the limit: the character dies.',
    }[level];
    return { level, value: v, stored, ignored: stored - v, limit, deathAbove: limit * 2, minutes, unconscious: level === 'unconscious' || level === 'dead', dead: level === 'dead', text };
}

/** Fatigue after waking up: reduced by the Toughness Bonus, at most one level below the limit */
export function wakeUpValue({ value, max, toughnessBonus, ignoredLevels = 0 }) {
    const limit = Number(max) || 0;
    // calculated with the effective fatigue; the stored value keeps the ignored levels while some fatigue is left
    const after = Math.max(0, effectiveFatigue(value, ignoredLevels) - (Number(toughnessBonus) || 0));
    const wake = limit > 0 && after > limit ? Math.max(0, limit - 1) : after;
    return wake > 0 ? wake + (Number(ignoredLevels) || 0) : 0;
}

/** Did a change of the fatigue cross the limit? Used for the notice in the chat. */
export function crossing(from, to, max) {
    const limit = Number(max) || 0;
    if (limit <= 0) return null;
    if (from <= limit * 2 && to > limit * 2) return 'dead';
    if (from <= limit && to > limit) return 'unconscious';
    return null;
}

/* ------------------------------ coupled to the game clock ------------------------------ */

export const HOUR_SECONDS = 3600;
/** Complete rest: 1 hour removes 1 level, 6 hours remove all fatigue (rule summary, to be verified) */
export const FULL_REST_HOURS = 6;

/** The timer that is stored when a character collapses: { since, until } in world seconds */
export function unconsciousTimer(now, minutes) {
    const since = Number(now) || 0;
    return { since, until: since + Math.max(0, Number(minutes) || 0) * 60 };
}

/** State of the timer for the sheet: ready when the unconscious time is over; text like "6 min" */
export function timerView(timer, now) {
    if (!timer || !Number.isFinite(Number(timer.until))) return { active: false, ready: false, remaining: 0, text: '' };
    const remaining = Math.max(0, Number(timer.until) - Number(now));
    if (remaining <= 0) return { active: true, ready: true, remaining: 0, text: 'ready to wake up' };
    const min = Math.floor(remaining / 60);
    const sec = Math.ceil(remaining % 60);
    return { active: true, ready: false, remaining, text: min > 0 ? `${min} min ${sec ? `${sec} s` : ''}`.trim() : `${sec} s` };
}

/** Fatigue removed by complete rest: whole hours, 6 hours or more remove everything */
export function restRecovery({ value, hours }) {
    const before = Math.max(0, Math.floor(Number(value) || 0));
    const h = Math.max(0, Math.floor(Number(hours) || 0));
    const removed = h >= FULL_REST_HOURS ? before : Math.min(before, h);
    return { before, removed, after: before - removed, all: h >= FULL_REST_HOURS };
}
