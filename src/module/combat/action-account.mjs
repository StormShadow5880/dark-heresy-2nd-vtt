import { SYSTEM_ID } from '../system-id.mjs';
import { accountKey, accountView, canAfford, chargeAccount, cappedCost, costFromActionText, costFromTypes, costLabel, readAccount, refundLast, shortage } from '../rules/action-account.mjs';
import { allCombatActions } from '../rules/combat-actions.mjs';

const FLAG = 'actionAccount';

export function accountEnabled() {
    return !!game.settings.get(SYSTEM_ID, 'action-account');
}

/** The combatant of the actor while it is the turn of that actor in a running combat, otherwise null */
export function activeCombatantFor(actor, combat = game.combat) {
    if (!accountEnabled() || !combat?.started) return null;
    const current = combat.combatant;
    if (!current || current.isDefeated) return null;
    return current.actorId === actor.id || current.actor === actor ? current : null;
}

export function accountOf(combatant, combat = game.combat) {
    return readAccount(combatant?.getFlag(SYSTEM_ID, FLAG), accountKey(combat.round, combat.turn));
}

async function store(combatant, account) {
    await combatant.setFlag(SYSTEM_ID, FLAG, account);
}

/** Data for the sheet: null when there is no turn of this actor */
export function viewFor(actor) {
    const combatant = activeCombatantFor(actor);
    if (!combatant) return { active: false };
    return { active: true, ...accountView(accountOf(combatant)) };
}

/** Takes an action from the account without asking (sustaining powers, manual entries, …) */
export async function spendAction(actor, { name, cost }) {
    const combatant = activeCombatantFor(actor);
    if (!combatant) return false;
    await store(combatant, chargeAccount(accountOf(combatant), { name, cost }));
    return true;
}

/**
 * Before an action is rolled: it is taken from the account. When it does not fit, the player is asked whether to do it anyway.
 * @returns {Promise<boolean>} false when the action should not be made
 */
export async function guardAction(actor, { name, cost, variable = false }) {
    const combatant = activeCombatantFor(actor);
    // not the turn of this actor (reaction, delayed action), a free action or something that cannot be calculated: no check
    if (!combatant || cost === null || cost === undefined) return true;
    const account = accountOf(combatant);
    if (cost > 0 && !canAfford(account, cost)) {
        const ok = await foundry.applications.api.DialogV2.confirm({
            classes: ['dh-ui', 'dh-dialog'],
            window: { title: 'Not enough actions' },
            content: `<p>${foundry.utils.escapeHTML(shortage(account, name, cost))}</p><p>Do it anyway?</p>`,
            rejectClose: false,
            modal: false,
        });
        if (ok !== true) return false;
    }
    await store(combatant, chargeAccount(account, { name, cost }));
    if (variable) ui.notifications.info(`${name} can cost a Half or a Full Action: the Half Action was taken from the account. Use "Take an action" on the sheet for the rest.`);
    return true;
}

/** An attack of a weapon: the cost follows the chosen combat action (Standard Attack = Half Action …) */
export function combatActionCost(name) {
    const info = allCombatActions().find((a) => a.name === name);
    return info ? costFromTypes(info.type) : { cost: null, variable: false };
}

export async function guardCombatAction(actor, actionName) {
    const { cost, variable } = combatActionCost(actionName);
    return guardAction(actor, { name: actionName, cost, variable });
}

export async function guardPower(actor, power) {
    return guardAction(actor, { name: power.name, cost: costFromActionText(power.system?.action) });
}

export async function refundAction(actor) {
    const combatant = activeCombatantFor(actor);
    if (!combatant) return;
    await store(combatant, refundLast(accountOf(combatant)));
}

export async function resetAccount(actor) {
    const combatant = activeCombatantFor(actor);
    if (!combatant) return;
    await store(combatant, { key: accountKey(game.combat.round, game.combat.turn), spent: 0, log: [] });
}

/** The choice of "Take an action": every combat action with its cost, plus free choices */
export function actionChoices() {
    const rows = allCombatActions()
        .map((a) => ({ name: a.name, ...costFromTypes(a.type) }))
        .filter((a) => !a.reaction);
    return [
        ...rows.map((a) => ({ value: a.name, label: `${a.name} (${costLabel(a.cost)}${a.variable ? ' or more' : ''})`, cost: a.cost })),
        { value: 'Other Half Action', label: 'Other Half Action', cost: 1 },
        { value: 'Other Full Action', label: 'Other Full Action', cost: 2 },
    ].sort((a, b) => a.label.localeCompare(b.label));
}

export async function chooseAndSpend(actor) {
    const combatant = activeCombatantFor(actor);
    if (!combatant) return ui.notifications.info('It is not the turn of this character.');
    const choices = actionChoices();
    const options = choices.map((c) => `<option value="${foundry.utils.escapeHTML(c.value)}">${foundry.utils.escapeHTML(c.label)}</option>`).join('');
    const value = await foundry.applications.api.DialogV2.prompt({
        classes: ['dh-ui', 'dh-dialog'],
        window: { title: `Take an action: ${actor.name}` },
        content: `<label>Action <select name="action">${options}</select></label><p class="notes">The cost is taken from the actions of this turn.</p>`,
        ok: { label: 'Take it', callback: (ev, button) => button.form.elements.action.value },
        rejectClose: false,
        modal: false,
    });
    const choice = choices.find((c) => c.value === value);
    if (!choice) return;
    if (!(await guardAction(actor, { name: choice.value, cost: choice.cost }))) return;
}

/**
 * Open dossier sheets and the combat tracker follow the account. Only the text of the account panel is replaced (no render of a
 * sheet part: that would bind the click handlers a second time).
 */
export async function refreshAccountViews() {
    const { renderTemplate } = foundry.applications.handlebars;
    for (const app of foundry.applications.instances.values()) {
        if (!(app.actor && app.options?.classes?.includes('dossier') && app.rendered)) continue;
        const box = app.element.querySelector('[data-account]');
        if (!box) continue;
        const html = await renderTemplate('systems/dark-heresy-2nd/templates/actor/dossier/action-account.hbs', { acct: viewFor(app.actor) });
        if (box.dataset.html !== html) {
            box.innerHTML = html;
            box.dataset.html = html;
        }
    }
    decorateTracker();
}

/** Small pips behind the name of the current combatant in the combat tracker (best effort: nothing breaks if the markup differs) */
export function decorateTracker(root = document) {
    try {
        const combat = game.combat;
        for (const old of root.querySelectorAll('.dh-account-pips')) old.remove();
        if (!accountEnabled() || !combat?.started || !combat.combatant) return;
        const combatant = combat.combatant;
        const row = root.querySelector(`.combatant[data-combatant-id="${combatant.id}"]`);
        const target = row?.querySelector('.token-name, .name-controls, h4');
        if (!target) return;
        const view = accountView(accountOf(combatant));
        const el = document.createElement('span');
        el.className = 'dh-account-pips';
        el.title = view.text;
        el.innerHTML = view.pips.map((p) => `<i class="pip ${p.on ? 'is-on' : ''}"></i>`).join('');
        target.appendChild(el);
    } catch (err) {
        console.debug('Dark Heresy | combat tracker pips', err);
    }
}
