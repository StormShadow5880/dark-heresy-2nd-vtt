/**
 * Healing rules (pure, no Foundry). See docs/healing.md for the rule readings and what needs a GM decision.
 *
 * Data model of the system: `wounds.value` are the REMAINING wounds, `wounds.max` the maximum, `wounds.critical` the critical damage
 * (the excess damage once the wounds are gone, tracked separately: normal and critical damage are clearly distinguishable).
 * Fatigue is `fatigue.value` (levels), fate `fate.value`.
 */

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

export const HOURS = 3600;

/**
 * The injury state of a character.
 *   none      no damage
 *   light     Lightly Damaged:    damage up to twice the toughness bonus
 *   heavy     Heavily Damaged:    more damage than that, no critical damage
 *   critical  Critically Damaged: has critical damage
 * "Twice the toughness bonus" is the minor damage zone the sheet already uses (rules/wounds.mjs); check it against page 244.
 */
export function injuryState({ value, max, critical, toughnessBonus }) {
    const m = Math.max(0, Math.floor(num(max)));
    const damage = Math.max(0, m - Math.min(m, Math.max(0, Math.floor(num(value)))));
    const crit = Math.max(0, Math.floor(num(critical)));
    const minorLimit = Math.max(0, 2 * Math.floor(num(toughnessBonus)));
    let state = 'none';
    if (crit > 0) state = 'critical';
    else if (damage > minorLimit) state = 'heavy';
    else if (damage > 0) state = 'light';
    return { state, damage, critical: crit, minorLimit, label: STATE_LABELS[state] };
}

export const STATE_LABELS = { none: 'Undamaged', light: 'Lightly Damaged', heavy: 'Heavily Damaged', critical: 'Critically Damaged' };

/**
 * What a healing of `amount` points does. Critical damage goes first (if the source may heal it), then the wounds; the wounds never
 * rise above the maximum, nothing is made up for points that cannot be used.
 * @returns {{requested, healedCritical, healedWounds, healed, wasted, before, after}}
 */
export function computeHealing({ value, max, critical }, amount, { allowCritical = true } = {}) {
    const requested = Math.max(0, Math.floor(num(amount)));
    const m = Math.max(0, Math.floor(num(max)));
    const v = Math.min(m, Math.max(0, Math.floor(num(value))));
    const c = Math.max(0, Math.floor(num(critical)));
    const healedCritical = allowCritical ? Math.min(requested, c) : 0;
    const healedWounds = Math.min(requested - healedCritical, m - v);
    return {
        requested,
        healedCritical,
        healedWounds,
        healed: healedCritical + healedWounds,
        wasted: requested - healedCritical - healedWounds,
        before: { value: v, critical: c },
        after: { value: v + healedWounds, critical: c - healedCritical },
    };
}

/** Fatigue: removes up to `amount` levels, never below 0 */
export function computeFatigueRemoval(current, amount) {
    const before = Math.max(0, Math.floor(num(current)));
    const removed = Math.min(before, Math.max(0, Math.floor(num(amount))));
    return { requested: Math.max(0, Math.floor(num(amount))), removed, before, after: before - removed };
}

/* ----------------------------- First Aid ----------------------------- */

/**
 * Modifiers of the Medicae test: challenging (+0), -10 for a Heavily Damaged patient, -10 per point of critical damage for a
 * Critically Damaged one.
 */
export function firstAidModifiers({ state, critical }) {
    const parts = [{ name: 'Challenging', value: 0 }];
    if (state === 'heavy') parts.push({ name: 'Heavily Damaged', value: -10 });
    if (state === 'critical') parts.push({ name: `Critically Damaged (${critical} critical)`, value: -10 * Math.max(0, Math.floor(num(critical))) });
    return { parts, total: parts.reduce((s, p) => s + p.value, 0) };
}

/**
 * Healing of a successful First Aid: Intelligence bonus + degrees of success.
 * The degrees are the RULE count (`ruleDos`, rules/degrees.mjs): the success itself is the first degree, every further tens digit one
 * more. Using the displayed degrees (which start at +0) would drop the first one, adding one to the rule count would count it twice.
 */
export function firstAidHealing({ intelligenceBonus, ruleDegrees }) {
    const bonus = Math.max(0, Math.floor(num(intelligenceBonus)));
    const degrees = Math.max(0, Math.floor(num(ruleDegrees)));
    return { amount: bonus + degrees, bonus, degrees };
}

/* ----------------------------- Time locks ----------------------------- */

/**
 * Is a lock over? `lastTime` and `now` are world times in seconds.
 * @returns {{ready: boolean, remaining: number, text: string}}
 */
