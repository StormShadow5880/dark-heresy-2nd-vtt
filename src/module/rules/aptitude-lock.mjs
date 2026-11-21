import { SYSTEM_ID } from '../system-id.mjs';

/**
 * Aptitudes are fixed after the character was generated: they can not be added or removed by hand.
 * They come from the creation wizard (items flagged `creatorGranted`) and are only read by the advancement prices.
 * Only a GM may still edit the aptitudes of an old character that was NOT made with the wizard (no creator data),
 * otherwise such a character could never get any.
 */
export function aptitudesLocked(actor) {
    const legacyEditable = !!game.user?.isGM && !actor?.getFlag?.(SYSTEM_ID, 'creator');
    return !legacyEditable;
}

/** Items created by the wizard carry this flag and are always allowed */
export const isCreatorGranted = (data) => !!data?.flags?.[SYSTEM_ID]?.creatorGranted;
