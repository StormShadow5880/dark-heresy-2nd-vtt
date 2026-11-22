/**
 * Storage of patrons and relationships (Foundry side). Rules and data shapes: rules/relations.mjs, rules/relations-data.mjs.
 *
 *   patron             Actor of type "patron": the PUBLIC data in `system`; ownership: nobody by default, OBSERVER for the owners of the
 *                      characters it is assigned to (so the players can open the patron sheet)
 *   confidential store ONE JournalEntry, ownership default NONE (GM only), flags.dark-heresy-2nd.secretsJson:
 *                      { patrons: { [patronActorId]: secret }, contacts: { [actorId]: { [itemId]: gmNotes } } }
 *   character          actor flag relations (personal factions), actor flag patronId, item flag relation (contact data)
 *
 * Only a GM client writes the patron and reads the confidential store. Players read the public patron actor they may observe.
 * (Earlier versions kept patrons in JournalEntry documents: migrateJournalPatrons() converts them.)
 */
import { SYSTEM_ID } from '../system-id.mjs';
import { factionRegistry } from './factions.mjs';
import { factionName } from '../rules/factions.mjs';
import { emptyPatron, emptySecret, mergePatron, newId, normalizeRelations, patronOwnership, playerView, splitPatron } from '../rules/relations-data.mjs';

const SECRETS = 'secretsJson';
const STORE_MARK = 'secretStore';
const parse = (text, fallback) => {
    try {
        return text ? JSON.parse(text) : fallback;
    } catch {
        return fallback;
    }
};

/* ------------------------------ patrons ------------------------------ */

const PATRON_KEYS = Object.keys(emptyPatron());

export const patronDocs = () => game.actors?.filter((a) => a.type === 'patron') ?? [];

/** Public data of a patron actor (what a player gets) */
export function publicPatron(doc) {
    if (!doc || doc.type !== 'patron') return null;
    const sys = typeof doc.system?.toObject === 'function' ? doc.system.toObject() : doc.system ?? {};
    const pub = {};
    for (const key of PATRON_KEYS) if (sys[key] !== undefined) pub[key] = foundry.utils?.deepClone ? foundry.utils.deepClone(sys[key]) : JSON.parse(JSON.stringify(sys[key]));
    const registry = factionRegistry();
    // the faction names come from the list (a rename reaches everybody), the row keeps its snapshot otherwise
    const relations = (pub.relations ?? emptyPatron().relations).map((r) => ({ ...r, faction: factionName(registry, r) }));
    return { ...emptyPatron(), ...pub, relations, name: doc.name, img: doc.img ?? emptyPatron().img };
}

/** The complete patron for the GM: public data and confidential store */
export async function fullPatron(doc) {
    const pub = publicPatron(doc);
    if (!pub) return null;
    if (!game.user.isGM) return { ...playerView(pub), id: doc.id };
    const secrets = (await readSecrets()).patrons[doc.id];
    return { ...mergePatron(pub, secrets), id: doc.id };
}

export async function createPatron() {
    if (!game.user.isGM) return null;
    const pub = emptyPatron();
    const { name, img, ...system } = pub;
    return Actor.create({ name, img, type: 'patron', system });
}

/** Saves a complete patron: the public part into the patron actor, the confidential part into the store (GM only) */
export async function savePatron(id, full, { render = true } = {}) {
    if (!game.user.isGM) return;
    const doc = game.actors.get(id);
    if (!doc) return;
    const { pub, secret } = splitPatron({ ...full, assigned: full.assigned ?? publicPatron(doc)?.assigned ?? [] });
    const { name, img, ...system } = pub;
    await doc.update({ name, img, system }, { render });
    const secrets = await readSecrets();
    secrets.patrons[id] = secret;
    await writeSecrets(secrets);
}

export async function deletePatron(id) {
    if (!game.user.isGM) return;
    const doc = game.actors.get(id);
    const pub = publicPatron(doc);
    for (const actorId of pub?.assigned ?? []) await game.actors.get(actorId)?.unsetFlag(SYSTEM_ID, 'patronId');
    const secrets = await readSecrets();
    delete secrets.patrons[id];
    await writeSecrets(secrets);
    await doc?.delete();
}

export const actorPatronId = (actor) => actor?.getFlag(SYSTEM_ID, 'patronId') ?? null;

export function actorPatronDoc(actor) {
    const id = actorPatronId(actor);
    return id ? game.actors.get(id) ?? null : null;
}

/** Users (not GMs) who own an actor */
const ownersOf = (actor) => game.users.filter((u) => !u.isGM && actor.testUserPermission(u, 'OWNER')).map((u) => u.id);

/** The patron document is visible to the owners of the assigned characters and to nobody else */
export async function syncPatronOwnership(doc) {
    if (!game.user.isGM || !doc) return;
    const pub = publicPatron(doc);
    const owners = (pub?.assigned ?? []).map((id) => game.actors.get(id)).filter(Boolean).map(ownersOf);
    const L = CONST.DOCUMENT_OWNERSHIP_LEVELS;
    await doc.update({ ownership: patronOwnership(owners, L.NONE, L.OBSERVER) }, { recursive: false, diff: false });
}

