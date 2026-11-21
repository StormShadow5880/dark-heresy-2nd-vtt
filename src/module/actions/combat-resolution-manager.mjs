/**
 * Attack automation in the chat (world setting "Automatic attack resolution"):
 *   1. the attacker rolls an attack with a target selected; on a hit this manager posts a defence request
 *      (requestDefence, called from ActionData.performActionAndSendToChat)
 *   2. the owner of the target (or the GM) clicks Dodge / Parry / Take the hit in the chat
 *   3. the evasion test is rolled and, if it fails, the hits are applied to the target (rules/combat-resolution.mjs)
 *   4. one result card shows the damage
 * The data travels in message flags, so the target's owner needs nothing from the attacker's client.
 */
import { SYSTEM_ID } from '../system-id.mjs';
import { applyHits, automatedAttack, defenceChoices, serializeHit } from '../rules/combat-resolution.mjs';

const FLAG = 'defence';
const RESOLVES = 'defenceResolves';

export const autoCombatEnabled = () => {
    try {
        return !!game.settings.get(SYSTEM_ID, 'auto-combat');
    } catch {
        return false;
    }
};

async function actorFromUuid(uuid) {
    const doc = await fromUuid(uuid);
    return doc?.actor ?? doc ?? null;
}

const resolutionOf = (messageId) => game.messages.find((m) => m.getFlag(SYSTEM_ID, RESOLVES) === messageId);

/**
 * Posts the defence request for an attack that hit a target. Returns false if nothing is automated
 * (no target, no hit, not a weapon attack, setting off).
 */
export async function requestDefence(actionData) {
    const rd = actionData.rollData;
    const hits = actionData.damageData?.hits ?? [];
    const attackItem = rd?.weapon ?? (rd?.hasDamage ? rd?.power : null);
    if (!autoCombatEnabled() || !attackItem || !rd.targetActor || !rd.success || !hits.length) return false;
    const kind = automatedAttack(attackItem);
    if (!kind.automated) {
        if (kind.reason) ui.notifications.info(kind.reason);
        return false;
    }
    // Several hits (bursts, Twin-Linked): dodging them follows the auto-fire rules (rulebook page 220), not in the system data yet
    if (hits.length > 1) {
        ui.notifications.info('This attack has several hits: the rule for dodging them is not automated yet, use the hit buttons of the attack card.');
        return false;
    }
    const choices = defenceChoices(rd.targetActor, { melee: kind.melee });
    const flags = {
        attackerUuid: rd.sourceActor.uuid,
        targetUuid: rd.targetActor.uuid,
        weaponName: rd.name,
        hits: hits.map(serializeHit),
    };
    const content = await foundry.applications.handlebars.renderTemplate('systems/dark-heresy-2nd/templates/chat/defence-request-chat.hbs', {
        targetName: rd.targetActor.name,
        attackerName: rd.sourceActor.name,
        weaponName: rd.name,
        hitCount: hits.length,
        multiple: hits.length > 1,
        choices,
    });
    await ChatMessage.create({
        author: game.user.id,
        content,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
        flags: { [SYSTEM_ID]: { [FLAG]: flags } },
    });
    return true;
}

/** Called for every rendered chat message: wires the defence buttons, hides them once answered or when the user may not answer */
export async function bindDefenceMessage(message, html) {
    const flags = message.getFlag?.(SYSTEM_ID, FLAG);
    if (!flags) return;
    const box = html.querySelector('.dh-defence__buttons');
    if (!box) return;
    const answered = resolutionOf(message.id);
    let target = null;
    try {
        target = fromUuidSync(flags.targetUuid)?.actor ?? fromUuidSync(flags.targetUuid);
    } catch {
        target = null;
    }
    const mayAnswer = game.user.isGM || target?.isOwner;
    if (answered) {
        box.remove();
        html.querySelector('.dh-defence__text')?.replaceChildren('Answered, see the result below.');
        return;
    }
    if (!mayAnswer) {
        box.remove();
        html.querySelector('.dh-defence__text')?.replaceChildren('Waiting for the owner of the target to choose a reaction.');
        return;
    }
    box.querySelectorAll('.dh-defence__choice').forEach((button) =>
        button.addEventListener('click', async (ev) => {
            ev.preventDefault();
            box.querySelectorAll('button').forEach((b) => (b.disabled = true));
            await resolveDefence(message, button.dataset.choice);
        }),
    );
}

/** The chosen reaction: evasion test, then damage on a failure; posts the result card */
export async function resolveDefence(message, choice) {
    const flags = message.getFlag(SYSTEM_ID, FLAG);
    if (!flags) return;
    if (resolutionOf(message.id)) return ui.notifications.warn('This attack has been answered already.');
    const target = await actorFromUuid(flags.targetUuid);
    const attacker = await actorFromUuid(flags.attackerUuid);
    if (!target) return ui.notifications.warn('The target of the attack does not exist any more.');
    if (!game.user.isGM && !target.isOwner) return ui.notifications.warn(`Only the owner of ${target.name} can answer.`);

    let evasion = null;
    let evaded = false;
    const rolls = [];
    if (choice === 'dodge' || choice === 'parry') {
        const targetNumber = Number(target.skills?.[choice]?.current);
        if (!Number.isFinite(targetNumber)) return ui.notifications.warn(`${target.name} has no ${choice} value.`);
        const check = await target.rollCheck(targetNumber);
        evaded = check.success;
        rolls.push(check.roll);
        evasion = { label: choice === 'dodge' ? 'Dodge' : 'Parry', roll: check.roll.total, target: targetNumber };
    }

    const result = evaded ? null : await applyHits(target, flags.hits);
    const content = await foundry.applications.handlebars.renderTemplate('systems/dark-heresy-2nd/templates/chat/attack-result-chat.hbs', {
        attackerName: attacker?.name ?? 'Attacker',
        targetName: target.name,
        weaponName: flags.weaponName,
        evasion,
        evaded,
        result,
        maxWounds: target.system.wounds.max,
    });
    await ChatMessage.create({
        author: game.user.id,
        content,
        rolls,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
        flags: { [SYSTEM_ID]: { [RESOLVES]: message.id } },
    });
}

/** When a result message arrives, the request message it answers is drawn again (its buttons disappear on every client) */
export function refreshAnsweredRequest(message) {
    const requestId = message.getFlag?.(SYSTEM_ID, RESOLVES);
    if (!requestId) return;
    const request = game.messages.get(requestId);
    if (request) ui.chat?.updateMessage?.(request);
}
