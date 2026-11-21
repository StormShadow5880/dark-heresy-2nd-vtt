/**
 * Attack automation in the chat (world setting "Automatic attack resolution").
 *
 * ONE chat message per attack ("attack card") with one row per target. The owner of a target (or the GM) answers in the row:
 * Dodge / Parry / Take the hit. The answer is sent to the GM client (socket), which rolls the evasion test, applies the damage
 * and updates the card: players may neither change a chat message of another user nor damage an NPC.
 *
 *   attack hits -> requestDefence() -> attack card (single target)
 *   Psychic Barrage / Storm: request card "Choose x targets" -> click the targets on the map -> attack card with all targets
 *   Blast: request card "Check area" -> list of the tokens in the area -> attack card with all targets
 *
 * The rules (what a defence prevents, armour and toughness, distances) are in rules/combat-resolution.mjs.
 */
import { SYSTEM_ID } from '../system-id.mjs';
import { damageLines, effectOfRoll, playBlast, playResolution } from '../vfx/vfx.mjs';
import { toFormula } from '../rules/formula.mjs';
import {
    SPREAD_RANGE_M,
    applyHits,
    attackCardView,
    automatedAttack,
    blastDodge,
    distanceProblem,
    evasionOutcome,
    groupHitsByTarget,
    inBlastRadius,
    newTargetEntry,
    serializeHit,
} from '../rules/combat-resolution.mjs';
import { showsImpact } from '../vfx/vfx-config.mjs';

const ATTACK = 'attack';
const SPREAD = 'spread';
const SPREAD_RESOLVES = 'spreadResolves';
const BLAST = 'blast';
const BLAST_RESOLVES = 'blastResolves';
const SOCKET = `system.${SYSTEM_ID}`;
const CARD = 'systems/dark-heresy-2nd/templates/chat/attack-card-chat.hbs';

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

const actorOf = (uuid) => {
    try {
        const doc = fromUuidSync(uuid);
        return doc?.actor ?? doc;
    } catch {
        return null;
    }
};

/** The request cards (spread / blast) that have been answered: the card of the attack carries the flag */
const resolutionOf = (messageId) => game.messages.find((m) => [SPREAD_RESOLVES, BLAST_RESOLVES].some((key) => m.getFlag(SYSTEM_ID, key) === messageId));

/* -------------------------------------------------------------------------- */
/*  The attack card                                                           */
/* -------------------------------------------------------------------------- */

async function renderCard(attack) {
    return foundry.applications.handlebars.renderTemplate(CARD, attackCardView(attack));
}

/**
 * Creates the attack card.
 * @param extraFlags flags of the card, e.g. { spreadResolves: <id of the request card> }
 */
async function createAttackCard({ attacker, weaponName, label, template = null, targets, extraFlags = {}, vfx = null }) {
    const attack = {
        attackerUuid: attacker.uuid,
        attackerName: attacker.name,
        weaponName,
        label,
        template,
        vfx,
        targets: targets.map((t) => newTargetEntry(t)),
    };
    await ChatMessage.create({
        author: game.user.id,
        content: await renderCard(attack),
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
        flags: { [SYSTEM_ID]: { [ATTACK]: attack, ...extraFlags } },
    });
}

/* -------------------------------------------------------------------------- */
/*  Answering: buttons -> GM -> result                                        */
/* -------------------------------------------------------------------------- */

let queue = Promise.resolve();
const enqueue = (job) => {
    queue = queue.then(job).catch((error) => console.error('Dark Heresy 2e | attack resolution failed', error));
    return queue;
};

/** A button of a target row was clicked on this client */
async function answerDefence(message, targetUuid, choice) {
    if (game.user.isGM) return enqueue(() => resolveTarget(message.id, targetUuid, choice, game.user.id));
    if (!game.users.activeGM) {
        ui.notifications.warn('A GM has to be online to resolve the attack.');
        return false;
    }
    game.socket.emit(SOCKET, { type: 'defence', messageId: message.id, targetUuid, choice, userId: game.user.id });
    return true;
}

