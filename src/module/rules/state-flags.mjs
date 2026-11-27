/**
 * The hidden state of the system, in one list. Every flag the system writes to a document (actor, combatant, item, active effect)
 * is named here with what it is for and whether it may be reset without losing anything that cannot be rebuilt. Pure functions.
 * The GM can see and reset them in the sheet ("Module state" button of the dossier header).
 */
export const STATE_FLAGS = [
    // character
    { key: 'xpLog', on: 'actor', label: 'Experience log', resettable: false, note: 'The record of all XP awards and purchases. Cannot be rebuilt.' },
    { key: 'creator', on: 'actor', label: 'Creation record', resettable: false, note: 'How the character was made (aptitudes, open rules). Cannot be rebuilt.' },
    { key: 'originUnlocked', on: 'actor', label: 'Origin unlocked', resettable: true, note: 'The GM lifted the lock of home world, background and role.' },
    { key: 'favoriteSkills', on: 'actor', label: 'Favourite skills', resettable: true, note: 'The key skills of the overview.' },
    // time based
    { key: 'healingTimers', on: 'actor', label: 'Healing timers', resettable: true, note: 'First Aid, Endurance and Invigourate limits (world time).' },
    { key: 'fatigueTimer', on: 'actor', label: 'Unconscious timer', resettable: true, note: 'The unconscious time of fatigue (world time). Reset it if the character is awake.' },
    // relations
    { key: 'patronId', on: 'actor', label: 'Patron', resettable: true, note: 'The assigned patron actor.' },
    { key: 'relations', on: 'actor', label: 'Relationships', resettable: false, note: 'Contacts and faction relations. Cannot be rebuilt.' },
    // combat
    { key: 'actionAccount', on: 'combatant', label: 'Action account', resettable: true, note: 'Actions spent in the current turn.' },
    { key: 'reactionState', on: 'combatant', label: 'Reaction', resettable: true, note: 'Reaction used in the current round.' },
    { key: 'sustainTurn', on: 'combatant', label: 'Sustained powers answered', resettable: true, note: 'The question about sustained powers was answered in this turn.' },
    // psychic powers
    { key: 'sustainedActive', on: 'item', label: 'Sustained (power)', resettable: true, note: 'The power counts as sustained. Reset together with the sustained count of the psyker.' },
    { key: 'psyEffect', on: 'effect', label: 'Psychic effect', resettable: false, note: 'Marks the Active Effect of a sustained power.' },
];

const byKey = new Map(STATE_FLAGS.map((f) => [f.key, f]));

/**
 * Describes the flags of one document for the overview: [{ key, label, note, resettable, known, value }]. `flags` is the object
 * under the system scope (document.flags[system id]). Keys the system does not know are listed as "unknown" (not resettable here).
 */
export function describeFlags(flags, on) {
    return Object.entries(flags ?? {})
        .map(([key, value]) => {
            const def = byKey.get(key);
            if (def && def.on !== on) return null;
            return { key, label: def?.label ?? key, note: def?.note ?? 'Not a flag of the current system version.', resettable: !!def?.resettable, known: !!def, value };
        })
        .filter(Boolean)
        .sort((a, b) => a.label.localeCompare(b.label));
}

export const valueText = (value) => {
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return text.length > 80 ? `${text.slice(0, 77)}...` : text;
};
