/**
 * Patron and relationship rules (pure, no Foundry). HOUSE RULE of this campaign ("Dark Maledictum"), not an official Dark Heresy 2 rule and not
 * the unchanged Imperium Maledictum success-level rule:
 *
 *   one applicable relationship level = ±10 on the target number of a fitting social test.
 *
 * Four values are kept apart:
 *   1. the personal DH2 characteristic Influence (unchanged, used for Requisition etc.; never touched here)
 *   2. the personal faction relation of a character (signed level)
 *   3. the personal contact value towards one person (signed level)
 *   4. the patron's relation to a faction (signed level)
 *
 * In person:       personal level = faction level + contact value
 * In the patron's name: the patron's relation to that faction is used INSTEAD of the personal combination (never added to it).
 * The modifier goes onto the target number BEFORE the roll; success, failure, degrees and the DH2 limits of the roll stay as they are.
 */

export const MODIFIER_PER_LEVEL = 10;

/** Skills a relationship may apply to (the interpersonal skills of the system). Everything else never gets a relation modifier. */
export const SOCIAL_SKILLS = ['charm', 'command', 'commerce', 'deceive', 'inquiry', 'intimidate'];
export const isSocialSkill = (key) => SOCIAL_SKILLS.includes(String(key ?? ''));

/** A signed whole level, anything else is 0 */
export function level(value) {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) ? n : 0;
}

export const personalLevel = (factionLevel, contactLevel) => level(factionLevel) + level(contactLevel);
export const levelToModifier = (lvl) => level(lvl) * MODIFIER_PER_LEVEL;

/**
 * The GM's optional limit of the relationship modifier (separate from the DH2 limit of ±60 for all modifiers of a roll).
 * @param cap {{mode: 'none'|'cap', max?: number}}
 */
export function capModifier(modifier, cap = { mode: 'none' }) {
    const m = Number(modifier) || 0;
    if (cap?.mode !== 'cap') return { value: m, capped: false };
    const max = Math.abs(Number(cap.max));
    if (!Number.isFinite(max)) return { value: m, capped: false };
    const value = Math.max(-max, Math.min(max, m));
    return { value, capped: value !== m };
}

export const AFFILIATIONS = {
    unknown: 'Unknown: the character appears in person or openly for the patron',
    known: 'Known: the patron\'s reputation takes effect',
    hidden: 'Unclear or hidden: the GM decides in the scene',
};

/**
 * What a relationship does to one social test.
 * @param input {{
 *   skill: string,
 *   mode: 'none'|'personal'|'patron',
 *   factionLevel?: number|null, contactLevel?: number|null, patronLevel?: number|null,
 *   patronSecret?: boolean, affiliation?: 'unknown'|'known'|'hidden',
 *   cap?: object,
 *   gm?: {apply?: boolean, mode?: string, affiliation?: string}   // the GM's decision for this roll
 * }}
 * @returns {{applies: boolean, mode: string, level: number, modifier: number, capped: boolean, parts: {label: string, value: number}[],
 *            secret: boolean, needsGm: boolean, reason: string}}
 */
export function resolveRelation(input) {
    const none = (reason) => ({ applies: false, mode: 'none', level: 0, modifier: 0, capped: false, parts: [], secret: false, needsGm: false, reason });
    const gm = input.gm ?? {};
    if (!isSocialSkill(input.skill)) return none('Relationships only apply to social tests.');
    let mode = gm.mode ?? input.mode ?? 'none';
    if (mode === 'none') return none('No relationship chosen.');
    if (gm.apply === false) return none('The GM did not apply the relationship to this test.');
    const affiliation = gm.affiliation ?? input.affiliation ?? 'unknown';

    if (mode === 'personal') {
        const f = level(input.factionLevel);
        const c = level(input.contactLevel);
        const lvl = f + c;
        const capped = capModifier(levelToModifier(lvl), input.cap);
        const parts = [];
        if (input.factionLevel !== null && input.factionLevel !== undefined) parts.push({ label: 'Faction', value: f });
        if (input.contactLevel !== null && input.contactLevel !== undefined) parts.push({ label: 'Contact', value: c });
        return { applies: true, mode, level: lvl, modifier: capped.value, capped: capped.capped, parts, secret: false, needsGm: false, reason: '' };
    }

    // in the name of the patron: the patron's value replaces the personal combination
    const secret = !!input.patronSecret;
    const decided = gm.apply === true || gm.affiliation === 'known';
    // unknown or unclear membership: the GM decides for this roll, the system does not claim that the character is recognised
    const needsGm = !decided && affiliation !== 'known';
    if (secret) {
        return { applies: true, mode, level: 0, modifier: 0, capped: false, parts: [], secret: true, needsGm: true, reason: 'The influence of the patron is unknown to the player: the GM resolves the test.' };
    }
    const lvl = level(input.patronLevel);
    const capped = capModifier(levelToModifier(lvl), input.cap);
    return {
        applies: !needsGm || decided,
        mode,
        level: lvl,
        modifier: capped.value,
        capped: capped.capped,
        parts: [{ label: 'Patron', value: lvl }],
        secret: false,
        needsGm,
        reason: needsGm ? 'Whether the patron is known here is for the GM to decide.' : '',
    };
}

