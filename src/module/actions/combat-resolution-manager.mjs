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
import { toFormula } from '../rules/formula.mjs';
import { SPREAD_RANGE_M, applyHits, inBlastRadius, automatedAttack, defenceChoices, groupHitsByTarget, serializeHit, withinSpread } from '../rules/combat-resolution.mjs';

const FLAG = 'defence';
const RESOLVES = 'defenceResolves';
const SPREAD = 'spread';
const SPREAD_RESOLVES = 'spreadResolves';
const BLAST = 'blast';
const BLAST_RESULT = 'blastResult';
const BLAST_RESOLVES = 'blastResolves';
const BLAST_APPLIED = 'blastApplied';

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

const resolutionOf = (messageId) => game.messages.find((m) => [RESOLVES, SPREAD_RESOLVES, BLAST_RESOLVES, BLAST_APPLIED].some((key) => m.getFlag(SYSTEM_ID, key) === messageId));

/** One defence request card for the hit(s) that strike one target */
async function postDefenceRequest({ attacker, target, weaponName, hits, melee }) {
    const choices = defenceChoices(target, { melee });
    const flags = { attackerUuid: attacker.uuid, targetUuid: target.uuid, weaponName, hits: hits.map(serializeHit) };
    const content = await foundry.applications.handlebars.renderTemplate('systems/dark-heresy-2nd/templates/chat/defence-request-chat.hbs', {
        targetName: target.name,
        attackerName: attacker.name,
        weaponName,
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
}

/**
 * Posts the defence request for an attack that hit a target. Returns false if nothing is automated
 * (no target, no hit, setting off, attack types that are not automated).
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
    if (kind.spread && hits.length > 1) return requestSpread({ rd, hits, attackItem });
    if (kind.blast) return requestBlast({ rd, hits, attackItem });
    // Several hits (bursts, Twin-Linked): dodging them follows the auto-fire rules (rulebook page 220), not in the system data yet
    if (hits.length > 1) {
        ui.notifications.info('This attack has several hits: the rule for dodging them is not automated yet, use the hit buttons of the attack card.');
        return false;
    }
    await postDefenceRequest({ attacker: rd.sourceActor, target: rd.targetActor, weaponName: rd.name, hits, melee: kind.melee });
    return true;
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

/** Psychic Blast: the card with the button that checks who is inside the area */
async function requestBlast({ rd, hits, attackItem }) {
    const radius = await blastRadius(attackItem, rd.pr);
    const flags = {
        attackerUuid: rd.sourceActor.uuid,
        centreUuid: rd.targetActor.uuid,
        powerName: rd.name,
        radius,
        hit: serializeHit(hits[0]),
    };
    const content = await foundry.applications.handlebars.renderTemplate('systems/dark-heresy-2nd/templates/chat/blast-request-chat.hbs', {
        powerName: rd.name,
        attackerName: rd.sourceActor.name,
        targetName: rd.targetActor.name,
        radius,
    });
    await ChatMessage.create({ author: game.user.id, content, style: CONST.CHAT_MESSAGE_STYLES.OTHER, flags: { [SYSTEM_ID]: { [BLAST]: flags } } });
    return true;
}

/** Psychic Barrage / Storm with several hits: the attacker chooses the targets of the further hits afterwards */
async function requestSpread({ rd, hits, attackItem }) {
    const flags = {
        attackerUuid: rd.sourceActor.uuid,
        targetUuid: rd.targetActor.uuid,
        powerName: rd.name,
        attackType: attackItem.system.attackType,
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
    await ChatMessage.create({
        author: game.user.id,
        content,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
        flags: { [SYSTEM_ID]: { [SPREAD]: flags } },
    });
    return true;
}

/** Called for every rendered chat message: wires the defence buttons, hides them once answered or when the user may not answer */
export async function bindDefenceMessage(message, html) {
    if (message.getFlag?.(SYSTEM_ID, SPREAD)) return bindSpreadMessage(message, html);
    if (message.getFlag?.(SYSTEM_ID, BLAST)) return bindBlastMessage(message, html);
    if (message.getFlag?.(SYSTEM_ID, BLAST_RESULT)) return bindBlastResult(message, html);
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

function bindSpreadMessage(message, html) {
    const flags = message.getFlag(SYSTEM_ID, SPREAD);
    const box = html.querySelector('.dh-spread__buttons');
    if (!box) return;
    if (resolutionOf(message.id)) {
        box.remove();
        html.querySelector('.dh-spread__text')?.replaceChildren('Targets chosen, see below.');
        return;
    }
    let attacker = null;
    try {
        attacker = fromUuidSync(flags.attackerUuid);
        attacker = attacker?.actor ?? attacker;
    } catch {
        attacker = null;
    }
    if (!game.user.isGM && !attacker?.isOwner) {
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
 * Choose the targets of the further hits of a Psychic Barrage / Storm: the first hit strikes the initial target, the others
 * the initial target or any other targeted token within two metres of it. Line of sight and range are up to the players.
 */
export async function chooseSpreadTargets(message) {
    const flags = message.getFlag(SYSTEM_ID, SPREAD);
    if (!flags || resolutionOf(message.id)) return;
    const initial = await actorFromUuid(flags.targetUuid);
    const attacker = await actorFromUuid(flags.attackerUuid);
    if (!initial) return ui.notifications.warn('The first target does not exist any more.');
    const initialToken = initial.token?.object ?? initial.getActiveTokens?.()[0];

    const { DHTargetedActionManager } = await import('./targeted-action-manager.mjs');
    const candidates = [{ uuid: initial.uuid, name: initial.name, actor: initial }];
    const tooFar = [];
    for (const token of game.user.targets) {
        if (!token.actor || token.actor.uuid === initial.uuid) continue;
        const distance = initialToken ? DHTargetedActionManager.tokenDistance(initialToken, token) : Infinity;
        if (withinSpread(distance)) candidates.push({ uuid: token.actor.uuid, name: token.actor.name, actor: token.actor });
        else tooFar.push(token.actor.name);
    }
    if (tooFar.length) ui.notifications.warn(`Further than ${SPREAD_RANGE_M} m from ${initial.name}: ${tooFar.join(', ')}.`);
    if (candidates.length === 1) ui.notifications.info(`No other target within ${SPREAD_RANGE_M} m of ${initial.name} is targeted: every hit strikes ${initial.name}. Target more tokens first to spread the hits.`);

    const esc = (t) => foundry.utils.escapeHTML(String(t));
    const rows = flags.hits.slice(1).map((hit, i) => {
        const options = candidates.map((c) => `<option value="${esc(c.uuid)}">${esc(c.name)}</option>`).join('');
        return `<div class="form-group"><label>Hit ${i + 2} <small>${esc(hit.location)} · ${hit.totalDamage} ${esc(hit.damageType)}</small></label><select name="hit${i + 1}">${options}</select></div>`;
    });
    const picked = await foundry.applications.api.DialogV2.prompt({
        window: { title: `${flags.attackType}: choose targets` },
        content: `<p>Hit 1 strikes <strong>${esc(initial.name)}</strong>. Choose the target of each further hit.</p>${rows.join('')}`,
        ok: {
            label: 'Assign hits',
            callback: (event, button) => flags.hits.slice(1).map((h, i) => button.form.elements[`hit${i + 1}`].value),
        },
        rejectClose: false,
        modal: false,
    });
    if (!picked) return;
    if (resolutionOf(message.id)) return ui.notifications.warn('The targets have been chosen already.');

    const targetIds = [initial.uuid, ...picked];
    const groups = groupHitsByTarget(flags.hits, targetIds);
    const byUuid = new Map(candidates.map((c) => [c.uuid, c.actor]));
    const summary = [];
    for (const group of groups) {
        const target = byUuid.get(group.targetId);
        summary.push({ targetName: target.name, targetUuid: target.uuid, count: group.hits.length, many: group.hits.length > 1, hits: group.hits });
        // one hit on a target: it answers like against a bolt; several hits on one target stay manual (see the result card)
        if (group.hits.length === 1) await postDefenceRequest({ attacker, target, weaponName: flags.powerName, hits: group.hits, melee: false });
    }
    const content = await foundry.applications.handlebars.renderTemplate('systems/dark-heresy-2nd/templates/chat/spread-result-chat.hbs', {
        attackType: flags.attackType,
        powerName: flags.powerName,
        groups: summary,
    });
    await ChatMessage.create({
        author: game.user.id,
        content,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
        flags: { [SYSTEM_ID]: { [SPREAD_RESOLVES]: message.id } },
    });
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
    const requestId = [RESOLVES, SPREAD_RESOLVES, BLAST_RESOLVES, BLAST_APPLIED].map((key) => message.getFlag?.(SYSTEM_ID, key)).find(Boolean);
    if (!requestId) return;
    const request = game.messages.get(requestId);
    if (request) ui.chat?.updateMessage?.(request);
}


/* -------------------------------------------- */
/*  Psychic Blast                               */
/* -------------------------------------------- */

const actorOf = (uuid) => {
    try {
        const doc = fromUuidSync(uuid);
        return doc?.actor ?? doc;
    } catch {
        return null;
    }
};

function bindBlastMessage(message, html) {
    const flags = message.getFlag(SYSTEM_ID, BLAST);
    const box = html.querySelector('.dh-blast__buttons');
    if (!box) return;
    if (resolutionOf(message.id)) {
        box.remove();
        html.querySelector('.dh-blast__text')?.replaceChildren('Area checked, see below.');
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

function bindBlastResult(message, html) {
    const box = html.querySelector('.dh-blast__applybox');
    if (!box) return;
    if (resolutionOf(message.id)) {
        box.remove();
        html.querySelector('.dh-blast__applytext')?.replaceChildren('Damage applied, see below.');
        return;
    }
    if (!game.user.isGM) {
        box.remove();
        html.querySelector('.dh-blast__applytext')?.replaceChildren('The GM applies the damage to all targets.');
        return;
    }
    box.querySelector('.dh-blast__apply')?.addEventListener('click', async (ev) => {
        ev.preventDefault();
        ev.currentTarget.disabled = true;
        await applyBlastDamage(message);
    });
}

/**
 * Lists every token inside the blast radius around the first target (centre to centre, scene distance units = metres), draws the
 * area as a template and lets the attacker check or change who is hit before anything is applied.
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
            content: '<p>The power has no blast radius in its data. Radius in metres:</p><div class="form-group"><label>Radius (m)</label><input type="number" name="radius" value="2" min="0" step="0.5" /></div>',
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

    // draw the area so everybody can see what is inside (removed again afterwards)
    let templateId = null;
    try {
        const grid = canvas.grid;
        const [created] = await canvas.scene.createEmbeddedDocuments('MeasuredTemplate', [
            { t: 'circle', x: centreToken.center.x, y: centreToken.center.y, distance: radius, fillColor: '#a02020', borderColor: '#d8b66a', author: game.user.id, flags: { [SYSTEM_ID]: { blast: true } } },
        ]);
        templateId = created?.id ?? null;
        void grid;
    } catch (error) {
        console.warn('Dark Heresy 2e | blast template could not be drawn', error);
    }
    // the affected tokens are targeted, so they are visible on the canvas
    game.user.targets.forEach((t) => t.setTarget(false, { releaseOthers: false, groupSelection: true }));
    inside.forEach((i) => i.token.setTarget(true, { releaseOthers: false, groupSelection: true }));

    const esc = (t) => foundry.utils.escapeHTML(String(t));
    const rows = inside
        .map((i) => {
            const own = attacker && i.id === attacker.uuid;
            return `<div class="form-group"><label><input type="checkbox" name="t" value="${esc(i.id)}" ${own ? '' : 'checked'} /> ${esc(i.name)}${own ? ' <em>(the psyker)</em>' : ''}</label><span>${Math.round(i.distance * 10) / 10} m</span></div>`;
        })
        .join('');
    let picked = null;
    try {
        picked = await foundry.applications.api.DialogV2.prompt({
            window: { title: `Blast: ${radius} m around ${centre.name}` },
            content: `<p>${inside.length} token(s) inside the ${radius} m area (centre to centre). Uncheck anyone who is not hit (cover, line of sight, ...).</p>${rows}`,
            ok: { label: 'Confirm targets', callback: (event, button) => [...button.form.querySelectorAll('input[name=t]:checked')].map((i) => i.value) },
            rejectClose: false,
            modal: false,
        });
    } finally {
        if (templateId) canvas.scene.deleteEmbeddedDocuments('MeasuredTemplate', [templateId]).catch(() => {});
    }
    if (!picked || !picked.length) return;
    if (resolutionOf(message.id)) return ui.notifications.warn('The area has been checked already.');

    const targets = inside.filter((i) => picked.includes(i.id)).map((i) => ({ uuid: i.id, name: i.name, distance: Math.round(i.distance * 10) / 10 }));
    const content = await foundry.applications.handlebars.renderTemplate('systems/dark-heresy-2nd/templates/chat/blast-result-chat.hbs', {
        powerName: flags.powerName,
        radius,
        count: targets.length,
        many: targets.length !== 1,
        targets,
        hit: flags.hit,
    });
    await ChatMessage.create({
        author: game.user.id,
        content,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
        flags: { [SYSTEM_ID]: { [BLAST_RESULT]: { powerName: flags.powerName, targets, hit: flags.hit }, [BLAST_RESOLVES]: message.id } },
    });
}

/** The GM applies the blast damage to every confirmed target; one card shows the damage of each */
export async function applyBlastDamage(message) {
    const data = message.getFlag(SYSTEM_ID, BLAST_RESULT);
    if (!data || resolutionOf(message.id)) return;
    const lines = [];
    for (const t of data.targets) {
        const actor = await actorFromUuid(t.uuid);
        if (!actor) continue;
        const result = await applyHits(actor, [data.hit]);
        lines.push({
            name: actor.name,
            hit: result.hits[0],
            damage: result.damage,
            critical: result.critical,
            criticalEffect: result.hits[0].criticalEffect,
            wounds: result.wounds,
            maxWounds: actor.system.wounds.max,
        });
    }
    const content = await foundry.applications.handlebars.renderTemplate('systems/dark-heresy-2nd/templates/chat/blast-damage-chat.hbs', { powerName: data.powerName, targets: lines });
    await ChatMessage.create({
        author: game.user.id,
        content,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
        flags: { [SYSTEM_ID]: { [BLAST_APPLIED]: message.id } },
    });
}
