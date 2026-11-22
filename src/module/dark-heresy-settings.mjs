import { SYSTEM_ID } from './hooks-manager.mjs';
import { registerClockSettings } from './ui/world-clock.mjs';
import { registerFactionSettings } from './relations/factions.mjs';
import { registerTimeSettings } from './actions/time-runner.mjs';
import { SOUND_SETTINGS, SOUND_VOLUME_SETTING } from './vfx/vfx-config.mjs';

export class DarkHeresySettings {

    static SETTINGS = {
        worldVersion: 'world-version',
        simpleAttackRolls: 'simple-attack-rolls',
        simplePsychicRolls: 'simple-psychic-rolls',
        processActiveEffectsDuringCombat: 'active-effects-during-combat',
        darkChat: 'dark-chat',
        woundsFormula: 'wounds-formula',
        autoCombat: 'auto-combat',
        creatorStartingXp: 'creator-starting-xp',
        creatorVeteran: 'creator-veteran',
        creatorRandom: 'creator-random',
        rulebookMacro: 'rulebook-macro-created',
        healingFirstAidLock: 'healing-firstaid-lock',
        vfx: 'vfx-enabled',

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
            default: 'manual',
            type: String,
            choices: {
                im: 'Imperium Maledictum (calculated)',
                manual: 'Manual (as entered)',
            },
            onChange: () => game.actors?.forEach((a) => a.prepareData?.()),
        });
        game.settings.register(SYSTEM_ID, DarkHeresySettings.SETTINGS.rulebookMacro, {
            scope: 'world',
            config: false,
            default: false,
            type: Boolean,
        });
        game.settings.register(SYSTEM_ID, DarkHeresySettings.SETTINGS.vfx, {
            name: 'Visual Effects (Sequencer + JB2A)',
            hint: 'Play animations for Las weapons, Psychic Bolt and Psychic Blast. Needs the modules Sequencer and JB2A Free Content; without them everything works as before.',
            scope: 'world',
            config: true,
            default: true,
            type: Boolean,
        });
        registerClockSettings();
        registerTimeSettings();
        registerFactionSettings();
        for (const { key, name } of Object.values(SOUND_SETTINGS)) {
            game.settings.register(SYSTEM_ID, key, {
                name,
                hint: 'Audio file played with the animation (needs Sequencer). Empty = silent. Example: modules/my-sounds/laser.ogg',
                scope: 'world',
                config: true,
                default: '',
                type: String,
                filePicker: 'audio',
            });
        }
        game.settings.register(SYSTEM_ID, 'vfx-floating-numbers', {
            name: 'Floating damage and healing numbers',
            hint: 'Shows "-3" in red above a token that loses wounds and "+4" in green when it is healed (needs Sequencer).',
            scope: 'world',
            config: true,
            default: true,
            type: Boolean,
        });
        game.settings.register(SYSTEM_ID, SOUND_VOLUME_SETTING, {
            name: 'Sound volume of the effects',
            scope: 'world',
            config: true,
            default: 0.6,
            type: Number,
            range: { min: 0, max: 1, step: 0.05 },
        });
        game.settings.register(SYSTEM_ID, 'sustain-prompt', {
            name: 'Ask about sustained powers at the start of the turn',
            hint: 'In combat the psyker is asked at the start of his turn which sustained powers he keeps. The cost (Free, Half or Full Action) is taken from the actions of the turn; powers that are not kept end.',
            scope: 'world',
            config: true,
            default: true,
            type: Boolean,
        });
        game.settings.register(SYSTEM_ID, 'relations-cap-mode', {
            name: 'Relationship modifier: limit',
            hint: 'House rule: one relationship level = ±10 on the target of a fitting social test. Here the GM can limit the relationship modifier (positive and negative). This is separate from the DH2 limit of ±60 for all modifiers of a roll, which always applies.',
            scope: 'world',
            config: true,
            default: 'none',
            type: String,
            choices: { none: 'No additional limit', cap: 'Limit to the value below' },
        });
        game.settings.register(SYSTEM_ID, 'relations-cap-value', {
            name: 'Relationship modifier: maximum (only with a limit)',
            hint: 'For example 20 means at most +20 and at least −20 from relationships. No value is built in: it only applies if the limit above is switched on.',
            scope: 'world',
            config: true,
            default: 20,
            type: Number,
            range: { min: 10, max: 60, step: 10 },
        });
        game.settings.register(SYSTEM_ID, 'relations-gm-confirm', {
            name: 'GM confirms every relationship test of the players',
            hint: 'If on, a social test of a player that uses a relationship is first shown to the GM, who can confirm or correct whether it is relevant. Secret patron values and an unclear patron membership always go through the GM.',
            scope: 'world',
            config: true,
            default: false,
            type: Boolean,
        });
        game.settings.register(SYSTEM_ID, DarkHeresySettings.SETTINGS.healingFirstAidLock, {
            name: 'First Aid: what starts the 24 hour limit',
            hint: 'A patient can be treated with First Aid once per 24 hours. Default: only a successful treatment starts the limit. Alternative: every attempt does.',
            scope: 'world',
            config: true,
            default: 'success',
            type: String,
            choices: { success: 'Only a successful treatment', attempt: 'Every attempt' },
        });
        game.settings.register(SYSTEM_ID, DarkHeresySettings.SETTINGS.autoCombat, {
            name: 'Automatic Attack Resolution',
            hint: 'A weapon attack needs a targeted token (no roll without one). An attack that hits asks the target (its owner or the GM) in the chat to dodge, parry or take the hit. The evasion test is rolled, failed evasion applies the damage (armour, penetration, toughness bonus) to the target and one result card shows the damage.',
            scope: 'world',
            config: true,
            default: true,
            type: Boolean,
        });
        // Character creation wizard
        game.settings.register(SYSTEM_ID, DarkHeresySettings.SETTINGS.creatorStartingXp, {
            name: 'Creation: Starting XP',
            hint: 'Experience points a new acolyte has to spend in the character creation wizard (core rulebook: 1000).',
            scope: 'world',
            config: true,
            default: 1000,
            type: Number,
        });
        game.settings.register(SYSTEM_ID, DarkHeresySettings.SETTINGS.creatorVeteran, {
            name: 'Creation: Veteran Variant',
            hint: 'Allows the optional variant in the wizard: characteristics are rolled with a base of 25 instead of 20 (point buy is not available with it).',
            scope: 'world',
            config: true,
            default: false,
            type: Boolean,
        });
        game.settings.register(SYSTEM_ID, DarkHeresySettings.SETTINGS.creatorRandom, {
            name: 'Creation: Random Choices',
            hint: 'Players may pick a random home world, background and role in the wizard (the GM always may).',
            scope: 'world',
            config: true,
            default: true,
            type: Boolean,
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
