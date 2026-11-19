import { DarkHeresyItemSheet } from './item-sheet.mjs';

export class DarkHeresyPeerEnemySheet extends DarkHeresyItemSheet {
    static DEFAULT_OPTIONS = {
        position: { width: 800, height: 340 },
    };

    static DEFAULT_TAB = 'stats';

    static PARTS = {
        sheet: { template: `systems/dark-heresy-2nd/templates/item/item-peer-enemy-sheet.hbs`, scrollable: ['.dh-body'] },
    };
}
