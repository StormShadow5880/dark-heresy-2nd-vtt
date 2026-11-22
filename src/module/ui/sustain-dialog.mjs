import { SYSTEM_ID } from '../system-id.mjs';
import { canSustain } from '../rules/psychic-effects.mjs';
import { isPsychicPowerActive, deactivatePsychicEffect } from '../actions/psychic-effect-manager.mjs';
import { TURN_BUDGET, budgetLabel, needsSustainPrompt, planSustain, sustainEntries, turnKey } from '../rules/sustain-turn.mjs';

const { DialogV2 } = foundry.applications.api;
const esc = (t) => foundry.utils.escapeHTML?.(String(t ?? '')) ?? String(t ?? '');

/** The active powers of the actor that have to be kept going */
export function sustainedPowersOf(actor) {
    return actor.items.filter((i) => i.type === 'psychicPower' && canSustain(i) && isPsychicPowerActive(actor, i));
}

/** Who answers the question: an active player who owns the character, otherwise the active GM. Everybody calculates the same user. */
export function responsibleUserId(actor) {
    const owners = game.users.filter((u) => u.active && !u.isGM && actor.testUserPermission?.(u, 'OWNER')).sort((a, b) => a.id.localeCompare(b.id));
    return owners[0]?.id ?? game.users.activeGM?.id ?? null;
}

/** Called on every client when the turn changes: only the responsible user sees the dialog */
export async function onTurnStart(combat) {
    if (!game.settings.get(SYSTEM_ID, 'sustain-prompt')) return;
    const combatant = combat?.combatant;
    const actor = combatant?.actor;
    if (!combatant || !actor || combatant.isDefeated || !['acolyte', 'npc'].includes(actor.type)) return;
    if (responsibleUserId(actor) !== game.user.id) return;
    const key = turnKey(combat.round, combat.turn);
    if (combatant.getFlag(SYSTEM_ID, 'sustainTurn')?.key === key) return; // already answered this turn
    const powers = sustainedPowersOf(actor);
    const entries = sustainEntries(powers.map((p) => ({ id: p.id, name: p.name, sustained: p.system.sustained })));
    if (!needsSustainPrompt(entries)) return;
    await promptSustained(actor, combatant, entries, key);
}

function rowHtml(e) {
    return `<label class="dh-sustain__row" data-cost="${e.cost}">
        <input type="checkbox" name="keep" value="${esc(e.id)}" ${e.cost === 0 ? 'checked' : ''} />
        <span class="dh-sustain__name">${esc(e.name)}</span>
        <span class="dh-sustain__cost">${esc(e.manual ? `${e.sustained || 'Special'} (check the power)` : e.label)}</span>
    </label>`;
}

async function promptSustained(actor, combatant, entries, key) {
    const content = `<form class="dh-sustain">
        <p class="notes">Start of the turn of <strong>${esc(actor.name)}</strong>. Tick the powers you keep going. Free actions cost nothing, the others are taken from the actions of this turn. Powers you do not tick end.</p>
        <div class="dh-sustain__list">${entries.map(rowHtml).join('')}</div>
        <p class="dh-sustain__budget" aria-live="polite"></p>
    </form>`;

    const refresh = (form) => {
        const kept = [...form.querySelectorAll('input[name=keep]:checked')].map((c) => c.value);
        const plan = planSustain(entries, kept);
        // a power that no longer fits cannot be ticked
        for (const row of form.querySelectorAll('.dh-sustain__row')) {
            const box = row.querySelector('input');
            const cost = Number(row.dataset.cost);
            box.disabled = !box.checked && cost > plan.remaining;
            row.classList.toggle('is-disabled', box.disabled);
        }
        form.querySelector('.dh-sustain__budget').textContent = `Left for this turn: ${budgetLabel(Math.max(0, plan.remaining))}`;
    };

    const result = await DialogV2.wait({
        classes: ['dh-ui', 'dh-dialog'],
        window: { title: `Sustained powers: ${actor.name}` },
        position: { width: 460 },
        content,
        render: (event, dialog) => {
            const form = dialog.element.querySelector('form');
            form.addEventListener('change', () => refresh(form));
            refresh(form);
        },
        buttons: [
            {
                action: 'keep',
                label: 'Keep the ticked powers',
                default: true,
                callback: (ev, button) => [...button.form.querySelectorAll('input[name=keep]:checked')].map((c) => c.value),
            },
            { action: 'later', label: 'Decide later', callback: () => null },
        ],
        rejectClose: false,
        modal: false,
    });
    if (!Array.isArray(result)) return;

    const plan = planSustain(entries, result);
    if (!plan.ok) return ui.notifications.warn(plan.error);
    for (const e of plan.dropped) await deactivatePsychicEffect(actor, e.id);
    await combatant.setFlag(SYSTEM_ID, 'sustainTurn', { key, spent: plan.spent, remaining: plan.remaining, kept: plan.kept.map((e) => e.id) });

    const list = (arr) => arr.map((e) => `${esc(e.name)} <em>(${esc(e.label)})</em>`).join(', ') || '—';
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="dh-chat"><p><strong>${esc(actor.name)}</strong> sustains: ${list(plan.kept)}.</p>${plan.dropped.length ? `<p>Ended: ${list(plan.dropped)}.</p>` : ''}<p>Actions left this turn: <strong>${esc(budgetLabel(Math.max(0, plan.remaining)))}</strong> (of ${esc(budgetLabel(TURN_BUDGET))}).</p></div>`,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    });
}
