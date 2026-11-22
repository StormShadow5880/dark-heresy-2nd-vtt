import { DarkHeresyItem } from './documents/item.mjs';
import { DarkHeresy } from './rules/config.mjs';
import { AcolyteSheet } from './sheets/actor/acolyte-sheet.mjs';
import { AcolyteDossierSheet } from './sheets/actor/dossier-sheet.mjs';
import { DarkHeresyItemSheet } from './sheets/item/item-sheet.mjs';
import { DarkHeresyWeaponSheet } from './sheets/item/weapon-sheet.mjs';
import { DarkHeresyArmourSheet } from './sheets/item/armour-sheet.mjs';
import { DarkHeresyTalentSheet } from './sheets/item/talent-sheet.mjs';
import { DarkHeresyJournalEntrySheet } from './sheets/item/journal-entry-sheet.mjs';
import { DarkHeresyPeerEnemySheet } from './sheets/item/peer-enemy-sheet.mjs';
import { DarkHeresyAttackSpecialSheet } from './sheets/item/attack-special-sheet.mjs';
import { DarkHeresyWeaponModSheet } from './sheets/item/weapon-mod-sheet.mjs';
import {
    createCharacteristicMacro,
    createItemMacro,
    createSkillMacro,
    rollCharacteristicMacro,
    rollItemMacro,
    rollSkillMacro,
} from './macros/macro-manager.mjs';
import { HandlebarManager } from './handlebars/handlebars-manager.mjs';
import { DarkHeresyAmmoSheet } from './sheets/item/ammo-sheet.mjs';
import { DarkHeresyPsychicPowerSheet } from './sheets/item/psychic-power-sheet.mjs';
import { DarkHeresyStorageLocationSheet } from './sheets/item/storage-location-sheet.mjs';
import { DarkHeresyTraitSheet } from './sheets/item/trait-sheet.mjs';
import { DarkHeresyActorProxy } from './documents/actor-proxy.mjs';
import { NpcSheet } from './sheets/actor/npc-sheet.mjs';
import { VehicleSheet } from './sheets/actor/vehicle-sheet.mjs';
import { DarkHeresyCriticalInjurySheet } from './sheets/item/critical-injury-sheet.mjs';
import { DarkHeresyGearSheet } from './sheets/item/gear-sheet.mjs';
import { DarkHeresySettings } from './dark-heresy-settings.mjs';
import { DHTargetedActionManager } from './actions/targeted-action-manager.mjs';
import { DHBasicActionManager } from './actions/basic-action-manager.mjs';
import { DHCombatActionManager } from './actions/combat-action-manager.mjs';
import { DarkHeresyCyberneticSheet } from './sheets/item/cybernetic-sheet.mjs';
import { DarkHeresyForceFieldSheet } from './sheets/item/force-field-sheet.mjs';
import { checkAndMigrateWorld } from './dark-heresy-migrations.mjs';
import { DHTourMain } from './tours/main-tour.mjs';

import * as documents from './documents/_module.mjs'

import { SYSTEM_ID } from './system-id.mjs';
import { onPsychicEffectRemoved, onPsychicPowerDeleted, refreshPsychicEffects } from './actions/psychic-effect-manager.mjs';
import { aptitudesLocked, isCreatorGranted } from './rules/aptitude-lock.mjs';
import { applyRulebookStyles, ensureImportMacro, importRulebookPages } from './tools/rulebook-import.mjs';
import { registerCombatSocket } from './actions/combat-resolution-manager.mjs';
import { PatronSheet } from './sheets/patron-dossier.mjs';
import { initWorldClock } from './ui/world-clock.mjs';
import { registerRelationSocket } from './relations/roll.mjs';
import { migrateJournalPatrons } from './relations/store.mjs';
import { initTimeRunner, registerTimeSocket } from './actions/time-runner.mjs';
import { registerHealingSocket, registerHealingLockSocket } from './actions/healing-manager.mjs';
import { CharacterCreator } from './creator/wizard.mjs';
import { preloadDossierImages } from './ui/preload-images.mjs';
import { registerWoundsSyncHooks, syncAllWounds } from './actions/wounds-sync.mjs';
export { SYSTEM_ID };

export class HooksManager {
    static registerHooks() {
        console.log('Dark Heresy 2nd Edition | Registering system hooks');

        Hooks.once('init', HooksManager.init);
        Hooks.on('ready', HooksManager.ready);
        Hooks.on('hotbarDrop', HooksManager.hotbarDrop);
        Hooks.on('deleteActiveEffect', HooksManager.deleteActiveEffect);
        Hooks.on('deleteItem', HooksManager.deleteItem);
        for (const hook of ['createJournalEntryPage', 'updateJournalEntryPage', 'deleteJournalEntryPage', 'createJournalEntry', 'updateJournalEntry', 'deleteJournalEntry']) Hooks.on(hook, () => applyRulebookStyles());
        Hooks.on('preCreateItem', HooksManager.preCreateItem);
        Hooks.on('preDeleteItem', HooksManager.preDeleteItem);
        Hooks.on('renderActorDirectory', HooksManager.renderActorDirectory);
        Hooks.on('updateActor', HooksManager.updateActor);
        registerWoundsSyncHooks();

        DHTargetedActionManager.initializeHooks();
        DHBasicActionManager.initializeHooks();
        DHCombatActionManager.initializeHooks();
    }

