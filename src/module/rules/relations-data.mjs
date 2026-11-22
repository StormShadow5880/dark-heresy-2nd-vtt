/**
 * Data model of patrons and the separation of public and confidential data (pure).
 *
 * A patron is stored in TWO Foundry documents (JournalEntry used as a data store):
 *   - the public document (flags.dark-heresy-2nd.patron): visible to the players whose characters are assigned to the patron
 *   - the confidential store (ONE journal for the whole world, default ownership NONE, flags.dark-heresy-2nd.secrets as a JSON string)
 * Foundry has no field-level permissions; a CSS-hidden field would still be in the client data. So confidential values are never
 * written into the public document, into actor or item flags, into chat messages or into settings. See docs/patrons.md.
 */

import { level } from './relations.mjs';

export const PATRON_VERSION = 1;

let counter = 0;
export const newId = (prefix = 'r') => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const emptyPatron = () => ({
    version: PATRON_VERSION,
    name: 'New Patron',
    img: 'icons/svg/mystery-man.svg',
    dynasty: '',
    faction: '',
    role: '',
    motivation: '',
    demeanor: '',
    description: '',
    notes: '', // public notes: the GM's private notes are stored in the confidential store
    boons: [], // { id, text }
    liabilities: [], // { id, text, secret }
    relations: [], // { id, faction, level, secret }: the patron's relation to a faction
    affiliation: 'unknown', // unknown | known | hidden: is the characters' membership known (GM controlled, see rules/relations.mjs)
    assigned: [], // actor ids
});

/** The confidential counterpart of a patron */
export const emptySecret = () => ({ notes: '', liabilities: [], relationLevels: {} });

/**
 * Splits a complete patron (as the GM edits it) into the part for the public document and the confidential part.
 * Secret liabilities and the level of secret relations go ONLY into the confidential part; a secret relation stays in the public list
 * as a name with no value, so the players know that an unknown value exists.
 */
export function splitPatron(full) {
    const pub = { ...emptyPatron(), ...full, notes: full.notes ?? '' };
    const secret = emptySecret();
    secret.notes = String(full.gmNotes ?? '');
    pub.liabilities = [];
    for (const l of full.liabilities ?? []) {
        if (l.secret) secret.liabilities.push({ id: l.id, text: l.text });
        else pub.liabilities.push({ id: l.id, text: l.text, secret: false });
    }
    pub.relations = [];
    for (const r of full.relations ?? []) {
        if (r.secret) {
            secret.relationLevels[r.id] = level(r.level);
            pub.relations.push({ id: r.id, faction: r.faction, secret: true });
        } else pub.relations.push({ id: r.id, faction: r.faction, level: level(r.level), secret: false });
    }
    delete pub.gmNotes;
    return { pub, secret };
}

/** The complete patron for the GM: public document + confidential part */
export function mergePatron(pub, secret) {
    const s = { ...emptySecret(), ...(secret ?? {}) };
    return {
        ...emptyPatron(),
        ...pub,
        gmNotes: s.notes,
        liabilities: [...(pub.liabilities ?? []).map((l) => ({ ...l, secret: false })), ...s.liabilities.map((l) => ({ ...l, secret: true }))],
        relations: (pub.relations ?? []).map((r) => (r.secret ? { ...r, level: level(s.relationLevels[r.id]) } : r)),
    };
}

/** What a player sees: the public document without internal fields; secret relations only as "unknown" */
export function playerView(pub) {
    const p = { ...emptyPatron(), ...pub };
    return {
        ...p,
        relations: p.relations.map((r) => (r.secret ? { id: r.id, faction: r.faction, secret: true, label: 'unknown' } : { ...r, label: String(r.level) })),
        assigned: undefined,
    };
}

/** The relation of the patron to a faction (by faction name, case-insensitive), from the merged (GM) or public data */
export function patronRelation(patron, factionName) {
    const wanted = String(factionName ?? '').trim().toLowerCase();
    return (patron?.relations ?? []).find((r) => String(r.faction).trim().toLowerCase() === wanted) ?? null;
}

/**
 * Ownership of the public patron document: nobody by default, the owners of the assigned characters may observe it.
 * @param ownersOfActors {string[][]} for every assigned actor the ids of the non-GM users who own it
 */
export function patronOwnership(ownersOfActors, NONE = 0, OBSERVER = 2) {
    const ownership = { default: NONE };
    for (const users of ownersOfActors) for (const id of users) ownership[id] = OBSERVER;
    return ownership;
}

/* ----------------------------- the character's own relations ----------------------------- */

/** Personal factions and the faction link of a contact are stored in actor / item flags (the owner may edit them, they are not secret) */
export const emptyRelations = () => ({ version: 1, factions: [] }); // factions: { id, name, level }

export function normalizeRelations(raw) {
    const r = { ...emptyRelations(), ...(raw ?? {}) };
    r.factions = (r.factions ?? []).map((f) => ({ id: f.id ?? newId('f'), name: String(f.name ?? ''), level: level(f.level) }));
    return r;
}

/**
 * A contact of the character = a "peer" item. Its relationship data is kept in the item flags, so existing contacts (items with a name and
 * a description) are kept unchanged: without flags they are contacts without a faction and a value of 0.
 */
export function contactOf(item) {
    const f = item.flags?.['dark-heresy-2nd']?.relation ?? {};
    return {
        id: item.id,
        name: item.name,
        img: item.img,
        description: item.system?.description ?? '',
        factionId: f.factionId ?? null,
        level: level(f.level),
        background: f.background ?? '',
        notes: f.notes ?? '',
    };
}

/* ----------------------------- GM-side processing of roll requests ----------------------------- */

/** Only the active GM client processes a request, and every request id only once */
export function shouldProcess({ activeGmId, selfId, requestId, seen }) {
    if (!activeGmId || activeGmId !== selfId) return false;
    if (!requestId || seen.has(requestId)) return false;
    seen.add(requestId);
    return true;
}

/**
 * The public part of a roll that used a secret value: only what the players may know. No roll number, no target, no modifier.
 */
export function publicRollSummary({ characterName, skillLabel, success, degrees, mode }) {
    return { characterName, skillLabel, success: !!success, degrees: Number(degrees) || 0, influence: mode === 'patron' ? 'The influence of the patron is not known to the player.' : '' };
}