/** Only the active GM resolves; players' answers arrive here */
export function registerCombatSocket() {
    game.socket.on(SOCKET, (data) => {
        if (data?.type !== 'defence' || game.users.activeGM?.id !== game.user.id) return;
        enqueue(() => resolveTarget(data.messageId, data.targetUuid, data.choice, data.userId));
    });
}

/** GM client: roll the evasion test, apply the remaining hits, update the card */
async function resolveTarget(messageId, targetUuid, choice, userId) {
    const message = game.messages.get(messageId);
    const attack = message?.getFlag(SYSTEM_ID, ATTACK);
    const entry = attack?.targets.find((t) => t.uuid === targetUuid);
    if (!entry || entry.state === 'done') return;
    const target = await actorFromUuid(targetUuid);
    if (!target) return ui.notifications.warn('The target of the attack does not exist any more.');
    const user = game.users.get(userId);
    if (!user?.isGM && !target.testUserPermission(user, 'OWNER')) return ui.notifications.warn(`${user?.name ?? 'This user'} may not answer for ${target.name}.`);
    if (!entry.choices.some((c) => c.id === choice)) return ui.notifications.warn(`${target.name} cannot choose ${choice} here.`);

    let outcome = { prevented: 0, remaining: entry.hits, missed: false };
    let evasion = null;
    if (choice === 'dodge' || choice === 'parry') {
        const targetNumber = Number(target.skills?.[choice]?.current);
        if (!Number.isFinite(targetNumber)) return ui.notifications.warn(`${target.name} has no ${choice} value.`);
        const check = await target.rollCheck(targetNumber);
        // the RULE degrees: a plain success is one degree and prevents one hit
        outcome = evasionOutcome({ success: check.success, ruleDos: check.ruleDos, hits: entry.hits, storm: !!entry.storm });
        evasion = { label: choice === 'dodge' ? 'Dodge' : 'Parry', roll: check.roll.total, target: targetNumber, success: check.success, degrees: check.ruleDos };
    }
    const result = outcome.missed ? null : await applyHits(target, outcome.remaining);

    Object.assign(entry, {
        state: 'done',
        choice,
        evasion,
        outcome: { prevented: outcome.prevented, missed: outcome.missed },
        result,
        maxWounds: target.system.wounds.max,
    });
    await message.update({ content: await renderCard(attack), [`flags.${SYSTEM_ID}.${ATTACK}`]: attack });
    // animation: shot, waiting, then the result (impact and floating number only after a real hit). Once per row, not awaited.
    playResolution({
        effect: attack.vfx,
        attackerUuid: attack.attackerUuid,
        targetUuid: entry.uuid,
        impact: !!attack.vfx && showsImpact(entry),
        lines: outcome.missed ? [] : damageLines(result),
    }).catch(() => {});
    if (attack.targets.every((t) => t.state === 'done')) await removeBlastTemplate(attack.template);
}

/** Called for every rendered chat message */
export async function bindDefenceMessage(message, html) {
    if (message.getFlag?.(SYSTEM_ID, SPREAD)) return bindSpreadMessage(message, html);
    if (message.getFlag?.(SYSTEM_ID, BLAST)) return bindBlastMessage(message, html);
    const attack = message.getFlag?.(SYSTEM_ID, ATTACK);
    if (!attack) return;
    html.querySelectorAll('.dh-target.is-open').forEach((row) => {
        const uuid = row.dataset.uuid;
        const buttons = row.querySelector('.dh-target__buttons');
        if (!buttons) return;
        if (!game.user.isGM && !actorOf(uuid)?.isOwner) {
            buttons.remove();
            row.querySelector('.dh-target__wait')?.replaceChildren(`Waiting for the owner of ${attack.targets.find((t) => t.uuid === uuid)?.name ?? 'the target'}.`);
            return;
        }
        buttons.querySelectorAll('.dh-target__choice').forEach((button) =>
            button.addEventListener('click', async (ev) => {
                ev.preventDefault();
                buttons.querySelectorAll('button').forEach((b) => (b.disabled = true));
                const sent = await answerDefence(message, uuid, button.dataset.choice);
                if (sent === false) buttons.querySelectorAll('button').forEach((b) => (b.disabled = false));
            }),
        );
    });
}

