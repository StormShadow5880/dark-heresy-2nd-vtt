/**
 * The character creation wizard (ApplicationV2). It only edits the creation draft (draft.mjs) and shows what
 * character.mjs computes from it; the rules live there, not here.
 */
import { SYSTEM_ID } from '../system-id.mjs';
import { markTooltips } from '../ui/tooltips.mjs';
import { aptitudeName, buildQuotes, describeQuote, num } from '../rules/advancement.mjs';
import { isDlc, sourceLabel } from '../rules/sources.mjs';
import { differences, homeworldGroups, typeIdOf } from './homeworld-groups.mjs';
import { BACKGROUNDS, CHARACTERISTICS, HOMEWORLDS, POINT_BUY, ROLES, byId } from './data.mjs';
import { STEPS, computeCharacter, newDraft, replayAdvances, stepBlockers, stepStatus } from './character.mjs';
import { applyFormData, logEvent, markStepDone, pruneChoices, rerollCharacteristic, revalidateAdvances, setBackground, setCharacteristicRoll, setHomeWorld, setRole } from './draft.mjs';
import { characteristicFormula, characteristicKind, evaluatePointBuy, pointBuyBase, rollBase } from './rules.mjs';
import { createCompendiumResolver, finalizeCharacter } from './finalize.mjs';
import { talentQuote } from '../rules/advancement.mjs';

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const DRAFT_FLAG = 'creatorDraft';

export const CREATOR_SETTINGS = { startingXp: 'creator-starting-xp', veteran: 'creator-veteran', random: 'creator-random' };

/** Rolls dice with Foundry's roll engine; the result is also shown to the roller in the chat as documentation */
export async function rollDice(formula, flavor) {
    const roll = await new Roll(formula).evaluate();
    try {
        await roll.toMessage({ flavor: `Character creation: ${flavor}`, speaker: { alias: 'Character Creator' } }, { rollMode: 'selfroll' });
    } catch (error) {
        console.warn('Dark Heresy 2e | creator roll could not be posted', error);
    }
    return roll.dice.flatMap((d) => d.results.map((r) => r.result));
}

