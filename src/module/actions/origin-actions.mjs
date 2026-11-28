/**
 * Explicit operations for origin rules: Influence loss (Highborn) and removing Insanity (Garden World).
 * Players ask, the GM client decides: permissions are checked on the GM side for socket requests, and every request id counts once.
 */
import { SYSTEM_ID } from '../system-id.mjs';
import { influenceLoss, insanityRemoval } from '../rules/origin-costs.mjs';
import { shouldProcess } from '../rules/relations-data.mjs';
import { appendLog } from '../rules/experience.mjs';

const SOCKET = `system.${SYSTEM_ID}`;
const seen = new Set();
const requests = new Set();
const esc = (t) => foundry.utils.escapeHTML(String(t ?? ''));
const say = (actor, html) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: html });

/**
 * Takes Influence away. `source` is 'rule' (a rule demands the loss: Highborn reduces it), 'voluntary' or 'admin' (never reduced).
 * The loss is booked on the characteristic modifier, so the base and the advances stay as they are.
 */
export async function applyInfluenceLoss(actor, amount, { source = 'rule', reason = '', requestId = null } = {}) {
    if (!(game.user.isGM || actor.isOwner)) return { ok: false, reason: 'No permission.' };
    if (requestId) {
        if (seen.has(`inf:${actor.id}:${requestId}`)) return { ok: false, reason: 'Already applied.' };
        seen.add(`inf:${actor.id}:${requestId}`);
    }
    const r = influenceLoss(actor.system.bio, amount, source);
    if (!r.loss) return { ok: false, reason: 'Nothing to lose.' };
    const inf = actor.system.characteristics.influence;
    await actor.update({ 'system.characteristics.influence.modifier': Number(inf.modifier || 0) - r.loss });
    await say(actor, `<p><strong>${esc(actor.name)}</strong> loses ${r.loss} Influence${reason ? ` (${esc(reason)})` : ''}${r.reduced ? `. Breeding Counts: ${r.amount} reduced by 1` : ''}.</p>`);
    return { ok: true, ...r };
}

/** Garden World: the GM approves, the character pays 50 EP per point and loses that much Insanity. Runs on the approving client. */
export async function removeInsanity(actor, points, { approved = false, requestId = null } = {}) {
    if (requestId) {
        if (seen.has(`ins:${actor.id}:${requestId}`)) return { ok: false, reason: 'Already applied.' };
    }
    const xp = actor.system.experience;
    const check = insanityRemoval({ bio: actor.system.bio, insanity: actor.system.insanity, xpAvailable: xp.total - xp.used, points, approved: approved && game.user.isGM });
    if (!check.ok) {
        ui.notifications.warn(check.error);
        return { ok: false, reason: check.error };
    }
    if (requestId) seen.add(`ins:${actor.id}:${requestId}`);
    await actor.update({ 'system.insanity': Number(actor.system.insanity) - check.points, 'system.experience.used': xp.used + check.cost });
    await appendLog(actor, { type: 'spend', category: 'Other', label: `Serenity of the Green: removed ${check.points} Insanity`, cost: check.cost, note: 'Approved by the GM. No Disorder is removed by this.' });
    await say(actor, `<p><strong>${esc(actor.name)}</strong> removes ${check.points} Insanity for ${check.cost} EP (Serenity of the Green, approved by the GM).</p>`);
    return { ok: true, ...check };
}

/** A player or the GM asks to remove Insanity. The GM client shows the question. */
export async function requestInsanityRemoval(actor, points) {
    const check = insanityRemoval({ bio: actor.system.bio, insanity: actor.system.insanity, xpAvailable: actor.system.experience.total - actor.system.experience.used, points, approved: true });
    if (!check.ok) return ui.notifications.warn(check.error);
    if (game.user.isGM) return approveInsanity(actor, check.points, foundry.utils.randomID());
    if (!actor.isOwner) return ui.notifications.warn('No permission.');
    if (!game.users.activeGM) return ui.notifications.warn('A GM has to be online to approve this.');
    game.socket.emit(SOCKET, { type: 'insanity-removal', requestId: foundry.utils.randomID(), userId: game.user.id, actorId: actor.id, points: check.points });
    ui.notifications.info('The GM has to approve the removal of Insanity.');
}

async function approveInsanity(actor, points, requestId) {
    const cost = points * 50;
    const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: 'Serenity of the Green' },
        content: `<p>Approve that <strong>${esc(actor.name)}</strong> removes <strong>${points}</strong> Insanity for <strong>${cost} EP</strong> of their own?</p><p>No Disorder is removed by this.</p>`,
        rejectClose: false,
        modal: false,
    });
    if (ok) await removeInsanity(actor, points, { approved: true, requestId });
}

export function registerOriginSocket() {
    game.socket.on(SOCKET, async (data) => {
        if (data?.type !== 'insanity-removal') return;
        if (!shouldProcess({ activeGmId: game.users.activeGM?.id, selfId: game.user.id, requestId: data.requestId, seen: requests })) return;
        const user = game.users.get(data.userId);
        const actor = game.actors.get(data.actorId);
        if (!actor || !user || !actor.testUserPermission(user, 'OWNER')) return ui.notifications.warn(`${user?.name ?? 'A user'} may not do this.`);
        await approveInsanity(actor, Math.floor(Number(data.points)), data.requestId);
    });
}
