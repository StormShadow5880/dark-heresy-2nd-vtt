/**
 * "Spend EP" as a catalogue: Characteristics, Skills, Talents, Psychic Powers (and "Other" for manual entries). Every row shows the level, the
 * value, the matching aptitudes, the price and the result of the prerequisites; a row is bought with its Buy button after a short
 * confirmation. Prices, checks and the purchase itself are the ones of rules/advancement.mjs and rules/experience.mjs.
 */
import { SYSTEM_ID } from '../system-id.mjs';
import { buildCatalog, filterRows } from '../rules/catalog.mjs';
import { purchaseAdvancement, spendExperience } from '../rules/experience.mjs';
import { DIALOG_CLASSES } from './dialog-helpers.mjs';

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ''));

const TABS = [
    { id: 'char', label: 'Characteristics', header: 'Advance' },
    { id: 'skill', label: 'Skills', header: 'Advance' },
    { id: 'talent', label: 'Talents', header: 'Tier' },
    { id: 'power', label: 'Psychic Powers', header: 'Discipline' },
    { id: 'other', label: 'Other', header: '' },
];

async function loadIndex(name, fields) {
    const pack = game.packs.get(`${SYSTEM_ID}.${name}`);
    if (!pack) return [];
    return [...(await pack.getIndex({ fields }))];
}

const mark = { met: '✓', unmet: '✗', manual: '?' };

/** The prerequisites of a row, requirement by requirement */
function prerequisiteHtml(check) {
    if (!check || check.empty) return '';
    return check.clauses
        .map((c) => {
            const detail = c.alternatives.map((a) => (a.detail ? `${a.text}: ${a.detail}` : a.text)).join(' / ');
            return `<div class="prereq prereq--${c.status}"><b>${mark[c.status]}</b> ${esc(c.text)}${c.status !== 'met' ? ` <small>(${esc(detail)})</small>` : ''}</div>`;
        })
        .join('');
}

