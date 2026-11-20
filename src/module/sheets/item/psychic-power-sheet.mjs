import { DarkHeresyItemContainerSheet } from './item-container-sheet.mjs';
import { CHARACTERISTIC_LABELS, EFFECT_FIELDS, effectRows } from '../../rules/psychic-effects.mjs';

export class DarkHeresyPsychicPowerSheet extends DarkHeresyItemContainerSheet {
    static DEFAULT_OPTIONS = {
        position: { width: 820, height: 575 },
        actions: {
            addPsychicEffect: DarkHeresyPsychicPowerSheet.#onAddEffect,
            removePsychicEffect: DarkHeresyPsychicPowerSheet.#onRemoveEffect,
        },
    };

    static DEFAULT_TAB = 'stats';

    static PARTS = {
        sheet: { template: `systems/dark-heresy-2nd/templates/item/item-psychic-power-sheet.hbs`, scrollable: ['.dh-body'] },
    };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        context.effectRows = effectRows(this.item);
        context.effectCharacteristics = CHARACTERISTIC_LABELS;
        context.effectFields = EFFECT_FIELDS;
        context.effectRounding = { up: 'Round up', down: 'Round down', none: 'No rounding' };
        return context;
    }

    /** The effect rows are submitted as an object keyed by index, they are stored as an array */
    _processFormData(event, form, formData) {
        const data = super._processFormData(event, form, formData);
        const rows = data?.system?.autoEffects;
        if (rows && !Array.isArray(rows)) {
            data.system.autoEffects = Object.keys(rows)
                .sort((a, b) => a - b)
                .map((key) => rows[key]);
        }
        return data;
    }

    static async #onAddEffect() {
        const rows = [...effectRows(this.item), { characteristic: 'toughness', field: 'unnatural', value: null, pr: { divide: 2, round: 'up' } }];
        await this.item.update({ 'system.autoEffects': rows });
    }

    static async #onRemoveEffect(event, target) {
        const index = Number(target.dataset.index);
        const rows = effectRows(this.item).filter((_, i) => i !== index);
        await this.item.update({ 'system.autoEffects': rows });
    }
}
