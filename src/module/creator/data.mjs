/**
 * Character creation rules of the Dark Heresy 2E core rulebook (source id "dh2-core") as structured data.
 * No UI and no Foundry code in here. Descriptions and bonus texts are taken from the rule files that already
 * exist in the system (rules/homeworlds.mjs, backgrounds.mjs, roles.mjs, divinations.mjs) so there is only one text.
 *
 * Choice schema (used by home worlds, backgrounds, roles ...):
 *   { id, type: 'choose-one' | 'specialization' | 'aptitude' | 'talent-spec', options: [...], required: true }
 * The selected value is stored in draft.choices[id].
 *
 * Ids follow "<kind>.<slug>", e.g. "homeworld.feral", "background.adeptus-mechanicus", "role.mystic".
 */
import { homeworlds } from '../rules/homeworlds.mjs';
import { backgrounds } from '../rules/backgrounds.mjs';
import { roles } from '../rules/roles.mjs';

export const SOURCE_CORE = 'dh2-core';

export const DEFAULT_STARTING_XP = 1000;
export const POINT_BUY = { base: 25, positive: 30, negative: 20, points: 60, max: 40 };
export const BASE_ROLL = 20;
export const VETERAN_BASE_ROLL = 25;

export const CHARACTERISTICS = [
    ['weaponSkill', 'Weapon Skill', 'WS'],
    ['ballisticSkill', 'Ballistic Skill', 'BS'],
    ['strength', 'Strength', 'S'],
    ['toughness', 'Toughness', 'T'],
    ['agility', 'Agility', 'Ag'],
    ['intelligence', 'Intelligence', 'Int'],
    ['perception', 'Perception', 'Per'],
    ['willpower', 'Willpower', 'WP'],
    ['fellowship', 'Fellowship', 'Fel'],
    ['influence', 'Influence', 'Inf'],
].map(([key, label, short]) => ({ key, label, short }));

export const CHARACTERISTIC_KEYS = CHARACTERISTICS.map((c) => c.key);

/** "Weapon Skill" -> "weaponSkill" */
export function characteristicKey(name) {
    const flat = String(name ?? '').toLowerCase().replace(/[^a-z]/g, '');
    return CHARACTERISTIC_KEYS.find((k) => k.toLowerCase() === flat) ?? null;
}

const slug = (name) =>
    String(name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

/**
 * Home worlds of the core rulebook. Numbers come from the specification (wounds differ from the older system
 * data: Hive World 8+1d5, Shrine World 7+1d5 - the rules/homeworlds.mjs values were corrected to match).
 * `recommendedBackgrounds` is empty: the rulebook text is not part of the system data (see docs).
 * `bonusMechanic`: 'A' existing mechanic, 'B' new mechanic needed, 'C' visible rule entry only.
 */
export const HOMEWORLD_DEFS = [
    ['Feral World', { description: 'Savage, low-tech planets where only the strong survive.', hint: 'Strong and tough characters; suits warriors and hunters.' }],
    ['Forge World', { description: 'Industrial worlds of the Adeptus Mechanicus.', hint: 'Intelligent and tough characters; suits technology-minded roles.' }],
    ['Highborn', { description: 'The nobility of the Imperium, born to privilege and influence.', hint: 'Charismatic, influential characters; weak constitution.' }],
    ['Hive World', { description: 'Gigantic cities of billions, spires above and slums below.', hint: 'Agile and perceptive characters; suited to alert, mobile roles.' }],
    ['Shrine World', { description: 'Planets devoted to the worship of the God-Emperor.', hint: 'Charismatic, strong-willed characters.' }],
    ['Voidborn', { description: 'Born on ships and stations between the stars.', hint: 'Intelligent, strong-willed characters; weak bodies.' }],
].map(([name, text]) => {
    const rule = homeworlds().find((h) => h.name === name);
    const wounds = { 'Feral World': 9, 'Forge World': 8, Highborn: 9, 'Hive World': 8, 'Shrine World': 7, Voidborn: 7 }[name];
    return {
        id: `homeworld.${slug(name)}`,
        source: SOURCE_CORE,
        name,
        ...text,
        positive: rule.bonus_characteristics.map(characteristicKey),
        negative: characteristicKey(rule.negative_characteristic),
        fateThreshold: rule.fate_threshold,
        blessing: rule.emperors_blessing,
        aptitude: rule.aptitude,
        wounds: { base: wounds, dice: '1d5' },
        bonus: { ...rule.home_world_bonus, mechanic: name === 'Forge World' || name === 'Voidborn' ? 'A' : 'C' },
        bookPage: rule.source,
        recommendedBackgrounds: [],
        choices:
            name === 'Forge World'
                ? [{ id: 'hw-talent', type: 'choose-one', label: "Omnissiah's Chosen: talent", options: [{ talent: 'Technical Knock' }, { talent: 'Weapon-Tech' }], required: true }]
                : [],
        talents: name === 'Voidborn' ? [{ talent: 'Strong Minded' }] : [],
    };
});

/** skill label -> skill key of the actor ("Tech-Use" -> "techUse") */
export function skillKey(name) {
    const flat = String(name).toLowerCase().replace(/[^a-z]/g, '');
    return SKILL_KEYS.find((k) => k.toLowerCase() === flat) ?? null;
}
const SKILL_KEYS = [
    'acrobatics', 'athletics', 'awareness', 'charm', 'command', 'commerce', 'commonLore', 'deceive', 'dodge', 'forbiddenLore', 'inquiry',
    'interrogation', 'intimidate', 'linguistics', 'logic', 'medicae', 'navigate', 'operate', 'parry', 'psyniscience', 'scholasticLore',
    'scrutiny', 'security', 'sleightOfHand', 'stealth', 'survival', 'techUse', 'trade',
];
/** Speciality names of the rulebook that the actor template spells differently */
const SPEC_ALIASES = { adeptusadministratum: 'administratum' };

/** "High Gothic" -> "highGothic" (the key format of the actor template) */
export function specKey(name) {
    const words = String(name).replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/);
    const key = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join('');
    return SPEC_ALIASES[key.toLowerCase()] ?? key;
}

