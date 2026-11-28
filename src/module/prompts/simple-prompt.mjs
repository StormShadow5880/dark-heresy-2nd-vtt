import { moduleOn } from '../modules.mjs';
import { sendActionDataToChat } from '../rolls/roll-helpers.mjs';
import { actionDialog } from './dialog-helpers.mjs';
import { isSocialSkill } from '../rules/relations.mjs';
import { applicableOriginBonuses, applyOriginResult, planOriginRoll } from '../rules/origin-bonuses.mjs';
import { toRuleDegrees } from '../rules/degrees.mjs';
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
    if (actor && isSocialSkill(skillKey) && moduleOn('relations')) {
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
    // named origin bonuses and Fate options (rules/origin-bonuses.mjs); nothing is on by default
    const bio = actor?.system?.bio;
    const speciality = simpleSkillData.specKey;
    const avail = bio ? applicableOriginBonuses(bio, skillKey, speciality) : { modifiers: [], fate: [] };
    const fatePoints = Number(actor?.system?.fate?.value ?? 0);
    if (avail.modifiers.length || avail.fate.length) content = content.replace(/<\/div>\s*$/, `${originSectionHtml(avail, fatePoints)}</div>`);
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
                const plan = planOriginRoll({
                    bio,
                    skillKey,
                    specKey: speciality,
                    selected: [...element.querySelectorAll('input[data-origin-bonus]:checked')].map((e) => e.dataset.originBonus),
                    fateId: element.querySelector('input[name="origin-fate"]:checked')?.value || null,
                    fatePoints,
                });
                for (const error of plan.errors) ui.notifications.warn(`Origin bonus: ${error}`);
                const originSum = Object.values(plan.modifiers).reduce((a, b) => a + b, 0);
                if (section) {
                    const outcome = await handleSelection({
                        actor,
                        simpleSkillData,
                        section,
                        skillKey,
                        skillLabel: rollData.nameOverride,
                        difficulty: rollData.modifiers['difficulty'],
                        // the GM-resolved path rolls elsewhere: the named bonuses are added to the manual modifier, no Fate Point is spent
                        modifier: Number(rollData.modifiers['modifier'] || 0) + originSum,
                    });
                    if (outcome === 'handled') {
                        if (plan.fate) ui.notifications.info('No Fate Point was spent: the GM resolves this test.');
                        return;
                    }
                }
                Object.assign(rollData.modifiers, plan.modifiers);
                await rollData.calculateTotalModifiers();
                await simpleSkillData.calculateSuccessOrFailure();
                if (plan.fate || plan.degrees.length) {
                    const bonus = plan.fate?.characteristic ? Number(actor.system.characteristics?.[plan.fate.characteristic]?.bonus ?? 0) : 0;
                    const result = applyOriginResult({ success: rollData.success, dos: rollData.dos, dof: rollData.dof }, plan, bonus);
                    Object.assign(rollData, { success: result.success, dos: result.dos, dof: result.dof });
                    rollData.ruleDos = toRuleDegrees(result.dos);
                    rollData.originNotes = result.notes;
                    // one Fate Point, spent once, only after the roll and only when the ability took effect
                    if (result.spendFate) await actor.spendFate();
                }
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

/** The origin section of the dialog: named bonuses as tick boxes, Fate options as one radio group */
function originSectionHtml({ modifiers, fate }, fatePoints) {
    const esc = (t) => foundry.utils.escapeHTML?.(String(t)) ?? String(t);
    const rows = modifiers.map((b) => {
        const effect = b.kind === 'degree' ? `+${b.value} degree of success` : `+${b.value}`;
        return `<label class="dh-origin-row"><input type="checkbox" data-origin-bonus="${b.id}" /> <b>${esc(b.name)}</b> ${effect} <i>${esc(b.condition)}</i></label>`;
    });
    const fateRows = fate.map((f) => {
        const effect = f.kind === 'bonus' ? `+${f.value}` : 'automatic success';
        return `<label class="dh-origin-row"><input type="radio" name="origin-fate" value="${f.id}" ${fatePoints < 1 ? 'disabled' : ''} /> <b>${esc(f.name)}</b> ${effect} · costs 1 Fate Point <i>${esc(f.condition)}</i></label>`;
    });
    return `<div class="dh-panel spacer dh-origin"><h1 class="dh-panel__header">Origin bonuses</h1>${rows.join('')}
        <h1 class="dh-panel__header">Fate Point (${fatePoints} available)</h1>
        <label class="dh-origin-row"><input type="radio" name="origin-fate" value="" checked /> No Fate Point</label>${fateRows.join('')}</div>`;
}
