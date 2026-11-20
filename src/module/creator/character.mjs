/**
 * Computes the complete character from a creation draft. Pure: the same draft always gives the same result,
 * nothing is added twice when it is computed again.
 *
 * env = { startingXp, systemDefaults }   systemDefaults: the default system data of an acolyte
 *                                         (game.model.Actor.acolyte at runtime) - used for the skill list
 */
import { aptitudeId, aptitudeName, num } from '../rules/advancement.mjs';
import { purchaseAdvancement } from '../rules/experience.mjs';
import { APTITUDES } from '../rules/advancement-data.mjs';
import {
    BACKGROUNDS,
    CHARACTERISTICS,
    CHARACTERISTIC_KEYS,
    HOMEWORLDS,
    ROLES,
    byId,
    characteristicKey,
    skillKey,
    specKey,
} from './data.mjs';
import { characteristicFromDice, characteristicKind, divinationEffect, divinationForRoll, evaluatePointBuy, fateFromRoll, rollBase, woundsFromRoll } from './rules.mjs';

export const STEPS = [
    { id: 'welcome', label: 'Welcome' },
    { id: 'homeworld', label: 'Home World' },
    { id: 'characteristics', label: 'Characteristics' },
    { id: 'background', label: 'Background' },
    { id: 'role', label: 'Role' },
    { id: 'aptitudes', label: 'Aptitudes & Bonuses' },
    { id: 'skills', label: 'Skills & Talents' },
    { id: 'vitals', label: 'Wounds, Fate, Divination' },
    { id: 'elite', label: 'Elite Advances & Psychic', optional: true },
    { id: 'xp', label: 'Starting Experience', optional: true },
    { id: 'equipment', label: 'Equipment' },
    { id: 'biography', label: 'Biography' },
    { id: 'review', label: 'Review & Finalize' },
];

export function newDraft() {
    return {
        version: 1,
        mode: 'guided',
        homeWorldId: null,
        backgroundId: null,
        roleId: null,
        characteristics: { method: 'roll', veteran: false, rolls: {}, rerollUsed: null, points: {} },
        choices: {},
        advances: [],
        wounds: { roll: null },
        fate: { roll: null },
        divination: { roll: null },
        corruptionRoll: null,
        biography: {},
        completedSteps: [],
        overrides: [],
        log: [],
    };
}

export const talentName = (t) => (t.spec ? `${t.talent ?? t.name} (${t.spec})` : (t.talent ?? t.name));
const MAX_SKILL_RANK = 4;

const option = (value, label) => ({ value: String(value), label });

function skillLabel(entry) {
    const base = entry.skill.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
    return entry.spec ? `${base} (${entry.spec})` : base;
}

function specsOf(env, skill) {
    return Object.entries(env.systemDefaults?.skills?.[skill]?.specialities ?? {}).map(([key, s]) => ({ key, label: s.label }));
}

/** Creates a choice record and reads the stored answer */
function makeChoice(draft, def) {
    const raw = draft.choices[def.id];
    const valid = def.options.some((o) => o.value === String(raw));
    return { required: true, ...def, value: valid ? String(raw) : null, resolved: valid };
}

