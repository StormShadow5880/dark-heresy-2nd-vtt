/**
 * Healing in the chat. Every healing is ONE "healing card" (chat message with flags.dark-heresy-2nd.healing). The card is resolved by
 * the GM client (socket), exactly once: players may not change another character, and a card whose entries are done cannot be applied
 * again (no double application, also not by a double click or a second GM client).
 *
 *   First Aid           Medicae test on the patient (Target, or yourself) -> card
 *   Fate: Heal 1d5      the GM client spends the point, rolls 1d5, heals normal damage only
 *   Endurance           after a successful manifestation: allies within 3 m x PR -> card
 *   Invigourate         after a successful manifestation: fatigue levels for allies within 1 m -> card
 *   24 h rest           GM dialog (finishRest)
 *
 * The rules (amounts, order, states, timers) are pure functions in rules/healing.mjs. docs/healing.md lists the readings.
 */
import { SYSTEM_ID } from '../system-id.mjs';
import {
    FIRST_AID_HOURS,
    HARDY_NOTE,
    HOURS,
    INVIGOURATE_RADIUS,
    RECOVERY_HOURS,
    STATE_LABELS,
    computeFatigueRemoval,
    computeHealing,
    enduranceHealing,
    enduranceRadius,
    enduranceTargets,
    firstAidHealing,
    firstAidModifiers,
    firstAidStartsLock,
    healingCardView,
    healingPowerKind,
    injuryState,
    invigourateBudget,
    timerStatus,
    validateInvigourate,
} from '../rules/healing.mjs';

const HEALING = 'healing';
const SOCKET = `system.${SYSTEM_ID}`;
const CARD = 'systems/dark-heresy-2nd/templates/chat/healing-card-chat.hbs';
const { DialogV2 } = foundry.applications.api;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ''));

/* -------------------------------------------------------------------------- */
/*  Settings and helpers                                                      */
/* -------------------------------------------------------------------------- */

/** 'success' (default): only a successful First Aid starts the 24 h lock. 'attempt': every attempt does. */
export const firstAidLockMode = () => {
    try {
        return game.settings.get(SYSTEM_ID, 'healing-firstaid-lock') === 'attempt' ? 'attempt' : 'success';
    } catch {
        return 'success';
    }
};

const worldTime = () => Number(game.time?.worldTime ?? 0);
const actorOf = async (uuid) => {
    const doc = await fromUuid(uuid);
    return doc?.actor ?? doc ?? null;
};

/** Injury state of an actor (from the stored wounds, critical damage and the toughness bonus) */
export function actorInjury(actor) {
    const s = actor.system;
    return injuryState({
        value: s.wounds?.value,
        max: s.wounds?.max,
        critical: s.wounds?.critical,
        toughnessBonus: s.characteristics?.toughness?.bonus,
    });
}

/** Timers of an actor: { key: world time (s) of the last start } */
export const timersOf = (actor) => actor.getFlag(SYSTEM_ID, 'healingTimers') ?? {};
export const timerOf = (actor, key, hours) => timerStatus({ lastTime: timersOf(actor)[key], now: worldTime(), hours });

async function startTimer(actor, key) {
    await actor.setFlag(SYSTEM_ID, 'healingTimers', { ...timersOf(actor), [key]: worldTime() });
}

const MISSING_TIME = 'The world time does not seem to advance (it is 0): the 24 h / 12 h limits cannot be checked reliably. A GM has to confirm.';

/**
 * Is the timer free? If it runs, only the GM can override it (dialog). Returns true if the action may go on.
 * "worldTime 0" counts as not reliable, the GM is asked.
 */
