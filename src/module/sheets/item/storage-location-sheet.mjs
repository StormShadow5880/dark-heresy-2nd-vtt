import { DarkHeresyItemContainerSheet } from './item-container-sheet.mjs';

export class DarkHeresyStorageLocationSheet extends DarkHeresyItemContainerSheet {
    static DEFAULT_OPTIONS = {
        position: { width: 640, height: 460 },
    };

    static DEFAULT_TAB = 'contents';

    static PARTS = {
        sheet: { template: `systems/dark-heresy-2nd/templates/item/item-storage-location-sheet.hbs`, scrollable: ['.dh-body'] },
    };
}
