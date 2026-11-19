import { DHPromptApplication } from './dh-prompt-base.mjs';

export class WeaponAttackDialog extends DHPromptApplication {
    static DEFAULT_OPTIONS = {
        id: 'dh-weapon-attack-dialog',
        window: { title: 'Weapon Attack' },
    };

    static PARTS = {
        prompt: { template: 'systems/dark-heresy-2nd/templates/prompt/weapon-roll-prompt.hbs' },
    };

    /**
     * @param weaponActionData {WeaponActionData}
     * @param options
     */
    constructor(weaponActionData = {}, options = {}) {
        super(options);
        this.weaponAttackData = weaponActionData;
        this.data = weaponActionData.rollData;
        this.initialized = false;
    }

    _activateListeners(html) {
        html.find('.weapon-select').change(async (ev) => await this._updateWeapon(ev));
        html.find('#attack-roll').click(async (ev) => await this._rollAttack(ev));
        html.find('#attack-cancel').click(async (ev) => await this._cancelAttack(ev));
    }

    async _updateWeapon(event) {
        this.data.selectWeapon(event.target.name);
        await this.data.update();
        await this.render();
    }

    async _prepareContext(options) {
        // Initial Values
        if (!this.initialized) {
            this.data.initialize();
            this.initialized = true;
        }
        return super._prepareContext(options);
    }

    async _cancelAttack(event) {
        await this.close();
    }

    async _rollAttack(event) {
        if (this.data.fireRate === 0) {
            ui.notifications.warn(`Not enough ammo to perform action. Do you need to reload?`);
            return;
        }

        await this.data.finalize();
        await this.weaponAttackData.performActionAndSendToChat();
        await this.close();
    }
}

/**
 *
 * @param weaponAttackData {WeaponActionData}
 */
export async function prepareWeaponRoll(weaponAttackData) {
    const prompt = new WeaponAttackDialog(weaponAttackData);
    await prompt.render({ force: true });
}