async function timerAllows(actor, key, hours, what) {
    const status = timerOf(actor, key, hours);
    const unreliable = worldTime() === 0 && timersOf(actor)[key] !== undefined;
    if (status.ready && !unreliable) return true;
    if (!game.user.isGM) {
        ui.notifications.warn(`${actor.name}: ${what} is not possible yet (${status.text} left). A GM can override this.`);
        return false;
    }
    return DialogV2.confirm({
        classes: ['dh-ui', 'dh-dialog'],
        window: { title: 'Time limit' },
        content: `<p>${esc(actor.name)}: ${esc(what)} was used ${status.ready ? 'before' : `${esc(status.text)} ago is not over yet`}.${unreliable ? ` ${esc(MISSING_TIME)}` : ''}</p><p>Continue anyway?</p>`,
        rejectClose: false,
        modal: false,
    }).then((r) => r === true);
}

/* -------------------------------------------------------------------------- */
/*  The card                                                                  */
/* -------------------------------------------------------------------------- */

const render = (card) => foundry.applications.handlebars.renderTemplate(CARD, healingCardView(card));

/**
 * Creates a healing card.
 * entry: { uuid, name, op: { type: 'heal'|'fatigue', amount, allowCritical, consumeFate, die, pinning, timer: {key, hours} } }
 */
async function createHealingCard(card) {
    const full = {
        eyebrow: 'Healing',
        info: [],
        skipped: [],
        state: 'pending',
        requestedBy: game.user.id,
        ...card,
        entries: card.entries.map((e) => ({ state: 'pending', result: null, ...e })),
    };
    // a card without anything to apply is complete at once
    if (!full.entries.length) full.state = card.state ?? 'done';
    const message = await ChatMessage.create({
        author: game.user.id,
        content: await render(full),
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
        flags: { [SYSTEM_ID]: { [HEALING]: full } },
    });
    return message;
}

let queue = Promise.resolve();
const enqueue = (job) => {
    queue = queue.then(job).catch((error) => console.error('Dark Heresy 2e | healing failed', error));
    return queue;
};

/** Ask the GM client to apply the card (this client if it is the GM) */
export async function requestApply(message) {
    if (game.user.isGM) return enqueue(() => resolveCard(message.id, game.user.id));
    if (!game.users.activeGM) {
        ui.notifications.warn('A GM has to be online to apply the healing.');
        return false;
    }
    game.socket.emit(SOCKET, { type: 'healing', messageId: message.id, userId: game.user.id });
    return true;
}

export function registerHealingSocket() {
    game.socket.on(SOCKET, (data) => {
        if (data?.type !== 'healing' || game.users.activeGM?.id !== game.user.id) return;
        enqueue(() => resolveCard(data.messageId, data.userId));
    });
}

/** GM client: apply every pending entry once, write the results into the card */
async function resolveCard(messageId, userId) {
    const message = game.messages.get(messageId);
    const card = foundry.utils.deepClone(message?.getFlag(SYSTEM_ID, HEALING));
    if (!card || card.state !== 'pending') return;
    const user = game.users.get(userId);
    const healer = card.healerUuid ? await actorOf(card.healerUuid) : null;
    if (!user?.isGM && !(healer?.testUserPermission(user, 'OWNER') || card.requestedBy === userId)) {
        return ui.notifications.warn(`${user?.name ?? 'This user'} may not apply this healing.`);
    }
    // the card is marked first: a second request meanwhile finds it taken
    card.state = 'working';
    await message.update({ [`flags.${SYSTEM_ID}.${HEALING}.state`]: 'working' });

    for (const entry of card.entries) {
        if (entry.state !== 'pending') continue;
        const actor = await actorOf(entry.uuid);
        if (!actor) {
            Object.assign(entry, { state: 'skipped', reason: 'The character does not exist any more.' });
            continue;
        }
        if (!user?.isGM && !actor.testUserPermission(user, 'OWNER') && card.kind !== 'firstAid' && !healer?.isOwner) {
            // players may heal others only through their own (First Aid / power) card
            Object.assign(entry, { state: 'skipped', reason: 'No permission.' });
            continue;
        }
        const op = entry.op;
        if (op.consumeFate) {
            const fate = Number(actor.system.fate?.value ?? 0);
            if (fate < 1) {
                Object.assign(entry, { state: 'skipped', reason: 'No Fate Point left.' });
                continue;
            }
            const roll = await new Roll(op.die ?? '1d5').evaluate();
            await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: 'Fate: Heal' });
            op.amount = roll.total;
            await actor.update({ 'system.fate.value': fate - 1 });
            entry.fateSpent = 1;
        }
        if (op.type === 'fatigue') {
            const r = computeFatigueRemoval(actor.system.fatigue?.value, op.amount);
            await actor.update({ 'system.fatigue.value': r.after });
            entry.result = { ...r, removed: r.removed };
        } else {
            const w = actor.system.wounds;
            const before = actorInjury(actor);
            const r = computeHealing({ value: w.value, max: w.max, critical: w.critical }, op.amount, { allowCritical: op.allowCritical !== false });
            await actor.update({ 'system.wounds.value': r.after.value, 'system.wounds.critical': r.after.critical });
            const after = actorInjury(actor);
            entry.result = { ...r, max: w.max, stateBefore: before.state, stateAfter: after.state, pinning: !!op.pinning };
        }
        if (op.timer) await startTimer(actor, op.timer.key);
        entry.state = 'done';
    }
    if (card.lockKey) {
        const patient = card.entries[0] && (await actorOf(card.entries[0].uuid));
        if (patient && card.entries[0].state !== 'skipped') await startTimer(patient, card.lockKey);
    }
    card.state = card.entries.some((e) => e.state === 'done') || !card.entries.length ? 'done' : 'rejected';
    if (card.state === 'rejected') card.reason = card.entries.map((e) => e.reason).filter(Boolean).join(' ');
    await message.update({ content: await render(card), [`flags.${SYSTEM_ID}.${HEALING}`]: card });
}

