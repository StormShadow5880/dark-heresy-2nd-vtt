import { DarkHeresyItemSheet } from './item-sheet.mjs';

export class DarkHeresyJournalEntrySheet extends DarkHeresyItemSheet {
    static DEFAULT_OPTIONS = {
        position: { width: 640, height: 430 },
    };

    static DEFAULT_TAB = 'stats';

    static PARTS = {
        sheet: { template: `systems/dark-heresy-2nd/templates/item/item-journal-entry-sheet.hbs`, scrollable: ['.dh-body'] },
    };
}
