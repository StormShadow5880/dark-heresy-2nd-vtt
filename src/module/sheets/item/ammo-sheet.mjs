import { DarkHeresyItemContainerSheet } from './item-container-sheet.mjs';

export class DarkHeresyAmmoSheet extends DarkHeresyItemContainerSheet {
    static DEFAULT_OPTIONS = {
        position: { width: 820, height: 575 },
    };

    static DEFAULT_TAB = 'stats';

    static PARTS = {
        sheet: { template: `systems/dark-heresy-2nd/templates/item/item-ammo-sheet.hbs`, scrollable: ['.dh-body'] },
    };

    canAdd(itemData) {
        if (!super.canAdd(itemData)) {
            return false;
        }
        // Every item can only be added once for weapons
        if (this.item.items?.some((i) => i.name === itemData.name)) {
            ui.notifications.info('Ammo can only hold one ' + itemData.name);
            return false;
        }
        return true;
    }
}
