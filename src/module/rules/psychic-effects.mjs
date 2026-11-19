/**
 * Automatic effects of psychic powers.
 *
 * A power that has effect definitions changes the character while it is in effect. When the manifestation test
 * succeeds the effect is switched on as a real Active Effect on the actor, the power counts as sustained (psy.sustained +1,
 * which lowers the current psy rating) and it stays until it is ended manually.
 *
 * Definitions come from the power item (`system.autoEffects`) or, for known powers, from the registry below.
 * A definition is either a fixed `value` or a value derived from the psy rating the power was manifested with:
 *   { path, value: -10 }                                  fixed
 *   { path, pr: { divide: 2, round: 'up' } }              psy rating / 2, rounded up
 * `mode` is the Foundry change mode, ADD (2) by default.
 */

export const MODE_ADD = 2;

/** Only effects that are written down in the power text are listed here. */
export const PSYCHIC_EFFECTS = {
    'Iron Arm': [
        { path: 'system.characteristics.toughness.unnatural', label: 'Unnatural Toughness', pr: { divide: 2, round: 'up' } },
        { path: 'system.characteristics.strength.unnatural', label: 'Unnatural Strength', pr: { divide: 2, round: 'up' } },
        { path: 'system.characteristics.agility.modifier', label: 'Agility', value: -10 },
    ],
};

/** @returns {object[]} the effect definitions of a power (empty when it has none) */
export function getEffectDefinitions(power) {
    const own = power?.system?.autoEffects;
    if (Array.isArray(own) && own.length) return own;
    return PSYCHIC_EFFECTS[power?.name] ?? [];
}

export function hasEffect(power) {
    return getEffectDefinitions(power).length > 0;
}

/** Value of one definition for a psy rating */
export function computeValue(def, pr) {
    if (def.value !== undefined && def.value !== null) return Number(def.value);
    const rating = Math.max(0, Number(pr) || 0);
    const divide = Number(def.pr?.divide) || 1;
    const multiply = Number(def.pr?.multiply) || 1;
    const raw = (rating * multiply) / divide;
    switch (def.pr?.round) {
        case 'down':
            return Math.floor(raw);
        case 'up':
            return Math.ceil(raw);
        default:
            return raw;
    }
}

/** Active Effect changes for a power at a given psy rating */
export function buildChanges(power, pr) {
    return getEffectDefinitions(power).map((def) => ({
        key: def.path,
        mode: def.mode ?? MODE_ADD,
        value: String(computeValue(def, pr)),
    }));
}

/** Short text for the chat card, e.g. "Unnatural Toughness +3, Unnatural Strength +3, Agility -10" */
export function describeEffects(power, pr) {
    return getEffectDefinitions(power)
        .map((def) => {
            const value = computeValue(def, pr);
            return `${def.label ?? def.path} ${value >= 0 ? '+' : ''}${value}`;
        })
        .join(', ');
}
