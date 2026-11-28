/**
 * Tables whose text is copyrighted (Core Rulebook Table 8-15 Malignancies, Table 8-16 Mutations) are NOT part of this repository.
 * Each is a separate private data source, handed to the rules as `env.privateTables[id]`: a list of entries
 * `{ name, text?, min?, max? }`. Without it the rule stays open and visible; nothing is invented.
 * A rule either lets the player CHOOSE an entry (`mode: 'choose'`) or ROLLS (`mode: 'roll'`, entries carry min/max).
 */
export const PRIVATE_TABLES = {
    '8-15': { title: 'Table 8-15: Malignancies' },
    '8-16': { title: 'Table 8-16: Mutations' },
};

/** The valid entries of a private table, or null when it is not available */
export function tableEntries(env, id) {
    const list = env?.privateTables?.[id];
    if (!Array.isArray(list) || !list.length) return null;
    const entries = list.filter((e) => e && typeof e.name === 'string' && e.name.trim());
    return entries.length ? entries : null;
}

/** The entry of a roll result (min..max, inclusive), or null */
export function lookupRoll(entries, total) {
    const n = Number(total);
    if (!entries || !Number.isFinite(n)) return null;
    return entries.find((e) => Number.isFinite(Number(e.min)) && Number.isFinite(Number(e.max)) && n >= Number(e.min) && n <= Number(e.max)) ?? null;
}
