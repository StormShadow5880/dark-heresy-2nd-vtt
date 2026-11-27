import { TALENT_SPECIALISATIONS } from './advancement-data.mjs';
/**
 * Talent prerequisites (pure). The prerequisites of the talents are short texts from the rulebook, e.g.
 *   "Agility 45, Ambidextrous, Ballistic Skill 40 or Weapon Skill 40, Two-Weapon Wielder (Melee, Ranged)"
 * Reading: a comma separates requirements that ALL have to be met; " or " inside a requirement offers alternatives (ONE is enough).
 * Parentheses are never split ("(Melee, Ranged)" is one requirement).
 *
 * Every single requirement is checked against the character when its meaning is clear:
 *   characteristic  "Agility 40"                    total value of the characteristic
 *   skill           "Tech-Use", "Trade (Armourer)"  the skill (or speciality) is known
 *   skill rank      "Awareness +10", "Rank 2 in the Medicae skill"
 *   psy rating      "Psy rating"                    at least 1
 *   lore            "Lore (any one)"                any Lore speciality is known
 *   talent          "Frenzy", "Resistance (Fear)", "Two-Weapon Wielder (Melee, Ranged)"   an owned talent (with the choice)
 *   other item      "Mechanicus Implants"           an owned item with that name (trait, cybernetic ...)
 * What cannot be read for sure ("Weapon Training (any melee)", "Rank 4 in selected skill", an unknown name that the character does not
 * own) is NOT decided: it is reported as "manual" and the player / GM confirms it. Nothing is ever reported as met without proof.
 *
 * Result status per requirement and overall: 'met' | 'unmet' | 'manual'.
 */

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const CHARACTERISTICS = {
    weaponskill: ['weaponSkill', 'Weapon Skill'],
    ballisticskill: ['ballisticSkill', 'Ballistic Skill'],
    strength: ['strength', 'Strength'],
    toughness: ['toughness', 'Toughness'],
    agility: ['agility', 'Agility'],
    intelligence: ['intelligence', 'Intelligence'],
    perception: ['perception', 'Perception'],
    willpower: ['willpower', 'Willpower'],
    fellowship: ['fellowship', 'Fellowship'],
    influence: ['influence', 'Influence'],
};

const LORE_SKILLS = ['commonLore', 'forbiddenLore', 'scholasticLore'];

/** Splits at top level (outside of parentheses) */
function splitTop(text, matcher) {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth = Math.max(0, depth - 1);
        else if (depth === 0) {
            const len = matcher(text, i);
            if (len) {
                parts.push(text.slice(start, i));
                start = i + len;
                i += len - 1;
            }
        }
    }
    parts.push(text.slice(start));
    return parts.map((p) => p.trim()).filter(Boolean);
}
const commaAt = (t, i) => (t[i] === ',' ? 1 : 0);
const orAt = (t, i) => {
    const m = /^\s+or\s+/i.exec(t.slice(i, i + 6));
    return m ? m[0].length : 0;
};

/** The requirements as structure: [{ text, alternatives: [string] }] */
export function parsePrerequisites(text) {
    const t = String(text ?? '').trim();
    if (!t || /^none$/i.test(t)) return { empty: true, clauses: [] };
    return { empty: false, clauses: splitTop(t, commaAt).map((c) => ({ text: c, alternatives: splitTop(c, orAt) })) };
}

/* ----------------------------- one requirement ----------------------------- */

const skillByName = (skills, name) => {
    const n = norm(name);
    return Object.entries(skills ?? {}).find(([key, s]) => norm(s.label) === n || norm(key) === n) ?? null;
};
const specByName = (skill, name) => Object.values(skill.specialities ?? {}).find((sp) => norm(sp.label) === norm(name)) ?? null;
const res = (status, text, detail = '') => ({ status, text, detail });

function checkSkill(view, text, name, spec, needAdvance) {
    const found = skillByName(view.skills, name);
    if (!found) return null;
    const [, skill] = found;
    const label = spec ? `${skill.label} (${spec})` : skill.label;
    const need = needAdvance > 1 ? ` +${(needAdvance - 1) * 10}` : '';
    if (skill.isSpecialist) {
        const specs = Object.values(skill.specialities ?? {});
        const candidates = spec ? specs.filter((s) => norm(s.label) === norm(spec)) : specs;
        const ok = candidates.some((s) => s.taken !== false && Number(s.advance) >= needAdvance);
        return res(ok ? 'met' : 'unmet', text, ok ? `${label}${need} known` : `${label}${need} missing`);
    }
    const adv = Number(skill.advance) || 0;
    return res(adv >= needAdvance ? 'met' : 'unmet', text, `${label}${need}: ${adv >= needAdvance ? 'known' : 'missing'}`);
}

function ownedSpecs(view, base) {
    const specs = new Set();
    let plain = false;
    for (const item of view.items) {
        if (item.type !== 'talent') continue;
        const m = /^(.*?)\s*(?:\((.*)\))?$/.exec(String(item.name).trim());
        if (norm(m[1]) !== base) continue;
        if (m[2]) m[2].split(',').forEach((s) => specs.add(norm(s)));
        else plain = true;
    }
    return { specs, plain, any: plain || specs.size > 0 };
}

/** Talents that were split into specialisations: an old general entry of them is a decision for the GM */
const SPLIT_TALENTS = new Set(Object.keys(TALENT_SPECIALISATIONS).map((n) => norm(n)));

