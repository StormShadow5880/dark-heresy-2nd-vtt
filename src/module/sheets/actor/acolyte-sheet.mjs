import { toggleUIExpanded } from '../../rules/config.mjs';
import { ActorContainerSheet } from './actor-container-sheet.mjs';
import { DHBasicActionManager } from '../../actions/basic-action-manager.mjs';
import { DHTargetedActionManager } from '../../actions/targeted-action-manager.mjs';
import { Hit } from '../../rolls/damage-data.mjs';
import { AssignDamageData } from '../../rolls/assign-damage-data.mjs';
import { prepareAssignDamageRoll } from '../../prompts/assign-damage-prompt.mjs';
import { confirmDialog } from '../../prompts/dialog-helpers.mjs';
import { toFormula } from '../../rules/formula.mjs';
import { woundsFormulaIsIM } from '../../rules/wounds-setting.mjs';

export class AcolyteSheet extends ActorContainerSheet {
    static DEFAULT_OPTIONS = {
        position: { width: 1000, height: 750 },
    };

    static DEFAULT_TAB = 'main';

    static PARTS = {
        sheet: { template: `systems/dark-heresy-2nd/templates/actor/actor-acolyte-sheet.hbs`, scrollable: ['.dh-body'] },
    };

    _activateListeners(html) {
        super._activateListeners(html);

        html.find('.roll-characteristic').click(async (ev) => await this._prepareRollCharacteristic(ev));
        html.find('.roll-skill').click(async (ev) => await this._prepareRollSkill(ev));
        html.find('.acolyte-homeWorld').change((ev) => this._onHomeworldChange(ev));
        html.find('.bonus-vocalize').click(async (ev) => await this._onBonusVocalize(ev));

        html.find('.combat-control').click(async (ev) => await this._combatControls(ev));
    }

    async _combatControls(event) {
        event.preventDefault();
        const target = event.currentTarget;

        switch(target.dataset.combatAction) {
            case 'attack':
                await DHTargetedActionManager.performWeaponAttack(this.actor);
                break;
            case 'assign-damage':
                const hitData = new Hit();
                const assignData = new AssignDamageData(this.actor, hitData);
                await prepareAssignDamageRoll(assignData);
                break;
            case 'dodge':
                await this.actor.rollSkill('dodge');
                break;
            case 'parry':
                await this.actor.rollSkill('parry');
                break;

        }
    }

    async _onBonusVocalize(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        let bonus = this.actor.backgroundEffects.abilities.find((a) => a.name === div.data('bonusName'));
        if (bonus) {
            await DHBasicActionManager.sendItemVocalizeChat({
                actor: this.actor.name,
                name: bonus.name,
                type: bonus.source,
                description: bonus.benefit,
            });
        }
    }

    async _prepareRollCharacteristic(event) {
        event.preventDefault();
        const characteristicName = $(event.currentTarget).data('characteristic');
        await this.actor.rollCharacteristic(characteristicName);
    }

    async _prepareRollSkill(event) {
        event.preventDefault();
        const skillName = $(event.currentTarget).data('skill');
        const specialtyName = $(event.currentTarget).data('specialty');
        await this.actor.rollSkill(skillName, specialtyName);
    }

    async _onHomeworldChange(event) {
        event.preventDefault();
        const confirmed = await confirmDialog({
            title: 'Roll Characteristics?',
            content: '<p>Would you like to roll Wounds and Fate for this homeworld?</p>',
        });
        if (!confirmed) return;

        // Something is probably wrong -- we will skip this
        const homeworld = this.actor.backgroundEffects?.homeworld;
        if (!homeworld) return;

        // Roll Wounds - only when the maximum is entered by hand. With the Imperium Maledictum rule (IM-001)
        // the maximum wounds are calculated from the characteristics.
        if (!woundsFormulaIsIM()) {
            const woundRoll = new Roll(toFormula(homeworld.wounds));
            await woundRoll.evaluate();
            this.actor.wounds.max = woundRoll.total;
        }

        // Roll Fate
        const fateRoll = new Roll('1d10');
        await fateRoll.evaluate();
        this.actor.fate.max = parseInt(homeworld.fate_threshold) + (fateRoll.total >= homeworld.emperors_blessing ? 1 : 0);
        this.render();
    }
}
