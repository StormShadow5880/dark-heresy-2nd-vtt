/**
 * The world's faction list (Foundry side): defaults of the system plus the custom factions of the GM (world setting, readable by everybody:
 * a faction name is not confidential). Rules: rules/factions.mjs.
 */
import { SYSTEM_ID } from '../system-id.mjs';
import { addCustomFaction, buildRegistry, removeCustomFaction, renameCustomFaction } from '../rules/factions.mjs';

const SETTING = 'factions-custom';

export const registerFactionSettings = () => game.settings.register(SYSTEM_ID, SETTING, { scope: 'world', config: false, type: Object, default: { list: [] } });

export function customFactions() {
    try {
        const v = game.settings.get(SYSTEM_ID, SETTING);
        return Array.isArray(v?.list) ? v.list : [];
    } catch {
        return [];
    }
}

/** Default and custom factions */
export const factionRegistry = () => buildRegistry(customFactions());

async function saveCustom(list) {
    await game.settings.set(SYSTEM_ID, SETTING, { list });
    // open sheets show the names: draw them again (whole sheets, never a part: see the note in ui/world-clock.mjs)
    for (const app of foundry.applications.instances.values()) {
        if (app.rendered && app.document?.documentName === 'Actor' && ['acolyte', 'patron'].includes(app.document.type)) app.render();
    }
}

/** GM dialog: the standard factions (fixed) and the custom ones (add, rename, delete) */
export async function openFactionManager() {
    if (!game.user.isGM) return;
    const DialogV2 = foundry.applications.api.DialogV2;
    const esc = foundry.utils.escapeHTML;
    const rows = () =>
        factionRegistry()
            .map((f) =>
                f.custom
                    ? `<li data-id="${esc(f.id)}"><input type="text" value="${esc(f.name)}" data-rename aria-label="Name" /><button type="button" data-delete aria-label="Delete the faction">×</button></li>`
                    : `<li class="is-default"><span>${esc(f.name)}</span><small>standard</small></li>`,
            )
            .join('');
    await DialogV2.wait({
        classes: ['dh-ui', 'dh-dialog'],
        window: { title: 'Factions' },
        position: { width: 440 },
        content: `<p class="notes">Characters and patrons choose their relations from this list. Add the organisations of your campaign once; they can then be chosen everywhere.</p>
            <ul class="dh-factions">${rows()}</ul>
            <div class="form-group"><input type="text" data-new placeholder="New faction, e.g. House Volscen" /><button type="button" data-add>Add</button></div>
            <p class="notes dh-factions__msg" role="status"></p>`,
        render: (event, dialog) => {
            const el = dialog.element;
            const say = (t) => (el.querySelector('.dh-factions__msg').textContent = t ?? '');
            const redraw = () => (el.querySelector('.dh-factions').innerHTML = rows());
            el.addEventListener('click', async (ev) => {
                const b = ev.target.closest('button');
                if (!b) return;
                if (b.dataset.add !== undefined) {
                    const input = el.querySelector('[data-new]');
                    const r = addCustomFaction(customFactions(), input.value);
                    if (r.error) return say(r.error);
                    await saveCustom(r.custom);
                    input.value = '';
                    say('');
                    redraw();
                } else if (b.dataset.delete !== undefined) {
                    const id = b.closest('li').dataset.id;
                    if (await DialogV2.confirm({ window: { title: 'Delete the faction' }, content: '<p>Delete this faction from the list? Characters and patrons that use it keep the name in their relation.</p>', rejectClose: false, modal: false })) {
                        await saveCustom(removeCustomFaction(customFactions(), id));
                        redraw();
                    }
                }
            });
            el.addEventListener('change', async (ev) => {
                const input = ev.target.closest('[data-rename]');
                if (!input) return;
                const r = renameCustomFaction(customFactions(), input.closest('li').dataset.id, input.value);
                if (r.error) {
                    say(r.error);
                    return redraw();
                }
                await saveCustom(r.custom);
                say('');
            });
        },
        buttons: [{ action: 'close', label: 'Close', default: true }],
        rejectClose: false,
        modal: false,
    });
}
