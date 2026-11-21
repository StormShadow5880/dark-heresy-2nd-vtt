/**
 * Builds the view model for the Dark Heresy dossier character sheet.
 * Everything here only READS existing actor data (computed in documents/acolyte.mjs);
 * rules are not re-implemented in the templates.
 */
import { SYSTEM_ID } from '../../system-id.mjs';
import { SKILL_DESCRIPTIONS } from '../../rules/skill-descriptions.mjs';
import { buildQuotes, describeQuote, skillQuote } from '../../rules/advancement.mjs';
import { woundBar } from '../../rules/wounds.mjs';
import { canSustain, describeEffects, effectLine, hasEffect } from '../../rules/psychic-effects.mjs';

export const CHARACTERISTIC_ORDER = [
    'weaponSkill',
    'ballisticSkill',
    'strength',
    'toughness',
    'agility',
    'intelligence',
    'perception',
    'willpower',
    'fellowship',
    'influence',
];

export const TRAINING_LEVELS = {
    0: 'Unknown',
    1: 'Known',
    2: 'Trained',
    3: 'Experienced',
    4: 'Veteran',
};

export const TRAINING_PIP_LABELS = { 1: 'Known', 2: '+10', 3: '+20', 4: '+30' };

export const CHARACTERISTIC_ADVANCE_LEVELS = {
    0: 'None',
    1: 'Simple',
    2: 'Intermediate',
    3: 'Trained',
    4: 'Proficient',
    5: 'Expert',
};

const MAX_CHARACTERISTIC_PIPS = 5;
const MAX_CHARACTERISTIC_ADVANCE_LEVEL = 5;
const DEFAULT_FAVORITE_SKILLS = ['awareness', 'dodge', 'inquiry', 'techUse'];

const ARMOUR_ZONES = [
    ['head', 'Head'],
    ['body', 'Body'],
    ['leftArm', 'Left Arm'],
    ['rightArm', 'Right Arm'],
    ['leftLeg', 'Left Leg'],
    ['rightLeg', 'Right Leg'],
];

const GEAR_GROUPS = [
    { id: 'weapon', label: 'Weapons', types: ['weapon'] },
    { id: 'armour', label: 'Armour', types: ['armour', 'forceField'] },
    { id: 'ammo', label: 'Ammunition', types: ['ammunition'] },
    { id: 'tools', label: 'Tools', types: ['tool'] },
    { id: 'consumables', label: 'Consumables', types: ['consumable', 'drug'] },
    { id: 'cybernetic', label: 'Cybernetics', types: ['cybernetic'] },
    { id: 'gear', label: 'Other Gear', types: ['gear', 'weaponModification', 'armourModification'] },
];

export function getFavoriteSkills(actor) {
    return actor.getFlag(SYSTEM_ID, 'favoriteSkills') ?? DEFAULT_FAVORITE_SKILLS;
}

export function getExperienceLog(actor) {
    return actor.getFlag(SYSTEM_ID, 'xpLog') ?? [];
}

function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function percent(value, max) {
    if (!max || max <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((toNumber(value) / max) * 100)));
}

export function buildCharacteristics(actor) {
    return CHARACTERISTIC_ORDER.filter((key) => actor.characteristics[key]).map((key) => {
        const c = actor.characteristics[key];
        // The form fields must show the stored values: actor.characteristics already contains Active Effects
        // (e.g. Unnatural from a sustained power), and saving those back would make them permanent.
        const stored = actor._source?.system?.characteristics?.[key] ?? c;
        const tens = Math.floor(toNumber(c.total) / 10);
        return {
            key,
            short: c.short,
            label: c.label,
            base: stored.base,
            advance: stored.advance,
            advanceLabel: CHARACTERISTIC_ADVANCE_LEVELS[stored.advance] ?? stored.advance,
            advancePips: Array.from({ length: MAX_CHARACTERISTIC_PIPS }, (_, i) => i < toNumber(stored.advance)),
            modifier: stored.modifier,
            unnatural: stored.unnatural,
            effectiveUnnatural: c.unnatural,
            fromEffects: toNumber(c.unnatural) !== toNumber(stored.unnatural) || toNumber(c.modifier) !== toNumber(stored.modifier),
            total: c.total,
            bonus: c.bonus,
            bonusText: `${tens} (tens digit)${toNumber(c.unnatural) ? ` + ${toNumber(c.unnatural)} (unnatural)` : ''}`,
            hasBonus: !!c.has_bonus,
            hasNegative: !!c.has_negative,
        };
    });
}

