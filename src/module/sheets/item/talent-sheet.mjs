import { DarkHeresyItemSheet } from './item-sheet.mjs';

export class DarkHeresyTalentSheet extends DarkHeresyItemSheet {
    static DEFAULT_OPTIONS = {
        position: { width: 640, height: 460 },
    };

    static DEFAULT_TAB = 'stats';

    static PARTS = {
        sheet: { template: `systems/dark-heresy-2nd/templates/item/item-talent-sheet.hbs`, scrollable: ['.dh-body'] },
    };
}
