/**
 * Relationships in social tests: the section of the roll dialog, the contact's "Test" button and the GM-side resolution (secret values,
 * unclear patron membership, "confirm every one"). The rules are in rules/relations.mjs; nothing here changes how success, failure and
 * degrees are calculated: the modifier is only added to the target number before the roll.
 *
 * Flow of a test with a relationship:
 *   - public values, no GM decision needed:  the modifier goes into the normal roll (modifier "relation", one more row on the card)
 *   - secret value / unclear membership / "confirm every one": the player's dialog sends a request to the ACTIVE GM client (socket). The GM
 *     client decides, rolls ONCE and posts the cards; for a secret value the public card has no roll, target or modifier, the details go to a
 *     whisper to the GMs.
 */
import { SYSTEM_ID } from '../system-id.mjs';
import { SOCIAL_SKILLS, describeRelation, evaluateSelection, isSocialSkill, needsGmResolution, resolveRelation, signed } from '../rules/relations.mjs';
import { contactOf, shouldProcess } from '../rules/relations-data.mjs';
import { actorPatronDoc, actorRelations, fullPatron } from './store.mjs';
import { relationCap } from './sheet-actions.mjs';

const SOCKET = `system.${SYSTEM_ID}`;
const seen = new Set();
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ''));

export const confirmAllRelations = () => {
    try {
        return !!game.settings.get(SYSTEM_ID, 'relations-gm-confirm');
    } catch {
        return false;
    }
};

/* ------------------------------ data of the character ------------------------------ */

/** What this client knows: personal factions and contacts, the patron as far as this user may see it */
export async function relationContext(actor) {
    const rel = actorRelations(actor);
    const contacts = actor.items.filter((i) => i.type === 'peer').map(contactOf);
    const doc = actorPatronDoc(actor);
    let patron = null;
    if (doc) {
        const full = await fullPatron(doc);
        if (full) patron = { id: doc.id, name: full.name, affiliation: full.affiliation ?? 'unknown', relations: (full.relations ?? []).map((r) => ({ id: r.id, faction: r.faction, level: r.secret && !game.user.isGM ? undefined : r.level, secret: !!r.secret })) };
    }
    return { factions: rel.factions, contacts, patron };
}

const hasAnything = (ctx) => ctx.factions.length > 0 || ctx.contacts.length > 0 || !!ctx.patron;

/* ------------------------------ the section of the roll dialog ------------------------------ */

