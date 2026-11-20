import { SYSTEM_ID } from '../system-id.mjs';
import { buildChanges, canSustain, describeEffects, hasEffect } from '../rules/psychic-effects.mjs';

/** Active Effect of a power that is in effect on the actor (only powers with effect definitions have one) */
export function findPsychicEffect(actor, powerId) {
    return actor.effects.find((e) => e.getFlag(SYSTEM_ID, 'psyEffect')?.powerId === powerId);
}

/** A power is active when it is marked as sustained or its effect exists */
export function isPsychicPowerActive(actor, power) {
    return !!power.getFlag?.(SYSTEM_ID, 'sustainedActive') || !!findPsychicEffect(actor, power.id);
}

/** Can the power be switched on at all: it is sustainable (Sustained is not "No") or it has effect definitions */
export function isActivatable(power) {
    return canSustain(power) || hasEffect(power);
}

/**
 * Switches a power on after a successful manifestation:
 *  - the power is marked as sustained and psy.sustained +1 (the current psy rating drops),
 *    but only once, no matter how often it is cast again
 *  - if the power has effect definitions an Active Effect with the values for the given psy rating is created
 *    (or refreshed when it already exists)
 * @returns {Promise<{active: boolean, text: string}|null>} null if the power cannot be activated
 */
export async function activatePsychicPower(actor, power, pr) {
    if (!isActivatable(power)) return null;
    const alreadyActive = isPsychicPowerActive(actor, power);
    let text = '';

    if (hasEffect(power)) {
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
        }
        text = describeEffects(power, pr);
    }

    if (!alreadyActive) {
        await actor.update({ 'system.psy.sustained': Number(actor.system.psy.sustained ?? 0) + 1 });
        await power.setFlag(SYSTEM_ID, 'sustainedActive', true);
        if (actor.system.psy.rating - actor.system.psy.sustained < 0) {
            ui.notifications.warn(`${actor.name} sustains more powers than the psy rating allows.`);
        }
    }
    return { active: true, text };
}

/** Compatibility name used by the dossier sheet and older code */
export const activatePsychicEffect = activatePsychicPower;

/** Takes the power out of the sustained count and clears its marker */
async function endSustained(actor, power) {
    await actor.update({ 'system.psy.sustained': Math.max(0, Number(actor.system.psy.sustained ?? 0) - 1) });
    if (power?.getFlag?.(SYSTEM_ID, 'sustainedActive')) await power.unsetFlag(SYSTEM_ID, 'sustainedActive');
}

/**
 * Ends a power by hand. With an effect the effect is deleted, the sustained count is then reduced by
 * {@link onPsychicEffectRemoved}; without an effect it is done here.
 */
export async function deactivatePsychicEffect(actor, powerId) {
    const effect = findPsychicEffect(actor, powerId);
    if (effect) return effect.delete();
    const power = actor.items.get(powerId);
    if (power?.getFlag?.(SYSTEM_ID, 'sustainedActive')) await endSustained(actor, power);
}

/** Called when the effect of a power disappears, however that happened (button, effect panel, deleting the effect) */
export async function onPsychicEffectRemoved(effect) {
    const info = effect.getFlag(SYSTEM_ID, 'psyEffect');
    const actor = effect.parent;
    if (!info || !(actor instanceof Actor)) return;
    await endSustained(actor, actor.items.get(info.powerId));
}

/**
 * Deleting a power that is in effect ends it: its Active Effect goes away (the bonus must not stay behind) and it
 * no longer counts as sustained.
 */
export async function onPsychicPowerDeleted(item) {
    const actor = item.parent;
    if (!(actor instanceof Actor) || !item.isPsychicPower) return;
    const effect = findPsychicEffect(actor, item.id);
    if (effect) await effect.delete(); // deleteActiveEffect hook ends the sustained count
    else if (item.getFlag?.(SYSTEM_ID, 'sustainedActive')) await endSustained(actor, null);
}

/** The values of active effects follow a changed psy rating of the actor */
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
