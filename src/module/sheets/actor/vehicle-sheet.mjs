import { ActorContainerSheet } from './actor-container-sheet.mjs';

export class VehicleSheet extends ActorContainerSheet {
    static DEFAULT_OPTIONS = {
        position: { width: 1000, height: 750 },
    };

    static DEFAULT_TAB = 'main';

    static PARTS = {
        sheet: { template: `systems/dark-heresy-2nd/templates/actor/actor-vehicle-sheet.hbs`, scrollable: ['.dh-body'] },
    };

    async _onItemDamage(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        game.dh.warn('Not Implemented for Vehicles Yet');
    }

}