    static init() {
        console.log(`Loading Dark Heresy 2nd Edition System
______________  _________ 
___  __ \__  / / /_|__  /
__  / / /_  /_/ /____/ /
_  /_/ /_  __  / _  __/ 
/_____/ /_/ /_/  /____/ 

"Only in death does duty end"
Enable Debug with: game.dh.debug = true           
`);

        const consolePrefix = 'Dark Heresy | ';
        game.dh = {
            debug: false,
            log: (s, o) => (!!game.dh.debug ? console.log(`${consolePrefix}${s}`, o) : undefined),
            warn: (s, o) => console.warn(`${consolePrefix}${s}`, o),
            error: (s, o) => console.error(`${consolePrefix}${s}`, o),
            rollItemMacro,
            rollSkillMacro,
            rollCharacteristicMacro,
            openCreator: () => CharacterCreator.open(),
            importRulebookPages,
        };

        //CONFIG.debug.hooks = true;

        // Add custom constants for configuration.
        CONFIG.dh = DarkHeresy;
        CONFIG.Combat.initiative = { formula: '@initiative.base + @initiative.bonus', decimals: 0 };
        CONFIG.MeasuredTemplate.defaults.angle = 30.0;

        // Define custom Document classes
        CONFIG.Actor.documentClass = DarkHeresyActorProxy;
        CONFIG.Actor.documentClasses = {
            acolyte: documents.DarkHeresyAcolyte,
            npc: documents.DarkHeresyNPC,
            vehicle: documents.DarkHeresyVehicle,
            patron: documents.DarkHeresyPatron,

        };
        CONFIG.Actor.typeLabels = { ...(CONFIG.Actor.typeLabels ?? {}), patron: 'Patron' };
        CONFIG.Item.documentClass = DarkHeresyItem;

        // Register sheet application classes
        const { Actors, Items } = foundry.documents.collections;
        // Replace the core sheets with our ApplicationV2 sheets
        const { ActorSheet, ItemSheet } = foundry.appv1.sheets;
        try {
            Actors.unregisterSheet('core', ActorSheet);
            Items.unregisterSheet('core', ItemSheet);
        } catch (err) {
            game.dh.warn('Unable to unregister core sheets', err);
        }
        Actors.registerSheet(SYSTEM_ID, AcolyteDossierSheet, {types: ['acolyte'], makeDefault: true, label: 'Dark Heresy Dossier'});
        Actors.registerSheet(SYSTEM_ID, AcolyteSheet, {types: ['acolyte'], makeDefault: false, label: 'Dark Heresy Classic'});
        Actors.registerSheet(SYSTEM_ID, NpcSheet, {types: ['npc'], makeDefault: true });
        Actors.registerSheet(SYSTEM_ID, PatronSheet, {types: ['patron'], makeDefault: true, label: 'Patron Dossier'});
        Actors.registerSheet(SYSTEM_ID, VehicleSheet, {types: ['vehicle'], makeDefault: true });

        Items.registerSheet(SYSTEM_ID, DarkHeresyItemSheet, { makeDefault: true });
        Items.registerSheet(SYSTEM_ID, DarkHeresyAmmoSheet, { types: ['ammunition'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, DarkHeresyArmourSheet, { types: ['armour'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, DarkHeresyAttackSpecialSheet, { types: ['attackSpecial'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, DarkHeresyCriticalInjurySheet, { types: ['criticalInjury'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, DarkHeresyCyberneticSheet, { types: ['cybernetic'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, DarkHeresyJournalEntrySheet, { types: ['journalEntry'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, DarkHeresyForceFieldSheet, { types: ['forceField'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, DarkHeresyGearSheet, { types: ['consumable', 'gear', 'drug', 'tool'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, DarkHeresyPeerEnemySheet, { types: ['peer', 'enemy'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, DarkHeresyPsychicPowerSheet, { types: ['psychicPower'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, DarkHeresyStorageLocationSheet, {types: ['storageLocation'],makeDefault: true,});
        Items.registerSheet(SYSTEM_ID, DarkHeresyTalentSheet, { types: ['talent'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, DarkHeresyTraitSheet, {types: ['trait'],makeDefault: true,});
        Items.registerSheet(SYSTEM_ID, DarkHeresyWeaponModSheet, {types: ['weaponModification'],makeDefault: true,});
        Items.registerSheet(SYSTEM_ID, DarkHeresyWeaponSheet, { types: ['weapon'], makeDefault: true });

        DarkHeresySettings.registerSettings();
        HandlebarManager.loadTemplates();
    }

    static async ready() {
        console.log(`DH2e Loaded!`);
        DarkHeresySettings.applyDarkChat();
        preloadDossierImages();
        registerCombatSocket();
        registerHealingSocket();
        registerHealingLockSocket();
        registerTimeSocket();
        registerRelationSocket();
        if (game.users.activeGM?.id === game.user.id) migrateJournalPatrons().then((n) => n && ui.notifications.info(`${n} patron(s) converted to patron actors.`)).catch((e) => console.warn('Dark Heresy 2e | patron migration failed', e));
        initTimeRunner();
        initWorldClock();
        applyRulebookStyles();
        ensureImportMacro().catch((e) => console.warn('Dark Heresy 2e | macro could not be created', e));
        await syncAllWounds();
        await checkAndMigrateWorld();

        game.tours.register(SYSTEM_ID, "main-tour", new DHTourMain());

        console.log('Initializing with:', game.settings.get(SYSTEM_ID, DarkHeresySettings.SETTINGS.processActiveEffectsDuringCombat));
        if (!game.settings.get(SYSTEM_ID, DarkHeresySettings.SETTINGS.processActiveEffectsDuringCombat)) {
            DHCombatActionManager.disableHooks();
        }
    }

    /** Whoever deleted the effect of a sustained power also updates the sustained count */
    static async deleteActiveEffect(effect, options, userId) {
        if (userId !== game.user.id) return;
        await onPsychicEffectRemoved(effect);
    }

    /** Button "Create Acolyte" in the actor directory (opens the character creation wizard) */
    static renderActorDirectory(app, html) {
        const root = html instanceof HTMLElement ? html : html[0];
        if (!root) return;
        if (game.user.isGM && !root.querySelector('.dh-finish-rest')) {
            const rest = document.createElement('button');
            rest.type = 'button';
            rest.className = 'dh-finish-rest';
            rest.innerHTML = '<i class="fa-solid fa-bed"></i> 24 h rest';
            rest.addEventListener('click', async () => (await import('./actions/healing-manager.mjs')).finishRest());
            (root.querySelector('.directory-header .header-actions') ?? root.querySelector('.directory-header') ?? root.querySelector('header'))?.append(rest);
        }
        if (game.user.isGM && !root.querySelector('.dh-patrons')) {
            const patrons = document.createElement('button');
            patrons.type = 'button';
            patrons.className = 'dh-patrons';
            patrons.innerHTML = '<i class="fa-solid fa-user-tie"></i> Patrons';
            patrons.addEventListener('click', async () => (await import('./sheets/patron-dossier.mjs')).openPatronDirectory());
            (root.querySelector('.directory-header .header-actions') ?? root.querySelector('.directory-header') ?? root.querySelector('header'))?.append(patrons);
        }
        if (game.user.isGM && !root.querySelector('.dh-factions-btn')) {
            const factions = document.createElement('button');
            factions.type = 'button';
            factions.className = 'dh-factions-btn';
            factions.innerHTML = '<i class="fa-solid fa-landmark"></i> Factions';
            factions.addEventListener('click', async () => (await import('./relations/factions.mjs')).openFactionManager());
            (root.querySelector('.directory-header .header-actions') ?? root.querySelector('.directory-header') ?? root.querySelector('header'))?.append(factions);
        }
        if (root.querySelector('.dh-create-acolyte')) return;
        if (!game.user.hasPermission('ACTOR_CREATE')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dh-create-acolyte';
        button.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Acolyte';
        button.addEventListener('click', () => CharacterCreator.open());
        const header = root.querySelector('.directory-header .header-actions') ?? root.querySelector('.directory-header') ?? root.querySelector('header');
        header?.append(button);
    }

    /** Aptitudes are fixed after character creation (see rules/aptitude-lock.mjs) */
    static preCreateItem(item, data) {
        if (item.type !== 'aptitude' || !item.parent?.getFlag || isCreatorGranted(data)) return;
        if (!aptitudesLocked(item.parent)) return;
        ui.notifications.warn('Aptitudes are fixed after character creation and can not be added by hand.');
        return false;
    }

    static preDeleteItem(item) {
        if (item.type !== 'aptitude' || !item.parent?.getFlag || !aptitudesLocked(item.parent)) return;
        ui.notifications.warn('Aptitudes are fixed after character creation and can not be removed by hand.');
        return false;
    }

    static async deleteItem(item, options, userId) {
        if (userId !== game.user.id) return;
        await onPsychicPowerDeleted(item);
    }

    /** Active psychic effects follow a changed psy rating */
    static async updateActor(actor, changes, options, userId) {
        if (userId !== game.user.id) return;
        if (foundry.utils.getProperty(changes, 'system.psy.rating') === undefined) return;
        await refreshPsychicEffects(actor);
    }

    static hotbarDrop(bar, data, slot) {
        game.dh.log('Hotbar Drop:', data);
        switch (data.type) {
            case 'characteristic':
                createCharacteristicMacro(data, slot);
                return false;
            case 'item':
            case 'Item':
                createItemMacro(data, slot);
                return false;
            case 'skill':
                createSkillMacro(data, slot);
                return false;
            default:
                return;
        }
    }
}
