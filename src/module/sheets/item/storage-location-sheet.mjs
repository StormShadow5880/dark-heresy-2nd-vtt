import { DarkHeresyItemContainerSheet } from './item-container-sheet.mjs';

export class DarkHeresyStorageLocationSheet extends DarkHeresyItemContainerSheet {
    static DEFAULT_OPTIONS = {
        position: { width: 760, height: 560 },
    };

    static DEFAULT_TAB = 'contents';

    static PARTS = {
        sheet: { template: `systems/dark-heresy-2nd/templates/item/item-storage-location-sheet.hbs`, scrollable: ['.dh-body'] },
    };
}
