import { DarkHeresyItemContainerSheet } from './item-container-sheet.mjs';

export class DarkHeresyArmourSheet extends DarkHeresyItemContainerSheet {
    static DEFAULT_OPTIONS = {
        position: { width: 680, height: 560 },
    };

    static DEFAULT_TAB = 'stats';

    static PARTS = {
        sheet: { template: `systems/dark-heresy-2nd/templates/item/item-armour-sheet.hbs`, scrollable: ['.dh-body'] },
    };
}
