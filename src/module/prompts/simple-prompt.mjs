import { sendActionDataToChat } from '../rolls/roll-helpers.mjs';
import { actionDialog } from './dialog-helpers.mjs';

/**
 *
 * @param simpleSkillData {SimpleSkillData}
 * @returns {Promise<void>}
 */
export async function prepareSimpleRoll(simpleSkillData) {
    const content = await foundry.applications.handlebars.renderTemplate('systems/dark-heresy-2nd/templates/prompt/simple-roll-prompt.hbs', simpleSkillData);
    await actionDialog({
        title: 'Roll Modifier',
        content,
        action: {
            label: 'Roll',
            icon: 'fa-solid fa-dice-d20',
            callback: async (element) => {
                const rollData = simpleSkillData.rollData;
                rollData.modifiers['difficulty'] = parseInt(element.querySelector('#difficulty').value);
                rollData.modifiers['modifier'] = element.querySelector('#modifier').value;
                await rollData.calculateTotalModifiers();
                await simpleSkillData.calculateSuccessOrFailure();
                await sendActionDataToChat(simpleSkillData);
            },
        },
    });
}

export async function prepareCreateSpecialistSkillPrompt(simpleSkillData) {
    const content = await foundry.applications.handlebars.renderTemplate('systems/dark-heresy-2nd/templates/prompt/add-speciality-prompt.hbs', simpleSkillData);
    await actionDialog({
        title: 'Create Specialist Skill',
        content,
        action: {
            label: 'Add',
            icon: 'fa-solid fa-plus',
            callback: async (element) => {
                const speciality = element.querySelector('#speciality-name').value;
                await simpleSkillData.actor.addSpecialitySkill(simpleSkillData.skillName, speciality);
            },
        },
    });
}
