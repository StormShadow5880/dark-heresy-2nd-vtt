import { AcolyteSheet } from './acolyte-sheet.mjs';
import { prettifyDescription } from '../../rules/psy-text.mjs';
import { SYSTEM_ID } from '../../system-id.mjs';
import { moduleOn } from '../../modules.mjs';
import { homeworlds } from '../../rules/homeworlds.mjs';
import { backgrounds } from '../../rules/backgrounds.mjs';
import { roles } from '../../rules/roles.mjs';
import { ORIGIN_FIELDS, isUnlocked, originLocked, UNLOCK_FLAG } from '../../rules/origin-lock.mjs';
import { groupedOptions, isDlc, sourceLabel } from '../../rules/sources.mjs';
import { timerView } from '../../rules/fatigue.mjs';
import { sororitasInsanity, sororitasOffer } from '../../rules/origin-grants.mjs';
import { giveReactionBack, takeReaction, chooseAndSpend, refundAction, resetAccount, viewFor as accountViewFor } from '../../combat/action-account.mjs';
import {
    buildArmour,
    buildCharacteristics,
    buildCriticalInjuries,
    buildCombatProfile,
    buildDevelopment,
    buildGear,
    buildProgression,
    buildOverview,
    buildEquippedArmour,
    buildPsychic,
    buildQuickSkills,
    fatigueStateOf,
    enrichPowerDescriptions,
    buildRelations,
    buildResources,
    buildStatusTiles,
    buildSkills,
    buildWeapons,
    buildSpecialistGroups,
    buildTalentsAndTraits,
    getFavoriteSkills,
    CHARACTERISTIC_ADVANCE_LEVELS,
    TRAINING_LEVELS,
} from './dossier-context.mjs';
import { removeLogEntry } from '../../rules/experience.mjs';
import { MAX_CRITICAL, adjustDamage, applyTypedDamage } from '../../rules/wounds.mjs';
import { stepCounter } from '../../rules/counters.mjs';
import { activatePsychicPower, deactivatePsychicEffect, isPsychicPowerActive } from '../../actions/psychic-effect-manager.mjs';
import { prepareAwardExperience, prepareSpendExperience } from '../../prompts/experience-prompt.mjs';
import { confirmDialog } from '../../prompts/dialog-helpers.mjs';
import { timerRows } from '../../rules/healing.mjs';
import { isFreeAreaClick } from '../../rules/item-description.mjs';
import { levelToModifier } from '../../rules/relations.mjs';
import { addContact, addFaction, buildNetworkView, removeFaction, setContactField, setFactionField } from '../../relations/sheet-actions.mjs';
import { actorPatronDoc, assignPatron, patronDocs, publicPatron } from '../../relations/store.mjs';

const T = 'systems/dark-heresy-2nd/templates/actor/dossier';

/** Rules lists of the header selects that carry a source (book and page): they are grouped by book */
const SOURCED = { homeWorld: homeworlds, background: backgrounds, role: roles };

/** A select of the header: label, value, options; home world, background and role grouped by book, with the source of the choice */
function bioField(actor, key) {
    const value = actor.bio?.[key] ?? '';
    const origin = ORIGIN_FIELDS.includes(key);
    const locked = origin && originLocked(actor);
    const field = { key, locked, origin, unlocked: origin && isUnlocked(actor), gm: game.user.isGM, label: key === 'homeWorld' ? 'Home World' : key.charAt(0).toUpperCase() + key.slice(1), value, options: CONFIG.dh.bio[key] };
    const list = SOURCED[key]?.();
    if (list) {
        field.groups = groupedOptions(list, value);
        const current = list.find((e) => e.name === value);
        field.sourceText = current ? `${current.name}: ${sourceLabel(current.source)}${isDlc(current.source) ? ' (expansion content)' : ''}` : '';
    }
    return field;
}

/** Sheet-wide UI state that must survive re-renders (filters are not stored on the actor) */
const DEFAULT_SKILL_UI = { query: '', mode: 'all', sort: 'name' };

/**
 * The "dossier" character sheet for acolytes (ApplicationV2).
 * Rules live in the actor document / rules modules; this class only prepares view data and handles interaction.
 */