/** Checks one requirement string against the character view */
export function checkRequirement(text, view) {
    const t = text.trim();
    let m;
    if (/^psy\s*rating$/i.test(t)) return res(Number(view.psyRating) >= 1 ? 'met' : 'unmet', t, `Psy Rating ${Number(view.psyRating) || 0}`);

    if ((m = /^(.+?)\s+(\d{2,3})$/.exec(t)) && CHARACTERISTICS[norm(m[1])]) {
        const [key, label] = CHARACTERISTICS[norm(m[1])];
        const value = Number(view.chars?.[key]);
        if (!Number.isFinite(value)) return res('manual', t, `${label} unknown: check manually`);
        return res(value >= Number(m[2]) ? 'met' : 'unmet', t, `${label} ${value} / ${m[2]}`);
    }

    if ((m = /^rank\s+(\d)\s+in\s+(.+)$/i.exec(t))) {
        if (/selected|chosen|any/i.test(m[2])) return res('manual', t, 'depends on the chosen skill: check manually');
        const name = m[2].replace(/\s+skill$/i, '').replace(/^the\s+/i, '');
        return checkSkill(view, t, name, null, Number(m[1])) ?? res('manual', t, 'unknown skill: check manually');
    }

    if ((m = /^(.+?)\s*\+(\d+)$/.exec(t))) {
        const [, name, bonus] = m;
        const r = checkSkill(view, t, name.replace(/\s*\(.*\)$/, ''), (/\((.*)\)/.exec(name) ?? [])[1], 1 + Math.round(Number(bonus) / 10));
        return r ?? res('manual', t, 'unknown skill: check manually');
    }

    if (/^lore\s*\(any\b/i.test(t)) {
        const ok = LORE_SKILLS.some((k) => Object.values(view.skills?.[k]?.specialities ?? {}).some((s) => s.taken !== false && Number(s.advance) >= 1));
        return res(ok ? 'met' : 'unmet', t, ok ? 'a Lore speciality is known' : 'no Lore speciality known');
    }

    m = /^([^()]+?)\s*(?:\((.+)\))?$/.exec(t);
    if (!m) return res('manual', t, 'not readable: check manually');
    const name = m[1].trim();
    const spec = m[2]?.trim();

    // a skill
    const asSkill = checkSkill(view, t, name, spec, 1);
    if (asSkill) return asSkill;

    // a choice that only a person can judge ("any melee")
    if (spec && /^any\b/i.test(spec)) return res('manual', t, 'depends on the choice: check manually');

    // a talent
    const base = norm(name);
    if (view.knownTalents?.has(base)) {
        const owned = ownedSpecs(view, base);
        // a trait or another item that carries the name of the talent (a background may grant it) counts as well
        const asOtherItem = view.items.some((i) => i.type !== 'talent' && norm(String(i.name).replace(/\s*\(.*\)$/, '')) === base);
        if (!spec) return res(owned.any || asOtherItem ? 'met' : 'unmet', t, owned.any ? 'learned' : asOtherItem ? 'owned' : 'not learned');
        const wanted = spec.split(',').map(norm).filter(Boolean);
        const ok = wanted.every((w) => owned.specs.has(w));
        // an old general entry without a specialisation (before the talent was split): never read as one or all specialisations, the GM decides
        if (!ok && owned.plain && SPLIT_TALENTS.has(base)) return res('manual', t, `has the old general ${name} without a specialisation: the GM decides whether it covers ${spec}`);
        return res(ok ? 'met' : 'unmet', t, ok ? 'learned' : `${name} (${spec}) not learned`);
    }

    // another item of the character (trait, cybernetic ...)
    const hasItem = view.items.some((i) => norm(i.name) === base || norm(String(i.name).replace(/\s*\(.*\)$/, '')) === base);
    if (hasItem) return res('met', t, 'owned');

    return res('manual', t, 'cannot be checked automatically: check manually');
}

/* ----------------------------- the whole text ----------------------------- */

/**
 * @param text {string} the prerequisites of a talent
 * @param view {{chars, skills, psyRating, items, knownTalents: Set<string>}} see viewOf()
 * @returns {{empty: boolean, status: 'met'|'unmet'|'manual', clauses: object[], unmet: string[], manual: string[]}}
 */
export function evaluatePrerequisites(text, view) {
    const parsed = parsePrerequisites(text);
    if (parsed.empty) return { empty: true, status: 'met', clauses: [], unmet: [], manual: [] };
    const clauses = parsed.clauses.map((clause) => {
        const alternatives = clause.alternatives.map((a) => checkRequirement(a, view));
        const status = alternatives.some((a) => a.status === 'met') ? 'met' : alternatives.every((a) => a.status === 'unmet') ? 'unmet' : 'manual';
        return { text: clause.text, status, alternatives };
    });
    const unmet = clauses.filter((c) => c.status === 'unmet').map((c) => c.text);
    const manual = clauses.filter((c) => c.status === 'manual').map((c) => c.text);
    return { empty: false, status: unmet.length ? 'unmet' : manual.length ? 'manual' : 'met', clauses, unmet, manual };
}

/** The view of a character (actor) for the checks; `knownTalents`: normalised names of all talents of the compendium */
export function viewOf(actor, knownTalents = new Set()) {
    const chars = {};
    for (const [key, c] of Object.entries(actor.system?.characteristics ?? {})) chars[key] = Number(c.total);
    return {
        chars,
        skills: actor.system?.skills ?? {},
        psyRating: actor.system?.psy?.rating ?? 0,
        items: [...(actor.items ?? [])].map((i) => ({ type: i.type, name: i.name })),
        knownTalents,
    };
}

export const normalizeName = norm;