/* -------------------------------------------------------------------------- */
/*  Entry point: an attack hit a target                                       */
/* -------------------------------------------------------------------------- */

/**
 * Called when an attack roll is done. Returns false if nothing is automated (no target, no hit, setting off, attack types
 * that are not automated).
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
    // Spray (flame weapons) hits everybody in a cone: no cone targeting yet
    if (rd.weapon && rd.hasAttackSpecial?.('Spray')) {
        ui.notifications.info('Spray attacks hit a whole cone: not automated yet, use the hit buttons of the attack card.');
        return false;
    }
    // Weapons with the Blast quality: the area around the target is checked like a psychic blast
    if (rd.weapon && rd.hasAttackSpecial?.('Blast')) {
        const level = Number(rd.getAttackSpecial('Blast')?.level);
        return requestBlast({ rd, hits, radius: Number.isFinite(level) && level > 0 ? level : null, label: 'Blast' });
    }
    if (kind.blast) return requestBlast({ rd, hits, radius: await blastRadius(attackItem, rd.pr), label: 'Psychic Blast' });
    if (kind.spread && hits.length > 1) return requestSpread({ rd, hits, attackItem });
    const storm = String(attackItem.system?.attackType ?? '').toLowerCase() === 'psychic storm';
    // one target: a single hit, or several hits of one attack (bursts, Swift / Lightning Attack, Barrage, Storm)
    await createAttackCard({
        attacker: rd.sourceActor,
        weaponName: rd.name,
        label: rd.weapon ? 'Attack' : attackItem.system?.attackType || 'Psychic attack',
        targets: [{ target: rd.targetActor, hits, melee: kind.melee, storm }],
        vfx: effectOfRoll(rd),
    });
    return true;
}

/** When a card that answers a request arrives, the request card is drawn again (its button disappears on every client) */
export function refreshAnsweredRequest(message) {
    const requestId = [SPREAD_RESOLVES, BLAST_RESOLVES].map((key) => message.getFlag?.(SYSTEM_ID, key)).find(Boolean);
    if (!requestId) return;
    const request = game.messages.get(requestId);
    if (request) ui.chat?.updateMessage?.(request);
}

/* -------------------------------------------------------------------------- */
/*  Blast                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Draws the impact area of a blast as a circle around the token (a template of the scene, so everybody sees it).
 * Returns { sceneId, id } or null if it could not be drawn (no permission, no scene).
 */
async function drawBlastTemplate(token, radius) {
    try {
        const [created] = await canvas.scene.createEmbeddedDocuments('MeasuredTemplate', [
            { t: 'circle', x: token.center.x, y: token.center.y, distance: radius, fillColor: '#a02020', borderColor: '#d8b66a', author: game.user.id, flags: { [SYSTEM_ID]: { blast: true } } },
        ]);
        return created ? { sceneId: canvas.scene.id, id: created.id } : null;
    } catch (error) {
        console.warn('Dark Heresy 2e | blast template could not be drawn', error);
        return null;
    }
}

/** Removes the circle (the GM client does it when every target has answered) */
async function removeBlastTemplate(template) {
    if (!template) return;
    try {
        await game.scenes.get(template.sceneId)?.deleteEmbeddedDocuments('MeasuredTemplate', [template.id]);
    } catch {
        // already gone
    }
}

