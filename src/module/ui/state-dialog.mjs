import { SYSTEM_ID } from '../system-id.mjs';
import { describeFlags, valueText } from '../rules/state-flags.mjs';

const { DialogV2 } = foundry.applications.api;
const esc = (t) => foundry.utils.escapeHTML(String(t ?? ''));

/** The documents that carry state of this actor: the actor, its items and its combatants */
function holders(actor) {
    const list = [{ doc: actor, on: 'actor', name: actor.name }];
    for (const item of actor.items) list.push({ doc: item, on: 'item', name: `${item.name} (item)` });
    for (const combat of game.combats ?? []) for (const c of combat.combatants) if (c.actorId === actor.id) list.push({ doc: c, on: 'combatant', name: `${c.name} (combat)` });
    return list;
}

/** GM: the state flags of a character in one place, each with a reset button where that is safe */
export async function openStateDialog(actor) {
    if (!game.user.isGM) return;
    const rows = [];
    for (const h of holders(actor)) {
        for (const f of describeFlags(h.doc.flags?.[SYSTEM_ID], h.on)) rows.push({ ...f, holder: h });
    }
    const body = rows.length
        ? rows
              .map(
                  (r, i) => `<tr><td><b>${esc(r.label)}</b><br><small>${esc(r.holder.name)} · ${esc(r.key)}</small></td><td><small>${esc(r.note)}</small><br><code>${esc(valueText(r.value))}</code></td><td>${r.resettable ? `<button type="button" data-reset="${i}">Reset</button>` : ''}</td></tr>`,
              )
              .join('')
        : '<tr><td colspan="3"><em>No state is stored for this character.</em></td></tr>';
    await DialogV2.wait({
        classes: ['dh-ui', 'dh-dialog'],
        window: { title: `Module state: ${actor.name}`, resizable: true },
        position: { width: 640 },
        content: `<p class="notes">The state that the system keeps outside of the normal data (timers, combat counters, locks). Resetting only removes that one entry; nothing else changes.</p><table class="wtable wtable--full"><tbody>${body}</tbody></table>`,
        render: (event, dialog) => {
            dialog.element.querySelectorAll('[data-reset]').forEach((button) =>
                button.addEventListener('click', async () => {
                    const r = rows[Number(button.dataset.reset)];
                    await r.holder.doc.unsetFlag(SYSTEM_ID, r.key);
                    button.closest('tr').remove();
                }),
            );
        },
        buttons: [{ action: 'close', label: 'Close', default: true }],
        rejectClose: false,
        modal: false,
    });
}