export class AcolyteDossierSheet extends AcolyteSheet {
    static DEFAULT_OPTIONS = {
        classes: ['dossier'],
        position: { width: 1100, height: 780 },
        actions: {
            toggleFavorite: AcolyteDossierSheet.#onToggleFavorite,
            toggleEquipped: AcolyteDossierSheet.#onToggleEquipped,
            reloadWeapon: AcolyteDossierSheet.#onReloadWeapon,
            takeAction: AcolyteDossierSheet.#onTakeAction,
            wakeUp: AcolyteDossierSheet.#onWakeUp,
            showState: AcolyteDossierSheet.#onShowState,
            takeReaction: AcolyteDossierSheet.#onTakeReaction,
            restoreReaction: AcolyteDossierSheet.#onRestoreReaction,
            toggleOriginLock: AcolyteDossierSheet.#onToggleOriginLock,
            fateFatigue: AcolyteDossierSheet.#onFateFatigue,
            refundAction: AcolyteDossierSheet.#onRefundAction,
            resetAccount: AcolyteDossierSheet.#onResetAccount,
            adjustValue: AcolyteDossierSheet.#onAdjustValue,
            spendExperience: AcolyteDossierSheet.#onSpendExperience,
            awardExperience: AcolyteDossierSheet.#onAwardExperience,
            buyAdvance: AcolyteDossierSheet.#onBuyAdvance,
            removeLogEntry: AcolyteDossierSheet.#onRemoveLogEntry,
            rollTable: AcolyteDossierSheet.#onRollTable,
            setTraining: AcolyteDossierSheet.#onSetTraining,
            toggleCharEdit: AcolyteDossierSheet.#onToggleCharEdit,
            adjustDamage: AcolyteDossierSheet.#onAdjustDamage,
            togglePsychicEffect: AcolyteDossierSheet.#onTogglePsychicEffect,
            togglePowerDetail: AcolyteDossierSheet.#onTogglePowerDetail,
            toggleSkillDetail: AcolyteDossierSheet.#onToggleSkillDetail,
            toggleGearDetail: AcolyteDossierSheet.#onToggleGearDetail,
            goTab: AcolyteDossierSheet.#onGoTab,
            setCritical: AcolyteDossierSheet.#onSetCritical,
            firstAid: AcolyteDossierSheet.#onFirstAid,
            firstAidSelf: AcolyteDossierSheet.#onFirstAidSelf,
            fateHeal: AcolyteDossierSheet.#onFateHeal,
            addFaction: AcolyteDossierSheet.#onAddFaction,
            manageFactions: AcolyteDossierSheet.#onManageFactions,
            removeFaction: AcolyteDossierSheet.#onRemoveFaction,
            addContact: AcolyteDossierSheet.#onAddContact,
            relationRoll: AcolyteDossierSheet.#onRelationRoll,
            openPatron: AcolyteDossierSheet.#onOpenPatron,
        },
    };

    static DEFAULT_TAB = 'overview';

    static PARTS = {
        header: { template: `${T}/header.hbs` },
        nav: { template: `${T}/nav.hbs` },
        overview: { template: `${T}/overview.hbs`, scrollable: [''] },
        skills: { template: `${T}/skills.hbs`, scrollable: [''] },
        combat: { template: `${T}/combat.hbs`, scrollable: [''] },
        gear: { template: `${T}/gear.hbs`, scrollable: [''] },
        talents: { template: `${T}/talents.hbs`, scrollable: [''] },
        psychic: { template: `${T}/psychic.hbs`, scrollable: [''] },
        development: { template: `${T}/development.hbs`, scrollable: [''] },
        bio: { template: `${T}/bio.hbs`, scrollable: [''] },
    };

