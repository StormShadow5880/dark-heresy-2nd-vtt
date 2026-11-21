/**
 * Pushing a psychic power: using a Psy Rating above the rating that is currently available.
 * How far one may push depends on the kind of psyker (the base Psy Rating plus):
 *   Bound (e.g. a sanctioned psyker) +2, Unbound (e.g. an unsanctioned psyker) +4, Daemonic (a daemon or a daemon host) +3.
 * The kind is read from the free text field `system.psy.class`; an unknown text means the limit cannot be checked (no invented limit).
 */

export const PUSH_LIMITS = [
    { key: 'unbound', limit: 4, label: 'Unbound', test: /unbound|unsanction/i }, // before "bound": the word contains it
    { key: 'daemonic', limit: 3, label: 'Daemonic', test: /daemon/i },
    { key: 'bound', limit: 2, label: 'Bound', test: /bound|sanction/i },
];

/** @returns {{key, limit, label}|null} */
export function pushClass(psyClass) {
    const text = String(psyClass ?? '').trim();
    const found = PUSH_LIMITS.find((c) => c.test.test(text));
    return found ? { key: found.key, limit: found.limit, label: found.label } : null;
}

/**
 * @param pr {number} the Psy Rating chosen in the dialog
 * @param available {number} the rating that is free (rating minus sustained powers): above it the psyker pushes
 * @param baseRating {number} the base Psy Rating
 * @param psyClass {string}
 * @returns {{pushing: boolean, extra: number, max: number|null, limit: number|null, label: string, over: boolean, unknownClass: boolean, message: string}}
 */
export function pushStatus({ pr, available, baseRating, psyClass }) {
    const chosen = Math.floor(Number(pr) || 0);
    const free = Math.floor(Number(available) || 0);
    const base = Math.floor(Number(baseRating) || 0);
    const cls = pushClass(psyClass);
    const pushing = chosen > free;
    const max = cls ? base + cls.limit : null;
    const over = !!cls && chosen > max;
    let message = '';
    if (pushing) {
        message = `You are pushing: Psy Rating ${chosen} is ${chosen - free} above your current rating of ${free}.`;
        if (cls) message += ` ${cls.label} psykers may push up to base Psy Rating +${cls.limit} = ${max}.`;
        else message += ` The kind of psyker ("${psyClass || 'not set'}") is not Bound, Unbound or Daemonic, so the limit is not checked.`;
        if (over) message += ` ${chosen} is more than the maximum of ${max}: lower the Psy Rating.`;
    }
    return { pushing, extra: pushing ? chosen - free : 0, max, limit: cls?.limit ?? null, label: cls?.label ?? '', over, unknownClass: pushing && !cls, message };
}