export function sectionHtml(ctx, preset = {}) {
    if (!hasAnything(ctx)) return '';
    const mode = preset.mode ?? 'none';
    const opt = (v, label, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(label)}</option>`;
    const factions = ctx.factions.map((f) => opt(f.id, `${f.name} (${signed(f.level)})`, f.id === preset.factionId)).join('');
    const contacts = ctx.contacts.map((c) => opt(c.id, `${c.name} (${signed(c.level)})`, c.id === preset.contactId)).join('');
    const patronRel = (ctx.patron?.relations ?? []).map((r) => opt(r.id, `${r.faction}${r.secret && !game.user.isGM ? '' : ` (${signed(r.level)})`}`, false)).join('');
    const radio = (v, label, disabled = false) => `<label class="dh-rel__mode"><input type="radio" name="relMode" value="${v}" ${mode === v ? 'checked' : ''} ${disabled ? 'disabled' : ''} /> ${esc(label)}</label>`;
    return `<div class="dh-panel spacer dh-rel">
        <h1 class="dh-panel__header">Relationship <small>(house rule: 1 level = ±10)</small></h1>
        <div class="dh-rel__modes">${radio('none', 'None')}${radio('personal', 'Personal')}${radio('patron', ctx.patron ? `In the name of ${ctx.patron.name}` : 'In the name of a patron', !ctx.patron)}</div>
        <div class="dh-rel__personal" hidden>
            <label>Faction <select id="relFaction"><option value="">– none –</option>${factions}</select></label>
            <label>Contact <select id="relContact"><option value="">– none –</option>${contacts}</select></label>
        </div>
        <div class="dh-rel__patron" hidden><label>Faction of the patron <select id="relPatron"><option value="">– choose –</option>${patronRel}</select></label></div>
        ${game.user.isGM ? `<div class="dh-rel__gm" hidden><label>Patron membership in this scene <select id="relGm"><option value="auto">as set (${esc(ctx.patron?.affiliation ?? '')})</option><option value="known">known here</option><option value="notknown">not known here</option></select></label></div>` : ''}
        <div class="dh-rel__preview" aria-live="polite"></div>
    </div>`;
}

/** Wires the section; returns {read, evaluate} for the callback */
export function bindSection(element, ctx, { skillKey, skillLabel, base }) {
    const root = element.querySelector('.dh-rel');
    if (!root) return null;
    const $ = (s) => root.querySelector(s);
    const read = () => ({
        mode: root.querySelector('input[name="relMode"]:checked')?.value ?? 'none',
        factionId: $('#relFaction')?.value || undefined,
        contactId: $('#relContact')?.value || undefined,
        patronRelationId: $('#relPatron')?.value || undefined,
    });
    const gmDecision = () => {
        const v = $('#relGm')?.value;
        return v === 'known' ? { affiliation: 'known' } : v === 'notknown' ? { apply: false } : undefined;
    };
    const evaluate = () => evaluateSelection(ctx, read(), { skill: skillKey, cap: relationCap(), gm: gmDecision() });
    const update = () => {
        const sel = read();
        $('.dh-rel__personal').hidden = sel.mode !== 'personal';
        $('.dh-rel__patron').hidden = sel.mode !== 'patron';
        const gm = root.querySelector('.dh-rel__gm');
        if (gm) gm.hidden = sel.mode !== 'patron';
        const out = $('.dh-rel__preview');
        if (sel.mode === 'none') return (out.innerHTML = '');
        const r = evaluate();
        if (!isSocialSkill(skillKey)) return (out.innerHTML = '<p class="notes">Relationships only apply to social tests.</p>');
        if (r.secret) return (out.innerHTML = '<p class="notes"><b>Influence unknown.</b> The GM resolves this test; the result is shown without the hidden value.</p>');
        const lines = describeRelation(r, { skillLabel, base, factionName: r.factionName, contactName: r.contactName });
        out.innerHTML = `${lines.map((l) => `<div class="dh-field__wrapper"><span class="dh-field__span">${esc(l.label)}</span><span class="dh-field__span">${esc(l.value)}</span></div>`).join('')}${r.reason ? `<p class="notes">${esc(r.reason)}</p>` : ''}`;
    };
    root.addEventListener('change', update);
    update();
    return { read, evaluate, gmDecision };
}

/* ------------------------------ the test of a contact ("Test" button) ------------------------------ */

/** The player chooses a fitting social skill; choosing alone makes no roll (the roll dialog opens next) */
export async function relationRollPrompt(actor, { itemId = null, factionId = null } = {}) {
    const skills = SOCIAL_SKILLS.filter((k) => actor.system.skills?.[k]).map((k) => ({ key: k, label: actor.system.skills[k].label, value: actor.system.skills[k].current }));
    const item = itemId ? actor.items.get(itemId) : null;
    const contact = item ? contactOf(item) : null;
    const faction = actorRelations(actor).factions.find((f) => f.id === (factionId ?? contact?.factionId)) ?? null;
    const options = skills.map((s) => `<option value="${s.key}">${esc(s.label)} (${s.value})</option>`).join('');
    const chosen = await foundry.applications.api.DialogV2.prompt({
        classes: ['dh-ui', 'dh-dialog'],
        window: { title: 'Social test' },
        content: `<p>${contact ? `Contact: <b>${esc(contact.name)}</b>` : ''}${faction ? ` · Faction: <b>${esc(faction.name)}</b>` : ''}</p>
            <div class="form-group"><label>Skill</label><select name="skill"><option value="">– choose a skill –</option>${options}</select></div>
            <p class="notes">The roll dialog opens next, nothing is rolled yet.</p>`,
        ok: { label: 'Continue', callback: (ev, button) => button.form.elements.skill.value },
        rejectClose: false,
        modal: false,
    });
    if (!chosen) return;
    await actor.rollSkill(chosen, null, { relationPreset: { mode: 'personal', factionId: faction?.id, contactId: contact?.id } });
}

/* ------------------------------ from the dialog to the roll ------------------------------ */

/**
 * Called by the roll dialog after "Roll". Returns 'apply' (the modifier was put into rollData, the normal roll goes on), 'handled'
 * (a request went to the GM / the GM path rolled) or 'none'.
 */
export async function handleSelection({ actor, simpleSkillData, section, skillKey, skillLabel, difficulty, modifier }) {
    if (!section) return 'none';
    const sel = section.read();
    if (sel.mode === 'none') return 'none';
    const resolved = section.evaluate();
    if (!resolved.applies && !resolved.needsGm && !resolved.secret) {
        if (resolved.reason) ui.notifications.info(resolved.reason);
        return 'none';
    }
    const goesToGm = needsGmResolution(resolved, { confirmAll: confirmAllRelations() });
    if (game.user.isGM) {
        // the GM decided in the dialog (membership select): no second confirmation
        if (resolved.secret) {
            await runRelationRoll(actor, { skillKey, skillLabel, sel, difficulty, modifier, gm: section.gmDecision(), asGm: true });
            return 'handled';
        }
        if (resolved.needsGm && !resolved.applies) {
            ui.notifications.info('The patron is not treated as known for this test: no relationship modifier was applied.');
            return 'none';
        }
        applyToRollData(simpleSkillData.rollData, resolved, skillLabel);
        return 'apply';
    }
    if (goesToGm) {
        if (!game.users.activeGM) {
            ui.notifications.warn('A GM has to be online to resolve this test. Nothing was rolled.');
            return 'handled';
        }
        game.socket.emit(SOCKET, { type: 'relation-roll', requestId: foundry.utils.randomID(), userId: game.user.id, actorId: actor.id, skillKey, skillLabel, sel, difficulty, modifier });
        ui.notifications.info('The GM resolves this test.');
        return 'handled';
    }
    applyToRollData(simpleSkillData.rollData, resolved, skillLabel);
    return 'apply';
}

function applyToRollData(rollData, resolved, skillLabel) {
    if (!resolved.applies) return;
    rollData.modifiers.relation = resolved.modifier;
    rollData.relation = { lines: describeRelation(resolved, { skillLabel, base: rollData.baseTarget, factionName: resolved.factionName, contactName: resolved.contactName }), secret: false };
}

/* ------------------------------ GM side ------------------------------ */

export function registerRelationSocket() {
    game.socket.on(SOCKET, async (data) => {
        if (data?.type !== 'relation-roll') return;
        if (!shouldProcess({ activeGmId: game.users.activeGM?.id, selfId: game.user.id, requestId: data.requestId, seen })) return;
        try {
            await processRequest(data);
        } catch (error) {
            console.error('Dark Heresy 2e | relationship test failed', error);
        }
    });
}

async function processRequest(data) {
    const user = game.users.get(data.userId);
    const actor = game.actors.get(data.actorId);
    if (!actor || !user || !(user.isGM || actor.testUserPermission(user, 'OWNER'))) return ui.notifications.warn(`${user?.name ?? 'A user'} may not roll for this character.`);
    if (!isSocialSkill(data.skillKey) || !actor.system.skills?.[data.skillKey]) return;
    const ctx = await gmContext(actor);
    const preview = evaluateSelection(ctx, data.sel, { skill: data.skillKey, cap: relationCap() });
    const decision = await confirmDialog(actor, data, preview);
    if (!decision) return ui.notifications.info('The GM did not roll the test.');
    await runRelationRoll(actor, { ...data, gm: decision });
}

/** The GM client sees the true values: secret flags stay in the data, the level is read from the confidential store */
async function gmContext(actor) {
    return relationContext(actor);
}

async function confirmDialog(actor, data, preview) {
    const DialogV2 = foundry.applications.api.DialogV2;
    const lines = describeRelation({ ...preview, secret: false }, { skillLabel: data.skillLabel, base: actor.system.skills[data.skillKey].current, factionName: preview.factionName, contactName: preview.contactName });
    const secretNote = preview.secret ? '<p><b>The value is secret for the player.</b> You see it here, the player does not.</p>' : '';
    const result = await DialogV2.wait({
        classes: ['dh-ui', 'dh-dialog'],
        window: { title: 'Relationship test' },
        content: `<p><b>${esc(actor.name)}</b> rolls <b>${esc(data.skillLabel)}</b> ${preview.mode === 'patron' ? `in the name of ${esc(preview.patronName)}` : 'in person'}.</p>${secretNote}
            ${lines.map((l) => `<div>${esc(l.label)}: <b>${esc(l.value)}</b></div>`).join('')}
            <p class="notes">${esc(preview.reason || '')}</p>
            <div class="form-group"><label>Apply the relationship?</label><select name="apply"><option value="yes">Yes, it is relevant</option><option value="no">No</option></select></div>
            ${preview.mode === 'patron' ? '<div class="form-group"><label>Patron membership</label><select name="aff"><option value="auto">as set</option><option value="known">known here</option><option value="unknown">not known here</option></select></div>' : ''}`,
        buttons: [
            { action: 'roll', label: 'Roll', default: true, callback: (ev, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
            { action: 'cancel', label: 'Cancel' },
        ],
        rejectClose: false,
        modal: false,
    }).catch(() => null);
    if (!result || typeof result !== 'object') return null;
    const gm = {};
    if (result.apply === 'no') gm.apply = false;
    else if (preview.mode === 'patron' && result.aff === 'known') gm.affiliation = 'known';
    else if (preview.mode === 'patron' && result.aff === 'unknown') gm.apply = false;
    else gm.apply = true;
    return gm;
}

/** Rolls the test on THIS (GM) client, once, and posts the cards */
async function runRelationRoll(actor, { skillKey, skillLabel, sel, difficulty, modifier, gm }) {
    const { SimpleSkillData } = await import('../rolls/action-data.mjs');
    const { sendActionDataToChat } = await import('../rolls/roll-helpers.mjs');
    const ctx = await gmContext(actor);
    const wasSecret = sel.mode === 'patron' && !!ctx.patron?.relations?.find((r) => r.id === sel.patronRelationId)?.secret;
    // the GM computes with the true value: reveal the level for this calculation only
    const trueCtx = { ...ctx, patron: ctx.patron && { ...ctx.patron, relations: ctx.patron.relations.map((r) => ({ ...r, secret: false })) } };
    const resolved = evaluateSelection(trueCtx, sel, { skill: skillKey, cap: relationCap(), gm: { ...gm, affiliation: sel.mode === 'patron' ? gm?.affiliation ?? (gm?.apply === true ? 'known' : undefined) : gm?.affiliation } });
    const skill = actor.system.skills[skillKey];
    const data = new SimpleSkillData();
    const rd = data.rollData;
    rd.actor = actor;
    rd.nameOverride = skillLabel;
    rd.type = 'Skill';
    rd.baseTarget = skill.current;
    rd.modifiers.difficulty = parseInt(difficulty) || 0;
    rd.modifiers.modifier = modifier ?? 0;
    if (resolved.applies) {
        rd.modifiers.relation = resolved.modifier;
        rd.relation = { lines: describeRelation(resolved, { skillLabel, base: skill.current, factionName: resolved.factionName, contactName: resolved.contactName }), secret: wasSecret };
    }
    await rd.calculateTotalModifiers();
    await data.calculateSuccessOrFailure();
    if (!wasSecret) return sendActionDataToChat(data);

    // secret value: the public card knows only the outcome, everything else goes to the GMs
    const outcome = { characterName: actor.name, skillLabel, success: rd.success, degrees: rd.success ? rd.dos : rd.dof };
    const publicHtml = await foundry.applications.handlebars.renderTemplate('systems/dark-heresy-2nd/templates/chat/relation-secret-chat.hbs', outcome);
    await ChatMessage.create({ content: publicHtml, speaker: ChatMessage.getSpeaker({ actor }), style: CONST.CHAT_MESSAGE_STYLES.OTHER });
    const gmHtml = await foundry.applications.handlebars.renderTemplate(data.template, data);
    await ChatMessage.create({ content: gmHtml, rolls: rd.roll ? [rd.roll] : [], whisper: ChatMessage.getWhisperRecipients('GM').map((u) => u.id), speaker: ChatMessage.getSpeaker({ actor }), style: CONST.CHAT_MESSAGE_STYLES.OTHER });
}