/** Chat: cards that are still pending get their button (visible to everyone who may press it) */
export function bindHealingMessage(message, html) {
    const card = message.getFlag?.(SYSTEM_ID, HEALING);
    if (!card) return;
    const button = html.querySelector('.dh-healing__apply');
    if (!button) return;
    const allowed = game.user.isGM || card.requestedBy === game.user.id;
    if (!allowed) {
        html.querySelector('.dh-healing__buttons')?.remove();
        return;
    }
    // the card is applied automatically when it is created, the button is the fallback if the GM client was not there
    button.addEventListener('click', async (ev) => {
        ev.preventDefault();
        button.disabled = true;
        const ok = await requestApply(message);
        if (ok === false) button.disabled = false;
    });
}

/** The client that created a card asks for the application at once */
async function createAndApply(card) {
    const message = await createHealingCard(card);
    if (message && message.getFlag(SYSTEM_ID, HEALING)?.state === 'pending') await requestApply(message);
    return message;
}

/* -------------------------------------------------------------------------- */
/*  First Aid                                                                 */
/* -------------------------------------------------------------------------- */

function targetedActor() {
    const targets = [...(game.user.targets ?? [])];
    if (targets.length > 1) {
        ui.notifications.warn('First Aid: target exactly one patient.');
        return { error: true };
    }
    return { actor: targets[0]?.actor ?? null };
}

