import { applyDataTypes } from '../sheets/dh-sheet-mixin.mjs';
import { recursiveUpdate } from '../rolls/roll-helpers.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

async function onSubmit(event, form, formData) {
    applyDataTypes(form, formData);
    game.dh.log('_updateObject', { event, formData: formData.object });
    recursiveUpdate(this.data, formData.object);
    await this.data.update();
    await this.render();
}

/**
 * Base class for the roll prompts. The prompt edits `this.data` (a roll data object)
 * live while the user changes form values.
 */
export class DHPromptApplication extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        tag: 'form',
        classes: ['dialog', 'dh-prompt'],
        position: { width: 500 },
        form: { handler: onSubmit, submitOnChange: true, closeOnSubmit: false },
    };

    /** The object that is edited by the form and is used as the template context */
    data = {};

    async _prepareContext(options) {
        await this.data.update();
        return this.data;
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        this._activateListeners($(this.element));
    }

    /**
     * @param html {jQuery}
     */
    _activateListeners(html) {}
}
