import { SYSTEM_ID } from './system-id.mjs';

/**
 * The optional parts of the system. Each one can be switched off in the system settings; a part that is off does not start, does not
 * listen and does not show anything. The core (sheets, rolls, advancement, character creation, wounds, fatigue) is always on.
 * Stored data is never touched by switching a module off.
 */
export const MODULES = {
    time: { setting: 'module-time', label: 'Time: world clock bar, running clock, rest planner' },
    relations: { setting: 'module-relations', label: 'Patrons, contacts and relationships' },
    combat: { setting: 'action-account', label: 'Combat: action account and reactions' },
    sustain: { setting: 'sustain-prompt', label: 'Combat: sustained powers at the start of the turn' },
    vfx: { setting: 'vfx', label: 'Visual effects and sounds (Sequencer + JB2A)' },
};

/** Is the optional part switched on? (A missing setting counts as on, an unreadable one as off.) */
export function moduleOn(name) {
    const m = MODULES[name];
    if (!m) return false;
    try {
        return !!game.settings.get(SYSTEM_ID, m.setting);
    } catch {
        return false;
    }
}
