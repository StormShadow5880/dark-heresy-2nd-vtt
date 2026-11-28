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
import { isDlc } from '../rules/sources.mjs';

export const SOURCE_CORE = 'dh2-core';
/** Expansion books (Enemies Within, Without, Beyond, Forgotten Gods): marked as DLC in the wizard */
export const SOURCE_EXPANSION = 'dh2-expansion';

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
        skills: [],
        traits: [],
        consequences: [],
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
        consequences: [],
        corruption: 0,
        traitChoice: null,
        ...def,
    };
});

/**
 * Backgrounds of the expansion books (DLC), built from the same data as the core backgrounds. Special rules that need a roll or a
 * decision (the Mutant's mutations and corruption, the Exorcised's malignancy) are shown as the bonus text, they are not rolled here.
 */
export const EXPANSION_BACKGROUND_DEFS = [
    {
        name: 'Adepta Sororitas',
        skills: [
            free('bg-skill-1', S('athletics')),
            slot('bg-skill-2', S('charm'), S('intimidate')),
            free('bg-skill-3', S('commonLore', 'Adepta Sororitas')),
            free('bg-skill-4', S('linguistics', 'High Gothic')),
            slot('bg-skill-5', S('medicae'), S('parry')),
        ],
        talents: [
            {
                id: 'bg-wt',
                label: 'Weapon Training',
                options: [
                    [{ talent: 'Weapon Training', spec: 'Flame' }, { talent: 'Weapon Training', spec: 'Chain' }],
                    [{ talent: 'Weapon Training', spec: 'Las' }, { talent: 'Weapon Training', spec: 'Chain' }],
                ],
            },
        ],
        equipment: [
            { id: 'eq-1', options: [['Hand Flamer'], ['Laspistol']] },
            { id: 'eq-2', options: [['Chainblade']] },
            { id: 'eq-3', options: [['Armoured Bodyglove']] },
            { id: 'eq-4', options: [['Chrono']] },
            { id: 'eq-5', options: [['Dataslate']] },
            { id: 'eq-6', options: [['Stablight']] },
            { id: 'eq-7', options: [['Micro-bead']] },
        ],
        aptitudeChoice: ['Offence', 'Social'],
    },
    {
        name: 'Mutant',
        skills: [
            slot('bg-skill-1', S('acrobatics'), S('athletics')),
            free('bg-skill-2', S('awareness')),
            slot('bg-skill-3', S('deceive'), S('intimidate')),
            free('bg-skill-4', S('forbiddenLore', 'Mutants')),
            free('bg-skill-5', S('survival')),
        ],
        talents: [
            { talent: 'Weapon Training', spec: 'Low-Tech' },
            { talent: 'Weapon Training', spec: 'Solid Projectile' },
        ],
        equipment: [
            { id: 'eq-1', options: [['Shotgun'], ['Stub Revolver', 'Great Weapon']] },
            { id: 'eq-2', options: [['Grapnel and Line']] },
            { id: 'eq-3', options: [['Heavy Leathers']] },
            { id: 'eq-4', options: [['Combat Vest']] },
            { id: 'eq-5', options: [['Stimm', 2]] },
        ],
        aptitudeChoice: ['Fieldcraft', 'Offence'],
        // The Mutant: 10 starting Corruption, ONE starting trait of the list (chosen in the wizard, given when the character is finished, in
        // addition to the starting mutation), and a starting mutation: 5d10 summed and looked up on Table 8-16 (this start rule replaces the
        // normal handling of mutation and malignancy for this step). "Twisted Flesh" (the background ability) is separate and later.
        corruption: 10,
        traitChoice: {
            id: 'bg-mutant-trait',
            label: 'Mutant: starting trait (choose one)',
            options: [
                { trait: 'Amphibious' },
                { trait: 'Dark-sight' },
                { trait: 'Natural Weapons' },
                { trait: 'Sonar Sense' },
                { trait: 'Sturdy' },
                { trait: 'Toxic', level: 1 },
                { trait: 'Unnatural Agility', level: 1 },
                { trait: 'Unnatural Strength', level: 1 },
                { trait: 'Unnatural Toughness', level: 1 },
            ],
        },
        consequences: [
            {
                id: 'mutation',
                kind: 'roll',
                formula: '5d10',
                label: 'Starting mutation: roll 5d10 and sum it, then look the result up on Table 8-16: Mutations (this start rule replaces the normal handling of mutation and malignancy)',
                tableMissing: 'the concrete mutation from Table 8-16 is open: the table is not part of the system data (it belongs to the private import package); the 5d10 result is saved',
            },
        ],
    },
    {
        name: 'Heretek',
        skills: [
            slot('bg-skill-1', S('deceive'), S('inquiry')),
            { id: 'bg-skill-2', pick: pick('bg-skill-2', 'Forbidden Lore speciality', 'forbiddenLore') },
            slot('bg-skill-3', S('medicae'), S('security')),
            free('bg-skill-4', S('techUse')),
            { id: 'bg-skill-5', pick: pick('bg-skill-5', 'Trade speciality', 'trade') },
        ],
        talents: [{ talent: 'Weapon Training', spec: 'Solid Projectile' }],
        traits: [{ trait: 'Mechanicus Implants' }],
        equipment: [
            { id: 'eq-1', options: [['Stub Revolver', 'Expander Bullets', 2], ['Stub Revolver', 'Man-Stopper Rounds', 2]] },
            { id: 'eq-2', options: [['Web Grenade']] },
            { id: 'eq-3', options: [['Combi-tool']] },
            { id: 'eq-4', options: [['Flak Cloak']] },
            { id: 'eq-5', options: [['Filtration Plugs']] },
            { id: 'eq-6', options: [['De-tox']] },
            { id: 'eq-7', options: [['Dataslate']] },
            { id: 'eq-8', options: [['Stablight']] },
        ],
        aptitudeChoice: ['Finesse', 'Tech'],
    },
    {
        name: 'Imperial Navy',
        skills: [
            free('bg-skill-1', S('athletics')),
            slot('bg-skill-2', S('command'), S('intimidate')),
            free('bg-skill-3', S('commonLore', 'Imperial Navy')),
            free('bg-skill-4', S('navigate', 'Stellar')),
            slot('bg-skill-5', S('operate', 'Aeronautica'), S('operate', 'Voidship')),
        ],
        talents: [
            {
                id: 'bg-wt',
                label: 'Weapon Training',
                options: [
                    [{ talent: 'Weapon Training', spec: 'Chain' }, { talent: 'Weapon Training', spec: 'Solid Projectile' }],
                    [{ talent: 'Weapon Training', spec: 'Shock' }, { talent: 'Weapon Training', spec: 'Solid Projectile' }],
                ],
            },
        ],
        equipment: [
            { id: 'eq-1', options: [['Combat Shotgun'], ['Hand Cannon']] },
            { id: 'eq-2', options: [['Chainsword'], ['Shock Whip']] },
            { id: 'eq-3', options: [['Flak Coat']] },
            { id: 'eq-4', options: [['Rebreather']] },
            { id: 'eq-5', options: [['Micro-bead']] },
        ],
        aptitudeChoice: ['Offence', 'Tech'],
    },
    {
        name: 'Rogue Trader',
        skills: [
            slot('bg-skill-1', S('charm'), S('scrutiny')),
            free('bg-skill-2', S('commerce')),
            free('bg-skill-3', S('commonLore', 'Rogue Traders')),
            { id: 'bg-skill-4', pick: pick('bg-skill-4', 'Alien language', 'linguistics') },
            slot('bg-skill-5', S('operate', 'Surface'), S('operate', 'Aeronautica')),
        ],
        talents: [
            {
                id: 'bg-wt',
                label: 'Weapon Training',
                options: [
                    [{ talent: 'Weapon Training', spec: 'Las' }, { talent: 'Weapon Training', spec: 'Shock' }],
                    [{ talent: 'Weapon Training', spec: 'Solid Projectile' }, { talent: 'Weapon Training', spec: 'Shock' }],
                ],
            },
        ],
        equipment: [
            { id: 'eq-1', options: [['Laspistol'], ['Autopistol']] },
            { id: 'eq-2', options: [['Shock Maul']] },
            { id: 'eq-3', options: [['Mesh Cloak'], ['Carapace Chestplate']] },
            { id: 'eq-4', options: [['Auspex']] },
            { id: 'eq-5', options: [['Chrono']] },
        ],
        aptitudeChoice: ['Finesse', 'Social'],
    },
    {
        name: 'Exorcised',
        skills: [
            free('bg-skill-1', S('awareness')),
            slot('bg-skill-2', S('deceive'), S('inquiry')),
            free('bg-skill-3', S('dodge')),
            free('bg-skill-4', S('forbiddenLore', 'Daemonology')),
            slot('bg-skill-5', S('intimidate'), S('scrutiny')),
        ],
        talents: [
            { talent: 'Hatred', spec: 'Daemons' },
            { talent: 'Weapon Training', spec: 'Solid Projectile' },
            { talent: 'Weapon Training', spec: 'Chain' },
        ],
        equipment: [
            { id: 'eq-1', options: [['Autopistol'], ['Stub Revolver']] },
            { id: 'eq-2', options: [['Shotgun']] },
            { id: 'eq-3', options: [['Chainblade']] },
            { id: 'eq-4', options: [['Imperial Robes']] },
            { id: 'eq-5', options: [['Obscura', 3], ['Tranq', 3]] },
            { id: 'eq-6', options: [['Disguise Kit'], ['Excruciator Kit']] },
            { id: 'eq-7', options: [['Rebreather']] },
            { id: 'eq-8', options: [['Stablight'], ['Glow-Globe']] },
        ],
        aptitudeChoice: ['Defence', 'Knowledge'],
        consequences: [{ id: 'malignancy', kind: 'choice', label: 'One Malignancy (Core Rulebook Table 8-15)', blocked: 'the malignancy table is not part of the system data (it belongs to the private import package)' }],
    },
].map((def) => {
    const rule = backgrounds().find((b) => b.name === def.name);
    return {
        id: `background.${slug(def.name)}`,
        source: SOURCE_EXPANSION,
        name: def.name,
        bonus: rule.background_bonus,
        bookPage: rule.source,
        recommendedRoles: [],
        traits: [],
        consequences: [],
        corruption: 0,
        traitChoice: null,
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

/** Roles of the expansion books (DLC) */
export const EXPANSION_ROLE_DEFS = [
    { name: 'Fanatic', talentOptions: [{ talent: 'Deny the Witch' }, { talent: 'Jaded' }] },
    { name: 'Penitent', talentOptions: [{ talent: 'Die Hard' }, { talent: 'Flagellant' }] },
    { name: 'Ace', talentOptions: [{ talent: 'Hard Target' }, { talent: 'Hotshot Pilot' }] },
    { name: 'Crusader', talentOptions: [{ talent: 'Bodyguard' }, { talent: 'Deny the Witch' }] },
].map((def) => {
    const rule = roles().find((r) => r.name === def.name);
    return {
        id: `role.${slug(def.name)}`,
        source: SOURCE_EXPANSION,
        name: def.name,
        aptitudes: rule.role_aptitudes,
        bonus: rule.role_bonus,
        bookPage: rule.source,
        ...def,
    };
});

/**
 * Home worlds of the expansion books (DLC): the nine archetypes and the specific locations, built from rules/homeworlds.mjs.
 * Starting talents that the bonus text names without a choice are granted; skills, traits and rolls of the bonus text are shown as
 * the bonus text only (the wizard has no way to grant them from a home world).
 */
const EXPANSION_HOMEWORLD_TALENTS = {
    Temperance: [{ talent: 'Weapon Training', spec: 'Flame' }],
    Rund: [{ talent: 'Hatred', spec: 'Heretics' }],
    "The Emperor's Song": [{ talent: 'Deny the Witch' }],
    'Vouxis Prime': [{ talent: 'Blind Fighting' }],
    Pellenne: [{ talent: 'Resistance', spec: 'Radiation' }],
    'Penal Colony': [{ talent: 'Peer', spec: 'Criminal Cartels' }],
};

/**
 * Fixed starting skills of the expansion home worlds (rank 1 unless `ranks` says otherwise), only where the bonus text names them
 * without a choice or a condition. Whether a specific world also gets the starting skills of its parent type is NOT assumed: the
 * data says "mechanics inherited" for characteristics, fate, wounds and aptitude only.
 */
const EXPANSION_HOMEWORLD_SKILLS = {
    Pellenne: [{ skill: 'trade', spec: 'Prospector' }],
    'Port Aquila': [{ skill: 'commerce' }],
    "Snope's World": [{ skill: 'deceive' }, { skill: 'scrutiny' }],
    'Vouxis Prime': [{ skill: 'trade', spec: 'Sculptor', ranks: 2 }],
    'Daemon World': [{ skill: 'psyniscience' }],
    'Penal Colony': [{ skill: 'commonLore', spec: 'Underworld' }, { skill: 'scrutiny' }],
};
const EXPANSION_HOMEWORLD_TRAITS = { 'Agri-World': [{ trait: 'Brutal Charge', level: 2 }] };

/** Choices of an expansion home world: exactly one option is given; an option is a talent or a trait */
const EXPANSION_HOMEWORLD_CHOICES = {
    Pellenne: [
        {
            id: 'hw-hatred-darksight',
            type: 'choose-one',
            label: 'Guard the Pure-blooded: Hatred (Mutants) or Dark-sight',
            options: [{ talent: 'Hatred', spec: 'Mutants' }, { trait: 'Dark-sight' }],
            required: true,
        },
    ],
};

/**
 * Consequences of a home world or background that need a roll, a choice or a decision. kind: 'roll' (formula; with `apply` the result
 * is added to the character), 'choice' (the player chooses), 'manual' (the text says what to do by hand). `blocked` names what is
 * missing to automate it (for example a table that is not part of the system data): the consequence is shown as open in the wizard and
 * in the creation notes instead of pretending it was done.
 */
const EXPANSION_HOMEWORLD_CONSEQUENCES = {
    'Daemon World': [{ id: 'corruption', kind: 'roll', formula: '1d10+5', apply: 'corruption', label: 'Starting Corruption (1d10+5)' }],
    Tuchulcha: [
        { id: 'corruption', kind: 'roll', formula: '3d5', apply: 'corruption', label: 'Starting Corruption (3d5 instead of the usual Daemon World amount)' },
        { id: 'psyniscience', kind: 'manual', label: 'The text does not say whether the Daemon World starting skill (Psyniscience rank 1) applies: decide at the table.' },
    ],
    Kul: [{ id: 'lore-ranks', kind: 'manual', derive: 'kul-lore', label: 'Myth Made Truth: Forbidden Lore (The Warp) and (Daemonology) ranks equal to half the Intelligence Bonus (round down), unless already higher. Calculated once when the character is finished (project decision: Intelligence Bonus at the end of the creation, after the XP purchases)' }],
};

export const EXPANSION_HOMEWORLD_DEFS = homeworlds()
    .filter((h) => isDlc(h.source))
    .map((rule) => {
        const [base, dice] = String(rule.wounds).split('+');
        return {
            id: `homeworld.${slug(rule.name)}`,
            source: SOURCE_EXPANSION,
            name: rule.name,
            // `parent` comes from the data (rules/homeworlds.mjs, the specific locations of the books): the creator groups by it
            parent: rule.parent ?? null,
            description: rule.parent ? `A location of the home world type ${rule.parent}.` : 'A home world of the expansion books.',
            hint: '',
            positive: rule.bonus_characteristics.map(characteristicKey),
            negative: characteristicKey(rule.negative_characteristic),
            fateThreshold: rule.fate_threshold,
            blessing: rule.emperors_blessing,
            aptitude: rule.aptitude,
            wounds: { base: Number(base), dice },
            bonus: { ...rule.home_world_bonus, mechanic: 'C' },
            bookPage: rule.source,
            recommendedBackgrounds: [],
            choices: EXPANSION_HOMEWORLD_CHOICES[rule.name] ?? [],
            talents: EXPANSION_HOMEWORLD_TALENTS[rule.name] ?? [],
            skills: EXPANSION_HOMEWORLD_SKILLS[rule.name] ?? [],
            traits: EXPANSION_HOMEWORLD_TRAITS[rule.name] ?? [],
            consequences: EXPANSION_HOMEWORLD_CONSEQUENCES[rule.name] ?? [],
        };
    });

export const HOMEWORLDS = [...HOMEWORLD_DEFS, ...EXPANSION_HOMEWORLD_DEFS];
export const BACKGROUNDS = [...BACKGROUND_DEFS, ...EXPANSION_BACKGROUND_DEFS];
export const ROLES = [...ROLE_DEFS, ...EXPANSION_ROLE_DEFS];

export const byId = (list, id) => list.find((d) => d.id === id) ?? null;