export function computeCharacter(draft, env) {
    const out = {
        homeWorld: byId(HOMEWORLDS, draft.homeWorldId),
        background: byId(BACKGROUNDS, draft.backgroundId),
        role: byId(ROLES, draft.roleId),
        choices: [],
        warnings: [],
        characteristics: {},
        aptitudes: [],
        skills: {},
        talents: [],
        traits: [],
        bonuses: [],
        equipment: [],
        elite: [],
        psy: null,
        corruption: 0,
        wounds: null,
        fate: null,
        divination: null,
        divinationNotes: [],
        xp: { total: num(env.startingXp, 1000), spent: 0, available: 0 },
    };
    const addChoice = (def) => {
        const c = makeChoice(draft, def);
        out.choices.push(c);
        return c;
    };

    /* ----- home world ------------------------------------------------ */
    const hw = out.homeWorld;
    if (hw) {
        for (const def of hw.choices) {
            const c = addChoice({ id: def.id, step: 'homeworld', label: def.label, options: def.options.map((o, i) => option(i, o.talent)) });
            if (c.resolved) out.talents.push({ name: def.options[Number(c.value)].talent, source: hw.name });
        }
        for (const t of hw.talents) out.talents.push({ name: talentName(t), source: hw.name });
        out.bonuses.push({ source: 'Home World', name: hw.bonus.name, benefit: hw.bonus.benefit, mechanic: hw.bonus.mechanic });
    }

    /* ----- characteristics ------------------------------------------- */
    const gen = draft.characteristics;
    const kinds = Object.fromEntries(CHARACTERISTIC_KEYS.map((k) => [k, characteristicKind(hw, k)]));
    out.kinds = kinds;
    if (gen.method === 'pointbuy') {
        const pb = evaluatePointBuy(gen.points, kinds);
        out.pointBuy = pb;
        if (hw) CHARACTERISTIC_KEYS.forEach((k) => (out.characteristics[k] = pb.values[k]));
        out.characteristicsComplete = !!hw && pb.ok;
    } else {
        for (const k of CHARACTERISTIC_KEYS) {
            const r = gen.rolls[k];
            if (!r?.dice) continue;
            try {
                out.characteristics[k] = characteristicFromDice(r.dice, kinds[k], rollBase(gen.veteran)).value;
            } catch {
                out.warnings.push(`${k}: invalid dice`);
            }
        }
        out.characteristicsComplete = CHARACTERISTIC_KEYS.every((k) => out.characteristics[k] !== undefined);
    }

    /* ----- background -------------------------------------------------- */
    const bg = out.background;
    const grantedSkills = []; // {skill, spec}
    const grantSkill = (entry) => grantedSkills.push(entry);
    if (bg) {
        out.bonuses.push({ source: 'Background', name: bg.bonus.name, benefit: bg.bonus.benefit, mechanic: 'C' });
        for (const slotDef of bg.skills) {
            if (slotDef.pick) {
                const specs = specsOf(env, slotDef.pick.skill);
                const c = addChoice({ id: slotDef.id, step: 'skills', label: slotDef.pick.label, options: specs.map((s) => option(s.key, s.label)) });
                if (c.resolved) grantSkill({ skill: slotDef.pick.skill, spec: specs.find((s) => s.key === c.value).label, specKey: c.value });
                continue;
            }
            let entry;
            if (slotDef.options.length > 1) {
                const c = addChoice({ id: slotDef.id, step: 'skills', label: 'Starting skill', options: slotDef.options.map((o, i) => option(i, skillLabel({ skill: o.skill, spec: o.spec }))) });
                if (!c.resolved) continue;
                entry = slotDef.options[Number(c.value)];
            } else entry = slotDef.options[0];
            if (entry.pick) {
                const specs = specsOf(env, entry.skill);
                const c = addChoice({ id: `${slotDef.id}-spec`, step: 'skills', label: `${skillLabel(entry)} speciality`, options: specs.map((s) => option(s.key, s.label)) });
                if (c.resolved) grantSkill({ skill: entry.skill, spec: specs.find((s) => s.key === c.value).label, specKey: c.value });
            } else grantSkill({ skill: entry.skill, spec: entry.spec ?? null });
        }
        for (const t of bg.talents) {
            if (t.options) {
                const c = addChoice({
                    id: t.id,
                    step: 'skills',
                    label: t.label,
                    options: t.options.map((pkg, i) => option(i, pkg.map(talentName).join(' + '))),
                });
                if (c.resolved) for (const entry of t.options[Number(c.value)]) out.talents.push({ name: talentName(entry), source: bg.name });
            } else out.talents.push({ name: talentName(t), source: bg.name });
        }
        for (const trait of bg.traits) out.traits.push({ name: trait.trait, source: bg.name, note: trait.note });
        for (const group of bg.equipment) {
            const choiceId = `eq-${group.id}`;
            let selected = group.options[0];
            if (group.options.length > 1) {
                const c = addChoice({
                    id: choiceId,
                    step: 'equipment',
                    label: 'Starting equipment',
                    options: group.options.map((opt, i) => option(i, opt.filter((x) => typeof x === 'string').join(' and '))),
                });
                selected = c.resolved ? group.options[Number(c.value)] : null;
            }
            if (selected) {
                // an option is a list of item names, a number after a name is its quantity
                for (let i = 0; i < selected.length; i++) {
                    if (typeof selected[i] !== 'string') continue;
                    out.equipment.push({ name: selected[i], quantity: typeof selected[i + 1] === 'number' ? selected[i + 1] : 1, source: bg.name });
                }
            }
        }
    }

    /* ----- role ------------------------------------------------------ */
    const role = out.role;
    const roleAptitudes = [];
    if (role) {
        out.bonuses.push({ source: 'Role', name: role.bonus.name, benefit: role.bonus.benefit, mechanic: 'C' });
        for (const [i, apt] of role.aptitudes.entries()) {
            if (apt.includes(' or ')) {
                const names = apt.split(' or ');
                const c = addChoice({ id: `role-apt-${i}`, step: 'role', label: apt, options: names.map((n) => option(n, n)) });
                if (c.resolved) roleAptitudes.push(c.value);
            } else roleAptitudes.push(apt);
        }
        const opts = role.talentOptions;
        const c = addChoice({ id: 'role-talent', step: 'role', label: 'Role talent', options: opts.map((o, i) => option(i, o.needsSpec ?? talentName(o))) });
        if (c.resolved) {
            const picked = opts[Number(c.value)];
            if (picked.needsSpec) {
                const sc = addChoice({ id: 'role-talent-spec', step: 'role', label: picked.needsSpec, text: true, options: [], textValue: draft.choices['role-talent-spec'] });
                const text = String(draft.choices['role-talent-spec'] ?? '').trim();
                sc.resolved = !!text;
                sc.value = text || null;
                if (text) out.talents.push({ name: `${picked.talent} (${text})`, source: role.name });
            } else out.talents.push({ name: talentName(picked), source: role.name });
        }
        if (role.grantsElite) out.elite.push(role.grantsElite);
    }

    /* ----- aptitudes (home world, background, role, elite) ------------- */
    const sources = [{ name: 'General', source: 'General' }];
    if (hw) sources.push({ name: hw.aptitude, source: 'Home World' });
    if (bg) {
        const c = addChoice({ id: 'bg-apt', step: 'aptitudes', label: 'Background aptitude', options: bg.aptitudeChoice.map((n) => option(n, n)) });
        if (c.resolved) sources.push({ name: c.value, source: 'Background' });
    }
    for (const name of roleAptitudes) sources.push({ name, source: 'Role' });
    if (out.elite.includes('Psyker')) sources.push({ name: 'Psyker', source: 'Elite Advance: Psyker' });

    // first pass: which aptitudes does the character have anyway, which grants are duplicates
    const known = sources.map((src) => ({ ...src, id: aptitudeId(src.name) }));
    for (const src of known) if (!src.id) out.warnings.push(`Unknown aptitude "${src.name}" (${src.source}).`);
    const originals = new Set();
    for (const src of known) {
        if (src.id && !originals.has(src.id)) {
            originals.add(src.id);
            src.duplicate = false;
        } else if (src.id) src.duplicate = true;
    }
    // second pass: duplicates are replaced by a chosen aptitude of a characteristic that is not owned
    // (neither by another grant nor by an earlier replacement)
    const taken = new Set(originals);
    const replacementPool = CHARACTERISTICS.filter((c) => c.key !== 'influence').map((c) => c.key);
    let dupIndex = 0;
    for (const src of known) {
        if (!src.id) continue;
        if (!src.duplicate) {
            out.aptitudes.push({ id: src.id, name: aptitudeName(src.id), source: src.source, original: src.name });
            continue;
        }
        const choiceId = `dup-${dupIndex++}`;
        const free = replacementPool.filter((k) => !taken.has(k));
        const c = addChoice({ id: choiceId, step: 'aptitudes', label: `${aptitudeName(src.id)} (${src.source}) is a duplicate`, duplicateOf: src.id, options: free.map((k) => option(k, aptitudeName(k))) });
        if (c.resolved) {
            taken.add(c.value);
            out.aptitudes.push({ id: c.value, name: aptitudeName(c.value), source: src.source, original: src.name, replacement: true });
        }
    }

    /* ----- skills ---------------------------------------------------- */
    for (const entry of grantedSkills) {
        const key = skillKey(entry.skill) ?? entry.skill;
        const target = (out.skills[key] ??= { advance: 0, specs: {} });
        if (entry.spec) {
            const sk = entry.specKey ?? specKey(entry.spec);
            const spec = (target.specs[sk] ??= { label: entry.spec, advance: 0 });
            spec.advance = Math.min(MAX_SKILL_RANK, spec.advance + 1); // granted twice: one more rank (core FAQ)
        } else target.advance = Math.min(MAX_SKILL_RANK, target.advance + 1);
    }

    /* ----- elite / psyker ------------------------------------------------ */
    if (out.elite.includes('Psyker')) {
        const sanctioned = bg?.name === 'Adeptus Astra Telepathica';
        out.psy = { rating: 1, sanctioned, class: 'bound' };
        out.traits.push({ name: 'Psyker', source: 'Elite Advance: Psyker' });
        if (sanctioned) {
            if (!out.traits.some((t) => t.name === 'Sanctioned')) out.traits.push({ name: 'Sanctioned', source: 'Adeptus Astra Telepathica' });
        } else {
            const roll = Number(draft.corruptionRoll);
            out.corruption = Number.isInteger(roll) && roll >= 1 ? roll + 3 : 0;
            out.corruptionPending = !(Number.isInteger(roll) && roll >= 1);
            out.warnings.push('Rogue psyker: not sanctioned, gains 1d10+3 corruption points.');
        }
        if ((out.characteristics.willpower ?? 0) < 40) out.warnings.push('The Psyker elite advance asks for Willpower 40 (GM guidance at character creation).');
    }

    /* ----- wounds, fate, divination ------------------------------------ */
    if (hw) {
        const max = draft.wounds.roll ? woundsFromRoll(hw, draft.wounds.roll) : null;
        out.wounds = max ? { max, value: max, roll: draft.wounds.roll } : null;
        const fate = draft.fate.roll ? fateFromRoll(hw, draft.fate.roll) : null;
        out.fate = fate ? { ...fate, current: fate.threshold } : null;
    }
    const div = draft.divination.roll ? divinationForRoll(draft.divination.roll) : null;
    if (div) {
        out.divination = div;
        const effect = divinationEffect(div) ?? {};
        const apply = (d) => {
            if (out.characteristics[d.key] !== undefined) out.characteristics[d.key] += d.delta;
        };
        for (const d of effect.c ?? []) apply(d);
        for (const group of effect.pick ?? []) {
            const c = addChoice({ id: `div-${group.id}`, step: 'vitals', label: `Divination: ${group.label}`, options: group.options.map((o) => option(o.key, characteristicLabel(o.key))) });
            if (c.resolved) apply(group.options.find((o) => o.key === c.value));
        }
        if (effect.talent) {
            let name = effect.talent.name;
            let ok = true;
            if (effect.talent.choose) {
                const choices = Array.isArray(effect.talent.choose) ? effect.talent.choose : null;
                const c = addChoice({ id: 'div-talent', step: 'vitals', label: `Divination: ${name}`, text: !choices, options: choices ? choices.map((n) => option(n, n)) : [] });
                const text = choices ? c.value : String(draft.choices['div-talent'] ?? '').trim();
                if (!choices) {
                    c.resolved = !!text;
                    c.value = text || null;
                }
                ok = !!text;
                if (ok) name = `${name} (${text})`;
            }
            if (ok) {
                const has = out.talents.some((t) => t.name.toLowerCase().startsWith(effect.talent.name.toLowerCase()));
                if (has) apply(effect.fallback);
                else out.talents.push({ name, source: 'Divination' });
            }
        }
        if (effect.skill) {
            const key = effect.skill.skill;
            if (out.skills[key]?.advance > 0) apply(effect.fallback);
            else (out.skills[key] ??= { advance: 0, specs: {} }).advance = 1;
        }
        if (effect.fate && out.fate) {
            out.fate.threshold += effect.fate;
            out.fate.current += effect.fate;
        }
        if (effect.manual) out.divinationNotes.push(effect.manual);
    }

    /* ----- duplicates of talents (same name) ---------------------------- */
    const seen = new Set();
    out.talents = out.talents.filter((t) => {
        const k = t.name.toLowerCase();
        if (seen.has(k)) {
            out.warnings.push(`${t.name} was granted twice, it counts once (no rulebook rule for a second grant).`);
            return false;
        }
        seen.add(k);
        return true;
    });

    return out;
}

