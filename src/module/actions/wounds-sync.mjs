import { reconcileWounds } from '../rules/imperium-maledictum.mjs';
import { woundsFormulaIsIM } from '../rules/wounds-setting.mjs';

/**
 * IM-001 keeps the stored maximum wounds in step with the calculated one. The remaining wounds move by the same
 * amount, so activating a power or a trait that raises Toughness never turns into "damage" or "healing".
 */
export async function syncWounds(actor) {
    if (!actor || actor.type !== 'acolyte' || !woundsFormulaIsIM() || !actor.isOwner) return;
    const stored = actor._source.system.wounds;
    const update = reconcileWounds({ persistedMax: stored.max, computedMax: actor.system.wounds.max, value: stored.value });
    if (!update) return;
    await actor.update({ 'system.wounds.max': update.max, 'system.wounds.value': update.value });
}

const pending = new Map();

/** Waits until Foundry has finished re-preparing the actor, then synchronises (one run per actor and change burst) */
export function scheduleWoundsSync(actor) {
    if (!actor || actor.type !== 'acolyte') return;
    clearTimeout(pending.get(actor.id));
    pending.set(
        actor.id,
        setTimeout(async () => {
            pending.delete(actor.id);
            try {
                await syncWounds(actor);
            } catch (err) {
                game.dh?.warn('Unable to synchronise the maximum wounds', err);
            }
        }, 50),
    );
}

/** The actor an embedded document belongs to (items and effects on items included) */
function owningActor(doc) {
    let parent = doc?.parent;
    while (parent && !(parent instanceof Actor)) parent = parent.parent;
    return parent ?? null;
}

export function registerWoundsSyncHooks() {
    const own = (userId) => userId === game.user.id;
    Hooks.on('updateActor', (actor, changes, options, userId) => own(userId) && scheduleWoundsSync(actor));
    for (const type of ['Item', 'ActiveEffect']) {
        for (const event of ['create', 'update', 'delete']) {
            Hooks.on(`${event}${type}`, (doc, ...rest) => {
                const userId = rest[rest.length - 1];
                if (own(userId)) scheduleWoundsSync(owningActor(doc));
            });
        }
    }
}

/** Existing characters get their maximum calculated once when the world starts */
export async function syncAllWounds() {
    for (const actor of game.actors ?? []) {
        if (actor.type === 'acolyte' && actor.isOwner) await syncWounds(actor);
    }
}
