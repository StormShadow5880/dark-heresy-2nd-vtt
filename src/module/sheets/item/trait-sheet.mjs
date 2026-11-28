import { DarkHeresyItemSheet } from './item-sheet.mjs';

export class DarkHeresyTraitSheet extends DarkHeresyItemSheet {
    static DEFAULT_OPTIONS = {
        position: { width: 600, height: 430 },
    };

    static DEFAULT_TAB = 'stats';

    static PARTS = {
        sheet: { template: `systems/dark-heresy-2nd/templates/item/item-trait-sheet.hbs`, scrollable: ['.dh-body'] },
    };
}
