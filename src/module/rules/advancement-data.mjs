/**
 * Dark Heresy 2E advancement rules as structured data: aptitude assignments and XP cost tables.
 * Nothing in here calculates anything, see advancement.mjs. Keys are stable ids (the keys of the actor data),
 * never visible names.
 *
 * Cost tables are indexed by the number of matching aptitudes (2, 1, 0) and then by the level that is bought:
 *   characteristics: 1 Simple, 2 Intermediate, 3 Trained, 4 Proficient, 5 Expert
 *   skills:          1 Known, 2 Trained, 3 Experienced, 4 Veteran
 *   talents:         tier 1, 2, 3
 */

export const APTITUDES = {
    general: 'General',
    weaponSkill: 'Weapon Skill',
    ballisticSkill: 'Ballistic Skill',
    strength: 'Strength',
    toughness: 'Toughness',
    agility: 'Agility',
    intelligence: 'Intelligence',
    perception: 'Perception',
    willpower: 'Willpower',
    fellowship: 'Fellowship',
    offence: 'Offence',
    defence: 'Defence',
    finesse: 'Finesse',
    knowledge: 'Knowledge',
    fieldcraft: 'Fieldcraft',
    psyker: 'Psyker',
    social: 'Social',
    leadership: 'Leadership',
    tech: 'Tech',
};

/** Every character has these (rulebook: "all characters in DARK HERESY have the General aptitude") */
export const IMPLICIT_APTITUDES = ['general'];

/** Spelling variants found in the system data (backgrounds say "Defense") */
export const APTITUDE_ALIASES = { defense: 'defence' };

export const CHARACTERISTIC_LEVELS = ['None', 'Simple', 'Intermediate', 'Trained', 'Proficient', 'Expert'];
export const SKILL_LEVELS = ['Unknown', 'Known', 'Trained', 'Experienced', 'Veteran'];

export const CHARACTERISTIC_COSTS = {
    2: [100, 250, 500, 750, 1250],
    1: [250, 500, 750, 1000, 1500],
    0: [500, 750, 1000, 1500, 2500],
};

export const SKILL_COSTS = {
    2: [100, 200, 300, 400],
    1: [200, 400, 600, 800],
    0: [300, 600, 900, 1200],
};

export const TALENT_COSTS = {
    2: [200, 300, 400],
    1: [300, 450, 600],
    0: [600, 900, 1200],
};

/** characteristic key -> the two aptitudes of its advances. Influence cannot be advanced. */
export const CHARACTERISTIC_APTITUDES = {
    weaponSkill: ['weaponSkill', 'offence'],
    ballisticSkill: ['ballisticSkill', 'finesse'],
    strength: ['strength', 'offence'],
    toughness: ['toughness', 'defence'],
    agility: ['agility', 'finesse'],
    intelligence: ['intelligence', 'knowledge'],
    perception: ['perception', 'fieldcraft'],
    willpower: ['willpower', 'psyker'],
    fellowship: ['fellowship', 'social'],
};

/** skill key -> the two aptitudes of its advances */
export const SKILL_APTITUDES = {
    acrobatics: ['agility', 'general'],
    athletics: ['strength', 'general'],
    awareness: ['perception', 'fieldcraft'],
    charm: ['fellowship', 'social'],
    command: ['fellowship', 'leadership'],
    commerce: ['intelligence', 'knowledge'],
    commonLore: ['intelligence', 'knowledge'],
    deceive: ['fellowship', 'social'],
    dodge: ['agility', 'defence'],
    forbiddenLore: ['intelligence', 'knowledge'],
    inquiry: ['fellowship', 'social'],
    interrogation: ['willpower', 'social'],
    intimidate: ['strength', 'social'],
    linguistics: ['intelligence', 'general'],
    logic: ['intelligence', 'knowledge'],
    medicae: ['intelligence', 'fieldcraft'],
    navigate: ['intelligence', 'fieldcraft'],
    operate: ['agility', 'fieldcraft'],
    parry: ['weaponSkill', 'defence'],
    psyniscience: ['perception', 'psyker'],
    scholasticLore: ['intelligence', 'knowledge'],
    scrutiny: ['perception', 'general'],
    security: ['intelligence', 'tech'],
    sleightOfHand: ['agility', 'knowledge'],
    stealth: ['agility', 'fieldcraft'],
    survival: ['perception', 'fieldcraft'],
    techUse: ['intelligence', 'tech'],
    trade: ['intelligence', 'general'],
};

/**
 * Talents that can be bought more than once, each time for a different choice (weapon group, field, ...).
 * The choice is written into the name, e.g. "Weapon Training (Las)".
 */
export const MULTIPLE_TALENTS = ['Weapon Training', 'Exotic Weapon Training', 'Peer', 'Resistance', 'Hatred', 'Enemy', 'Two-Weapon Wielder'];

/**
 * Talents whose specialisations are a fixed list (the choice must be one of them). Two-Weapon Wielder: Melee and Ranged are bought
 * separately (core rulebook p. 132 as quoted in the project notes, not checked against the book).
 */
export const TALENT_SPECIALISATIONS = { 'Two-Weapon Wielder': ['Melee', 'Ranged'] };

/**
 * Talents that the extracted text says cannot be bought with XP in the normal way (the GM hands them out). A purchase is blocked and
 * only the GM can override it. Not checked against the book.
 */
export const NOT_XP_PURCHASABLE = ['Enemy'];
