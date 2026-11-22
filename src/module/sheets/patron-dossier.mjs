/**
 * Patron dossier (ApplicationV2). The GM edits everything; a player who owns an assigned character sees the public data only.
 * What the player's client receives is already reduced (store.mjs, rules/relations-data.mjs): hidden values are not in the client data.
 */
import { SYSTEM_ID } from '../system-id.mjs';
import { AFFILIATIONS } from '../rules/relations.mjs';
import { newId } from '../rules/relations-data.mjs';
import { actorPatronId, assignPatron, createPatron, deletePatron, fullPatron, patronDocs, savePatron, publicPatron } from '../relations/store.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEXT_FIELDS = [
    { key: 'role', label: 'Role', rows: 2 },
    { key: 'motivation', label: 'Motivation', rows: 3 },
    { key: 'demeanor', label: 'Demeanor', rows: 3 },
    { key: 'description', label: 'Description', rows: 5 },
    { key: 'notes', label: 'Notes', rows: 4 },
];

export class PatronDossier extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: ['dh-ui', 'dh-patron'],
        position: { width: 620, height: 720 },
        window: { resizable: true, icon: 'fa-solid fa-user-tie' },
        actions: {
            addBoon: PatronDossier.#add('boons', () => ({ id: newId('b'), text: '' })),
            addLiability: PatronDossier.#add('liabilities', () => ({ id: newId('l'), text: '', secret: false })),
            addRelation: PatronDossier.#add('relations', () => ({ id: newId('r'), faction: '', level: 0, secret: false })),
            removeRow: PatronDossier.#remove,
            save: PatronDossier.#save,
            pickImage: PatronDossier.#pickImage,
        },
    };

    static PARTS = { body: { template: 'systems/dark-heresy-2nd/templates/patron/dossier.hbs', scrollable: ['.dh-patron__body'] } };

    constructor(patronId, options = {}) {
        super({ ...options, id: `dh-patron-${patronId}` });
        this.patronId = patronId;
        this.draft = null;
        this.assigned = null;
    }

    get title() {
        return this.draft?.name ?? 'Patron';
    }

    async _prepareContext() {
        const doc = game.journal.get(this.patronId);
        const isGM = game.user.isGM;
        if (!this.draft) {
            this.draft = foundry.utils.deepClone(await fullPatron(doc));
            this.assigned = new Set(publicPatron(doc)?.assigned ?? []);
        }
        const characters = isGM
            ? game.actors
                  .filter((a) => a.type === 'acolyte')
                  .map((a) => ({ id: a.id, name: a.name, assigned: this.assigned.has(a.id), other: actorPatronId(a) && actorPatronId(a) !== this.patronId ? game.journal.get(actorPatronId(a))?.name : '' }))
            : [];
        return { patron: this.draft, editable: isGM, isGM, textFields: TEXT_FIELDS, affiliations: AFFILIATIONS, characters };
    }

    _onRender() {
        const root = this.element;
        root.querySelectorAll('[data-field]').forEach((el) => el.addEventListener('change', () => (this.draft[el.dataset.field] = el.value)));
        root.querySelectorAll('[data-list]').forEach((el) =>
            el.addEventListener('change', () => {
                const row = this.draft[el.dataset.list][Number(el.dataset.index)];
                if (!row) return;
                const key = el.dataset.key;
                row[key] = el.type === 'checkbox' ? el.checked : key === 'level' ? Math.trunc(Number(el.value)) || 0 : el.value;
            }),
        );
        root.querySelectorAll('[data-assign]').forEach((el) => el.addEventListener('change', () => (el.checked ? this.assigned.add(el.dataset.assign) : this.assigned.delete(el.dataset.assign))));
    }

    static #add(list, make) {
        return function () {
            this.draft[list].push(make());
            this.render();
        };
    }

    static #remove(event, target) {
        this.draft[target.dataset.list].splice(Number(target.dataset.index), 1);
        this.render();
    }

    static async #pickImage() {
        if (!game.user.isGM) return;
        new foundry.applications.apps.FilePicker.implementation({
            type: 'image',
            current: this.draft.img,
            callback: (path) => {
                this.draft.img = path;
                this.render();
            },
        }).render(true);
    }

    static async #save() {
        if (!game.user.isGM) return;
        const doc = game.journal.get(this.patronId);
        const before = new Set(publicPatron(doc)?.assigned ?? []);
        await savePatron(this.patronId, { ...this.draft, assigned: [...before] });
        for (const id of this.assigned) if (!before.has(id)) await assignPatron(game.actors.get(id), this.patronId);
        for (const id of before) if (!this.assigned.has(id)) await assignPatron(game.actors.get(id), null);
        ui.notifications.info(`${this.draft.name} saved.`);
        this.draft = null;
        this.render();
    }
}

/** Opens the dossier of a patron (a player only gets the patrons of his characters, the document permission decides) */
export function openPatron(patronId) {
    const doc = game.journal.get(patronId);
    if (!doc) return ui.notifications.warn('This patron is not available to you.');
    new PatronDossier(patronId).render({ force: true });
}

/** GM list of all patrons: open, create, delete */
export async function openPatronDirectory() {
    if (!game.user.isGM) return;
    const DialogV2 = foundry.applications.api.DialogV2;
    const docs = patronDocs();
    const rows = docs.map((d) => `<li><b>${foundry.utils.escapeHTML(d.name)}</b> <small>${(publicPatron(d)?.assigned ?? []).length} character(s)</small>
        <button type="button" data-open="${d.id}">Open</button><button type="button" data-delete="${d.id}" aria-label="Delete">×</button></li>`).join('');
    await DialogV2.wait({
        classes: ['dh-ui', 'dh-dialog'],
        window: { title: 'Patrons' },
        content: `<ul class="dh-patron__dir">${rows || '<li class="empty">No patrons yet.</li>'}</ul>`,
        render: (event, dialog) =>
            dialog.element.addEventListener('click', async (ev) => {
                const b = ev.target.closest('button[data-open], button[data-delete]');
                if (!b) return;
                if (b.dataset.open) openPatron(b.dataset.open);
                else if (await DialogV2.confirm({ window: { title: 'Delete the patron' }, content: '<p>Delete this patron and its confidential data? The characters lose their patron.</p>', rejectClose: false, modal: false })) {
                    await deletePatron(b.dataset.delete);
                    dialog.close();
                    openPatronDirectory();
                }
            }),
        buttons: [
            { action: 'new', label: 'New patron', default: true, callback: async () => (await createPatron()) },
            { action: 'close', label: 'Close' },
        ],
        rejectClose: false,
        modal: false,
    }).then(async (r) => {
        if (r && r.id) openPatron(r.id);
    });
}
