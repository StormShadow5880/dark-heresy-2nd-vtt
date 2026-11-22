/**
 * The faction registry (pure). One list for the whole world: the default factions that the system brings plus the custom ones the GM adds
 * (stored in the world setting "factions-custom"). Characters and patrons CHOOSE from this list; the level (relation) is stored with the
 * character or the patron. A row keeps the name at the time of choosing as a snapshot: if a custom faction is deleted later, the rows still
 * show their name and nothing is lost.
 */

export const DEFAULT_FACTIONS = [
    { id: 'adeptus-mechanicus', name: 'Adeptus Mechanicus' },
    { id: 'adeptus-arbites', name: 'Adeptus Arbites' },
    { id: 'administratum', name: 'Administratum' },
    { id: 'ministorum', name: 'Ecclesiarchy (Ministorum)' },
    { id: 'imperial-navy', name: 'Imperial Navy' },
    { id: 'inquisition', name: 'Inquisition' },
    { id: 'rogue-trader-dynasties', name: 'Rogue Trader Dynasties' },
];

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const key = (s) => clean(s).toLowerCase();

/** Default + custom factions, defaults first, custom ones sorted by name */
export function buildRegistry(custom = []) {
    const customList = (custom ?? [])
        .map((f) => ({ id: String(f.id), name: clean(f.name), custom: true }))
        .filter((f) => f.id && f.name)
        .sort((a, b) => a.name.localeCompare(b.name));
    return [...DEFAULT_FACTIONS.map((f) => ({ ...f, custom: false })), ...customList];
}

export const findById = (registry, id) => registry.find((f) => f.id === id) ?? null;
export const findByName = (registry, name) => registry.find((f) => key(f.name) === key(name)) ?? null;

/** The name to show: the registry name (a rename reaches everybody), else the snapshot of the row, else empty */
export function factionName(registry, row) {
    return findById(registry, row?.factionId)?.name ?? clean(row?.name ?? row?.faction);
}

let counter = 0;
const newCustomId = () => `c-${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Adds a custom faction; a name that exists already (default or custom, any case) is refused */
export function addCustomFaction(custom, name) {
    const n = clean(name);
    if (!n) return { custom, error: 'Enter a name.' };
    if (findByName(buildRegistry(custom), n)) return { custom, error: `"${n}" exists already.` };
    return { custom: [...(custom ?? []), { id: newCustomId(), name: n }], error: null };
}

export function renameCustomFaction(custom, id, name) {
    const n = clean(name);
    if (!n) return { custom, error: 'Enter a name.' };
    const clash = findByName(buildRegistry(custom), n);
    if (clash && clash.id !== id) return { custom, error: `"${n}" exists already.` };
    return { custom: custom.map((f) => (f.id === id ? { ...f, name: n } : f)), error: null };
}

export const removeCustomFaction = (custom, id) => (custom ?? []).filter((f) => f.id !== id);

/**
 * Rows of the character's factions: a row of an earlier version has only a free-text name. If it matches a faction of the list (any case) it is
 * linked to it, otherwise it stays as it is (a "custom text" row: it is still shown and used).
 */
export function linkRows(rows, registry) {
    return (rows ?? []).map((r) => {
        if (r.factionId && findById(registry, r.factionId)) return r;
        const match = r.factionId ? null : findByName(registry, r.name ?? r.faction);
        return match ? { ...r, factionId: match.id } : r;
    });
}

/** Options for the choice of a row: the faction itself plus every faction not chosen in another row */
export function optionsFor(registry, rows, currentId = null) {
    const taken = new Set((rows ?? []).map((r) => r.factionId).filter(Boolean));
    return registry.filter((f) => f.id === currentId || !taken.has(f.id));
}