/** First Aid by `healer` on the targeted token (or on the healer, if the healer chooses so) */
export async function startFirstAid(healer, { self = false } = {}) {
    if (!healer) return;
    const { actor: targeted, error } = targetedActor();
    if (error) return;
    const patient = self ? healer : targeted;
    if (!patient) return ui.notifications.warn('First Aid needs a patient: target a token first (or use "Treat myself"). No test was rolled.');
    if (!['acolyte', 'npc'].includes(patient.type) || !patient.system?.wounds) return ui.notifications.warn(`${patient.name} cannot be treated (no wounds).`);
    const medicae = healer.system.skills?.medicae;
    if (!medicae || !(Number(medicae.advance) >= 1)) return ui.notifications.warn(`${healer.name} is not trained in Medicae.`);

    const injury = actorInjury(patient);
    if (injury.state === 'none') return ui.notifications.info(`${patient.name} is not damaged.`);
    if (!(await timerAllows(patient, 'firstAid', FIRST_AID_HOURS, 'First Aid'))) return;

    const mods = firstAidModifiers(injury);
    const base = Number(medicae.current ?? 0);
    const dialog = await DialogV2.prompt({
        classes: ['dh-ui', 'dh-dialog'],
        window: { title: 'First Aid' },
        content: `<p><b>${esc(healer.name)}</b> treats <b>${esc(patient.name)}</b> (${esc(STATE_LABELS[injury.state])}${injury.critical ? `, ${injury.critical} critical` : ''}).</p>
            <p>Medicae ${base}, rule modifier ${mods.total >= 0 ? '+' : ''}${mods.total}.</p>
            <div class="form-group"><label>Other modifier</label><input type="number" name="extra" value="0" step="10" /></div>
            <p class="notes">Extended Care (rest and care over days) is done in the "24 h rest" dialog of the GM. ${esc(HARDY_NOTE)}</p>`,
        ok: { label: 'Roll', callback: (ev, button) => Number(new foundry.applications.ux.FormDataExtended(button.form).object.extra) || 0 },
        rejectClose: false,
        modal: false,
    });
    if (dialog === null || dialog === undefined) return;
    const extra = Number(dialog) || 0;
    const target = base + mods.total + extra;
    const check = await healer.rollCheck(target);
    const intelligenceBonus = Number(healer.system.characteristics?.intelligence?.bonus ?? 0);
    const amount = check.success ? firstAidHealing({ intelligenceBonus, ruleDegrees: check.ruleDos }).amount : 0;
    const roll = {
        skill: 'Medicae',
        base,
        roll: check.roll.total,
        target: Math.max(0, target),
        success: check.success,
        shown: check.dos,
        ruleDegrees: check.ruleDos,
        modifiers: [{ name: 'Challenging', value: 0 }, ...mods.parts, ...(extra ? [{ name: 'Other', value: extra }] : [])],
    };
    const lock = firstAidStartsLock({ mode: firstAidLockMode(), success: check.success });
    const info = [`${STATE_LABELS[injury.state]}${injury.critical ? ` (${injury.critical} critical)` : ''} before treatment.`];
    if (check.success) info.push(`Healing: Intelligence Bonus ${intelligenceBonus} + ${check.ruleDos} degree${check.ruleDos > 1 ? 's' : ''} = ${amount}. Critical damage is healed first.`);
    else info.push('The treatment failed, nothing is healed.');
    info.push(lock ? `The patient cannot be treated again for ${FIRST_AID_HOURS} hours.` : `No lock: only a successful treatment starts the ${FIRST_AID_HOURS} h limit.`);
    info.push(HARDY_NOTE);
    await createAndApply({
        kind: 'firstAid',
        title: 'First Aid',
        healerName: healer.name,
        healerUuid: healer.uuid,
        subtitle: `Patient: ${patient.name}`,
        roll,
        info,
        lockKey: lock ? 'firstAid' : null,
        entries: check.success && amount > 0 ? [{ uuid: patient.uuid, name: patient.name, op: { type: 'heal', amount, allowCritical: true } }] : [],
        state: check.success && amount > 0 ? 'pending' : 'done',
    });
    // a failed attempt in 'attempt' mode (no entry) still starts the lock
    if (lock && !(check.success && amount > 0) && game.user.isGM) await startTimer(patient, 'firstAid');
    else if (lock && !(check.success && amount > 0)) game.socket.emit(SOCKET, { type: 'lock', uuid: patient.uuid, key: 'firstAid', userId: game.user.id });
}

/* -------------------------------------------------------------------------- */
/*  Fate: Heal 1d5                                                            */
/* -------------------------------------------------------------------------- */