export class SpendCatalog extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: ['dh-ui', 'dh-dialog', 'dh-catalog-window'],
        position: { width: 860, height: 680 },
        window: { title: 'Spend Experience', icon: 'fa-solid fa-coins', resizable: true },
    };

    static PARTS = { body: { template: 'systems/dark-heresy-2nd/templates/prompt/spend-catalog.hbs', scrollable: ['.dh-catalog__body'] } };

    static open(actor, preselect = null) {
        const app = new SpendCatalog(actor, preselect);
        app.render({ force: true });
        return app;
    }

    constructor(actor, preselect = null, options = {}) {
        super({ ...options, id: `dh-spend-${actor.id}` });
        this.actor = actor;
        this.tab = !preselect ? 'char' : preselect.kind === 'spec' ? 'skill' : preselect.kind;
        this.search = '';
        this.onlyBuyable = false;
        this.preselect = preselect;
        this.index = null;
    }

    async _loadIndex() {
        if (this.index) return;
        const talents = (await loadIndex('talents', ['img', 'system.aptitudes', 'system.tier', 'system.prerequisites'])).map((e) => ({
            id: e._id,
            name: e.name,
            img: e.img,
            aptitudes: e.system?.aptitudes ?? '',
            tier: e.system?.tier ?? 0,
            prerequisites: e.system?.prerequisites ?? '',
        }));
        const powers = (await loadIndex('psychic-powers', ['img', 'system.cost', 'system.discipline'])).map((e) => ({ id: e._id, name: e.name, img: e.img, discipline: e.system?.discipline ?? '', cost: Number(e.system?.cost) || 0 }));
        talents.sort((a, b) => a.name.localeCompare(b.name));
        powers.sort((a, b) => a.name.localeCompare(b.name));
        this.index = { talents, powers };
    }

    async _prepareContext() {
        await this._loadIndex();
        const catalog = buildCatalog(this.actor, this.index, { isGM: game.user.isGM });
        this._catalog = catalog;
        const isOther = this.tab === 'other';
        const rows = isOther ? [] : filterRows(catalog.tabs[this.tab], { search: this.search, onlyBuyable: this.onlyBuyable });
        const tab = TABS.find((t) => t.id === this.tab);
        const highlight = this.preselect ? `${this.preselect.kind}:${this.preselect.key}` : null;
        return {
            available: catalog.available,
            isGM: game.user.isGM,
            isOther,
            search: this.search,
            onlyBuyable: this.onlyBuyable,
            tabs: TABS.map((t) => ({ ...t, active: t.id === this.tab, count: t.id === 'other' ? 0 : catalog.tabs[t.id].length })),
            levelHeader: tab.header,
            showValue: this.tab === 'char' || this.tab === 'skill',
            showApt: this.tab === 'char' || this.tab === 'skill' || this.tab === 'talent',
            showPrereq: this.tab === 'talent' || this.tab === 'power',
            rows: rows.map((r) => ({ ...r, highlight: r.id === highlight })),
        };
    }

    /** Opens the item card of a talent or psychic power from the compendium. */
    async _openItem(kind, id) {
        const pack = game.packs.get(`${SYSTEM_ID}.${kind === 'power' ? 'psychic-powers' : 'talents'}`);
        const doc = await pack?.getDocument(id);
        if (doc) doc.sheet.render(true);
        else ui.notifications.warn('The item card could not be found.');
    }

    async _onRender() {
        const el = this.element;
        el.querySelectorAll('[data-tab]').forEach((b) =>
            b.addEventListener('click', () => {
                this.tab = b.dataset.tab;
                this.preselect = null;
                this.render();
            }),
        );
        const search = el.querySelector('[data-search]');
        if (search) {
            search.addEventListener('input', () => {
                this.search = search.value;
                this._renderKeepingFocus();
            });
        }
        el.querySelector('[data-only]')?.addEventListener('change', (ev) => {
            this.onlyBuyable = ev.target.checked;
            this.render();
        });
        el.querySelectorAll('[data-open-item]').forEach((a) => {
            const open = () => this._openItem(a.dataset.kind, a.dataset.openItem);
            a.addEventListener('click', open);
            a.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    open();
                }
            });
        });
        el.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => this._confirm(b.dataset.buy)));
        el.querySelector('[data-manual]')?.addEventListener('click', () => this._manual(el.querySelector('.dh-catalog__manual')));
        // opened from a row of the advancement overview: that row is shown and the confirmation opens at once
        if (this.preselect) {
            const id = `${this.preselect.kind}:${this.preselect.key}`;
            this.preselect = null;
            el.querySelector(`tr[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center' });
            if (this._catalog.tabs[this.tab].find((r) => r.id === id)?.canBuy) this._confirm(id);
        }
    }

    /** The list is drawn again while typing: the field keeps its focus and cursor */
    async _renderKeepingFocus() {
        const pos = this.element.querySelector('[data-search]')?.selectionStart ?? null;
        await this.render();
        const input = this.element.querySelector('[data-search]');
        if (input) {
            input.focus();
            if (pos !== null) input.setSelectionRange(pos, pos);
        }
    }

    /** The confirmation: price, prerequisites, choice, note; then the purchase */
    async _confirm(id) {
        const row = Object.values(this._catalog.tabs).flat().find((r) => r.id === id);
        if (!row) return;
        const available = this._catalog.available;
        const needsConfirm = row.status === 'manual';
        const needsOverride = row.status === 'unmet' && game.user.isGM;
        const content = `
            <div class="dh-catalog__confirm">
                <p><b>${esc(row.name)}</b> ${row.level ? `<small>(${esc(row.level)})</small>` : ''}</p>
                <div class="dh-catalog__sum"><span>Cost</span><strong>${row.cost ?? '—'} EP</strong><span>Available</span><strong>${available} EP</strong><span>After the purchase</span><strong>${row.cost != null ? available - row.cost : '—'} EP</strong></div>
                ${row.check && !row.check.empty ? `<div class="dh-catalog__prereq"><h4>Prerequisites</h4>${prerequisiteHtml(row.check)}</div>` : ''}
                ${row.multiple ? '<div class="form-group"><label>Choice (e.g. a weapon group, a type)</label><input type="text" name="choice" required /></div>' : ''}
                ${needsConfirm ? '<div class="form-group"><label>I have checked the prerequisites marked "?"</label><input type="checkbox" name="confirmed" /></div>' : ''}
                ${needsOverride ? '<div class="form-group"><label>GM override: buy although a prerequisite is not met</label><input type="checkbox" name="override" /></div>' : ''}
                <div class="form-group"><label>Note</label><input type="text" name="note" /></div>
            </div>`;
        const data = await DialogV2.prompt({
            classes: DIALOG_CLASSES,
            window: { title: `Buy: ${row.name}` },
            position: { width: 440 },
            content,
            ok: { label: 'Buy', icon: 'fa-solid fa-coins', callback: (ev, button) => new foundry.applications.ux.FormDataExtended(button.form).object },
            rejectClose: false,
            modal: false,
        });
        if (!data) return;
        await this._buy(row, data);
    }

    async _buy(row, data) {
        const purchase = { kind: row.kind, key: row.key, choice: String(data.choice ?? '').trim(), prerequisitesConfirmed: !!data.confirmed, gmOverride: !!data.override, note: String(data.note ?? '').trim() };
        if (row.multiple && !purchase.choice) return ui.notifications.warn('Enter the choice of this talent.');
        if (row.kind === 'talent') {
            const doc = await game.packs.get(`${SYSTEM_ID}.talents`).getDocument(row.entryId);
            const entry = this.index.talents.find((t) => t.id === row.entryId);
            purchase.talent = { ...entry, system: doc.toObject().system };
        } else if (row.kind === 'power') {
            const doc = await game.packs.get(`${SYSTEM_ID}.psychic-powers`).getDocument(row.entryId);
            const entry = this.index.powers.find((p) => p.id === row.entryId);
            purchase.power = { ...entry, data: doc.toObject() };
        }
        const result = await purchaseAdvancement(this.actor, purchase);
        if (result.ok) ui.notifications.info(`${row.name}: ${result.quote.cost} EP spent.`);
        await this.render();
    }

    async _manual(form) {
        const f = new foundry.applications.ux.FormDataExtended(form).object;
        const ok = await spendExperience(this.actor, { target: f.target, cost: f.cost, customLabel: String(f.label ?? '').trim(), note: String(f.note ?? '').trim(), gmOverride: !!f.override });
        if (ok) await this.render();
    }
}
