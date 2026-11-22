import { sendActionDataToChat } from '../rolls/roll-helpers.mjs';
import { actionDialog } from './dialog-helpers.mjs';
import { isSocialSkill } from '../rules/relations.mjs';
import { bindSection, handleSelection, relationContext, sectionHtml } from '../relations/roll.mjs';

/**
 *
 * @param simpleSkillData {SimpleSkillData}
 * @returns {Promise<void>}
 */
export async function prepareSimpleRoll(simpleSkillData) {
    let content = await foundry.applications.handlebars.renderTemplate('systems/dark-heresy-2nd/templates/prompt/simple-roll-prompt.hbs', simpleSkillData);
    // social skills: the relationship section (patron, faction, contact). Other tests never get it.
    const skillKey = simpleSkillData.skillKey;
    const actor = simpleSkillData.rollData.actor;
    let ctx = null;
    if (actor && isSocialSkill(skillKey)) {
        try {
            ctx = await relationContext(actor);
            const section = sectionHtml(ctx, simpleSkillData.relationPreset ?? {});
            if (section) content = content.replace(/\{\{relation\}\}/g, '').replace(/<\/div>\s*$/, `${section}</div>`);
            else ctx = null;
        } catch (error) {
            console.warn('Dark Heresy 2e | relationship section failed', error);
            ctx = null;
        }
    }
    let section = null;
    const dialog = await actionDialog({
        title: 'Roll Modifier',
        content,
        width: ctx ? 400 : 300,
        action: {
            label: 'Roll',
            icon: 'fa-solid fa-dice-d20',
            callback: async (element) => {
                const rollData = simpleSkillData.rollData;
                rollData.modifiers['difficulty'] = parseInt(element.querySelector('#difficulty').value);
                rollData.modifiers['modifier'] = element.querySelector('#modifier').value;
                if (section) {
                    const outcome = await handleSelection({
                        actor,
                        simpleSkillData,
                        section,
                        skillKey,
                        skillLabel: rollData.nameOverride,
                        difficulty: rollData.modifiers['difficulty'],
                        modifier: rollData.modifiers['modifier'],
                    });
                    if (outcome === 'handled') return;
                }
                await rollData.calculateTotalModifiers();
                await simpleSkillData.calculateSuccessOrFailure();
                await sendActionDataToChat(simpleSkillData);
            },
        },
    });
    if (ctx) section = bindSection(dialog.element, ctx, { skillKey, skillLabel: simpleSkillData.rollData.nameOverride, base: simpleSkillData.rollData.baseTarget });
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