    _skillUi = { ...DEFAULT_SKILL_UI };
    _gearFilter = 'all';
    /** Characteristic tiles that are currently open for editing (kept across re-renders) */
    _openCharEdits = new Set();
    /** Psychic powers whose details are expanded (kept across re-renders) */
    _openPowers = new Set();
    /** Skills whose fold-out is open (kept across re-renders) */
    _openSkills = new Set();
    /** Gear rows whose description is open, and the prepared descriptions (kept across re-renders) */
    _openGear = new Set();
    _gearHtml = new Map();

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const actor = this.actor;
        const skills = buildSkills(actor);
        const resources = buildResources(actor);
        const weapons = buildWeapons(actor);
        context.dossier = {
            characteristics: buildCharacteristics(actor),
            resources: resources,
            account: accountViewFor(actor),
            fatigue: { ...fatigueStateOf(actor), wake: timerView(actor.getFlag(SYSTEM_ID, 'fatigueTimer'), game.time.worldTime) },
            statusTiles: buildStatusTiles(actor),
            res: Object.fromEntries(resources.map((r) => [r.id, r])),
            skills,
            quickSkills: buildQuickSkills(actor, skills),
            specialistGroups: buildSpecialistGroups(actor),
            combat: buildCombatProfile(actor, skills),
            armour: buildArmour(actor),
            weapons,
            hasEquippedWeapon: weapons.some((w) => w.equipped),
            hasStowedWeapon: weapons.some((w) => !w.equipped),
            criticalInjuries: buildCriticalInjuries(actor),
            sizeOptions: CONFIG.dh.bio.size,
            gear: buildGear(actor),
            psychic: buildPsychic(actor),
            development: buildDevelopment(actor),
            progression: buildProgression(actor),
            equippedArmour: buildEquippedArmour(actor),
            relations: buildRelations(actor),
            favorites: getFavoriteSkills(actor),
            bioFields: ['homeWorld', 'background', 'role', 'elite', 'divination'].map((key) => bioField(actor, key)),
            characteristicAdvanceLevels: CHARACTERISTIC_ADVANCE_LEVELS,
            trainingLevels: TRAINING_LEVELS,
            skillUi: this._skillUi,
            isGM: game.user.isGM,
            timers: timerRows(actor.getFlag(SYSTEM_ID, 'healingTimers'), game.time.worldTime),
        };
        Object.assign(context.dossier, await buildTalentsAndTraits(actor));
        await enrichPowerDescriptions(actor, context.dossier.psychic.powers);
        // patron and relationships (Biography)
        context.dossier.relationsEnabled = moduleOn('relations');
        context.dossier.network = context.dossier.relationsEnabled ? await buildNetworkView(actor) : { groups: [], loose: [] };
        const patronDoc = actorPatronDoc(actor);
        const patron = patronDoc ? publicPatron(patronDoc) : null;
        context.dossier.patron = patron
            ? {
                  id: patronDoc.id,
                  name: patronDoc.name,
                  img: patron.img,
                  faction: patron.faction,
                  dynasty: patron.dynasty,
                  affiliation: patron.affiliation,
                  boons: patron.boons,
                  liabilities: patron.liabilities,
                  // the stats come from the patron, nothing is copied to the character
                  relations: patron.relations.map((r) => ({ faction: r.faction, secret: !!r.secret, level: r.level, modifier: r.secret ? null : levelToModifier(r.level) })),
              }
            : null;
        context.dossier.patronOptions = game.user.isGM ? patronDocs().map((d) => ({ id: d.id, name: d.name, selected: d.id === patronDoc?.id })) : [];
        context.dossier.ov = buildOverview(actor, context.dossier, context.effects ?? []);
        context.dossier.tabs = [
            { id: 'overview', label: 'Overview', icon: 'fa-solid fa-id-card' },
            { id: 'skills', label: 'Skills', icon: 'fa-solid fa-list-check' },
            { id: 'combat', label: 'Combat', icon: 'fa-solid fa-crosshairs' },
            { id: 'gear', label: 'Gear', icon: 'fa-solid fa-toolbox' },
            { id: 'talents', label: 'Talents', icon: 'fa-solid fa-star' },
            { id: 'psychic', label: 'Psychic', icon: 'fa-solid fa-eye', dim: !context.dossier.psychic.isPsyker },
            { id: 'development', label: 'Advancement', icon: 'fa-solid fa-arrow-up-right-dots' },
            { id: 'bio', label: 'Biography', icon: 'fa-solid fa-book' },
        ];
        return context;
    }

    _activateListeners(html) {
        super._activateListeners(html);
        this._activateSkillFilters(this.element);
        this._activateGearFilters(this.element);
        // the damage field is derived (max - remaining wounds) and therefore not part of the form
        this.element.querySelectorAll('input.damage-input').forEach((input) =>
            input.addEventListener('change', async (ev) => {
                ev.stopPropagation();
                const wounds = this.actor.system.wounds;
                const update = applyTypedDamage(input.value, wounds.max, wounds.critical);
                await this.actor.update({ 'system.wounds.value': update.value, 'system.wounds.critical': update.critical });
                this.render();
            }),
        );
        this.element.querySelectorAll('.skill-row').forEach((row) => this._setSkillOpen(row, this._openSkills.has(row.querySelector('.skill-toggle')?.dataset.skillId)));
        this.element.querySelectorAll('.gear-row.has-detail').forEach((row) => {
            // a click on the free area of the row folds the description; the name, the image and every button have their own function
            row.addEventListener('click', (ev) => {
                if (isFreeAreaClick(ev.target)) this._toggleGear(row);
            });
            if (this._openGear.has(row.dataset.itemId)) this._setGearOpen(row, true);
        });
        this.element.querySelectorAll('.pw[data-power]').forEach((row) => this._setPowerOpen(row, this._openPowers.has(row.dataset.power)));
        this.element.querySelectorAll('.char').forEach((tile) => tile.classList.toggle('is-editing', this._openCharEdits.has(tile.dataset.char)));
        // Buttons inside <summary> must not toggle the surrounding <details>
        // relationships: text and number fields save on change (no redraw while typing, see sheet-actions.mjs)
        if (this.isEditable) {
            this.element.querySelectorAll('[data-contact]').forEach((el) => el.addEventListener('change', () => setContactField(this.actor, el.dataset.contact, el.dataset.field, el.value)));
            this.element.querySelectorAll('[data-faction-field]').forEach((el) => el.addEventListener('change', () => setFactionField(this.actor, el.dataset.factionId, el.dataset.factionField, el.value)));
        }
        this.element.querySelectorAll('[data-patron-drop]').forEach((zone) => {
            zone.addEventListener('dragenter', () => zone.classList.add('is-over'));
            zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
            zone.addEventListener('drop', () => zone.classList.remove('is-over'));
        });
        this.element.querySelectorAll('[data-patron-assign]').forEach((el) => el.addEventListener('change', () => assignPatron(this.actor, el.value || null)));
        this.element.querySelectorAll('summary button').forEach((b) => b.addEventListener('click', (ev) => ev.preventDefault()));
    }

    /* -------------------------------------------- */
    /*  Skill filtering (client side, no re-render) */
    /* -------------------------------------------- */

    _activateSkillFilters(root) {
        const list = root.querySelector('.skill-table');
        if (!list) return;
        const search = root.querySelector('.skill-search');
        const mode = root.querySelector('.skill-mode');
        const sort = root.querySelector('.skill-sort');
        const ui = this._skillUi;

        const apply = () => {
            const q = ui.query.trim().toLowerCase();
            list.dataset.sort = ui.sort;
            list.querySelectorAll('.skill-row').forEach((row) => {
                const matchesText = !q || row.dataset.name.includes(q);
                const trained = row.dataset.trained === 'true';
                const favorite = row.dataset.favorite === 'true';
                const matchesMode = ui.mode === 'all' || (ui.mode === 'trained' && trained) || (ui.mode === 'untrained' && !trained) || (ui.mode === 'favorites' && favorite);
                row.hidden = !(matchesText && matchesMode);
            });
        };

        search.value = ui.query;
        mode.value = ui.mode;
        sort.value = ui.sort;
        search.addEventListener('input', () => ((ui.query = search.value), apply()));
        mode.addEventListener('change', () => ((ui.mode = mode.value), apply()));
        sort.addEventListener('change', () => ((ui.sort = sort.value), apply()));
        apply();
    }

    _activateGearFilters(root) {
        const chips = root.querySelectorAll('.gear-filter');
        if (!chips.length) return;
        const apply = () => {
            chips.forEach((c) => c.classList.toggle('active', c.dataset.filter === this._gearFilter));
            root.querySelectorAll('.gear-group').forEach((g) => {
                g.hidden = this._gearFilter !== 'all' && g.dataset.group !== this._gearFilter;
            });
        };
        chips.forEach((chip) =>
            chip.addEventListener('click', () => {
                this._gearFilter = chip.dataset.filter;
                apply();
            }),
        );
        apply();
    }

    /* -------------------------------------------- */
    /*  Actions                                      */
    /* -------------------------------------------- */

    /** Clicking a training pip sets that level, clicking the highest filled pip lowers it by one */
    static async #onSetTraining(event, target) {
        if (!this.isEditable) return;
        const { path } = target.dataset;
        const level = Number(target.dataset.level);
        const current = Number(foundry.utils.getProperty(this.actor, path) ?? 0);
        await this.actor.update({ [path]: current === level ? level - 1 : level });
    }

    /** Pencil buttons of the overview: open another tab */
    static #onGoTab(event, target) {
        this.element.querySelector(`.dh-navigation a[data-tab="${target.dataset.tab}"]`)?.click();
    }

    _setSkillOpen(row, open) {
        row.classList.toggle('is-open', open);
        row.querySelector('.skill-detail')?.setAttribute('aria-hidden', String(!open));
        row.querySelector('.skill-toggle')?.setAttribute('aria-expanded', String(open));
    }

    /** Click on a skill name: show / hide its details (no re-render) */
    static #onToggleSkillDetail(event, target) {
        const id = target.dataset.skillId;
        const open = !this._openSkills.has(id);
        if (open) this._openSkills.add(id);
        else this._openSkills.delete(id);
        this._setSkillOpen(target.closest('.skill-row'), open);
    }

    _toggleGear(row) {
        const id = row.dataset.itemId;
        const open = !this._openGear.has(id);
        if (open) this._openGear.add(id);
        else this._openGear.delete(id);
        this._setGearOpen(row, open);
    }

    /** Folds the description of a gear row (no re-render). The text is prepared by Foundry's enricher on the first opening: links and formatting stay, the HTML is made safe. */
    async _setGearOpen(row, open) {
        row.classList.toggle('is-open', open);
        row.querySelector('.gear-detail')?.setAttribute('aria-hidden', String(!open));
        const toggle = row.querySelector('.gear-toggle');
        toggle?.setAttribute('aria-expanded', String(open));
        if (open) await this._fillGearDetail(row);
    }

    async _fillGearDetail(row) {
        const body = row.querySelector('.gear-detail__body');
        const item = this.actor.items.get(row.dataset.itemId);
        if (!body || !item || body.dataset.filled) return;
        const raw = item.system?.description ?? '';
        let cached = this._gearHtml.get(item.id);
        if (!cached || cached.raw !== raw) {
            const html = await foundry.applications.ux.TextEditor.implementation.enrichHTML(prettifyDescription(raw, this.actor.psy?.rating ?? 0), { rollData: { actor: this.actor, item, pr: this.actor.psy?.rating ?? 0 } });
            cached = { raw, html };
            this._gearHtml.set(item.id, cached);
        }
        body.innerHTML = cached.html;
        body.dataset.filled = '1';
    }

    static #onToggleGearDetail(event, target) {
        this._toggleGear(target.closest('.gear-row'));
    }

    _setPowerOpen(row, open) {
        row.classList.toggle('is-open', open);
        row.querySelector('.pw__detail')?.setAttribute('aria-hidden', String(!open));
        row.querySelector('.pw__toggle')?.setAttribute('aria-expanded', String(open));
    }

    /** Click on a power: show / hide its details (no re-render, the state survives re-renders) */
    static #onTogglePowerDetail(event, target) {
        const id = target.dataset.power;
        const row = target.closest('.pw');
        const open = !this._openPowers.has(id);
        if (open) this._openPowers.add(id);
        else this._openPowers.delete(id);
        this._setPowerOpen(row, open);
    }

    /** Ends an active power by hand, or switches a power with an effect on at the actor's psy rating */
    static async #onTogglePsychicEffect(event, target) {
        if (!this.isEditable) return;
        const power = this.actor.items.get(target.dataset.itemId);
        if (!power) return;
        if (isPsychicPowerActive(this.actor, power)) {
            await deactivatePsychicEffect(this.actor, power.id);
        } else {
            await activatePsychicPower(this.actor, power, this.actor.system.psy.rating);
        }
    }

    /** +1 damage (or -1 when healing). Damage beyond the maximum counts as critical damage. */
    static async #onAdjustDamage(event, target) {
        if (!this.isEditable) return;
        const wounds = this.actor.system.wounds;
        const update = adjustDamage(wounds, Number(target.dataset.delta));
        if (!update) return;
        const data = {};
        if (update.value !== undefined) data['system.wounds.value'] = update.value;
        if (update.critical !== undefined) data['system.wounds.critical'] = update.critical;
        await this.actor.update(data);
    }

    /** Clicking a critical pip sets that level, clicking the highest filled one lowers it by one */
    /** Wake up: normally when the unconscious time is over (automatic); earlier only after a confirmation */
    static async #onWakeUp() {
        const { timerViewOf, wakeUp } = await import('../../actions/fatigue-manager.mjs');
        const view = timerViewOf(this.actor);
        if (view.active && !view.ready) {
            const ok = await confirmDialog({ title: 'Wake up now?', content: `<p>${foundry.utils.escapeHTML(this.actor.name)} is unconscious for another ${view.text}. Wake up anyway?</p>` });
            if (!ok) return;
        }
        await wakeUp(this.actor);
    }

    /** GM: lifts or restores the lock of home world, background and role of this character */
    static async #onToggleOriginLock() {
        if (!game.user.isGM) return;
        if (isUnlocked(this.actor)) await this.actor.unsetFlag(SYSTEM_ID, UNLOCK_FLAG);
        else await this.actor.setFlag(SYSTEM_ID, UNLOCK_FLAG, true);
    }

    static async #onFateFatigue() {
        const { fateRemovesFatigue } = await import('../../actions/fatigue-manager.mjs');
        await fateRemovesFatigue(this.actor);
    }

    static async #onShowState() {
        const { openStateDialog } = await import('../../ui/state-dialog.mjs');
        await openStateDialog(this.actor);
    }

    static async #onTakeReaction() {
        await takeReaction(this.actor);
    }

    static async #onRestoreReaction() {
        await giveReactionBack(this.actor);
    }

    static async #onTakeAction() {
        await chooseAndSpend(this.actor);
    }

    static async #onRefundAction() {
        await refundAction(this.actor);
    }

    static async #onResetAccount() {
        await resetAccount(this.actor);
    }

    static async #onFirstAid() {
        const { startFirstAid } = await import('../../actions/healing-manager.mjs');
        await startFirstAid(this.actor);
    }

    static async #onFirstAidSelf() {
        const { startFirstAid } = await import('../../actions/healing-manager.mjs');
        await startFirstAid(this.actor, { self: true });
    }

    static async #onFateHeal() {
        if (!this.isEditable) return;
        const { startFateHeal } = await import('../../actions/healing-manager.mjs');
        await startFateHeal(this.actor);
    }

    static async #onAddFaction() {
        if (this.isEditable) await addFaction(this.actor);
    }

    static async #onManageFactions() {
        const { openFactionManager } = await import('../../relations/factions.mjs');
        await openFactionManager();
    }

    static async #onRemoveFaction(event, target) {
        if (this.isEditable) await removeFaction(this.actor, target.dataset.faction);
    }

    static async #onAddContact(event, target) {
        if (this.isEditable) await addContact(this.actor, target.dataset.faction || null);
    }

    static async #onRelationRoll(event, target) {
        const { relationRollPrompt } = await import('../../relations/roll.mjs');
        await relationRollPrompt(this.actor, { itemId: target.dataset.itemId ?? null, factionId: target.dataset.faction ?? null });
    }

    static async #onOpenPatron(event, target) {
        const { openPatron } = await import('../patron-dossier.mjs');
        openPatron(target.dataset.id);
    }

    static async #onSetCritical(event, target) {
        if (!this.isEditable) return;
        const level = Number(target.dataset.level);
        const current = Number(this.actor.system.wounds.critical ?? 0);
        const next = Math.min(MAX_CRITICAL, Math.max(0, current === level ? level - 1 : level));
        await this.actor.update({ 'system.wounds.critical': next });
    }

    static #onToggleCharEdit(event, target) {
        const key = target.dataset.char;
        const tile = target.closest('.char');
        if (this._openCharEdits.has(key)) this._openCharEdits.delete(key);
        else this._openCharEdits.add(key);
        tile?.classList.toggle('is-editing', this._openCharEdits.has(key));
    }

    static async #onToggleFavorite(event, target) {
        const id = target.dataset.skillId;
        const favorites = [...getFavoriteSkills(this.actor)];
        const index = favorites.indexOf(id);
        if (index >= 0) favorites.splice(index, 1);
        else favorites.push(id);
        await this.actor.setFlag(SYSTEM_ID, 'favoriteSkills', favorites);
    }

    static async #onToggleEquipped(event, target) {
        const item = this.actor.items.get(target.dataset.itemId);
        if (!item) return;
        await item.update({ 'system.equipped': !item.system.equipped });
    }

    /**
     * Simple reload: refills the magazine. The system does not track spare ammunition,
     * so no ammo is consumed from the inventory.
     */
    static async #onReloadWeapon(event, target) {
        const item = this.actor.items.get(target.dataset.itemId);
        if (!item?.usesAmmo) return;
        const max = item.system.clip?.max ?? 0;
        if (!max) return ui.notifications.warn(`${item.name} has no magazine size set.`);
        await item.update({ 'system.clip.value': max });
        ui.notifications.info(`${item.name} reloaded (${max}/${max}).`);
    }

    /** +/- on the simple counters (fatigue, fate, corruption, insanity) */
    static async #onAdjustValue(event, target) {
        if (!this.isEditable) return;
        const { path, delta } = target.dataset;
        const current = Number(foundry.utils.getProperty(this.actor, path) ?? 0);
        const next = stepCounter(current, Number(delta), target.dataset.max);
        if (next === current) return;
        if (path === 'system.corruption' && sororitasOffer(this.actor.system.bio?.background, next - current)) {
            return this.#sororitasCorruption(current, next);
        }
        await this.actor.update({ [path]: next });
    }

    /**
     * Adepta Sororitas: a Corruption gain can be replaced by Insanity (gain minus 1, at least 0).
     * Only the +/- button asks (a rule-based gain); direct edits of the field and GM macros stay untouched,
     * and nothing already gained is converted afterwards. The GM can book a plain correction.
     */
    async #sororitasCorruption(current, next) {
        const gain = next - current;
        const insanity = sororitasInsanity(gain);
        const DialogV2 = foundry.applications.api.DialogV2;
        const buttons = [
            { action: 'corruption', label: `Gain ${gain} Corruption`, default: true },
            { action: 'insanity', label: `Gain ${insanity} Insanity instead` },
        ];
        if (game.user.isGM) buttons.push({ action: 'correction', label: 'GM correction (no rule)' });
        const choice = await DialogV2.wait({
            window: { title: 'Adepta Sororitas: Corruption' },
            content: `<p>This character would gain <strong>${gain} Corruption</strong>. As an Adepta Sororitas she may gain ${gain} − 1 = <strong>${insanity} Insanity</strong> instead (minimum 0).</p>`,
            buttons,
            rejectClose: false,
            modal: false,
        });
        if (!choice) return;
        if (choice === 'insanity') {
            if (insanity > 0) await this.actor.update({ 'system.insanity': Number(this.actor.system.insanity ?? 0) + insanity });
            ui.notifications.info(`Adepta Sororitas: ${gain} Corruption replaced by ${insanity} Insanity.`);
            return;
        }
        await this.actor.update({ 'system.corruption': next });
    }

    static async #onSpendExperience() {
        await prepareSpendExperience(this.actor);
    }

    /** Buy button of a row in the advancement overview: opens the dialog with that advance selected */
    static async #onBuyAdvance(event, target) {
        if (!this.isEditable) return;
        await prepareSpendExperience(this.actor, { kind: target.dataset.kind, key: target.dataset.key });
    }

    static async #onAwardExperience() {
        await prepareAwardExperience(this.actor);
    }

    static async #onRemoveLogEntry(event, target) {
        if (!game.user.isGM) return;
        const confirmed = await confirmDialog({
            title: 'Remove Log Entry',
            content: '<p>Remove this entry from the log? EP and advances are <strong>not</strong> reverted.</p>',
        });
        if (confirmed) await removeLogEntry(this.actor, target.dataset.logId);
    }

    /** Draws from a rollable table of the system compendium (e.g. Psychic Phenomena) */
    static async #onRollTable(event, target) {
        const name = target.dataset.table;
        const pack = game.packs.get(`${SYSTEM_ID}.tables`);
        const entry = pack?.index.find((e) => e.name === name) ?? (await pack?.getIndex())?.find((e) => e.name === name);
        if (!entry) return ui.notifications.warn(`Table "${name}" not found.`);
        const table = await pack.getDocument(entry._id);
        await table.draw();
    }
}