/** Whether a roll with this relationship has to go through the GM client (secret value, unclear affiliation, or the GM wants to confirm every one) */
export function needsGmResolution(resolved, { confirmAll = false } = {}) {
    if (!resolved?.applies && !resolved?.needsGm) return false;
    return !!(resolved.secret || resolved.needsGm || (confirmAll && resolved.mode !== 'none'));
}

/* ----------------------------- the character's network (for the Contacts view) ----------------------------- */

/**
 * Hierarchy for the sheet: factions with their contacts, plus contacts without a faction.
 * @param factions {{id, name, level}[]}
 * @param contacts {{id, name, factionId?: string|null, level?: number}[]}
 */
export function buildNetwork(factions = [], contacts = [], cap = { mode: 'none' }) {
    const row = (c, factionLevel) => {
        const total = factionLevel === null ? level(c.level) : personalLevel(factionLevel, c.level);
        const mod = capModifier(levelToModifier(total), cap);
        return { ...c, level: level(c.level), total, modifier: mod.value, capped: mod.capped, formula: factionLevel === null ? `${signed(level(c.level))}` : `${signed(level(factionLevel))} ${signed(level(c.level))} = ${signed(total)}` };
    };
    const known = new Set(factions.map((f) => f.id));
    const groups = factions.map((f) => {
        const fl = level(f.level);
        const own = contacts.filter((c) => c.factionId === f.id);
        const mod = capModifier(levelToModifier(fl), cap);
        return { ...f, level: fl, modifier: mod.value, contacts: own.map((c) => row(c, fl)) };
    });
    // contacts without a faction, or whose faction no longer exists
    const loose = contacts.filter((c) => !c.factionId || !known.has(c.factionId)).map((c) => row(c, null));
    return { groups, loose };
}

export const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

/** The lines of the roll dialog / chat card for a resolved relationship */
export function describeRelation(resolved, { skillLabel, base, factionName = '', contactName = '' } = {}) {
    if (!resolved?.applies) return [];
    const lines = [];
    if (skillLabel !== undefined && base !== undefined) lines.push({ label: skillLabel, value: String(base) });
    if (resolved.secret) return [...lines, { label: 'Influence', value: 'unknown' }];
    if (resolved.mode === 'patron') {
        lines.push({ label: factionName ? `Patron → ${factionName}` : 'Patron', value: signed(resolved.level) });
    } else {
        for (const p of resolved.parts) lines.push({ label: p.label === 'Faction' ? factionName || 'Faction' : contactName || 'Contact', value: signed(p.value) });
        lines.push({ label: 'Personal relationship level', value: signed(resolved.level) });
    }
    lines.push({ label: 'Relationship modifier', value: `${resolved.modifier >= 0 ? '+' : '−'}${Math.abs(resolved.modifier)}${resolved.capped ? ' (limited by the GM setting)' : ''}` });
    if (base !== undefined) lines.push({ label: 'Target before other modifiers', value: String(Number(base) + resolved.modifier) });
    return lines;
}

/* ----------------------------- the choice in the roll dialog ----------------------------- */

/**
 * Evaluates the choice of the roll dialog against the data that is available ON THIS CLIENT.
 * @param ctx {{factions: {id,name,level}[], contacts: {id,name,factionId,level}[], patron: null|{id,name,affiliation,relations:{id,faction,level?,secret?}[]}}}
 * @param sel {{mode: string, factionId?: string, contactId?: string, patronRelationId?: string}}
 * @returns the result of resolveRelation() plus the names for the lines: { ...resolved, factionName, contactName, patronName }
 */
export function evaluateSelection(ctx, sel, { skill, cap, gm } = {}) {
    const mode = sel?.mode ?? 'none';
    if (mode === 'none') return { ...resolveRelation({ skill, mode: 'none' }), factionName: '', contactName: '' };
    if (mode === 'personal') {
        const faction = ctx.factions.find((f) => f.id === sel.factionId) ?? null;
        const contact = ctx.contacts.find((c) => c.id === sel.contactId) ?? null;
        if (!faction && !contact) return { ...resolveRelation({ skill, mode: 'none' }), reason: 'Choose a faction or a contact.', factionName: '', contactName: '' };
        const r = resolveRelation({ skill, mode, factionLevel: faction ? faction.level : null, contactLevel: contact ? contact.level : null, cap, gm });
        return { ...r, factionName: faction?.name ?? '', contactName: contact?.name ?? '' };
    }
    const rel = ctx.patron?.relations?.find((r) => r.id === sel.patronRelationId) ?? null;
    const r = resolveRelation({
        skill,
        mode: 'patron',
        patronLevel: rel && !rel.secret ? rel.level : 0,
        patronSecret: !!rel?.secret,
        affiliation: ctx.patron?.affiliation ?? 'unknown',
        cap,
        gm,
    });
    if (!rel) return { ...r, applies: false, reason: 'Choose a faction of the patron.', factionName: '', contactName: '', patronName: ctx.patron?.name ?? '' };
    return { ...r, factionName: rel.faction, contactName: '', patronName: ctx.patron?.name ?? '' };
}
