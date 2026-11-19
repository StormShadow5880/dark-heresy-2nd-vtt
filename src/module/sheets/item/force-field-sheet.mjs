import { DarkHeresyItemSheet } from './item-sheet.mjs';

export class DarkHeresyForceFieldSheet extends DarkHeresyItemSheet {
    static DEFAULT_OPTIONS = {
        position: { width: 820, height: 575 },
    };

    static DEFAULT_TAB = 'stats';

    static PARTS = {
        sheet: { template: `systems/dark-heresy-2nd/templates/item/item-force-field-sheet.hbs`, scrollable: ['.dh-body'] },
    };
}