/** The blast radius of a power in metres, or null if the power has no data for it */
async function blastRadius(attackItem, pr) {
    const formula = attackItem.system?.special?.blast;
    if (formula === undefined || formula === null || formula === '') return null;
    try {
        const roll = await new Roll(toFormula(formula), { pr: Number(pr) || 0 }).evaluate();
        return Number.isFinite(roll.total) ? roll.total : null;
    } catch {
        return null;
    }
}

/** Blast (power or weapon): the card with the button that checks who is inside the area */
async function requestBlast({ rd, hits, radius, label }) {
    const centreToken = rd.targetActor.token?.object ?? rd.targetActor.getActiveTokens?.()[0];
    const template = radius && centreToken ? await drawBlastTemplate(centreToken, radius) : null;
    // animation: centre and radius are the ones of the rules (the area is checked afterwards in the chat)
    if (radius && centreToken && rd.power) playBlast(rd, centreToken, radius).catch(() => {});
    const flags = {
        template,
        attackerUuid: rd.sourceActor.uuid,
        centreUuid: rd.targetActor.uuid,
        powerName: rd.name,
        label,
        radius,
        hit: serializeHit(hits[0]),
    };
    const content = await foundry.applications.handlebars.renderTemplate('systems/dark-heresy-2nd/templates/chat/blast-request-chat.hbs', {
        label,
        powerName: rd.name,
        attackerName: rd.sourceActor.name,
        targetName: rd.targetActor.name,
        radius,
    });
    await ChatMessage.create({ author: game.user.id, content, style: CONST.CHAT_MESSAGE_STYLES.OTHER, flags: { [SYSTEM_ID]: { [BLAST]: flags } } });
    return true;
}

function bindBlastMessage(message, html) {
    const flags = message.getFlag(SYSTEM_ID, BLAST);
    const box = html.querySelector('.dh-blast__buttons');
    if (!box) return;
    if (resolutionOf(message.id)) {
        box.remove();
        html.querySelector('.dh-blast__text')?.replaceChildren('Area checked, see the attack card below.');
        return;
    }
    if (!game.user.isGM && !actorOf(flags.attackerUuid)?.isOwner) {
        box.remove();
        html.querySelector('.dh-blast__text')?.replaceChildren('Waiting for the attacker to check the area.');
        return;
    }
    box.querySelector('.dh-blast__choose')?.addEventListener('click', async (ev) => {
        ev.preventDefault();
        await checkBlastArea(message);
    });
}

/**
 * Lists every token inside the blast radius around the first target (centre to centre, scene distance units = metres), shows the
 * area as a circle and lets the attacker check or change who is hit; then one attack card with all targets is created.
 */
