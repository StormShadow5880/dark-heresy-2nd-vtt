import { sendActionDataToChat } from '../rolls/roll-helpers.mjs';
import { ActionData } from '../rolls/action-data.mjs';
import { actionDialog } from './dialog-helpers.mjs';

export async function prepareDamageRoll(rollData) {
    rollData.dh = CONFIG.dh;
    const content = await foundry.applications.handlebars.renderTemplate('systems/dark-heresy-2nd/templates/prompt/damage-roll-prompt.hbs', rollData);
    await actionDialog({
        title: 'Damage Roll',
        content,
        action: {
            label: 'Roll',
            icon: 'fa-solid fa-dice-d10',
            callback: async (element) => {
                const actionData = new ActionData();
                actionData.template = 'systems/dark-heresy-2nd/templates/chat/damage-roll-chat.hbs';

                rollData.damage = element.querySelector('#damage').value;
                rollData.penetration = element.querySelector('#penetration').value;
                rollData.damageType = element.querySelector('[name=damageType]').value;
                rollData.pr = element.querySelector('#pr')?.value;
                rollData.template = 'systems/dark-heresy-2nd/templates/chat/damage-roll-chat.hbs';
                rollData.roll = new Roll(rollData.damage, rollData);
                await rollData.roll.evaluate();

                actionData.rollData = rollData;
                await sendActionDataToChat(actionData);
            },
        },
    });
}