export function buildResources(actor) {
    const s = actor.system;
    return [
        {
            id: 'wounds',
            label: 'Wounds',
            valuePath: 'system.wounds.value',
            value: s.wounds.value,
            maxPath: 'system.wounds.max',
            max: s.wounds.max,
            derived: !!s.wounds.derived,
            breakdown: s.wounds.breakdown ?? '',
            modifier: Number(s.wounds.modifier) || 0,
            pct: percent(s.wounds.value, s.wounds.max),
            bar: woundBar(s.wounds.value, s.wounds.max, s.wounds.critical, actor.characteristics.toughness?.woundBonus ?? actor.characteristics.toughness?.bonus),
            tone: 'wounds',
            note: s.wounds.critical ? `Critical: ${s.wounds.critical}` : '',
        },
        {
            id: 'fatigue',
            label: 'Fatigue',
            valuePath: 'system.fatigue.value',
            value: s.fatigue.value,
            max: s.fatigue.max,
            pct: percent(s.fatigue.value, s.fatigue.max),
            tone: 'fatigue',
            note: '',
        },
        {
            id: 'fate',
            label: 'Fate',
            valuePath: 'system.fate.value',
            value: s.fate.value,
            maxPath: 'system.fate.max',
            max: s.fate.max,
            pct: percent(s.fate.value, s.fate.max),
            tone: 'fate',
            note: '',
            pips: s.fate.max > 0 && s.fate.max <= 12 ? Array.from({ length: s.fate.max }, (_, i) => ({ level: i + 1, filled: i < s.fate.value })) : null,
        },
        {
            id: 'corruption',
            label: 'Corruption',
            valuePath: 'system.corruption',
            value: s.corruption,
            pct: 0,
            tone: 'corruption',
            note: `Bonus: ${s.corruptionBonus ?? 0}`,
        },
        {
            id: 'insanity',
            label: 'Insanity',
            valuePath: 'system.insanity',
            value: s.insanity,
            pct: 0,
            tone: 'insanity',
            note: `Bonus: ${s.insanityBonus ?? 0}`,
        },
    ];
}

/**
 * Flat list of all basic skills and all "taken" specialities.
 */
/** Facts for the fold-out of a skill: aptitudes, next advance with its price, description if the data has one */
function skillDetail(actor, skillKey, specKey) {
    const q = skillQuote(actor, skillKey, specKey);
    return {
        specialist: !!actor.skills[skillKey]?.isSpecialist,
        aptitudes: q.required.join(' + '),
        matches: q.matches,
        next: q.maxed ? 'Maximum' : q.advanceable ? `${q.fromName} → ${q.toName}` : '',
        cost: q.maxed || !q.advanceable ? null : q.cost,
        description: SKILL_DESCRIPTIONS[skillKey] ?? '',
    };
}

export function buildSkills(actor) {
    const favorites = getFavoriteSkills(actor);
    const charIndex = (short) => CHARACTERISTIC_ORDER.findIndex((k) => actor.characteristics[k]?.short === short);
    const rows = [];

    const makeRow = ({ id, skillKey, specKey, label, skill, basePath }) => {
        const short = skill.characteristic || skill.characteristics?.[0] || '';
        const advance = toNumber(skill.advance);
        return {
            id,
            skillKey,
            specKey,
            label,
            characteristic: short,
            charOrder: charIndex(short),
            advance,
            training: TRAINING_LEVELS[advance] ?? advance,
            trainingBonus: actor._skillAdvanceToValue(advance),
            total: skill.current,
            trained: advance >= 1,
            pips: [1, 2, 3, 4].map((level) => ({ level, filled: advance >= level, label: TRAINING_PIP_LABELS[level] })),
            favorite: favorites.includes(id),
            advancePath: `${basePath}.advance`,
            charPath: specKey ? null : `${basePath}.characteristic`,
            characteristicOptions: skill.characteristics ?? [],
            cost: skill.cost,
            detail: skillDetail(actor, skillKey, specKey),
        };
    };

    for (const [skillKey, skill] of Object.entries(actor.skills)) {
        if (!skill.isSpecialist) {
            rows.push(makeRow({ id: skillKey, skillKey, label: skill.label, skill, basePath: `system.skills.${skillKey}` }));
        } else {
            for (const [specKey, spec] of Object.entries(skill.specialities ?? {})) {
                if (!spec.taken) continue;
                rows.push(
                    makeRow({
                        id: `${skillKey}:${specKey}`,
                        skillKey,
                        specKey,
                        label: `${skill.label}: ${spec.label}`,
                        skill: { ...spec, characteristic: skill.characteristic, characteristics: skill.characteristics },
                        basePath: `system.skills.${skillKey}.specialities.${specKey}`,
                    }),
                );
            }
        }
    }
    const sorted = [...rows].sort((a, b) => a.label.localeCompare(b.label));
    sorted.forEach((row, i) => (row.nameOrder = i));
    return rows.map((r) => ({ ...r, nameOrder: sorted.findIndex((s) => s.id === r.id) }));
}

