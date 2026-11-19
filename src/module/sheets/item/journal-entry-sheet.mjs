import { DarkHeresyItemSheet } from './item-sheet.mjs';

export class DarkHeresyJournalEntrySheet extends DarkHeresyItemSheet {
    static DEFAULT_OPTIONS = {
        position: { width: 800, height: 350 },
    };

    static DEFAULT_TAB = 'stats';

    static PARTS = {
        sheet: { template: `systems/dark-heresy-2nd/templates/item/item-journal-entry-sheet.hbs`, scrollable: ['.dh-body'] },
    };
}