export async function startFateHeal(actor) {
    if (!actor) return;
    const fate = Number(actor.system.fate?.value ?? 0);
    if (fate < 1) return ui.notifications.warn(`${actor.name} has no Fate Point left.`);
    const w = actor.system.wounds;
    if (!(w.max - w.value > 0)) return ui.notifications.info(`${actor.name} has no normal damage that Fate could heal.`);
    const ok = await DialogV2.confirm({
        classes: ['dh-ui', 'dh-dialog'],
        window: { title: 'Fate: Heal' },
        content: `<p>Spend <b>one</b> Fate Point of ${esc(actor.name)} (${fate} left) and heal 1d5 wounds?</p><p class="notes">Fate heals normal damage only, never critical damage.</p>`,
        rejectClose: false,
        modal: false,
    });
    if (ok !== true) return;
    await createAndApply({
        kind: 'fate',
        title: 'Fate: Heal 1d5',
        healerName: actor.name,
        healerUuid: actor.uuid,
        info: ['One Fate Point is spent, 1d5 wounds are healed. Critical damage stays.'],
        entries: [{ uuid: actor.uuid, name: actor.name, op: { type: 'heal', die: '1d5', consumeFate: true, allowCritical: false } }],
    });
}

/* -------------------------------------------------------------------------- */
/*  Biomancy: Endurance / Invigourate                                         */
/* -------------------------------------------------------------------------- */

const tokenOf = (actor) => actor?.token?.object ?? actor?.getActiveTokens?.()[0] ?? null;

/**
 * Called after a successful manifestation of a focus power (PsychicActionData). Returns true if the power is a healing power.
 */
export async function requestHealingPower(actionData) {
    const rd = actionData.rollData;
    const kind = healingPowerKind(rd?.power);
    if (!kind || !rd?.success) return false;
    const psyker = rd.sourceActor;
    const pr = Math.max(0, Math.floor(Number(rd.pr ?? 0)));
    if (!psyker || pr < 1) return false;
    return kind === 'endurance' ? enduranceCard(psyker, pr) : invigourateCard(psyker, pr);
}

async function pickAllies({ psyker, pr, count, radius, title }) {
    const { DHTargetedActionManager } = await import('./targeted-action-manager.mjs');
    const { pickTokensOnCanvas } = await import('../ui/canvas-pick.mjs');
    const psykerToken = tokenOf(psyker);
    if (!psykerToken) {
        ui.notifications.warn(`${psyker.name} needs a token on the scene to measure the range.`);
        return { picked: [], skipped: [] };
    }
    const skipped = [];
    const tokens = await pickTokensOnCanvas({
        count,
        minCount: 0,
        title,
        label: (i) => `Ally ${i + 1}`,
        accept: (token) => {
            if (token.actor?.uuid === psyker.uuid) return 'The psyker is always included.';
            if (!token.actor?.system?.wounds) return `${token.name} cannot be healed.`;
            const d = DHTargetedActionManager.tokenDistance(psykerToken, token);
            if (d > radius) return `${token.name} is ${d} m away, the limit is ${radius} m.`;
            return true;
        },
        onRefuse: (reason, token) => skipped.push({ name: token?.name ?? '?', reason }),
    });
    return { picked: tokens ?? null, skipped };
}

async function enduranceCard(psyker, pr) {
    const radius = enduranceRadius(pr);
    const amount = enduranceHealing(pr);
    const { picked, skipped } = await pickAllies({ psyker, pr, count: enduranceTargets(pr), radius, title: `Endurance: up to ${pr} allies within ${radius} m` });
    if (!picked) return true;
    const targets = [psyker, ...picked.map((t) => t.actor)];
    const entries = [];
    for (const actor of targets) {
        if (entries.some((e) => e.uuid === actor.uuid)) continue;
        const t = timerOf(actor, 'endurance', RECOVERY_HOURS);
        if (!t.ready) {
            skipped.push({ name: actor.name, reason: `still recovering from Endurance (${t.text} left).` });
            continue;
        }
        entries.push({ uuid: actor.uuid, name: actor.name, op: { type: 'heal', amount, allowCritical: true, pinning: true, timer: { key: 'endurance', hours: RECOVERY_HOURS } } });
    }
    await createAndApply({
        kind: 'endurance',
        title: 'Endurance',
        healerName: psyker.name,
        healerUuid: psyker.uuid,
        subtitle: `Psy Rating ${pr}`,
        info: [`${amount} wounds each (Psy Rating ${pr} ÷ 2, rounded up), critical damage first. Pinning is overcome. Range ${radius} m (3 m × Psy Rating), up to ${pr} allies.`, `Each healed character recovers for ${RECOVERY_HOURS} hours before it can benefit again.`],
        skipped,
        entries,
        state: entries.length ? 'pending' : 'rejected',
        reason: entries.length ? '' : 'Nobody could be healed.',
    });
    return true;
}