export function buildSpecialistGroups(actor) {
    return Object.entries(actor.skills)
        .filter(([, skill]) => skill.isSpecialist)
        .map(([skillKey, skill]) => ({
            skillKey,
            label: skill.label,
            specialities: Object.entries(skill.specialities ?? {}).map(([specKey, spec]) => ({
                key: specKey,
                label: spec.label,
                taken: !!spec.taken,
                path: `system.skills.${skillKey}.specialities.${specKey}.taken`,
            })),
        }));
}

export function buildQuickSkills(actor, skills) {
    const favorites = getFavoriteSkills(actor);
    return favorites.map((id) => skills.find((s) => s.id === id)).filter(Boolean);
}

export function buildWeapons(actor) {
    return actor.items
        .filter((item) => item.isWeapon)
        .map((item) => {
            const sys = item.system;
            const rof = sys.rateOfFire ?? {};
            const specials = [...(item.items ?? [])]
                .filter((n) => n.type === 'attackSpecial')
                .map((n) => (n.system.hasLevel && n.system.level ? `${n.name} (${n.system.level})` : n.name));
            return {
                id: item.id,
                name: item.name,
                img: item.img,
                class: sys.class,
                type: sys.type,
                isRanged: item.isRanged,
                range: item.isMelee ? '—' : sys.range || '—',
                damage: sys.damage,
                damageType: sys.damageType,
                penetration: sys.penetration ?? 0,
                rateOfFire: item.isMelee ? '—' : `${rof.single ?? 0}/${rof.burst ?? 0}/${rof.full ?? 0}`,
                usesAmmo: item.usesAmmo,
                clipValue: sys.clip?.value ?? 0,
                clipMax: sys.clip?.max ?? 0,
                reload: sys.reload,
                specials,
                equipped: item.equipped,
            };
        });
}

export function buildArmour(actor) {
    return ARMOUR_ZONES.map(([key, label]) => {
        const zone = actor.armour[key];
        return {
            key,
            label,
            armour: zone.value,
            toughnessBonus: zone.toughnessBonus,
            traitBonus: zone.traitBonus,
            total: zone.total,
        };
    });
}

/** Worn armour as list entries: name and the armour points per body part */
export function buildEquippedArmour(actor) {
    return actor.items
        .filter((item) => item.type === 'armour' && item.equipped && !item.isNestedItem?.())
        .map((item) => {
            const ap = item.system.armourPoints ?? {};
            const parts = ARMOUR_ZONES.map(([key, label]) => ({ label, value: toNumber(ap[key]) })).filter((p) => p.value > 0);
            return {
                id: item.id,
                name: item.name,
                img: item.img,
                summary: parts.map((p) => `${p.label} ${p.value}`).join(' · ') || 'no armour points',
            };
        });
}

