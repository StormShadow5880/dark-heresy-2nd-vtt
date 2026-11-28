import { SYSTEM_ID } from '../system-id.mjs';
import { fatigueOrigin, fatigueState, restRecovery, timerView, unconsciousTimer, wakeUpValue } from '../rules/fatigue.mjs';

/**
 * Fatigue on the game clock: the unconscious time runs on the world time (like the healing timers), a rest takes fatigue
 * away. The timer is a flag of the actor: `flags.dark-heresy-2nd.fatigueTimer = { since, until }` in world seconds.
 */

const FLAG = 'fatigueTimer';
const esc = (t) => foundry.utils.escapeHTML(String(t ?? ''));
const say = (actor, html) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="dh-chat">${html}</div>`, style: CONST.CHAT_MESSAGE_STYLES.OTHER });

export const timerOf = (actor) => actor.getFlag(SYSTEM_ID, FLAG);
export const timerViewOf = (actor) => timerView(timerOf(actor), game.time.worldTime);

function stateOf(actor, value = actor.system.fatigue.value) {
    const t = actor.characteristics?.toughness;
    return fatigueState({ value, max: actor.system.fatigue.max, toughnessBonus: t?.bonusBeforeFatigue ?? t?.bonus, ignoredLevels: fatigueOrigin(actor.system.bio).ignoredLevels });
}

/** The limit was crossed: the unconscious time starts on the world clock */
export async function startUnconscious(actor) {
    const state = stateOf(actor);
    await actor.setFlag(SYSTEM_ID, FLAG, unconsciousTimer(game.time.worldTime, state.minutes));
}

/** The fatigue is back at or below the limit (by hand, by healing): no unconscious timer any more */
export async function clearTimer(actor) {
    if (timerOf(actor)) await actor.unsetFlag(SYSTEM_ID, FLAG);
}

/** Wakes the character up: fatigue drops by the Toughness Bonus (at most one level below the limit) */
export async function wakeUp(actor, { automatic = false } = {}) {
    const t = actor.characteristics.toughness;
    const after = wakeUpValue({ value: actor.system.fatigue.value, max: actor.system.fatigue.max, toughnessBonus: t.bonusBeforeFatigue ?? t.bonus, ignoredLevels: fatigueOrigin(actor.system.bio).ignoredLevels });
    await actor.update({ 'system.fatigue.value': after });
    await clearTimer(actor);
    await say(actor, `<p><strong>${esc(actor.name)}</strong> wakes up${automatic ? ' (the unconscious time is over)' : ''}. Fatigue is now ${after}.</p>`);
}

/** GM client: whoever is unconscious and whose time is over wakes up (called when the world time changes and at the start) */
export async function processTimers() {
    if (game.users.activeGM?.id !== game.user.id) return;
    for (const actor of game.actors) {
        if (actor.type !== 'acolyte') continue;
        const view = timerViewOf(actor);
        if (!view.active || !view.ready) continue;
        const state = stateOf(actor);
        if (state.dead) continue;
        if (state.unconscious) await wakeUp(actor, { automatic: true });
        else await clearTimer(actor);
    }
}

/** Complete rest of `hours` hours: 1 level per hour, 6 hours remove everything */
export async function applyRestRecovery(actor, hours) {
    const r = restRecovery({ value: actor.system.fatigue.value, hours });
    if (!r.removed) return r;
    await actor.update({ 'system.fatigue.value': r.after });
    if (r.after <= actor.system.fatigue.max) await clearTimer(actor);
    await say(actor, `<p><strong>${esc(actor.name)}</strong> rested ${Math.floor(hours)} hour${Math.floor(hours) === 1 ? '' : 's'}: ${r.all ? 'all fatigue is gone' : `fatigue −${r.removed}`} (now ${r.after}).</p>`);
    return r;
}

/** A Fate Point removes all fatigue levels at once */
export async function fateRemovesFatigue(actor) {
    if (!(actor.system.fatigue.value > 0)) return ui.notifications.info('There is no fatigue to remove.');
    if (!(actor.system.fate.value > 0)) return ui.notifications.warn('No Fate Point left.');
    const spent = await actor.spendFate({ label: 'Remove fatigue' });
    if (!spent.ok) return ui.notifications.warn(spent.reason);
    await actor.update({ 'system.fatigue.value': 0 });
    await clearTimer(actor);
    await say(actor, `<p><strong>${esc(actor.name)}</strong> spends a Fate Point${spent.free ? ' (not reduced, Faith in the Creed)' : ''}: all fatigue is removed.</p>`);
}
