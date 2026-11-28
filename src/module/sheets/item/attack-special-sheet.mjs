import { DarkHeresyItemSheet } from './item-sheet.mjs';

export class DarkHeresyAttackSpecialSheet extends DarkHeresyItemSheet {
    static DEFAULT_OPTIONS = {
        position: { width: 680, height: 470 },
    };

    static DEFAULT_TAB = 'stats';

    static PARTS = {
        sheet: { template: `systems/dark-heresy-2nd/templates/item/item-attack-special-sheet.hbs`, scrollable: ['.dh-body'] },
    };
}