export function buildGear(actor) {
    const groups = GEAR_GROUPS.map((group) => ({
        ...group,
        items: actor.items
            .filter((item) => group.types.includes(item.type) && !item.isNestedItem?.())
            .map((item) => ({
                id: item.id,
                name: item.name,
                img: item.img,
                type: item.type,
                weight: item.totalWeight,
                equipped: item.equipped,
                canEquip: ['weapon', 'armour', 'forceField', 'cybernetic'].includes(item.type) || 'equipped' in item.system,
                inBackpack: item.isInBackpack,
                craftsmanship: item.system.craftsmanship,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
    }));
    const enc = actor.encumbrance;
    return {
        groups: groups.filter((g) => g.items.length),
        allGroups: GEAR_GROUPS.map((g) => ({ id: g.id, label: g.label })),
        encumbrance: {
            value: Math.round(enc.value * 100) / 100,
            max: enc.max,
            pct: percent(enc.value, enc.max),
            encumbered: enc.encumbered,
        },
    };
}

export async function buildTalentsAndTraits(actor) {
    const enrich = (text, item) =>
        foundry.applications.ux.TextEditor.implementation.enrichHTML(text ?? '', {
            rollData: { actor, item, pr: actor.psy?.rating },
        });

    const talents = [];
    for (const item of actor.items.filter((i) => i.isTalent)) {
        talents.push({
            id: item.id,
            name: item.name,
            tier: item.system.tier,
            cost: item.system.cost,
            prerequisites: item.system.prerequisites,
            aptitudes: item.system.aptitudes,
            benefit: await enrich(item.system.benefit || item.system.description, item),
        });
    }
    talents.sort((a, b) => a.name.localeCompare(b.name));

    const traits = [];
    for (const item of actor.items.filter((i) => i.isTrait)) {
        traits.push({
            id: item.id,
            name: item.name,
            level: item.system.level,
            description: await enrich(item.system.description, item),
        });
    }
    traits.sort((a, b) => a.name.localeCompare(b.name));

    const aptitudes = actor.items
        .filter((i) => i.isAptitude)
        .map((i) => ({ id: i.id, name: i.name, img: i.img }))
        .sort((a, b) => a.name.localeCompare(b.name));

    return {
        talents,
        traits,
        aptitudes,
        abilities: actor.backgroundEffects?.abilities ?? [],
    };
}

const DISCIPLINE_ICONS = {
    Biomancy: 'fa-shield-halved',
    Telepathy: 'fa-eye',
    Telekinesis: 'fa-bolt',
    Pyromancy: 'fa-fire',
    Divination: 'fa-eye',
    'Void Frost': 'fa-snowflake',
    Minor: 'fa-eye',
    default: 'fa-wand-sparkles',
};

export function buildPsychic(actor) {
    const psy = actor.psy;
    const powers = actor.items
        .filter((i) => i.isPsychicPower)
        .map((item) => ({
            id: item.id,
            name: item.name,
            discipline: item.system.discipline,
            cost: item.system.cost,
            action: item.system.action,
            subtype: item.system.subtype,
            sustained: item.system.sustained,
            range: item.system.range,
            prerequisite: item.system.prerequisite,
            damage: item.system.damage,
            penetration: item.system.penetration,
            attackType: item.system.attackType,
            icon: DISCIPLINE_ICONS[item.system.discipline] ?? DISCIPLINE_ICONS.default,
            subtitle: item.system.sustained && item.system.sustained !== 'No' ? 'Sustained' : (item.system.damage && item.system.damage !== 0 && item.system.damage !== '0' ? 'Attack' : (item.system.subtype ?? '')),
            hasEffect: hasEffect(item),
            effectLine: effectLine(item),
            canSustain: canSustain(item),
            activatable: canSustain(item) || hasEffect(item),
            active: !!item.getFlag(SYSTEM_ID, 'sustainedActive') || actor.effects.some((e) => e.getFlag(SYSTEM_ID, 'psyEffect')?.powerId === item.id),
            isAttack: !!item.system.damage && item.system.damage !== 0 && item.system.damage !== '0',
        }))
        .sort((a, b) => (a.discipline ?? '').localeCompare(b.discipline ?? '') || a.name.localeCompare(b.name));
    const disciplines = [...new Set(powers.map((p) => p.discipline).filter(Boolean))];
    const sustainedPowers = buildSustainedPowers(actor, powers);
    return {
        sustainedPowers,
        hasSustained: sustainedPowers.length > 0,
        rating: psy.rating,
        current: psy.currentRating,
        sustained: psy.sustained,
        class: psy.class,
        hasFocus: psy.hasFocus,
        isPsyker: psy.rating > 0 || powers.length > 0,
        powers,
        disciplines,
    };
}

/**
 * The powers that are currently sustained, in the order they are listed on the sheet.
 * `effectText` shows what the power changes at the psy rating it was manifested with.
 */
export function buildSustainedPowers(actor, powers) {
    return powers
        .filter((p) => p.active)
        .map((p) => {
            const item = actor.items.get(p.id);
            const effect = actor.effects.find((e) => e.getFlag(SYSTEM_ID, 'psyEffect')?.powerId === p.id);
            const pr = effect?.getFlag(SYSTEM_ID, 'psyEffect')?.pr ?? actor.psy.rating;
            return {
                id: p.id,
                name: p.name,
                discipline: p.discipline,
                sustainAction: p.sustained,
                pr,
                effectText: p.hasEffect && item ? describeEffects(item, pr) : '',
            };
        });
}

export function buildDevelopment(actor) {
    const xp = actor.experience ?? {};
    const log = getExperienceLog(actor)
        .slice()
        .sort((a, b) => b.timestamp - a.timestamp)
        .map((entry) => ({
            ...entry,
            date: new Date(entry.timestamp).toLocaleString(game.i18n.lang),
            isSpend: entry.type === 'spend',
        }));
    return {
        total: xp.total ?? 0,
        used: xp.used ?? 0,
        available: xp.available ?? (xp.total ?? 0) - (xp.used ?? 0),
        calculatedTotal: xp.calculatedTotal ?? 0,
        spentCharacteristics: xp.spentCharacteristics ?? 0,
        spentSkills: xp.spentSkills ?? 0,
        spentTalents: xp.spentTalents ?? 0,
        spentPsychicPowers: xp.spentPsychicPowers ?? 0,
        pct: percent(xp.used, xp.total),
        mismatch: (xp.calculatedTotal ?? 0) !== (xp.used ?? 0),
        log,
    };
}

export function buildRelations(actor) {
    const map = (item) => ({ id: item.id, name: item.name, img: item.img, type: item.type });
    return {
        peers: actor.items.filter((i) => i.type === 'peer').map(map),
        enemies: actor.items.filter((i) => i.type === 'enemy').map(map),
        journal: actor.items.filter((i) => i.type === 'journalEntry').map(map),
    };
}

export function buildCombatProfile(actor, skills) {
    const find = (id) => skills.find((s) => s.id === id);
    const c = actor.characteristics;
    return {
        initiativeBase: actor.initiative.base,
        initiativeBonus: actor.initiative.bonus,
        initiativeCharacteristic: c[actor.initiative.characteristic]?.short,
        movement: actor.movement,
        dodge: find('dodge')?.total,
        parry: find('parry')?.total,
        strengthBonus: c.strength.bonus,
        toughnessBonus: c.toughness.bonus,
        weaponSkill: c.weaponSkill.total,
        ballisticSkill: c.ballisticSkill.total,
        wounds: actor.wounds,
        size: actor.size,
    };
}

export function buildCriticalInjuries(actor) {
    return actor.items
        .filter((i) => i.type === 'criticalInjury')
        .map((i) => ({ id: i.id, name: i.name, img: i.img, part: i.system.part, type: i.system.type }));
}

/**
 * Overview of the next advance of every characteristic and skill with aptitudes, matches and price.
 * The calculation lives in rules/advancement.mjs; this only shapes it for the template.
 */
export function buildProgression(actor) {
    const quotes = buildQuotes(actor);
    const shape = (q) => ({
        kind: q.kind,
        key: q.key,
        label: q.label,
        short: q.short ?? q.label,
        from: q.fromName,
        to: q.toName,
        maxed: q.maxed,
        advanceable: q.advanceable && !q.maxed,
        cost: q.cost,
        matches: q.matches,
        required: q.required.join(' + '),
        detail: describeQuote(q),
    });
    return {
        characteristics: quotes.characteristics.map(shape),
        skills: quotes.skills.map(shape),
        aptitudes: quotes.aptitudes,
    };
}

/**
 * The four counters next to the characteristics. The value is shown inside the symbol, the maximum (where there is
 * one) stays in the data and is only shown as tooltip.
 */
export function buildStatusTiles(actor) {
    const r = Object.fromEntries(buildResources(actor).map((res) => [res.id, res]));
    const withMax = (res, label) => `${label} ${res.value}${res.max ? ' / ' + res.max : ''}`;
    return [
        { id: 'fatigue', label: 'Fatigue', path: 'system.fatigue.value', value: r.fatigue.value, max: r.fatigue.max, tooltip: withMax(r.fatigue, 'Fatigue') },
        {
            id: 'fate',
            label: 'Fate',
            path: 'system.fate.value',
            value: r.fate.value,
            max: r.fate.max,
            maxPath: 'system.fate.max',
            tooltip: withMax(r.fate, 'Fate'),
        },
        { id: 'corruption', label: 'Corruption', path: 'system.corruption', value: r.corruption.value, max: null, tooltip: `Corruption ${r.corruption.value} · ${r.corruption.note}` },
        { id: 'insanity', label: 'Insanity', path: 'system.insanity', value: r.insanity.value, max: null, tooltip: `Insanity ${r.insanity.value} · ${r.insanity.note}` },
    ];
}

/** Enriched description of every power (inline rolls like [[@pr/2]] use the psy rating of the actor) */
export async function enrichPowerDescriptions(actor, powers) {
    const enrich = foundry.applications.ux.TextEditor.implementation.enrichHTML;
    for (const p of powers) {
        const item = actor.items.get(p.id);
        p.descriptionHtml = await enrich(item?.system?.description ?? '', { rollData: { actor, item, pr: actor.psy?.rating ?? 0 } });
    }
}
