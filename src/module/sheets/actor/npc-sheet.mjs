import { AcolyteSheet } from './acolyte-sheet.mjs';

export class NpcSheet extends AcolyteSheet {
    static DEFAULT_OPTIONS = {
        position: { width: 1000, height: 750 },
    };

    static DEFAULT_TAB = 'main';

    static PARTS = {
        sheet: { template: `systems/dark-heresy-2nd/templates/actor/actor-npc-sheet.hbs`, scrollable: ['.dh-body'] },
    };
}