export async function checkBlastArea(message) {
    const flags = message.getFlag(SYSTEM_ID, BLAST);
    if (!flags || resolutionOf(message.id)) return;
    const centre = await actorFromUuid(flags.centreUuid);
    const centreToken = centre?.token?.object ?? centre?.getActiveTokens?.()[0];
    if (!centreToken) return ui.notifications.warn('The first target needs a token on the scene to place the blast.');

    let radius = flags.radius;
    if (!Number.isFinite(radius) || radius <= 0) {
        radius = await foundry.applications.api.DialogV2.prompt({
            window: { title: 'Blast radius' },
            content: '<p>No blast radius in the data. Radius in metres:</p><div class="form-group"><label>Radius (m)</label><input type="number" name="radius" value="2" min="0" step="0.5" /></div>',
            ok: { label: 'Check area', callback: (event, button) => Number(button.form.elements.radius.value) },
            rejectClose: false,
            modal: false,
        });
        if (!Number.isFinite(radius) || radius <= 0) return;
    }

    const { DHTargetedActionManager } = await import('./targeted-action-manager.mjs');
    const attacker = await actorFromUuid(flags.attackerUuid);
    const inside = inBlastRadius(
        canvas.tokens.placeables
            .filter((t) => t.actor && !t.document.hidden)
            .map((t) => ({ token: t, id: t.actor.uuid, name: t.name, distance: t === centreToken ? 0 : DHTargetedActionManager.tokenDistance(centreToken, t) })),
        radius,
    );

    // the impact area is drawn as a circle (already when the blast hit, otherwise now); the GM client removes it when everybody answered
    const template = flags.template ?? (await drawBlastTemplate(centreToken, radius));
    // the affected tokens carry the target marker, so they are visible on the canvas
    game.user.targets.forEach((t) => t.setTarget(false, { releaseOthers: false, groupSelection: true }));
    inside.forEach((i) => i.token.setTarget(true, { releaseOthers: false, groupSelection: true }));

    const esc = (t) => foundry.utils.escapeHTML(String(t));
    const rows = inside
        .map((i) => {
            const own = attacker && i.id === attacker.uuid;
            return `<div class="form-group"><label><input type="checkbox" name="t" value="${esc(i.id)}" ${own ? '' : 'checked'} /> ${esc(i.name)}${own ? ' <em>(the attacker)</em>' : ''}</label><span>${Math.round(i.distance * 10) / 10} m</span><label title="An obstacle in the way makes dodging impossible"><input type="checkbox" name="b" value="${esc(i.id)}" /> blocked</label></div>`;
        })
        .join('');
    const picked = await foundry.applications.api.DialogV2.prompt({
        window: { title: `Blast: ${radius} m around ${centre.name}` },
        content: `<p>${inside.length} token(s) inside the ${radius} m area (centre to centre). Uncheck anyone who is not hit (cover, line of sight, ...). Tick <em>blocked</em> if an obstacle stops a target from leaving the area (then it cannot dodge).</p>${rows}`,
        ok: {
            label: 'Confirm targets',
            callback: (event, button) => ({
                hit: [...button.form.querySelectorAll('input[name=t]:checked')].map((i) => i.value),
                blocked: [...button.form.querySelectorAll('input[name=b]:checked')].map((i) => i.value),
            }),
        },
        rejectClose: false,
        modal: false,
    });
    game.user.targets.forEach((t) => t.setTarget(false, { releaseOthers: false, groupSelection: true }));
    if (!picked || !picked.hit.length) {
        // nobody is hit: the circle goes away; cancelling keeps it (the area can be checked again)
        if (picked) await removeBlastTemplate(template);
        return;
    }
    if (resolutionOf(message.id)) return ui.notifications.warn('The area has been checked already.');

    const targets = inside.filter((i) => picked.hit.includes(i.id)).map((i) => {
        const actor = i.token.actor;
        const distance = Math.round(i.distance * 10) / 10;
        const area = { ...blastDodge({ distanceFromCentre: distance, radius, agilityBonus: actor.characteristics?.agility?.bonus, blocked: picked.blocked.includes(i.id) }), distance };
        return { target: actor, hits: [flags.hit], melee: false, area };
    });
    await createAttackCard({ attacker, weaponName: flags.powerName, label: flags.label, template, targets, extraFlags: { [BLAST_RESOLVES]: message.id } });
}

/* -------------------------------------------------------------------------- */
/*  Psychic Barrage / Storm                                                   */
/* -------------------------------------------------------------------------- */

/** Barrage / Storm with several hits: the attacker chooses the targets of the further hits afterwards */
async function requestSpread({ rd, hits, attackItem }) {
    const flags = {
        attackerUuid: rd.sourceActor.uuid,
        targetUuid: rd.targetActor.uuid,
        powerName: rd.name,
        attackType: attackItem.system.attackType,
        maxRange: Number(rd.maxRange) || 0,
        hits: hits.map(serializeHit),
    };
    const extra = hits.length - 1;
    const content = await foundry.applications.handlebars.renderTemplate('systems/dark-heresy-2nd/templates/chat/spread-request-chat.hbs', {
        attackType: attackItem.system.attackType,
        powerName: rd.name,
        attackerName: rd.sourceActor.name,
        targetName: rd.targetActor.name,
        hitCount: hits.length,
        extraHits: extra,
        manyExtra: extra > 1,
        range: SPREAD_RANGE_M,
    });
    await ChatMessage.create({ author: game.user.id, content, style: CONST.CHAT_MESSAGE_STYLES.OTHER, flags: { [SYSTEM_ID]: { [SPREAD]: flags } } });
    return true;
}

