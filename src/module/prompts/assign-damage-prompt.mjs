import { DHPromptApplication } from './dh-prompt-base.mjs';

export class AssignDamageDialog extends DHPromptApplication {
    static DEFAULT_OPTIONS = {
        id: 'dh-assign-damage-dialog',
        window: { title: 'Assign Damage' },
    };

    static PARTS = {
        prompt: { template: 'systems/dark-heresy-2nd/templates/prompt/assign-damage-prompt.hbs' },
    };

    constructor(assignDamageData = {}, options = {}) {
        super(options);
        this.data = assignDamageData;
    }

    _activateListeners(html) {
        html.find('#assign-damage').click(async (ev) => await this._assignDamage(ev));
        html.find('#cancel-prompt').click(async (ev) => await this._cancelPrompt(ev));
    }

    async _cancelPrompt(event) {
        await this.close();
    }

    async _assignDamage(event) {
        await this.data.finalize();
        await this.data.performActionAndSendToChat();
        await this.close();
    }
}

export async function prepareAssignDamageRoll(assignDamageData) {
    const prompt = new AssignDamageDialog(assignDamageData);
    await prompt.render({ force: true });
}
