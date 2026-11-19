import { DHPromptApplication } from './dh-prompt-base.mjs';

export class ForceFieldDialog extends DHPromptApplication {
    static DEFAULT_OPTIONS = {
        id: 'dh-force-field-dialog',
        window: { title: 'Force Field' },
    };

    static PARTS = {
        prompt: { template: 'systems/dark-heresy-2nd/templates/prompt/force-field-prompt.hbs' },
    };

    constructor(forceFieldData = {}, options = {}) {
        super(options);
        this.data = forceFieldData;
    }

    _activateListeners(html) {
        html.find('#roll-force-field').click(async (ev) => await this._rollForceField(ev));
        html.find('#cancel-prompt').click(async (ev) => await this._cancelPrompt(ev));
    }

    async _cancelPrompt(event) {
        await this.close();
    }

    async _rollForceField(event) {
        if (!this.data.forceField.system.activated) {
            ui.notifications.warn(`Force Field not activated!`);
            return;
        }

        if (this.data.forceField.system.overloaded) {
            ui.notifications.warn(`Force Field currently overloaded!`);
            return;
        }

        await this.data.finalize();
        await this.data.performActionAndSendToChat();
        await this.close();
    }
}

export async function prepareForceFieldRoll(forceFieldData) {
    const prompt = new ForceFieldDialog(forceFieldData);
    await prompt.render({ force: true });
}
