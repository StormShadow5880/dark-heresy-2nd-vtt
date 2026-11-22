/**
 * Patron dossier (ApplicationV2). The GM edits everything; a player who owns an assigned character sees the public data only.
 * What the player's client receives is already reduced (store.mjs, rules/relations-data.mjs): hidden values are not in the client data.
 */
import { SYSTEM_ID } from '../system-id.mjs';
import { AFFILIATIONS } from '../rules/relations.mjs';
import { newId } from '../rules/relations-data.mjs';
import { factionRegistry, openFactionManager } from '../relations/factions.mjs';
import { findById } from '../rules/factions.mjs';
import { actorPatronId, assignPatron, createPatron, deletePatron, fullPatron, patronDocs, savePatron, publicPatron } from '../relations/store.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;

const TEXT_FIELDS = [
    { key: 'role', label: 'Role', rows: 3, icon: 'fa-medal' },
    { key: 'motivation', label: 'Motivation', rows: 3, icon: 'fa-compass' },
    { key: 'demeanor', label: 'Demeanor', rows: 4, icon: 'fa-masks-theater' },
    { key: 'description', label: 'Description', rows: 4, icon: 'fa-scroll' },
    { key: 'notes', label: 'Notes', rows: 3, icon: 'fa-book-open' },
];

/**
 * Sheet of the patron actor. The GM edits everything; a player who owns an assigned character sees the public data only. What the player's
 * client receives is already reduced (store.mjs, rules/relations-data.mjs): hidden values are not in the client data.
 */
/** Is the patron's own faction (a name) in the list of the world? An empty one counts as listed */
function factionListed(name) {
    const n = String(name ?? '').trim().toLowerCase();
    return !n || factionRegistry().some((f) => f.name.toLowerCase() === n);
}

