/**
 * Turns a finished creation draft into an Actor with embedded items.
 *
 * Commit strategy: the complete actor (system data, flags and every embedded item) is prepared first and then created
 * with ONE Actor.create call, so either the whole character exists or nothing does. After creation the number of
 * items is verified; an inconsistent actor is deleted again and an error is reported.
 */
import { SYSTEM_ID } from '../system-id.mjs';
import { STEPS, computeCharacter, replayAdvances, stepStatus, talentName } from './character.mjs';
import { CHARACTERISTIC_KEYS } from './data.mjs';

const EQUIPMENT_PACKS = ['weapons', 'armour', 'tools', 'consumables', 'cybernetics', 'ammo', 'weapon-mods'];

/** Names of the rulebook that the compendium spells differently */
export const NAME_SYNONYMS = {
    'light flak cloak': 'flak cloak',
    'enforcer light carapace armor': 'enforcer light carapace',
    'carapace chest plate': 'carapace chestplate',
    'armored body glove': 'armoured bodyglove',
    'armoured body glove': 'armoured bodyglove',
    'imperial guard flak armor': 'imperial guard flak armour',
    'lho sticks': 'lho-sticks',
    'glow-globe': 'glow-globe/stab light',
    injector: 'inhaler/injector',
    'monotask servo-skull (utility)': 'monotask servo-skull',
    'sacred unguents': 'sacred unguents',
};

export const normalizeName = (name) => {
    const flat = String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    return NAME_SYNONYMS[flat] ?? flat;
};

const clean = (data) => {
    const copy = JSON.parse(JSON.stringify(data));
    for (const key of ['_id', 'folder', 'sort', 'ownership', '_stats', 'pack']) delete copy[key];
    return copy;
};

const nameWithQuantity = (name, quantity) => (quantity > 1 ? `${name} (×${quantity})` : name);

/**
 * @param resolve {(kind: 'equipment'|'talent'|'trait'|'aptitude', name: string) => Promise<object|null>}
 *        returns the item data of the compendium entry or null
 */