function bindSpreadMessage(message, html) {
    const flags = message.getFlag(SYSTEM_ID, SPREAD);
    const box = html.querySelector('.dh-spread__buttons');
    if (!box) return;
    if (resolutionOf(message.id)) {
        box.remove();
        html.querySelector('.dh-spread__text')?.replaceChildren('Targets chosen, see the attack card below.');
        return;
    }
    if (!game.user.isGM && !actorOf(flags.attackerUuid)?.isOwner) {
        box.remove();
        html.querySelector('.dh-spread__text')?.replaceChildren('Waiting for the attacker to choose the targets.');
        return;
    }
    box.querySelector('.dh-spread__choose')?.addEventListener('click', async (ev) => {
        ev.preventDefault();
        await chooseSpreadTargets(message);
    });
}

/**
 * Choose the targets of the further hits of a Barrage / Storm: the first hit strikes the first target, the others the first target
 * or any token within two metres of it, all within the range of the power. Clicked on the map, one click per hit.
 */
export async function chooseSpreadTargets(message) {
    const flags = message.getFlag(SYSTEM_ID, SPREAD);
    if (!flags || resolutionOf(message.id)) return;
    const initial = await actorFromUuid(flags.targetUuid);
    const attacker = await actorFromUuid(flags.attackerUuid);
    if (!initial) return ui.notifications.warn('The first target does not exist any more.');
    const initialToken = initial.token?.object ?? initial.getActiveTokens?.()[0];

    const { DHTargetedActionManager } = await import('./targeted-action-manager.mjs');
    const { pickTokensOnCanvas } = await import('../ui/canvas-pick.mjs');
    if (!initialToken) return ui.notifications.warn(`${initial.name} needs a token on the scene.`);
    const attackerToken = attacker?.token?.object ?? attacker?.getActiveTokens?.()[0];
    const tokens = await pickTokensOnCanvas({
        count: flags.hits.length - 1,
        title: `${flags.attackType}: hit 1 strikes ${initial.name}`,
        label: (i) => `Hit ${i + 2}`,
        accept: (token) => {
            // every target must be within the range of the power ...
            if (flags.maxRange > 0 && attackerToken && token !== attackerToken) {
                const problem = distanceProblem({ name: token.name, from: attackerToken.name, distance: DHTargetedActionManager.tokenDistance(attackerToken, token), allowed: flags.maxRange });
                if (problem) return `${problem} (range of ${flags.powerName})`;
            }
            // ... and, from the first hit on, within two metres of the first target
            if (token.actor.uuid === initial.uuid) return true;
            return distanceProblem({ name: token.name, from: initial.name, distance: DHTargetedActionManager.tokenDistance(initialToken, token), allowed: SPREAD_RANGE_M }) ?? true;
        },
    });
    if (!tokens) return;
    if (resolutionOf(message.id)) return ui.notifications.warn('The targets have been chosen already.');

    const byUuid = new Map([[initial.uuid, initial], ...tokens.map((t) => [t.actor.uuid, t.actor])]);
    const groups = groupHitsByTarget(flags.hits, [initial.uuid, ...tokens.map((t) => t.actor.uuid)]);
    const storm = /storm/i.test(flags.attackType);
    await createAttackCard({
        attacker,
        weaponName: flags.powerName,
        label: flags.attackType,
        targets: groups.map((g) => ({ target: byUuid.get(g.targetId), hits: g.hits, melee: false, storm })),
        extraFlags: { [SPREAD_RESOLVES]: message.id },
    });
}