async function invigourateCard(psyker, pr) {
    const budget = invigourateBudget(pr);
    const { picked, skipped } = await pickAllies({ psyker, pr, count: budget, radius: INVIGOURATE_RADIUS, title: `Invigourate: allies within ${INVIGOURATE_RADIUS} m` });
    if (!picked) return true;
    const all = [psyker, ...picked.map((t) => t.actor)].filter((a, i, arr) => arr.findIndex((x) => x.uuid === a.uuid) === i);
    const rows = all
        .map((a) => `<div class="form-group"><label>${esc(a.name)} <small>(fatigue ${a.system.fatigue?.value ?? 0})</small></label><input type="number" min="0" step="1" name="n-${esc(a.uuid)}" value="0" /></div>`)
        .join('');
    const dist = await DialogV2.prompt({
        classes: ['dh-ui', 'dh-dialog'],
        window: { title: 'Invigourate' },
        content: `<p>Remove up to <b>${budget}</b> fatigue level${budget > 1 ? 's' : ''} <b>in total</b> (the Psy Rating). No wounds are healed.</p>${rows}`,
        ok: {
            label: 'Apply',
            callback: (ev, button) => {
                const data = new foundry.applications.ux.FormDataExtended(button.form).object;
                return Object.fromEntries(all.map((a) => [a.uuid, Math.floor(Number(data[`n-${a.uuid}`]) || 0)]));
            },
        },
        rejectClose: false,
        modal: false,
    });
    if (!dist) return true;
    const check = validateInvigourate(dist, pr);
    if (!check.ok) {
        ui.notifications.warn(check.error);
        return true;
    }
    const entries = [];
    for (const actor of all) {
        const n = dist[actor.uuid] ?? 0;
        if (n < 1) continue;
        const t = timerOf(actor, 'invigourate', RECOVERY_HOURS);
        if (!t.ready) {
            skipped.push({ name: actor.name, reason: `recovering (${t.text} left).` });
            continue;
        }
        entries.push({ uuid: actor.uuid, name: actor.name, op: { type: 'fatigue', amount: n, timer: { key: 'invigourate', hours: RECOVERY_HOURS } } });
    }
    await createAndApply({
        kind: 'invigourate',
        title: 'Invigourate',
        healerName: psyker.name,
        healerUuid: psyker.uuid,
        subtitle: `Psy Rating ${pr}`,
        info: [`Up to ${budget} fatigue levels in total within ${INVIGOURATE_RADIUS} m. No wounds are healed.`, `Each character recovers for ${RECOVERY_HOURS} hours before it can benefit again.`],
        skipped,
        entries,
        state: entries.length ? 'pending' : 'rejected',
        reason: entries.length ? '' : 'No fatigue was removed.',
    });
    return true;
}

/* -------------------------------------------------------------------------- */
/*  24 hours of rest (GM)                                                     */
/* -------------------------------------------------------------------------- */

/**
 * GM dialog: finish 24 hours of rest for characters. Nothing heals because time passed: the GM confirms the rest type per
 * character. The amounts come from the GM (page 244 / 109 values are not in the system data, see docs/healing.md).
 */
