import { toggleUIExpanded } from '../../rules/config.mjs';
import { DHSheetMixin } from '../dh-sheet-mixin.mjs';

export class DarkHeresyItemSheet extends DHSheetMixin(foundry.applications.sheets.ItemSheetV2) {
    static DEFAULT_OPTIONS = {
        position: { width: 600, height: 430 },
    };

    static DEFAULT_TAB = 'description';

    static PARTS = {
        sheet: { template: `systems/dark-heresy-2nd/templates/item/item-sheet.hbs`, scrollable: ['.dh-body'] },
    };

    /**
     * An item that is nested in another item (weapon modifications, attack specials, ammunition) is not in a world or actor
     * collection: the base class would try to create it. It is saved through its own update, which writes into the parent.
     */
    async _processSubmitData(event, form, submitData, options = {}) {
        if (this.item.isNestedItem?.()) return this.item.update(submitData);
        return super._processSubmitData(event, form, submitData, options);
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        context.item = this.item;
        return context;
    }

    _activateListeners(html) {
        super._activateListeners(html);
        // the name of a codex sheet is a text area (long names wrap); Enter must not add a line break
        html.find('textarea.dh-codex__name').on('keydown', (ev) => {
            if (ev.key === 'Enter') ev.preventDefault();
        });
        if (!this.isEditable) return;

        html.find('.sheet-control__hide-control').click(async (ev) => await this._sheetControlHideToggle(ev));
        html.find('.effect-delete').click(async (ev) => await this._effectDelete(ev));
        html.find('.effect-edit').click(async (ev) => await this._effectEdit(ev));
        html.find('.effect-create').click(async (ev) => await this._effectCreate(ev));
        html.find('.effect-enable').click(async (ev) => await this._effectEnable(ev));
        html.find('.effect-disable').click(async (ev) => await this._effectDisable(ev));
    }

    async _sheetControlHideToggle(event) {
        event.preventDefault();
        const displayToggle = $(event.currentTarget);
        $('span', displayToggle).first().toggleClass('active');
        const target = displayToggle.data('toggle');
        $('.' + target).toggle();
        toggleUIExpanded(target);
    }

    async _effectDisable(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        const effect = this.item.effects.get(div.data('effectId'));
        effect.update({disabled: true});
    }

    async _effectEnable(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        const effect = this.item.effects.get(div.data('effectId'));
        effect.update({disabled: false});
    }

    async _effectDelete(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        const effect = this.item.effects.get(div.data('effectId'));
        effect.delete();
    }

    async _effectEdit(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        const effect = this.item.effects.get(div.data('effectId'));
        effect.sheet.render({ force: true });
    }

    async _effectCreate(event) {
        event.preventDefault();
        return this.item.createEmbeddedDocuments('ActiveEffect', [{
            name: 'New Effect',
            img: 'icons/svg/aura.svg',
            origin: this.item.uuid,
            disabled: true
        }], { renderSheet: true })
    }
}
