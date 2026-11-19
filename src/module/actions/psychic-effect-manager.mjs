import { SYSTEM_ID } from '../system-id.mjs';
import { buildChanges, describeEffects, hasEffect } from '../rules/psychic-effects.mjs';

/** Active Effect of a power that is in effect on the actor */
export function findPsychicEffect(actor, powerId) {
    return actor.effects.find((e) => e.getFlag(SYSTEM_ID, 'psyEffect')?.powerId === powerId);
}

/**
 * Switches the effect of a power on (or refreshes it): creates the Active Effect with the values for the given psy
 * rating, marks the power as sustained and reduces the current psy rating (psy.sustained +1).
 * A power that is already in effect only gets its values updated, it is not counted twice.
 * @returns {Promise<string|null>} text of the applied changes, null if the power has no effect
 */
export async function activatePsychicEffect(actor, power, pr) {
    if (!hasEffect(power)) return null;
    const changes = buildChanges(power, pr);
    const existing = findPsychicEffect(actor, power.id);
    if (existing) {
        await existing.update({ changes, 'flags.dark-heresy-2nd.psyEffect.pr': pr });
    } else {
        await actor.createEmbeddedDocuments('ActiveEffect', [
            {
                name: power.name,
                img: power.img,
                origin: power.uuid,
                disabled: false,
                changes,
                flags: { [SYSTEM_ID]: { psyEffect: { powerId: power.id, pr } } },
            },
        ]);
        await actor.update({ 'system.psy.sustained': Number(actor.system.psy.sustained ?? 0) + 1 });
        await power.setFlag(SYSTEM_ID, 'sustainedActive', true);
        if (actor.system.psy.rating - actor.system.psy.sustained < 0) {
            ui.notifications.warn(`${actor.name} sustains more powers than the psy rating allows.`);
        }
    }
    return describeEffects(power, pr);
}

/** Ends a power by hand. The bookkeeping (sustained count, flag) is done in {@link onPsychicEffectRemoved}. */
export async function deactivatePsychicEffect(actor, powerId) {
    const effect = findPsychicEffect(actor, powerId);
    if (effect) await effect.delete();
}

/** Called when an effect of a power disappears, however that happened (button, effect panel, deleting the effect) */
export async function onPsychicEffectRemoved(effect) {
    const info = effect.getFlag(SYSTEM_ID, 'psyEffect');
    const actor = effect.parent;
    if (!info || !(actor instanceof Actor)) return;
    await actor.update({ 'system.psy.sustained': Math.max(0, Number(actor.system.psy.sustained ?? 0) - 1) });
    const power = actor.items.get(info.powerId);
    if (power?.getFlag(SYSTEM_ID, 'sustainedActive')) await power.unsetFlag(SYSTEM_ID, 'sustainedActive');
}

/** The psy rating of an active power follows the actor's psy rating (values are recalculated) */
export async function refreshPsychicEffects(actor) {
    for (const effect of actor.effects.filter((e) => e.getFlag(SYSTEM_ID, 'psyEffect'))) {
        const info = effect.getFlag(SYSTEM_ID, 'psyEffect');
        const power = actor.items.get(info.powerId);
        if (!power) continue;
        const changes = buildChanges(power, info.pr);
        const current = JSON.stringify(effect.changes.map((c) => [c.key, c.mode, String(c.value)]));
        if (current !== JSON.stringify(changes.map((c) => [c.key, c.mode, c.value]))) await effect.update({ changes });
    }
}
