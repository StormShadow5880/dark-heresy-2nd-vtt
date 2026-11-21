import { autoCombatEnabled } from '../actions/combat-resolution-manager.mjs';
import { DHPromptApplication } from './dh-prompt-base.mjs';

export class PsychicPowerDialog extends DHPromptApplication {
    static DEFAULT_OPTIONS = {
        id: 'dh-psychic-power-dialog',
        window: { title: 'Psychic Power' },
    };

    static PARTS = {
        prompt: { template: 'systems/dark-heresy-2nd/templates/prompt/psychic-power-roll-prompt.hbs' },
    };

    /**
     * @param psychicAttackData {PsychicActionData}
     * @param options
     */
    constructor(psychicAttackData = {}, options = {}) {
        super(options);
        this.psychicAttackData = psychicAttackData;
        this.data = psychicAttackData.rollData;
        this.initialized = false;
    }

    _activateListeners(html) {
        html.find('.power-select').change(async (ev) => await this._updatePower(ev));
        html.find('#power-roll').click(async (ev) => await this._rollPower(ev));
        html.find('#power-cancel').click(async (ev) => await this._cancelPower(ev));
    }

    async _updatePower(event) {
        this.data.selectPower(event.target.name);
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

    async _cancelPower(event) {
        await this.close();
    }

    async _rollPower(event) {
        // With the attack automation a psychic attack needs a target, like a weapon attack
        if (this.data.hasDamage && !this.data.targetActor && autoCombatEnabled()) {
            ui.notifications.warn('Target the token you attack first (select it and press T, or right click > Target). Without a target no attack roll is made.');
            return;
        }
        await this.data.finalize();
        await this.psychicAttackData.performActionAndSendToChat();
        await this.close();
    }
}

/**
 *
 * @param psychicAttackData {PsychicActionData}
 */
export async function preparePsychicPowerRoll(psychicAttackData) {
    const prompt = new PsychicPowerDialog(psychicAttackData);
    await prompt.render({ force: true });
}
