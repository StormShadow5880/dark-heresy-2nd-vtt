import { SYSTEM_ID } from '../system-id.mjs';

/**
 * Home world, background and role are fixed once the character was made with the creation wizard (the wizard marks the actor
 * with the flag `creator`). A player cannot change them afterwards; the GM still can (corrections). Characters that were not
 * made with the wizard stay editable, they have no "creation" to be finished.
 */
export const ORIGIN_FIELDS = ['homeWorld', 'background', 'role'];

export const isCreated = (actor) => !!actor?.getFlag?.(SYSTEM_ID, 'creator');

/** Is the origin of this actor locked for this user? */
export function originLocked(actor, user = game.user) {
    return isCreated(actor) && !user?.isGM;
}

/** The changed origin fields of an update (only real changes against the current values) */
export function changedOrigin(actor, changes) {
    return ORIGIN_FIELDS.filter((key) => {
        const next = changes?.[`system.bio.${key}`] ?? foundry.utils.getProperty(changes, `system.bio.${key}`);
        return next !== undefined && next !== (actor.system?.bio?.[key] ?? '');
    });
}