const S = (skill, spec = null) => ({ skill, ...(spec ? { spec } : {}) });
/** one skill slot with alternatives, or a single fixed skill */
const slot = (id, ...options) => ({ id, options });
const free = (id, option) => ({ id, options: [option], fixed: true });
const pick = (id, label, skill) => ({ id, label, type: 'specialization', skill });

/**
 * Backgrounds. `skills`: slots; a slot with one option is granted, with several options the player chooses.
 * `pick` slots (Scholastic Lore (Pick One)) ask for a speciality. Starting skills are granted at rank "Known".
 * `talents`: { talent, spec } entries or { id, options } choices; `equipment`: groups with alternatives.
 */
export const BACKGROUND_DEFS = [
    {
        name: 'Adeptus Administratum',
        skills: [
            slot('bg-skill-1', S('commerce'), S('medicae')),
            free('bg-skill-2', S('commonLore', 'Adeptus Administratum')),
            free('bg-skill-3', S('linguistics', 'High Gothic')),
            free('bg-skill-4', S('logic')),
            { id: 'bg-skill-5', pick: pick('bg-skill-5', 'Scholastic Lore speciality', 'scholasticLore') },
        ],
        talents: [{ id: 'bg-wt', label: 'Weapon Training', options: [[{ talent: 'Weapon Training', spec: 'Las' }], [{ talent: 'Weapon Training', spec: 'Solid Projectile' }]] }],
        equipment: [
            { id: 'eq-1', options: [['Laspistol'], ['Stub Automatic']] },
            { id: 'eq-2', options: [['Imperial Robes']] },
            { id: 'eq-3', options: [['Autoquill']] },
            { id: 'eq-4', options: [['Chrono']] },
            { id: 'eq-5', options: [['Dataslate']] },
            { id: 'eq-6', options: [['Medi-kit']] },
        ],
        aptitudeChoice: ['Knowledge', 'Social'],
    },
    {
        name: 'Adeptus Arbites',
        skills: [
            free('bg-skill-1', S('awareness')),
            free('bg-skill-2a', S('commonLore', 'Adeptus Arbites')),
            free('bg-skill-2b', S('commonLore', 'Underworld')),
            slot('bg-skill-3', S('inquiry'), S('interrogation')),
            free('bg-skill-4', S('intimidate')),
            free('bg-skill-5', S('scrutiny')),
        ],
        talents: [{ id: 'bg-wt', label: 'Weapon Training', options: [[{ talent: 'Weapon Training', spec: 'Shock' }], [{ talent: 'Weapon Training', spec: 'Solid Projectile' }]] }],
        equipment: [
            { id: 'eq-1', options: [['Shotgun'], ['Shock Maul']] },
            { id: 'eq-2', options: [['Enforcer Light Carapace'], ['Carapace Chestplate']] },
            { id: 'eq-3', options: [['Stimm', 3]] },
            { id: 'eq-4', options: [['Manacles']] },
            { id: 'eq-5', options: [['Lho-Sticks', 12]] },
        ],
        aptitudeChoice: ['Offence', 'Defence'],
    },
    {
        name: 'Adeptus Astra Telepathica',
        skills: [
            free('bg-skill-1', S('awareness')),
            free('bg-skill-2', S('commonLore', 'Adeptus Astra Telepathica')),
            slot('bg-skill-3', S('deceive'), S('interrogation')),
            free('bg-skill-4', S('forbiddenLore', 'The Warp')),
            slot('bg-skill-5', S('psyniscience'), S('scrutiny')),
        ],
        talents: [
            { talent: 'Weapon Training', spec: 'Las' },
            { talent: 'Weapon Training', spec: 'Low-Tech' },
        ],
        // The Sanctioned trait follows from the Psyker elite advance text ("characters without the AAT background are NOT sanctioned")
        traits: [{ trait: 'Sanctioned', note: 'Derived from the Psyker elite advance text of the rulebook (AAT characters are sanctioned).' }],
        equipment: [
            { id: 'eq-1', options: [['Laspistol']] },
            { id: 'eq-2', options: [['Staff'], ['Whip']] },
            { id: 'eq-3', options: [['Flak Cloak'], ['Flak Vest']] },
            { id: 'eq-4', options: [['Micro-bead'], ['Psy Focus']] },
        ],
        aptitudeChoice: ['Defence', 'Psyker'],
    },
    {
        name: 'Adeptus Mechanicus',
        skills: [
            { id: 'bg-skill-1', options: [S('awareness'), { skill: 'operate', pick: true }] },
            free('bg-skill-2', S('commonLore', 'Adeptus Mechanicus')),
            free('bg-skill-3', S('logic')),
            free('bg-skill-4', S('security')),
            free('bg-skill-5', S('techUse')),
        ],
        talents: [
            { talent: 'Mechadendrite Use', spec: 'Utility' },
            { talent: 'Weapon Training', spec: 'Solid Projectile' },
        ],
        traits: [{ trait: 'Mechanicus Implants' }],
        equipment: [
            { id: 'eq-1', options: [['Autogun'], ['Hand Cannon']] },
            { id: 'eq-2', options: [['Monotask Servo-Skull'], ['Mechadendrite']] },
            { id: 'eq-3', options: [['Imperial Robes']] },
            { id: 'eq-4', options: [['Sacred Unguents', 2]] },
        ],
        aptitudeChoice: ['Knowledge', 'Tech'],
    },
    {
        name: 'Adeptus Ministorum',
        skills: [
            free('bg-skill-1', S('charm')),
            free('bg-skill-2', S('command')),
            free('bg-skill-3', S('commonLore', 'Adeptus Ministorum')),
            slot('bg-skill-4', S('inquiry'), S('scrutiny')),
            free('bg-skill-5', S('linguistics', 'High Gothic')),
        ],
        talents: [
            {
                id: 'bg-wt',
                label: 'Weapon Training',
                options: [
                    [{ talent: 'Weapon Training', spec: 'Flame' }],
                    [
                        { talent: 'Weapon Training', spec: 'Low-Tech' },
                        { talent: 'Weapon Training', spec: 'Solid Projectile' },
                    ],
                ],
            },
        ],
        equipment: [
            { id: 'eq-1', options: [['Hand Flamer'], ['Warhammer', 'Stub Revolver']] },
            { id: 'eq-2', options: [['Imperial Robes'], ['Flak Vest']] },
            { id: 'eq-3', options: [['Backpack']] },
            { id: 'eq-4', options: [['Glow-Globe']] },
            { id: 'eq-5', options: [['Monotask Servo-Skull']] },
        ],
        aptitudeChoice: ['Leadership', 'Social'],
    },
    {
        name: 'Imperial Guard',
        skills: [
            free('bg-skill-1', S('athletics')),
            free('bg-skill-2', S('command')),
            free('bg-skill-3', S('commonLore', 'Imperial Guard')),
            { id: 'bg-skill-4', options: [S('medicae'), S('operate', 'Surface')] },
            free('bg-skill-5', S('navigate', 'Surface')),
        ],
        talents: [
            { talent: 'Weapon Training', spec: 'Las' },
            { talent: 'Weapon Training', spec: 'Low-Tech' },
        ],
        equipment: [
            { id: 'eq-1', options: [['Lasgun'], ['Laspistol', 'Sword']] },
            { id: 'eq-2', options: [['Combat Vest']] },
            { id: 'eq-3', options: [['Imperial Guard Flak Armour']] },
            { id: 'eq-4', options: [['Grapnel and Line']] },
            { id: 'eq-5', options: [['Lho-Sticks', 12]] },
            { id: 'eq-6', options: [['Magnoculars']] },
        ],
        aptitudeChoice: ['Fieldcraft', 'Leadership'],
    },
    {
        name: 'Outcast',
        skills: [
            slot('bg-skill-1', S('acrobatics'), S('sleightOfHand')),
            free('bg-skill-2', S('commonLore', 'Underworld')),
            free('bg-skill-3', S('deceive')),
            free('bg-skill-4', S('dodge')),
            free('bg-skill-5', S('stealth')),
        ],
        talents: [
            { talent: 'Weapon Training', spec: 'Chain' },
            { id: 'bg-wt', label: 'Weapon Training', options: [[{ talent: 'Weapon Training', spec: 'Las' }], [{ talent: 'Weapon Training', spec: 'Solid Projectile' }]] },
        ],
        equipment: [
            { id: 'eq-1', options: [['Autopistol'], ['Laspistol']] },
            { id: 'eq-2', options: [['Chainsword']] },
            { id: 'eq-3', options: [['Armoured Bodyglove'], ['Flak Vest']] },
            { id: 'eq-4', options: [['Inhaler/Injector']] },
            { id: 'eq-5', options: [['Obscura', 2], ['Slaught', 2]] },
        ],
        aptitudeChoice: ['Fieldcraft', 'Social'],
    },
].map((def) => {
    const rule = backgrounds().find((b) => b.name === def.name);
    return {
        id: `background.${slug(def.name)}`,
        source: SOURCE_CORE,
        name: def.name,
        bonus: rule.background_bonus,
        bookPage: rule.source,
        recommendedRoles: [],
        traits: [],
        ...def,
    };
});