function characteristicLabel(key) {
    return CHARACTERISTICS.find((c) => c.key === key)?.label ?? key;
}

/* ====================================================================== */
/*  Simulated actor: the same advancement functions as the sheet use it    */
/* ====================================================================== */

/** Actor-like object with the data of the computed character (nothing is saved) */
export function buildSimActor(state, env, draft) {
    const system = foundryClone(env.systemDefaults);
    const base = (k) => state.characteristics[k] ?? 0;
    for (const k of CHARACTERISTIC_KEYS) {
        const c = system.characteristics[k];
        c.base = base(k);
        c.advance = 0;
        c.cost = 0;
    }
    for (const [key, entry] of Object.entries(state.skills)) {
        const skill = system.skills[key];
        if (!skill) continue;
        if (entry.advance) skill.advance = entry.advance;
        for (const [sk, spec] of Object.entries(entry.specs)) {
            skill.specialities[sk] ??= { label: spec.label, advance: 0, cost: 0, taken: false };
            skill.specialities[sk].advance = spec.advance;
            skill.specialities[sk].taken = true;
        }
    }
    system.experience = { total: state.xp.total, used: 0 };
    const items = [
        ...state.aptitudes.map((a) => ({ type: 'aptitude', name: a.name, system: {} })),
        ...state.talents.map((t) => ({ type: 'talent', name: t.name, system: { cost: 0 } })),
    ];
    const flags = {
        xpLog: [{ id: 'start', timestamp: Date.now(), user: game.user?.name ?? 'Creator', type: 'award', category: 'Award', label: 'Starting experience', cost: state.xp.total, note: 'Character creation' }],
    };
    return {
        id: 'creator-draft',
        name: draft?.biography?.name ?? 'Draft',
        system,
        items,
        flags,
        getFlag: (scope, key) => flags[key],
        async update(data) {
            for (const [path, value] of Object.entries(data)) {
                if (path.startsWith('flags.dark-heresy-2nd.')) {
                    flags[path.slice('flags.dark-heresy-2nd.'.length)] = value;
                    continue;
                }
                const keys = path.split('.');
                const last = keys.pop();
                keys.reduce((o, k) => o[k], this)[last] = value;
            }
        },
        async createEmbeddedDocuments(type, list) {
            const made = list.map((d, i) => ({ ...d, id: `sim${items.length + i}` }));
            items.push(...made);
            return made;
        },
        async deleteEmbeddedDocuments(type, ids) {
            for (const id of ids) {
                const i = items.findIndex((x) => x.id === id);
                if (i >= 0) items.splice(i, 1);
            }
        },
    };
}

function foundryClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Replays the XP purchases of the draft on a simulated actor. Purchases that no longer work (aptitudes changed,
 * not enough XP) are reported and are not applied.
 * @returns {{actor: object, applied: object[], failed: object[]}}
 */
export async function replayAdvances(state, draft, env) {
    const actor = buildSimActor(state, env, draft);
    const applied = [];
    const failed = [];
    for (const adv of draft.advances) {
        const result = await purchaseAdvancement(actor, { ...adv, silent: true });
        (result.ok ? applied : failed).push({ adv, quote: result.quote, errors: result.errors });
    }
    return { actor, applied, failed };
}

/* ====================================================================== */
/*  Step validation                                                        */
/* ====================================================================== */

export function stepStatus(state, draft) {
    const pending = (step) => state.choices.filter((c) => c.step === step && c.required && !c.resolved);
    const bgRoleReady = !!state.background && !!state.role;
    const done = {
        welcome: true,
        homeworld: !!state.homeWorld && pending('homeworld').length === 0,
        characteristics: !!state.homeWorld && !!state.characteristicsComplete,
        background: !!state.background && state.choices.find((c) => c.id === 'bg-apt')?.resolved === true,
        role: !!state.role && pending('role').length === 0,
        aptitudes: bgRoleReady && pending('aptitudes').length === 0,
        skills: !!state.background && pending('skills').length === 0,
        vitals: !!state.wounds && !!state.fate && !!state.divination && pending('vitals').length === 0,
        elite: true,
        xp: true,
        equipment: !!state.background && pending('equipment').length === 0,
        biography: !!String(draft.biography?.name ?? '').trim(),
    };
    if (state.corruptionPending) done.elite = false;
    done.review = STEPS.filter((s) => s.id !== 'review').every((s) => done[s.id]);
    return done;
}