export async function buildCharacterData(draft, env, resolve) {
    const state = computeCharacter(draft, env);
    const status = stepStatus(state, draft);
    if (draft.mode !== 'expert') {
        const open = STEPS.filter((s) => s.id !== 'review' && !status[s.id]).map((s) => s.label);
        if (open.length) throw new Error(`The character is not complete yet: ${open.join(', ')}.`);
    }
    const { actor: sim, applied, failed } = await replayAdvances(state, draft, env);
    if (failed.length) throw new Error(`Some purchases are no longer possible: ${failed.map((f) => f.adv.key).join(', ')}.`);

    const system = JSON.parse(JSON.stringify(sim.system));
    const bio = draft.biography ?? {};
    system.bio = {
        ...system.bio,
        homeWorld: state.homeWorld?.name ?? '',
        background: state.background?.name ?? '',
        role: state.role?.name ?? '',
        elite: state.elite[0] ?? '',
        divination: state.divination?.name ?? '',
        gender: bio.gender ?? '',
        age: bio.age ?? '',
        build: bio.appearance ?? '',
        quirks: bio.distinguishing ?? '',
        notes: [
            bio.origin && `Origin: ${bio.origin}`,
            bio.personality && `Personality: ${bio.personality}`,
            bio.motivation && `Motivation: ${bio.motivation}`,
            bio.history && `Personal history: ${bio.history}`,
            bio.inquisitor && `Relationship to the Inquisitor: ${bio.inquisitor}`,
        ]
            .filter(Boolean)
            .join('\n\n'),
    };
    // rolls, choices and decisions of the origin that are not done (yet): listed on the character so that nobody forgets them
    const openRules = state.consequences.filter((c) => c.status !== 'resolved');
    if (openRules.length) {
        const lines = openRules.map((c) => `- ${c.source}: ${c.label}${c.blocked ? ` (open: ${c.blocked})` : c.status === 'manual' ? ' (apply by hand)' : ' (not rolled)'}`);
        system.bio.notes = `${system.bio.notes}\n\nOpen rules from the character creation:\n${lines.join('\n')}`.trim();
    }
    if (bio.homeWorldName) system.bio.notes = `Home world: ${bio.homeWorldName}\n\n${system.bio.notes}`.trim();
    system.wounds = { ...system.wounds, max: state.wounds.max, value: state.wounds.max, critical: 0, rolled: true };
    system.fate = { ...system.fate, max: state.fate.threshold, value: state.fate.current };
    if (state.psy) system.psy = { ...system.psy, rating: state.psy.rating, class: state.psy.class };
    if (state.corruption) system.corruption = state.corruption;

    const missing = [];
    const items = [];
    const add = (data) => items.push(data);

    for (const apt of state.aptitudes) {
        const found = await resolve('aptitude', apt.name);
        const data = found ? { ...clean(found), name: apt.name } : { name: apt.name, type: 'aptitude', system: {} };
        // fixed after creation: the lock (rules/aptitude-lock.mjs) lets only these items through
        data.flags = { ...(data.flags ?? {}), [SYSTEM_ID]: { creatorGranted: true } };
        add(data);
    }
    for (const t of state.talents) {
        const baseName = t.name.replace(/\s*\(.*\)\s*$/, '');
        const found = (await resolve('talent', t.name)) ?? (await resolve('talent', baseName));
        if (!found) missing.push(`Talent: ${t.name}`);
        const data = found ? clean(found) : { name: t.name, type: 'talent', system: {} };
        data.name = t.name;
        data.system = { ...data.system, cost: 0 };
        add(data);
    }
    // talents bought with XP carry their full data from the purchase
    for (const item of sim.items.filter((i) => i.type === 'talent' && Number(i.system?.cost) > 0)) {
        add({ name: item.name, type: 'talent', img: item.img, system: item.system });
    }
    for (const trait of state.traits) {
        const found = await resolve('trait', trait.name);
        if (!found) missing.push(`Trait: ${trait.name}`);
        const traitData = found ? clean(found) : { name: trait.name, type: 'trait', system: {} };
        if (trait.level) traitData.system = { ...traitData.system, level: trait.level };
        add(traitData);
    }
    for (const eq of state.equipment) {
        const found = await resolve('equipment', eq.name);
        if (!found) {
            missing.push(`Equipment: ${eq.name}`);
            add({ name: nameWithQuantity(eq.name, eq.quantity), type: 'gear', system: { description: 'Not found in the compendium during character creation.' } });
        } else add({ ...clean(found), name: nameWithQuantity(clean(found).name, eq.quantity) });
    }

    const flags = {
        xpLog: sim.flags.xpLog,
        creator: {
            version: 1,
            source: 'dh2-core',
            mode: draft.mode,
            createdAt: Date.now(),
            aptitudes: state.aptitudes.map(({ id, source, original, replacement }) => ({ id, source, original, replacement: !!replacement })),
            warnings: state.warnings,
            consequences: state.consequences.map(({ id, source, kind, label, status, result, blocked }) => ({ id, source, kind, label, status, result, blocked })),
            missing,
            overrides: draft.overrides,
            log: draft.log,
            divination: state.divinationNotes,
        },
    };
    return {
        data: { name: bio.name.trim(), type: 'acolyte', img: bio.portrait || undefined, system, items, flags: { [SYSTEM_ID]: flags } },
        missing,
        warnings: state.warnings,
        state,
        spent: applied.reduce((sum, a) => sum + (a.quote?.cost ?? 0), 0),
    };
}

/** Looks items up in the compendia of the system (name index, built once) */
export function createCompendiumResolver() {
    const indexes = new Map();
    const index = async (packName) => {
        if (!indexes.has(packName)) {
            const pack = game.packs.get(`${SYSTEM_ID}.${packName}`);
            const map = new Map();
            if (pack) for (const entry of await pack.getIndex()) map.set(normalizeName(entry.name), entry._id);
            indexes.set(packName, { pack, map });
        }
        return indexes.get(packName);
    };
    return async (kind, name) => {
        const packs = { equipment: EQUIPMENT_PACKS, talent: ['talents'], trait: ['traits'], aptitude: ['aptitudes'] }[kind] ?? [];
        const wanted = normalizeName(name);
        for (const packName of packs) {
            const { pack, map } = await index(packName);
            const id = map.get(wanted);
            if (pack && id) return (await pack.getDocument(id)).toObject();
        }
        return null;
    };
}

/** Creates the actor. Returns the new actor; throws (and leaves nothing behind) if anything is inconsistent. */
export async function finalizeCharacter(draft, env, resolve = createCompendiumResolver()) {
    const built = await buildCharacterData(draft, env, resolve);
    let actor;
    try {
        actor = await Actor.create(built.data);
        if (!actor || actor.items.size !== built.data.items.length) throw new Error('The created character is missing items.');
        const check = CHARACTERISTIC_KEYS.every((k) => Number.isFinite(actor.system.characteristics[k].base));
        if (!check) throw new Error('The created character has invalid characteristics.');
    } catch (error) {
        if (actor) await actor.delete().catch(() => {});
        throw error;
    }
    return { actor, missing: built.missing, warnings: built.warnings };
}

export { talentName };