export const ROLE_DEFS = [
    { name: 'Assassin', talentOptions: [{ talent: 'Jaded' }, { talent: 'Leap Up' }] },
    { name: 'Chirurgeon', talentOptions: [{ talent: 'Resistance', needsSpec: 'Resistance (choose one)' }, { talent: 'Takedown' }] },
    { name: 'Desperado', talentOptions: [{ talent: 'Catfall' }, { talent: 'Quick Draw' }] },
    { name: 'Hierophant', talentOptions: [{ talent: 'Double Team' }, { talent: 'Hatred', needsSpec: 'Hatred (choose a target)' }] },
    { name: 'Mystic', talentOptions: [{ talent: 'Resistance', spec: 'Psychic Powers' }, { talent: 'Warp Sense' }], grantsElite: 'Psyker' },
    { name: 'Sage', talentOptions: [{ talent: 'Ambidextrous' }, { talent: 'Clues from the Crowds' }] },
    { name: 'Seeker', talentOptions: [{ talent: 'Keen Intuition' }, { talent: 'Disarm' }] },
    { name: 'Warrior', talentOptions: [{ talent: 'Iron Jaw' }, { talent: 'Rapid Reload' }] },
].map((def) => {
    const rule = roles().find((r) => r.name === def.name);
    return {
        id: `role.${slug(def.name)}`,
        source: SOURCE_CORE,
        name: def.name,
        // Assassin: "Ballistic Skill or Weapon Skill" is a choice between two aptitudes
        aptitudes: rule.role_aptitudes,
        bonus: rule.role_bonus,
        bookPage: rule.source,
        ...def,
    };
});

export const HOMEWORLDS = HOMEWORLD_DEFS;
export const BACKGROUNDS = BACKGROUND_DEFS;
export const ROLES = ROLE_DEFS;

export const byId = (list, id) => list.find((d) => d.id === id) ?? null;