/** Assigns a patron to a character (a character has one patron; the patron may have many characters) */
export async function assignPatron(actor, patronId) {
    if (!game.user.isGM) return;
    const previous = actorPatronId(actor);
    if (previous && previous !== patronId) await removeFromAssigned(previous, actor.id);
    if (!patronId) return actor.unsetFlag(SYSTEM_ID, 'patronId');
    const doc = game.actors.get(patronId);
    const pub = publicPatron(doc);
    if (!pub) return;
    await doc.update({ 'system.assigned': [...new Set([...(pub.assigned ?? []), actor.id])] });
    await actor.setFlag(SYSTEM_ID, 'patronId', patronId);
    await syncPatronOwnership(doc);
}

async function removeFromAssigned(patronId, actorId) {
    const doc = game.actors.get(patronId);
    const pub = publicPatron(doc);
    if (!pub) return;
    await doc.update({ 'system.assigned': (pub.assigned ?? []).filter((id) => id !== actorId) });
    await syncPatronOwnership(doc);
}

/* ------------------------------ confidential store (GM only) ------------------------------ */

let storeDoc = null;
const findStore = () => game.journal?.find((j) => j.getFlag(SYSTEM_ID, STORE_MARK));

async function ensureStore() {
    storeDoc = findStore();
    if (!storeDoc && game.user.isGM) {
        storeDoc = await JournalEntry.create({
            name: 'Dark Heresy: patrons and relations (GM only)',
            ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
            flags: { [SYSTEM_ID]: { [STORE_MARK]: true, [SECRETS]: JSON.stringify({ patrons: {}, contacts: {} }) } },
        });
    }
    return storeDoc;
}

export async function readSecrets() {
    if (!game.user.isGM) return { patrons: {}, contacts: {} };
    const doc = findStore() ?? (await ensureStore());
    const data = parse(doc?.getFlag(SYSTEM_ID, SECRETS), {});
    return { patrons: data.patrons ?? {}, contacts: data.contacts ?? {} };
}

async function writeSecrets(data) {
    const doc = findStore() ?? (await ensureStore());
    await doc?.setFlag(SYSTEM_ID, SECRETS, JSON.stringify(data));
}

/** GM-only notes of one contact of a character */
export async function contactGmNotes(actorId, itemId) {
    return (await readSecrets()).contacts[actorId]?.[itemId] ?? '';
}

export async function setContactGmNotes(actorId, itemId, text) {
    if (!game.user.isGM) return;
    const s = await readSecrets();
    s.contacts[actorId] ??= {};
    if (text) s.contacts[actorId][itemId] = text;
    else delete s.contacts[actorId][itemId];
    await writeSecrets(s);
}

/** The patron's relation to a faction as the GM client sees it (for the secret roll path) */
export async function patronFactionLevel(patronId, factionName) {
    const doc = game.actors.get(patronId);
    const full = await fullPatron(doc);
    const wanted = String(factionName ?? '').trim().toLowerCase();
    return (full?.relations ?? []).find((r) => String(r.faction).trim().toLowerCase() === wanted) ?? null;
}

/* ------------------------------ the character's own relations ------------------------------ */

export const actorRelations = (actor) => normalizeRelations(actor.getFlag(SYSTEM_ID, 'relations'));

/** `render: false` for text edits: the sheet would redraw and the focus would be lost while typing */
export async function saveActorRelations(actor, relations, { render = true } = {}) {
    await actor.update({ [`flags.${SYSTEM_ID}.relations`]: normalizeRelations(relations) }, { render });
}

export { newId, emptySecret };

/**
 * Earlier versions kept a patron in a JournalEntry (flags.patronJson). Converts them to patron actors: same data, the confidential part
 * moves to the new id, the characters point to the new patron. The old journal is deleted only after the new actor exists.
 */
export async function migrateJournalPatrons() {
    if (!game.user.isGM) return 0;
    const old = game.journal?.filter((j) => j.getFlag(SYSTEM_ID, 'patronJson') !== undefined) ?? [];
    let migrated = 0;
    for (const doc of old) {
        const pub = parse(doc.getFlag(SYSTEM_ID, 'patronJson'), null);
        if (!pub) continue;
        const { name, img, ...system } = { ...emptyPatron(), ...pub, name: doc.name };
        const created = await Actor.create({ name, img, type: 'patron', system });
        if (!created) continue;
        const secrets = await readSecrets();
        if (secrets.patrons[doc.id]) {
            secrets.patrons[created.id] = secrets.patrons[doc.id];
            delete secrets.patrons[doc.id];
            await writeSecrets(secrets);
        }
        for (const actorId of pub.assigned ?? []) await game.actors.get(actorId)?.setFlag(SYSTEM_ID, 'patronId', created.id);
        await syncPatronOwnership(created);
        await doc.delete();
        migrated++;
    }
    return migrated;
}