const KIND_TEXT = { normal: '2d10', positive: '3d10, best two', negative: '3d10, worst two' };
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export class CharacterCreator extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: 'dh-character-creator',
        tag: 'form',
        classes: ['dh-ui', 'dh-creator'],
        window: { title: 'Create Acolyte', icon: 'fa-solid fa-user-plus', resizable: true },
        position: { width: 1240, height: 780 },
        form: { handler: CharacterCreator.#onSubmit, submitOnChange: true, closeOnSubmit: false },
        actions: {
            goStep: CharacterCreator.#onGoStep,
            next: CharacterCreator.#onNext,
            back: CharacterCreator.#onBack,
            saveDraft: CharacterCreator.#onSaveDraft,
            restart: CharacterCreator.#onRestart,
            cancel: CharacterCreator.#onCancel,
            selectHomeWorld: CharacterCreator.#onSelectHomeWorld,
            selectHomeWorldType: CharacterCreator.#onSelectHomeWorldType,
            selectBackground: CharacterCreator.#onSelectBackground,
            selectRole: CharacterCreator.#onSelectRole,
            randomPick: CharacterCreator.#onRandomPick,
            rollCharacteristic: CharacterCreator.#onRollCharacteristic,
            rollAll: CharacterCreator.#onRollAll,
            reroll: CharacterCreator.#onReroll,
            pointBuy: CharacterCreator.#onPointBuy,
            rollVital: CharacterCreator.#onRollVital,
            rollConsequence: CharacterCreator.#onRollConsequence,
            buy: CharacterCreator.#onBuy,
            buyTalent: CharacterCreator.#onBuyTalent,
            removeAdvance: CharacterCreator.#onRemoveAdvance,
            toggleLog: CharacterCreator.#onToggleLog,
            finalize: CharacterCreator.#onFinalize,
        },
    };

    static PARTS = { body: { template: 'systems/dark-heresy-2nd/templates/creator/creator.hbs', scrollable: ['.creator__main'] } };

    step = 'welcome';
    showLog = false;
    talentIndex = null;
    busy = false;

    constructor(options = {}) {
        super(options);
        this.draft = game.user.getFlag(SYSTEM_ID, DRAFT_FLAG) ?? newDraft();
        this.resumed = !!game.user.getFlag(SYSTEM_ID, DRAFT_FLAG);
        if (this.draft.currentStep) this.step = this.draft.currentStep;
    }

    /** Open the wizard (one per user) */
    static open() {
        const existing = foundry.applications.instances.get('dh-character-creator');
        if (existing) return existing.bringToFront();
        return new CharacterCreator().render({ force: true });
    }

    get env() {
        return {
            startingXp: num(game.settings.get(SYSTEM_ID, CREATOR_SETTINGS.startingXp), 1000),
            systemDefaults: foundry.utils.deepClone(game.model.Actor.acolyte),
        };
    }

    get expert() {
        return this.draft.mode === 'expert' && game.user.isGM;
    }

    /* -------------------------------------------- */
    /*  Context                                     */
    /* -------------------------------------------- */

    async _prepareContext() {
        const env = this.env;
        const draft = this.draft;
        const state = computeCharacter(draft, env);
        const status = stepStatus(state, draft);
        const sim = await replayAdvances(state, draft, env);
        const stepIndex = STEPS.findIndex((s) => s.id === this.step);
        // furthest step the player may open: every step before it is complete (optional steps count as complete)
        let reachable = 0;
        for (let i = 0; i < STEPS.length - 1; i++) {
            if (status[STEPS[i].id]) reachable = i + 1;
            else break;
        }
        if (this.expert) reachable = STEPS.length - 1;
        const steps = STEPS.map((s, i) => ({
            ...s,
            index: i + 1,
            current: s.id === this.step,
            done: !!status[s.id] && i < stepIndex + 1 && (s.optional ? draft.completedSteps.includes(s.id) : true),
            complete: !!status[s.id],
            locked: i > reachable,
        }));
        const current = STEPS[stepIndex];
        const choices = state.choices.map((c) => ({
            ...c,
            options: c.options.map((o) => ({ ...o, selected: o.value === c.value })),
            textValue: c.text ? (draft.choices[c.id] ?? '') : undefined,
        }));
        const choicesFor = (...ids) => choices.filter((c) => ids.includes(c.step));

        const context = {
            expert: this.expert,
            isGM: game.user.isGM,
            resumed: this.resumed,
            steps,
            step: this.step,
            at: Object.fromEntries(STEPS.map((s) => [s.id, s.id === this.step])),
            stepLabel: current.label,
            optional: !!current.optional,
            canBack: stepIndex > 0,
            canNext: stepIndex < STEPS.length - 1 && (this.expert || status[current.id] || current.optional),
            isLast: stepIndex === STEPS.length - 1,
            blockers: this.expert ? [] : (stepBlockers(state, draft)[this.step] ?? []),
            progress: Math.round((steps.filter((s) => s.complete && s.id !== 'review').length / (STEPS.length - 1)) * 100),
            draft,
            state,
            summary: this.#summary(state, sim.actor),
            mode: draft.mode,
            veteranAllowed: !!game.settings.get(SYSTEM_ID, CREATOR_SETTINGS.veteran),
            randomAllowed: !!game.settings.get(SYSTEM_ID, CREATOR_SETTINGS.random) || game.user.isGM,
            startingXp: env.startingXp,
            derivedWounds: game.settings.get(SYSTEM_ID, 'wounds-formula') === 'im',
            showLog: this.showLog,
            log: [...draft.log].reverse().slice(0, 40).map((e) => ({ ...e, date: new Date(e.time).toLocaleTimeString() })),
            overrides: draft.overrides,
        };

        // two steps: the type of home world, then (where it has variants) the general variant or a specific world
        const hwCard = (h) => ({
            ...h,
            selected: h.id === draft.homeWorldId,
            positiveText: h.positive.map(label).join(', '),
            negativeText: label(h.negative),
            woundsText: `${h.wounds.base}+${h.wounds.dice}`,
            bookLabel: sourceLabel(h.bookPage),
            dlc: isDlc(h.bookPage),
        });
        const hwGroups = homeworldGroups(HOMEWORLDS);
        const currentTypeId = this.hwType ?? typeIdOf(HOMEWORLDS, draft.homeWorldId);
        const typeCard = (g) => ({
            id: g.type.id,
            name: g.type.name,
            bookLabel: sourceLabel(g.type.bookPage),
            dlc: isDlc(g.type.bookPage),
            variantCount: g.variants.length,
            current: g.type.id === currentTypeId,
            chosen: g.type.id === typeIdOf(HOMEWORLDS, draft.homeWorldId),
        });
        const cards = hwGroups.map(typeCard);
        context.hwTypeSections = [
            { title: 'Core Rulebook', types: cards.filter((c) => !c.dlc) },
            { title: 'Expansion books (DLC)', types: cards.filter((c) => c.dlc) },
        ].filter((x) => x.types.length);
        const hwCurrent = hwGroups.find((g) => g.type.id === currentTypeId);
        context.hwStage2 = hwCurrent
            ? {
                  typeName: hwCurrent.type.name,
                  hasVariants: hwCurrent.variants.length > 0,
                  entries: [hwCurrent.type, ...hwCurrent.variants].map((h, i) => ({
                      ...hwCard(h),
                      isGeneral: i === 0,
                      parent: h.parent,
                      diffs: i === 0 ? [] : differences(hwCurrent.type, h, label),
                      sameValues: i > 0 && differences(hwCurrent.type, h, label).length === 0,
                  })),
              }
            : null;
        context.hwChoices = choicesFor('homeworld');
        context.consequences = state.consequences.map((c) => ({ ...c, canRoll: c.status === 'open' && !!c.formula, resultText: c.result ? `${c.result.formula}: ${c.result.dice.join(' + ')}${c.result.total !== c.result.dice.reduce((a, b) => a + b, 0) ? ` → ${c.result.total}` : ''}` : '' }));
        context.backgrounds = BACKGROUNDS.map((b) => ({
            ...b,
            selected: b.id === draft.backgroundId,
            skillText: b.skills.map((s) => (s.pick ? 'Scholastic Lore (pick)' : s.options.map((o) => `${skillName(o.skill)}${o.spec ? ` (${o.spec})` : ''}`).join(' / '))).join('; '),
            talentText: b.talents.map((t) => (t.options ? t.options.map((p) => p.map((x) => `${x.talent} (${x.spec})`).join(' + ')).join(' or ') : `${t.talent}${t.spec ? ` (${t.spec})` : ''}`)).join('; '),
            aptitudeText: b.aptitudeChoice.join(' or '),
            bookLabel: sourceLabel(b.bookPage),
            dlc: isDlc(b.bookPage),
        }));
        context.bgChoice = choices.find((c) => c.id === 'bg-apt');
        context.roles = ROLES.map((r) => ({
            ...r,
            selected: r.id === draft.roleId,
            aptitudeText: r.aptitudes.join(', '),
            talentText: r.talentOptions.map((t) => t.needsSpec ?? `${t.talent}${t.spec ? ` (${t.spec})` : ''}`).join(' or '),
            bookLabel: sourceLabel(r.bookPage),
            dlc: isDlc(r.bookPage),
        }));
        context.roleChoices = choicesFor('role');
        context.aptitudeChoices = choicesFor('aptitudes');
        context.skillChoices = choicesFor('skills');
        context.vitalChoices = choicesFor('vitals');
        context.equipmentChoices = choicesFor('equipment');
        context.skillList = Object.entries(state.skills).flatMap(([key, s]) => [
            ...(s.advance ? [{ name: key.replace(/([A-Z])/g, ' $1'), rank: s.advance }] : []),
            ...Object.values(s.specs).map((sp) => ({ name: `${key.replace(/([A-Z])/g, ' $1')} (${sp.label})`, rank: sp.advance })),
        ]);

        // characteristics
        const gen = draft.characteristics;
        const kinds = state.kinds;
        const pb = evaluatePointBuy(gen.points, kinds);
        context.method = gen.method;
        context.veteran = !!gen.veteran;
        context.rerollUsed = gen.rerollUsed;
        context.pointBuy = { ...pb, total: POINT_BUY.points };
        context.chars = CHARACTERISTICS.map((c) => {
            const roll = gen.rolls[c.key];
            const kind = kinds[c.key];
            return {
                ...c,
                kind,
                formula: KIND_TEXT[kind],
                dice: roll?.dice?.join(', ') ?? '',
                rolled: !!roll,
                previous: roll?.previous?.join(', '),
                value: state.characteristics[c.key],
                canReroll: !!roll && !gen.rerollUsed,
                points: gen.points?.[c.key] ?? 0,
                base: gen.method === 'pointbuy' ? pointBuyBase(kind) : rollBase(gen.veteran),
                max: POINT_BUY.max,
            };
        });

        // vitals
        context.vitals = {
            wounds: state.wounds,
            fate: state.fate,
            divination: state.divination,
            divinationNotes: state.divinationNotes,
            woundsRoll: draft.wounds.roll,
            fateRoll: draft.fate.roll,
            divinationRoll: draft.divination.roll,
            hasHomeWorld: !!state.homeWorld,
        };

        // elite
        context.elite = {
            psyker: state.elite.includes('Psyker'),
            sanctioned: state.psy?.sanctioned,
            corruptionPending: !!state.corruptionPending,
            corruption: state.corruption,
        };

        // experience
        const quotes = buildQuotes(sim.actor);
        const available = num(sim.actor.system.experience.total) - num(sim.actor.system.experience.used);
        const row = (q) => ({ ...q, detail: describeQuote(q), buyable: q.advanceable && !q.maxed && q.cost != null && q.cost <= available });
        context.xp = {
            total: sim.actor.system.experience.total,
            spent: sim.actor.system.experience.used,
            available,
            characteristics: quotes.characteristics.map(row),
            skills: quotes.skills.map(row),
            purchases: sim.applied.map((a, i) => ({ index: i, label: `${a.quote.label}: ${a.quote.fromName} → ${a.quote.toName}`, cost: a.quote.cost })),
            failed: sim.failed.map((f) => ({ label: f.adv.key, errors: f.errors.join(' ') })),
            talents: this.talentIndex ?? [],
            talentsLoaded: !!this.talentIndex,
        };

        // equipment hints: items that the compendium does not know, weapon training
        context.equipment = state.equipment.map((e) => ({ ...e, text: `${e.name}${e.quantity > 1 ? ` ×${e.quantity}` : ''}` }));

        // review
        context.review = {
            ready: status.review || this.expert,
            checklist: STEPS.filter((s) => s.id !== 'review').map((s) => ({ label: s.label, done: !!status[s.id], optional: !!s.optional })),
            warnings: state.warnings,
        };
        context.bio = draft.biography ?? {};
        return context;
    }

    #summary(state, simActor) {
        const chars = CHARACTERISTICS.map((c) => ({ short: c.short, value: state.characteristics[c.key] ?? '–', kind: state.kinds?.[c.key] }));
        return {
            name: this.draft.biography?.name || 'Unnamed acolyte',
            homeWorld: state.homeWorld?.name ?? '–',
            background: state.background?.name ?? '–',
            role: state.role?.name ?? '–',
            chars,
            wounds: state.wounds?.max ?? '–',
            fate: state.fate?.threshold ?? '–',
            aptitudes: state.aptitudes.map((a) => a.name),
            xp: num(simActor.system.experience.total) - num(simActor.system.experience.used),
        };
    }

    async _onRender() {
        markTooltips(this.element);
        if (this.step === 'xp' && !this.talentIndex) this.#loadTalents();
    }

    async #loadTalents() {
        const pack = game.packs.get(`${SYSTEM_ID}.talents`);
        const index = pack ? await pack.getIndex({ fields: ['img', 'system.aptitudes', 'system.tier', 'system.prerequisites'] }) : [];
        this.talentIndex = [...index]
            .map((e) => ({ id: e._id, name: e.name, img: e.img, aptitudes: e.system?.aptitudes ?? '', tier: e.system?.tier ?? 0, prerequisites: e.system?.prerequisites ?? '' }))
            .sort((a, b) => a.name.localeCompare(b.name));
        this.render();
    }

    /* -------------------------------------------- */
    /*  State changes                               */
    /* -------------------------------------------- */

    async #changed({ revalidate = true } = {}) {
        pruneChoices(this.draft, this.env);
        if (revalidate) await revalidateAdvances(this.draft, this.env);
        this.draft.currentStep = this.step;
        await game.user.setFlag(SYSTEM_ID, DRAFT_FLAG, this.draft); // autosave
        this.render();
    }

    static async #onSubmit(event, form, formData) {
        // FormDataExtended#object has flat names ("c.bg-apt"), applyFormData reads them
        applyFormData(this.draft, formData.object, {
            isGM: game.user.isGM,
            veteranAllowed: !!game.settings.get(SYSTEM_ID, CREATOR_SETTINGS.veteran),
            expert: this.expert,
        });
        await this.#changed();
    }

    static async #onGoStep(event, target) {
        this.step = target.dataset.step;
        await this.#changed({ revalidate: false });
    }

    static async #onNext() {
        markStepDone(this.draft, this.step);
        const i = STEPS.findIndex((s) => s.id === this.step);
        this.step = STEPS[Math.min(STEPS.length - 1, i + 1)].id;
        await this.#changed({ revalidate: false });
    }

    static async #onBack() {
        const i = STEPS.findIndex((s) => s.id === this.step);
        this.step = STEPS[Math.max(0, i - 1)].id;
        await this.#changed({ revalidate: false });
    }

    static async #onSaveDraft() {
        await game.user.setFlag(SYSTEM_ID, DRAFT_FLAG, this.draft);
        ui.notifications.info('Draft saved. You can continue later.');
    }

    static async #onRestart() {
        const ok = await DialogV2.confirm({ window: { title: 'Start over' }, content: '<p>Discard the current draft and start again?</p>', rejectClose: false, modal: false });
        if (!ok) return;
        this.draft = newDraft();
        this.step = 'welcome';
        this.resumed = false;
        await game.user.unsetFlag(SYSTEM_ID, DRAFT_FLAG);
        this.render();
    }

    static async #onCancel() {
        const ok = await DialogV2.confirm({ window: { title: 'Cancel creation' }, content: '<p>Close the wizard? Your draft stays saved and can be continued.</p>', rejectClose: false, modal: false });
        if (!ok) return;
        await game.user.setFlag(SYSTEM_ID, DRAFT_FLAG, this.draft);
        this.close();
    }

    /** Step one: the type. A type without variants is the choice, otherwise the variants are shown. */
    static async #onSelectHomeWorldType(event, target) {
        const group = homeworldGroups(HOMEWORLDS).find((g) => g.type.id === target.dataset.id);
        if (!group) return;
        this.hwType = group.type.id;
        if (!group.variants.length) setHomeWorld(this.draft, group.type.id);
        await this.#changed();
    }

    /** Step two: the general variant or a specific world */
    static async #onSelectHomeWorld(event, target) {
        setHomeWorld(this.draft, target.dataset.id);
        this.hwType = typeIdOf(HOMEWORLDS, target.dataset.id);
        await this.#changed();
    }

    static async #onSelectBackground(event, target) {
        setBackground(this.draft, target.dataset.id);
        await this.#changed();
    }

    static async #onSelectRole(event, target) {
        setRole(this.draft, target.dataset.id);
        await this.#changed();
    }

    static async #onRandomPick(event, target) {
        const what = target.dataset.what;
        if (what === 'homeworld') {
            const id = pick(HOMEWORLDS).id;
            setHomeWorld(this.draft, id);
            this.hwType = typeIdOf(HOMEWORLDS, id);
        }
        if (what === 'background') setBackground(this.draft, pick(BACKGROUNDS).id);
        if (what === 'role') setRole(this.draft, pick(ROLES).id);
        await this.#changed();
    }

    async #rollKey(key) {
        const kind = characteristicKind(byId(HOMEWORLDS, this.draft.homeWorldId), key);
        const dice = await rollDice(characteristicFormula(kind), `${key} (${KIND_TEXT[kind]})`);
        return { kind, dice };
    }

    static async #onRollCharacteristic(event, target) {
        if (!this.draft.homeWorldId) return ui.notifications.warn('Choose a home world first.');
        const { dice } = await this.#rollKey(target.dataset.key);
        setCharacteristicRoll(this.draft, target.dataset.key, dice);
        await this.#changed();
    }

    static async #onRollAll() {
        if (!this.draft.homeWorldId) return ui.notifications.warn('Choose a home world first.');
        for (const c of CHARACTERISTICS) {
            if (this.draft.characteristics.rolls[c.key]) continue;
            const { dice } = await this.#rollKey(c.key);
            setCharacteristicRoll(this.draft, c.key, dice);
        }
        await this.#changed();
    }

    static async #onReroll(event, target) {
        if (this.draft.characteristics.rerollUsed) return ui.notifications.warn('The re-roll has been used already.');
        const { dice } = await this.#rollKey(target.dataset.key);
        rerollCharacteristic(this.draft, target.dataset.key, dice);
        await this.#changed();
    }

    static async #onPointBuy(event, target) {
        const key = target.dataset.key;
        const points = this.draft.characteristics.points;
        points[key] = Math.max(0, num(points[key]) + Number(target.dataset.delta));
        await this.#changed();
    }

    /** A roll that comes with a home world or background (e.g. starting Corruption): rolled once, stored in the draft */
    static async #onRollConsequence(event, target) {
        const entry = computeCharacter(this.draft, this.env).consequences.find((c) => c.id === target.dataset.id);
        if (!entry || entry.status !== 'open' || !entry.formula) return;
        this.draft.consequenceRolls ??= {};
        if (this.draft.consequenceRolls[entry.id]) return; // never rolled twice
        const dice = await rollDice(entry.formula, entry.label);
        const modifier = Number((entry.formula.match(/([+-]\d+)$/) ?? [])[1] ?? 0);
        const total = dice.reduce((a, b) => a + b, 0) + modifier;
        this.draft.consequenceRolls[entry.id] = { formula: entry.formula, dice, total };
        logEvent(this.draft, `${entry.source}: ${entry.label} rolled ${total}`);
        await this.#changed();
    }

    static async #onRollVital(event, target) {
        const what = target.dataset.what;
        if (what === 'corruption') {
            if (this.draft.corruptionRoll) return;
            this.draft.corruptionRoll = (await rollDice('1d10', 'Corruption of a rogue psyker (1d10+3)'))[0];
        } else if (!this.draft.homeWorldId) {
            return ui.notifications.warn('Choose a home world first.');
        } else if (what === 'wounds' && !this.draft.wounds.roll) {
            this.draft.wounds.roll = (await rollDice('1d5', 'Wounds (1d5)'))[0];
            logEvent(this.draft, `Wounds: rolled ${this.draft.wounds.roll}`);
        } else if (what === 'fate' && !this.draft.fate.roll) {
            this.draft.fate.roll = (await rollDice('1d10', "Emperor's Blessing (1d10)"))[0];
            logEvent(this.draft, `Emperor's Blessing: rolled ${this.draft.fate.roll}`);
        } else if (what === 'divination' && !this.draft.divination.roll) {
            const roll = await new Roll('1d100').evaluate();
            await roll.toMessage({ flavor: 'Character creation: Divination (1d100)', speaker: { alias: 'Character Creator' } }, { rollMode: 'selfroll' }).catch(() => {});
            this.draft.divination.roll = roll.total;
            logEvent(this.draft, `Divination: rolled ${roll.total}`);
        }
        await this.#changed();
    }

    static async #onBuy(event, target) {
        this.draft.advances.push({ kind: target.dataset.kind, key: target.dataset.key });
        logEvent(this.draft, `Purchase: ${target.dataset.key}`);
        await this.#changed();
    }

    static async #onBuyTalent() {
        const select = this.element.querySelector('#creator-talent');
        const choice = this.element.querySelector('#creator-talent-choice')?.value?.trim() ?? '';
        const entry = this.talentIndex?.find((t) => t.id === select?.value);
        if (!entry) return;
        const pack = game.packs.get(`${SYSTEM_ID}.talents`);
        const doc = await pack.getDocument(entry.id);
        const talent = { ...entry, system: doc.toObject().system };
        const state = computeCharacter(this.draft, this.env);
        const sim = await replayAdvances(state, this.draft, this.env);
        const quote = talentQuote(sim.actor, entry, choice);
        if (quote.error) return ui.notifications.warn(quote.error);
        this.draft.advances.push({ kind: 'talent', key: entry.name, talent, choice, prerequisitesConfirmed: !!this.element.querySelector('#creator-talent-prereq')?.checked });
        await this.#changed();
    }

    static async #onRemoveAdvance(event, target) {
        this.draft.advances.splice(Number(target.dataset.index), 1);
        await this.#changed();
    }

    static async #onToggleLog() {
        this.showLog = !this.showLog;
        this.render();
    }

    static async #onFinalize() {
        if (this.busy) return;
        const ok = await DialogV2.confirm({
            window: { title: 'Finalize character' },
            content: `<p>Create <strong>${foundry.utils.escapeHTML(this.draft.biography?.name ?? '')}</strong> now? The rolls and choices can not be changed afterwards (use the Advancement tab for later changes).</p>`,
            rejectClose: false,
            modal: false,
        });
        if (!ok) return;
        this.busy = true;
        try {
            const { actor, missing, warnings } = await finalizeCharacter(this.draft, this.env, createCompendiumResolver());
            await game.user.unsetFlag(SYSTEM_ID, DRAFT_FLAG);
            if (missing.length) ui.notifications.warn(`Missing in the compendium: ${missing.join(', ')}. Placeholders were created.`);
            if (warnings.length) console.warn('Dark Heresy 2e | creator warnings', warnings);
            ui.notifications.info(`${actor.name} was created.`);
            await this.close();
            actor.sheet.render(true);
        } catch (error) {
            console.error('Dark Heresy 2e | character creation failed', error);
            ui.notifications.error(`The character could not be created: ${error.message}`);
        } finally {
            this.busy = false;
        }
    }
}

const skillName = (key) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

function label(key) {
    return CHARACTERISTICS.find((c) => c.key === key)?.label ?? key ?? '–';
}

export { aptitudeName };