/**
 * What is still open in each step, as readable sentences (shown above the step so the player knows why "Next" is
 * disabled). A step is complete exactly when its list is empty (optional steps never block).
 */
export function stepBlockers(state, draft) {
    const open = (step) => state.choices.filter((c) => c.step === step && c.required && !c.resolved).map((c) => `Choose: ${c.label}`);
    const homeFirst = state.homeWorld ? [] : ['Choose a home world first.'];
    const characteristics = [...homeFirst];
    if (state.homeWorld && !state.characteristicsComplete) {
        if (draft.characteristics.method === 'pointbuy') characteristics.push(...(state.pointBuy?.errors ?? []));
        else {
            const missing = CHARACTERISTIC_KEYS.filter((k) => state.characteristics[k] === undefined).length;
            characteristics.push(`Roll the remaining ${missing} characteristic${missing === 1 ? '' : 's'}.`);
        }
    }
    const vitals = [...homeFirst];
    if (state.homeWorld) {
        if (!state.wounds) vitals.push('Roll the wounds (1d5).');
        if (!state.fate) vitals.push("Roll the Emperor's Blessing (1d10).");
    }
    if (!state.divination) vitals.push('Roll the divination (1d100).');
    vitals.push(...open('vitals'));
    const needBg = state.background ? [] : ['Choose a background first.'];
    return {
        welcome: [],
        homeworld: [...(state.homeWorld ? [] : ['Choose a home world.']), ...open('homeworld')],
        characteristics,
        background: [...(state.background ? [] : ['Choose a background.']), ...(state.background && !state.choices.find((c) => c.id === 'bg-apt')?.resolved ? ['Choose the background aptitude (selection above the cards).'] : [])],
        role: [...(state.role ? [] : ['Choose a role.']), ...open('role')],
        aptitudes: [...(state.background ? [] : needBg), ...(state.role ? [] : ['Choose a role first.']), ...open('aptitudes')],
        skills: [...needBg, ...open('skills')],
        vitals,
        elite: state.corruptionPending ? ['Roll the corruption of the rogue psyker (1d10).'] : [],
        xp: [],
        equipment: [...needBg, ...open('equipment')],
        biography: String(draft.biography?.name ?? '').trim() ? [] : ['Enter a character name.'],
        review: [],
    };
}

export { APTITUDES };
