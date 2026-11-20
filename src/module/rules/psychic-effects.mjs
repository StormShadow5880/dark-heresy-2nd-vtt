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

export const CHARACTERISTIC_LABELS = {
    weaponSkill: 'Weapon Skill',
    ballisticSkill: 'Ballistic Skill',
    strength: 'Strength',
    toughness: 'Toughness',
    agility: 'Agility',
    intelligence: 'Intelligence',
    perception: 'Perception',
    willpower: 'Willpower',
    fellowship: 'Fellowship',
    influence: 'Influence',
};
export const EFFECT_FIELDS = { unnatural: 'Unnatural', modifier: 'Modifier' };

/**
 * Brings a definition into one shape. The item sheet stores rows as `{ characteristic, field, value, pr }`,
 * the registry (and advanced users) may give a plain `path`. A missing or blank `value` means "from the psy rating".
 */
export function normalizeDefinition(def) {
    const path = def.path || (def.characteristic && def.field ? `system.characteristics.${def.characteristic}.${def.field}` : '');
    const match = /^system\.characteristics\.(\w+)\.(\w+)$/.exec(path);
    const label =
        def.label ??
        (match
            ? `${match[2] === 'unnatural' ? 'Unnatural ' : ''}${CHARACTERISTIC_LABELS[match[1]] ?? match[1]}${match[2] === 'modifier' ? ' modifier' : ''}`
            : path);
    const blank = def.value === undefined || def.value === null || def.value === '';
    return { ...def, path, label, value: blank ? undefined : Number(def.value), mode: def.mode ?? MODE_ADD };
}

/** The stored rows may be an array or (after a form submit) an object keyed by index */
function asList(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return Object.keys(value).sort((a, b) => a - b).map((k) => value[k]);
    return [];
}

/** @returns {object[]} the effect definitions of a power (empty when it has none) */
export function getEffectDefinitions(power) {
    const own = asList(power?.system?.autoEffects).filter((d) => d && (d.path || (d.characteristic && d.field)));
    const defs = own.length ? own : (PSYCHIC_EFFECTS[power?.name] ?? []);
    return defs.map(normalizeDefinition);
}

/** Rows of the item sheet editor */
export function effectRows(power) {
    return asList(power?.system?.autoEffects);
}

/**
 * A power can be sustained when the item says so: its "Sustained" field is not empty and not "No".
 * Sustaining needs no effect definitions: the power counts against the psy rating and is marked as active.
 */
export function canSustain(power) {
    const value = String(power?.system?.sustained ?? 'No').trim();
    return value !== '' && value.toLowerCase() !== 'no';
}

export function hasEffect(power) {
    return getEffectDefinitions(power).length > 0;
}

/** Value of one definition for a psy rating */
export function computeValue(def, pr) {
    if (def.value !== undefined && def.value !== null && def.value !== '') return Number(def.value);
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