export class PatronSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
    static DEFAULT_OPTIONS = {
        classes: ['dh-ui', 'dh-patron'],
        position: { width: 940, height: 900 },
        window: { resizable: true, icon: 'fa-solid fa-user-tie' },
        // our fields are saved with the Save button, not by the form
        form: { submitOnChange: false, closeOnSubmit: false, handler: async () => {} },
        actions: {
            addBoon: PatronSheet.#add('boons', () => ({ id: newId('b'), name: '', text: '' })),
            addLiability: PatronSheet.#add('liabilities', () => ({ id: newId('l'), name: '', text: '', secret: false })),
            addRelation: PatronSheet.#add('relations', () => ({ id: newId('r'), faction: '', level: 0, note: '', secret: false })),
            removeRow: PatronSheet.#remove,
            manageFactions: () => openFactionManager(),
            pickImage: PatronSheet.#pickImage,
        },
    };

    // '' = the part itself is the scrolling area
    static PARTS = { body: { template: 'systems/dark-heresy-2nd/templates/patron/dossier.hbs', scrollable: [''] } };

    draft = null;
    assigned = null;

    #timer = null;

    get patronId() {
        return this.document.id;
    }

    get title() {
        return `Patron: ${this.draft?.name ?? this.document.name}`;
    }

    /** Every change is saved by itself shortly after the last edit (and when the window closes): there is no Save button to forget */
    queueSave() {
        if (!game.user.isGM) return;
        clearTimeout(this.#timer);
        this.#timer = setTimeout(() => this.autosave(), 500);
    }

    async autosave() {
        clearTimeout(this.#timer);
        this.#timer = null;
        if (!game.user.isGM || !this.draft) return;
        try {
            const doc = this.document;
            const before = new Set(publicPatron(doc)?.assigned ?? []);
            // render:false: a redraw while typing would take the focus away from the next field
            await savePatron(this.patronId, { ...this.draft, assigned: [...before] }, { render: false });
            for (const id of this.assigned) if (!before.has(id)) await assignPatron(game.actors.get(id), this.patronId);
            for (const id of before) if (!this.assigned.has(id)) await assignPatron(game.actors.get(id), null);
            if (this.window?.title) this.window.title.textContent = this.title;
            const note = this.element?.querySelector('.dh-patron__saved');
            if (note) note.textContent = 'Saved.';
        } catch (error) {
            console.error('Dark Heresy 2e | the patron could not be saved', error);
            ui.notifications.error(`The patron could not be saved: ${error.message}`);
        }
    }

    async close(options) {
        if (this.#timer) await this.autosave();
        return super.close(options);
    }

    async _prepareContext(options) {
        const base = await super._prepareContext(options);
        const doc = this.document;
        const isGM = game.user.isGM;
        if (!this.draft) {
            this.draft = foundry.utils.deepClone(await fullPatron(doc));
            this.assigned = new Set(publicPatron(doc)?.assigned ?? []);
        }
        const characters = isGM
            ? game.actors
                  .filter((a) => a.type === 'acolyte')
                  .map((a) => ({ id: a.id, name: a.name, assigned: this.assigned.has(a.id), other: actorPatronId(a) && actorPatronId(a) !== this.patronId ? game.actors.get(actorPatronId(a))?.name : '' }))
            : [];
        return { ...base, patron: this.draft, editable: isGM, isGM, textFields: TEXT_FIELDS, affiliations: AFFILIATIONS, characters, factionOptions: factionRegistry(), factionListed: factionListed(this.draft.faction) };
    }

    /** Belt and braces: the scroll position is also kept by hand, adding or removing a row must never throw the sheet back to the top */
    async _preRender(context, options) {
        await super._preRender?.(context, options);
        const body = this.element?.querySelector?.('.dh-patron__body');
        this._scrollTop = body ? body.scrollTop : null;
    }

    _onRender(context, options) {
        super._onRender?.(context, options);
        const root = this.element;
        if (this._scrollTop) {
            const body = root.querySelector('.dh-patron__body');
            const top = this._scrollTop;
            if (body) {
                body.scrollTop = top;
                requestAnimationFrame(() => (body.scrollTop = top));
            }
        }
        root.querySelectorAll('[data-field]').forEach((el) =>
            el.addEventListener('change', () => {
                this.draft[el.dataset.field] = el.value;
                this.queueSave();
            }),
        );
        root.querySelectorAll('[data-nav]').forEach((b) =>
            b.addEventListener('click', () => {
                root.querySelector(`#${b.dataset.nav}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                root.querySelectorAll('[data-nav]').forEach((x) => x.classList.toggle('is-active', x === b));
            }),
        );
        root.querySelectorAll('[data-list]').forEach((el) =>
            el.addEventListener('change', () => {
                const row = this.draft[el.dataset.list][Number(el.dataset.index)];
                if (!row) return;
                const key = el.dataset.key;
                if (key === 'factionId') {
                    // chosen from the list of the world: the row keeps the id and the name at the time of choosing
                    const chosen = findById(factionRegistry(), el.value);
                    row.factionId = chosen?.id ?? null;
                    if (chosen) row.faction = chosen.name;
                } else row[key] = el.type === 'checkbox' ? el.checked : key === 'level' ? Math.trunc(Number(el.value)) || 0 : el.value;
                this.queueSave();
                if (key === 'level') this.render(); // the colour of the level box follows
            }),
        );
        root.querySelectorAll('[data-assign]').forEach((el) => el.addEventListener('change', () => {
                el.checked ? this.assigned.add(el.dataset.assign) : this.assigned.delete(el.dataset.assign);
                this.queueSave();
            }),
        );
    }

    static #add(list, make) {
        return function () {
            this.draft[list].push(make());
            this.queueSave();
            this.render();
        };
    }

    static #remove(event, target) {
        this.draft[target.dataset.list].splice(Number(target.dataset.index), 1);
        this.queueSave();
        this.render();
    }

    static async #pickImage() {
        if (!game.user.isGM) return;
        new foundry.applications.apps.FilePicker.implementation({
            type: 'image',
            current: this.draft.img,
            callback: (path) => {
                this.draft.img = path;
                this.queueSave();
                this.render();
            },
        }).render(true);
    }
}

/** Opens the sheet of a patron (a player only gets the patrons of his characters: the permission of the actor decides) */
export function openPatron(patronId) {
    const doc = game.actors.get(patronId);
    if (!doc) return ui.notifications.warn('This patron is not available to you.');
    try {
        doc.sheet.render({ force: true });
    } catch (error) {
        console.error('Dark Heresy 2e | the patron sheet could not be opened', error);
        ui.notifications.error(`The patron sheet could not be opened: ${error.message}`);
    }
}

/** GM list of all patrons: open, create, delete (patrons are also in the Actors directory: type Patron) */
export async function openPatronDirectory() {
    if (!game.user.isGM) return;
    const DialogV2 = foundry.applications.api.DialogV2;
    const docs = patronDocs();
    const rows = docs
        .map(
            (d) => `<li><b>${foundry.utils.escapeHTML(d.name)}</b> <small>${(publicPatron(d)?.assigned ?? []).length} character(s)</small>
        <button type="button" data-open="${d.id}">Open</button><button type="button" data-delete="${d.id}" aria-label="Delete">×</button></li>`,
        )
        .join('');
    await DialogV2.wait({
        classes: ['dh-ui', 'dh-dialog'],
        window: { title: 'Patrons' },
        content: `<ul class="dh-patron__dir">${rows || '<li class="empty">No patrons yet.</li>'}</ul>
            <p><button type="button" data-new="1">New patron</button></p>`,
        render: (event, dialog) =>
            dialog.element.addEventListener('click', async (ev) => {
                const b = ev.target.closest('button[data-open], button[data-delete], button[data-new]');
                if (!b) return;
                try {
                    if (b.dataset.new) {
                        // created here and not in the callback of a dialog button: errors are shown instead of swallowed
                        const doc = await createPatron();
                        if (!doc) return ui.notifications.error('The patron could not be created.');
                        dialog.close();
                        openPatron(doc.id);
                    } else if (b.dataset.open) openPatron(b.dataset.open);
                    else if (await DialogV2.confirm({ window: { title: 'Delete the patron' }, content: '<p>Delete this patron and its confidential data? The characters lose their patron.</p>', rejectClose: false, modal: false })) {
                        await deletePatron(b.dataset.delete);
                        dialog.close();
                        openPatronDirectory();
                    }
                } catch (error) {
                    console.error('Dark Heresy 2e | patron action failed', error);
                    ui.notifications.error(`Patron: ${error.message}`);
                }
            }),
        buttons: [{ action: 'close', label: 'Close', default: true }],
        rejectClose: false,
        modal: false,
    });
}
