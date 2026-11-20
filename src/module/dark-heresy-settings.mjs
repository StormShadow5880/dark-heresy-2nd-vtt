import { SYSTEM_ID } from './hooks-manager.mjs';

export class DarkHeresySettings {

    static SETTINGS = {
        worldVersion: 'world-version',
        simpleAttackRolls: 'simple-attack-rolls',
        simplePsychicRolls: 'simple-psychic-rolls',
        processActiveEffectsDuringCombat: 'active-effects-during-combat',
        darkChat: 'dark-chat',
        woundsFormula: 'wounds-formula',

    }

    /** CSS class on the body that switches the dark chat on (see scss/ui/_chat-log.scss) */
    static DARK_CHAT_CLASS = 'dh-dark-chat';

    static applyDarkChat() {
        document.body.classList.toggle(DarkHeresySettings.DARK_CHAT_CLASS, !!game.settings.get(SYSTEM_ID, DarkHeresySettings.SETTINGS.darkChat));
    }

    static registerSettings() {
        // IM-001: rule taken over from Imperium Maledictum, see docs/imperium-maledictum-imports.md
        game.settings.register(SYSTEM_ID, DarkHeresySettings.SETTINGS.woundsFormula, {
            name: 'Maximum Wounds Rule',
            hint: 'Imperium Maledictum: Max Wounds = Strength Bonus + 2 x Toughness Bonus + Willpower Bonus, calculated automatically for player characters and updated when traits, powers or effects change a characteristic. Manual: the maximum entered on the sheet is used.',
            scope: 'world',
            config: true,
            default: 'im',
            type: String,
            choices: {
                im: 'Imperium Maledictum (calculated)',
                manual: 'Manual (as entered)',
            },
            onChange: () => game.actors?.forEach((a) => a.prepareData?.()),
        });
        game.settings.register(SYSTEM_ID, DarkHeresySettings.SETTINGS.darkChat, {
            name: 'Dark Chat',
            hint: 'Shows the whole chat (message list, messages and input) in the dark imperial style, whatever the Foundry theme is. Only affects you.',
            scope: 'client',
            config: true,
            default: true,
            type: Boolean,
            onChange: () => DarkHeresySettings.applyDarkChat(),
        });

        game.settings.register(SYSTEM_ID, DarkHeresySettings.SETTINGS.worldVersion, {
            name: 'World Version',
            hint: 'Used to handle data migration during system upgrades.',
            scope: 'world',
            config: true,
            requiresReload: true,
            default: 0,
            type: Number,
        });
        game.settings.register(SYSTEM_ID, DarkHeresySettings.SETTINGS.processActiveEffectsDuringCombat, {
            name: 'Active Effect Processing',
            hint: 'Process effects like Fire or Blood Loss on combat turn change.',
            scope: 'world',
            config: true,
            requiresReload: true,
            default: true,
            type: Boolean,
        });
        game.settings.register(SYSTEM_ID, DarkHeresySettings.SETTINGS.simpleAttackRolls, {
            name: 'Simple Attack Rolls',
            hint: 'Changes the default weapon automation behavior to disabled. Attack rolls will trigger a WeaponSkill or BallisticSkill roll as needed.',
            scope: 'client',
            config: true,
            requiresReload: true,
            default: false,
            type: Boolean,
        });
        game.settings.register(SYSTEM_ID, DarkHeresySettings.SETTINGS.simplePsychicRolls, {
            name: 'Simple Psychic Rolls',
            hint: 'Changes the default psychic power automation behavior to disabled. Psychic rolls will trigger a simple WillPower roll.',
            scope: 'client',
            config: true,
            requiresReload: true,
            default: false,
            type: Boolean,
        });
    }
}