export function timerStatus({ lastTime, now, hours }) {
    if (lastTime === undefined || lastTime === null || !Number.isFinite(Number(lastTime))) return { ready: true, remaining: 0, text: '' };
    const remaining = Math.max(0, Number(lastTime) + hours * HOURS - Number(now));
    if (remaining <= 0) return { ready: true, remaining: 0, text: '' };
    const h = Math.floor(remaining / HOURS);
    const m = Math.ceil((remaining % HOURS) / 60);
    return { ready: false, remaining, text: `${h} h ${m} min` };
}

export const FIRST_AID_HOURS = 24;
export const RECOVERY_HOURS = 12;

/** Does a First Aid attempt start the 24 hour lock? mode 'success' (default): only a successful treatment, 'attempt': every attempt */
export function firstAidStartsLock({ mode, success }) {
    return mode === 'attempt' ? true : !!success;
}

/* ----------------------------- Biomancy ----------------------------- */

/** Endurance: the psyker and up to PR allies within 3 m x PR recover half the psy rating (rounded up) wounds */
export const enduranceHealing = (pr) => Math.ceil(Math.max(0, num(pr)) / 2);
export const enduranceRadius = (pr) => 3 * Math.max(0, Math.floor(num(pr)));
export const enduranceTargets = (pr) => Math.max(0, Math.floor(num(pr)));

/** Invigourate: PR levels of fatigue in total, within 1 m */
export const INVIGOURATE_RADIUS = 1;
export const invigourateBudget = (pr) => Math.max(0, Math.floor(num(pr)));

/**
 * Checks the distribution of fatigue levels over the characters.
 * @param distribution {Record<string, number>} levels per character
 * @returns {{ok: boolean, total: number, error?: string}}
 */
export function validateInvigourate(distribution, pr) {
    const values = Object.values(distribution);
    if (values.some((v) => !Number.isInteger(v) || v < 0)) return { ok: false, total: 0, error: 'Levels must be whole numbers of 0 or more.' };
    const total = values.reduce((s, v) => s + v, 0);
    if (total > invigourateBudget(pr)) return { ok: false, total, error: `${total} levels distributed, but only ${invigourateBudget(pr)} (the psy rating) may be removed in total.` };
    return { ok: true, total };
}

/** Which healing power is it? By name (the compendium names) */
export function healingPowerKind(power) {
    const name = String(power?.name ?? '').trim().toLowerCase();
    if (name === 'endurance') return 'endurance';
    if (name === 'invigourate') return 'invigourate';
    return null;
}

/** Hardy: the effect of the talent on healing is not in the system data, the dialogs only point it out */
export const HARDY_NOTE = 'Hardy: its effect on healing is not automated, apply it by hand if it applies.';

/* ----------------------------- The healing card ----------------------------- */

/**
 * What the template of the healing card shows. `card` is the data kept in the flags of the chat message:
 * { kind, title, healerName, roll, info, skipped, entries: [{ uuid, name, op, state, result }], state, reason }
 */
export function healingCardView(card) {
    const entries = (card.entries ?? []).map((e) => {
        const r = e.result;
        const view = { ...e, pending: e.state === 'pending', skippedEntry: e.state === 'skipped', done: e.state === 'done' };
        if (r && e.op?.type === 'heal') {
            view.line = r.healed > 0 ? `${r.healed} healed` : 'nothing healed';
            view.criticalLine = r.healedCritical > 0 ? `${r.healedCritical} critical damage` : '';
            view.woundsLine = r.healedWounds > 0 ? `${r.healedWounds} wounds` : '';
            view.wastedLine = r.wasted > 0 ? `${r.wasted} point${r.wasted > 1 ? 's' : ''} could not be used` : '';
            view.after = `${r.after.value} / ${r.max} wounds${r.after.critical ? `, ${r.after.critical} critical` : ''}`;
            view.stateLine = r.stateBefore !== r.stateAfter ? `${STATE_LABELS[r.stateBefore]} → ${STATE_LABELS[r.stateAfter]}` : STATE_LABELS[r.stateAfter];
        }
        if (r && e.op?.type === 'fatigue') {
            view.line = r.removed > 0 ? `${r.removed} fatigue level${r.removed > 1 ? 's' : ''} removed` : 'no fatigue removed';
            view.after = `fatigue ${r.after}`;
        }
        return view;
    });
    return {
        ...card,
        entries,
        pending: card.state === 'pending',
        rejected: card.state === 'rejected',
        done: card.state === 'done',
        totalHealed: entries.reduce((s, e) => s + (e.result?.healed ?? e.result?.removed ?? 0), 0),
        manyEntries: entries.length > 1,
        rollModifiers: (card.roll?.modifiers ?? []).filter((m) => m.value !== 0 || m.name === 'Challenging'),
    };
}
