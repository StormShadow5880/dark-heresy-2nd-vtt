/**
 * Changes made on the Contacts / Relationships panel of the character sheet. The owner of a character may edit the personal relations
 * (factions, contacts, contact values: not secret); GM-only notes of a contact go into the confidential store.
 */
import { SYSTEM_ID } from '../system-id.mjs';
import { level } from '../rules/relations.mjs';
import { contactOf, newId } from '../rules/relations-data.mjs';
import { actorRelations, readSecrets, saveActorRelations, setContactGmNotes } from './store.mjs';
import { buildNetwork } from '../rules/relations.mjs';
import { factionName, findById, linkRows, optionsFor } from '../rules/factions.mjs';
import { factionRegistry } from './factions.mjs';

export function relationCap() {
    try {
        const mode = game.settings.get(SYSTEM_ID, 'relations-cap-mode');
        return { mode: mode === 'cap' ? 'cap' : 'none', max: Number(game.settings.get(SYSTEM_ID, 'relations-cap-value')) };
    } catch {
        return { mode: 'none' };
    }
}

/** View model of the Relationships panel */
export async function buildNetworkView(actor) {
    const rel = actorRelations(actor);
    const registry = factionRegistry();
    // rows of earlier versions (free text) are linked to the list when the name matches; the names come from the list
    const linked = linkRows(rel.factions, registry);
    const factions = linked.map((f) => ({ ...f, name: factionName(registry, f) }));
    const contacts = actor.items.filter((i) => i.type === 'peer').map(contactOf);
    const net = buildNetwork(factions, contacts, relationCap());
    for (const g of net.groups) {
        g.options = optionsFor(registry, linked, g.factionId).map((o) => ({ id: o.id, name: o.name, selected: o.id === g.factionId }));
        g.unlisted = !g.factionId || !findById(registry, g.factionId); // a free-text or removed faction: shown as it is
    }
    if (game.user.isGM) {
        const secrets = (await readSecrets()).contacts[actor.id] ?? {};
        for (const c of [...net.groups.flatMap((g) => g.contacts), ...net.loose]) c.gmNotes = secrets[c.id] ?? '';
    }
    return { ...net, hasFactions: net.groups.length > 0, cap: relationCap(), factionOptions: factions.map((f) => ({ id: f.id, name: f.name })) };
}

export async function addFaction(actor) {
    const rel = actorRelations(actor);
    rel.factions.push({ id: newId('f'), factionId: null, name: '', level: 0 });
    await saveActorRelations(actor, rel);
}

export async function removeFaction(actor, factionId) {
    const rel = actorRelations(actor);
    rel.factions = rel.factions.filter((f) => f.id !== factionId);
    await saveActorRelations(actor, rel);
    // the contacts stay, they have no faction now
    for (const item of actor.items.filter((i) => i.type === 'peer' && i.getFlag(SYSTEM_ID, 'relation')?.factionId === factionId)) {
        await item.setFlag(SYSTEM_ID, 'relation', { ...item.getFlag(SYSTEM_ID, 'relation'), factionId: null });
    }
}

export async function setFactionField(actor, factionId, field, value) {
    const rel = actorRelations(actor);
    const f = rel.factions.find((x) => x.id === factionId);
    if (!f) return;
    if (field === 'factionId') {
        // chosen from the list of the world: the row keeps the id and the name at the time of choosing
        const chosen = findById(factionRegistry(), value);
        f.factionId = chosen?.id ?? null;
        f.name = chosen?.name ?? f.name;
    } else f[field] = field === 'level' ? level(value) : String(value);
    await saveActorRelations(actor, rel, { render: field === 'level' || field === 'factionId' });
}

export async function addContact(actor, factionId = null) {
    await actor.createEmbeddedDocuments('Item', [{ name: 'New contact', type: 'peer', flags: { [SYSTEM_ID]: { relation: { factionId, level: 0, background: '', notes: '' } } } }], { renderSheet: false });
}

export async function setContactField(actor, itemId, field, value) {
    const item = actor.items.get(itemId);
    if (!item) return;
    if (field === 'name') return item.update({ name: String(value) }, { render: false });
    if (field === 'description') return item.update({ 'system.description': String(value) }, { render: false });
    if (field === 'gmNotes') return setContactGmNotes(actor.id, itemId, String(value));
    const rel = { factionId: null, level: 0, background: '', notes: '', ...(item.getFlag(SYSTEM_ID, 'relation') ?? {}) };
    rel[field] = field === 'level' ? level(value) : field === 'factionId' ? value || null : String(value);
    await item.update({ [`flags.${SYSTEM_ID}.relation`]: rel }, { render: false });
    if (field === 'level' || field === 'factionId') actor.sheet?.render();
}
