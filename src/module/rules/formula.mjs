/**
 * Foundry V13+ only accepts a string as dice formula (`new Roll(0)` throws "The dice roll formula is not a string").
 * Item data stores damage, penetration and range sometimes as a number (e.g. 0), so every formula goes through here.
 *
 * @param value {string|number|null|undefined}
 * @param fallback {string} used for empty values
 * @returns {string}
 */
export function toFormula(value, fallback = '0') {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text === '' ? fallback : text;
}