export async function finishRest() {
    if (!game.user.isGM) return ui.notifications.warn('Only the GM can finish a rest.');
    const actors = game.actors.filter((a) => a.type === 'acolyte' && a.system.wounds && (a.system.wounds.max - a.system.wounds.value > 0 || a.system.wounds.critical > 0));
    if (!actors.length) return ui.notifications.info('Nobody is damaged.');
    const rows = actors
        .map((a) => {
            const inj = actorInjury(a);
            return `<tr data-uuid="${esc(a.uuid)}"><td><input type="checkbox" name="on-${esc(a.id)}" /></td>
                <td><b>${esc(a.name)}</b><br><small>${esc(inj.label)} · ${a.system.wounds.value}/${a.system.wounds.max}${inj.critical ? ` · ${inj.critical} crit.` : ''}</small></td>
                <td><select name="rest-${esc(a.id)}"><option value="none">no rest</option><option value="rest">full rest</option><option value="bed">bed rest</option></select></td>
                <td><input type="number" min="0" step="1" name="nat-${esc(a.id)}" value="0" title="natural healing (page 244)" /></td>
                <td><input type="number" min="0" step="1" name="ext-${esc(a.id)}" value="0" title="Extended Care (page 109)" /></td>
                <td>${inj.state === 'critical' ? `<label><input type="checkbox" name="tgh-${esc(a.id)}" checked /> Toughness test</label>` : '—'}</td></tr>`;
        })
        .join('');
    const data = await DialogV2.prompt({
        classes: ['dh-ui', 'dh-dialog'],
        window: { title: '24 hours of rest', resizable: true },
        position: { width: 760 },
        content: `<p>Choose who rested for 24 hours and how. Without a confirmed rest nothing is healed.</p>
            <table class="wtable wtable--full"><thead><tr><th></th><th>Character</th><th>Rest</th><th>Natural healing</th><th>Extended Care</th><th>Critical</th></tr></thead><tbody>${rows}</tbody></table>
            <p class="notes">The amounts of natural healing (p. 244) and of Extended Care (p. 109, with healer, assistants and consecutive days) are entered by the GM: they are not part of the system data. ${esc(HARDY_NOTE)}</p>
            <div class="form-group"><label><input type="checkbox" name="reset" /> also reset the First Aid / power timers of the chosen characters</label></div>`,
        ok: { label: 'Finish the rest', callback: (ev, button) => new foundry.applications.ux.FormDataExtended(button.form).object },
        rejectClose: false,
        modal: false,
    });
    if (!data) return;
    const entries = [];
    const info = [];
    for (const a of actors) {
        if (!data[`on-${a.id}`]) continue;
        const rest = data[`rest-${a.id}`];
        if (rest === 'none') {
            info.push(`${a.name}: no rest confirmed, nothing healed.`);
            continue;
        }
        let nat = Math.max(0, Math.floor(Number(data[`nat-${a.id}`]) || 0));
        const ext = Math.max(0, Math.floor(Number(data[`ext-${a.id}`]) || 0));
        const inj = actorInjury(a);
        if (inj.state === 'critical' && data[`tgh-${a.id}`]) {
            const check = await a.rollCharacteristicCheck('toughness');
            if (!check?.success) {
                info.push(`${a.name}: Toughness test failed (${check?.roll?.total}), no natural healing of the critical damage.`);
                nat = 0;
            } else info.push(`${a.name}: Toughness test passed (${check.roll.total}).`);
        }
        if (data.reset) await a.setFlag(SYSTEM_ID, 'healingTimers', {});
        const amount = nat + ext;
        if (amount < 1) continue;
        entries.push({ uuid: a.uuid, name: a.name, op: { type: 'heal', amount, allowCritical: true } });
    }
    await createAndApply({
        kind: 'rest',
        title: '24 hours of rest',
        healerName: game.user.name,
        eyebrow: 'Rest',
        info: info.length ? info : ['Natural healing and Extended Care as entered by the GM.'],
        entries,
        state: entries.length ? 'pending' : 'done',
    });
}

/** Socket: lock for an attempt without a card entry (GM client) */
export function registerHealingLockSocket() {
    game.socket.on(SOCKET, async (data) => {
        if (data?.type !== 'lock' || game.users.activeGM?.id !== game.user.id) return;
        const actor = await actorOf(data.uuid);
        if (actor && ['firstAid'].includes(data.key)) await startTimer(actor, data.key);
    });
}
