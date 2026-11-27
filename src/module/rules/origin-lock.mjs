import { SYSTEM_ID } from '../system-id.mjs';

/**
 * Home world, background and role are fixed for every character: a player cannot change them. The GM can, and can lift the lock
 * of one character for corrections or rebuilds (flag `originUnlocked`, switched in the sheet header); the lock comes back when
 * the GM switches it on again.
 */
export const ORIGIN_FIELDS = ['homeWorld', 'background', 'role'];
export const UNLOCK_FLAG = 'originUnlocked';

export const isCreated = (actor) => !!actor?.getFlag?.(SYSTEM_ID, 'creator');
export const isUnlocked = (actor) => !!actor?.getFlag?.(SYSTEM_ID, UNLOCK_FLAG);

/** Is the origin of this actor locked for this user? */
export function originLocked(actor, user = game.user) {
    return actor?.type === 'acolyte' && !user?.isGM && !isUnlocked(actor);
}

/** The changed origin fields of an update (only real changes against the current values) */
export function changedOrigin(actor, changes) {
    return ORIGIN_FIELDS.filter((key) => {
        const next = changes?.[`system.bio.${key}`] ?? foundry.utils.getProperty(changes, `system.bio.${key}`);
        return next !== undefined && next !== (actor.system?.bio?.[key] ?? '');
    });
}
