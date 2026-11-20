/**
 * Pure rules of character creation: characteristic dice, point buy, wounds, fate, divination.
 * No Foundry code. Dice are rolled by the caller (Foundry Roll in the wizard) and passed in, so every rule can be
 * tested with fixed dice.
 */
import { divinations } from '../rules/divinations.mjs';
import { BASE_ROLL, CHARACTERISTIC_KEYS, DEFAULT_STARTING_XP, POINT_BUY, VETERAN_BASE_ROLL } from './data.mjs';

/** 'positive' | 'negative' | 'normal' for one characteristic of a home world */
export function characteristicKind(homeWorld, key) {
    if (!homeWorld) return 'normal';
    if (homeWorld.positive.includes(key)) return 'positive';
    if (homeWorld.negative === key) return 'negative';
    return 'normal';
}

/** Dice that are rolled: 2d10 normally, 3d10 for a positive or negative characteristic */
export function characteristicFormula(kind) {
    return kind === 'normal' ? '2d10' : '3d10';
}

export function rollBase(veteran = false) {
    return veteran ? VETERAN_BASE_ROLL : BASE_ROLL;
}

/**
 * Value of a characteristic from its dice.
 * normal: base + 2d10, positive: base + the two highest of 3d10, negative: base + the two lowest of 3d10.
 * @returns {{kept: number[], value: number}}
 */
export function characteristicFromDice(dice, kind, base = BASE_ROLL) {
    const sorted = [...dice].map(Number).sort((a, b) => a - b);
    let kept;
    if (kind === 'positive') kept = sorted.slice(1);
    else if (kind === 'negative') kept = sorted.slice(0, 2);
    else kept = sorted;
    if (kept.length !== 2 || kept.some((d) => !Number.isFinite(d))) throw new Error(`Invalid dice for ${kind} characteristic: ${dice}`);
    return { kept, value: base + kept[0] + kept[1] };
}

/** Starting value of a characteristic in point buy: 25, 30 for a positive and 20 for a negative characteristic */
export function pointBuyBase(kind) {
    if (kind === 'positive') return POINT_BUY.positive;
    if (kind === 'negative') return POINT_BUY.negative;
    return POINT_BUY.base;
}

/**
 * Checks a point buy distribution.
 * @param points {Record<string, number>} points added to each characteristic
 * @param kinds {Record<string, string>} kind per characteristic
 */
export function evaluatePointBuy(points, kinds) {
    const errors = [];
    const values = {};
    let spent = 0;
    for (const key of CHARACTERISTIC_KEYS) {
        const added = Number(points?.[key] ?? 0);
        if (!Number.isInteger(added) || added < 0) errors.push(`${key}: points must be a whole number of 0 or more.`);
        const base = pointBuyBase(kinds?.[key] ?? 'normal');
        values[key] = base + (Number.isFinite(added) ? added : 0);
        spent += Number.isFinite(added) ? added : 0;
        if (values[key] > POINT_BUY.max) errors.push(`${key}: ${values[key]} is above the maximum of ${POINT_BUY.max}.`);
    }
    const remaining = POINT_BUY.points - spent;
    if (remaining < 0) errors.push(`${-remaining} points too many.`);
    if (remaining > 0) errors.push(`${remaining} points left to spend.`);
    return { ok: errors.length === 0, errors, values, spent, remaining };
}

/** Wounds: base of the home world plus 1d5 */
export function woundsFromRoll(homeWorld, d5) {
    const roll = Number(d5);
    if (!homeWorld || !Number.isInteger(roll) || roll < 1 || roll > 5) return null;
    return homeWorld.wounds.base + roll;
}

/** Fate threshold: home world value, plus 1 if the Emperor's Blessing roll (1d10) reaches the threshold of the home world */
export function fateFromRoll(homeWorld, d10) {
    const roll = Number(d10);
    if (!homeWorld || !Number.isInteger(roll) || roll < 1 || roll > 10) return null;
    const blessing = roll >= homeWorld.blessing;
    return { roll, blessing, threshold: homeWorld.fateThreshold + (blessing ? 1 : 0) };
}

function inRange(roll, range) {
    const [from, to] = String(range).split('-').map(Number);
    return roll >= from && roll <= (to ?? from);
}

/** Divination entry for a d100 result (1-100) */
export function divinationForRoll(roll) {
    const n = Number(roll);
    if (!Number.isInteger(n) || n < 1 || n > 100) return null;
    return divinations().find((d) => inRange(n, d.roll)) ?? null;
}

/**
 * Mechanical effects of the divinations that only change characteristics, grant a talent / skill or the fate threshold.
 * Everything else of the divination text (session based rules, tables) stays as the visible rule text and is marked
 * `automated: false` - the sheet shows it through the divination entry.
 * keys: c = characteristic changes, pick = choose one of the alternatives, talent / skill = grant, fallback = bonus
 * if the character already has it, fate = fate threshold, manual = parts that are not automated.
 */
const delta = (key, value) => ({ key, delta: value });
export const DIVINATION_EFFECTS = {
    '01': { manual: 'Roll once on the Malignancies table and apply the result.' },
    '02-05': { c: [delta('perception', 5)], manual: 'The character gains the Phobia Mental Disorder.' },
    '06-09': { talent: { name: 'Jaded' }, fallback: delta('willpower', 2) },
    '10-13': { c: [delta('agility', -3)], manual: 'Critical damage rule (first critical damage each session).' },
    '14-17': { talent: { name: 'Hatred', choose: true }, fallback: delta('strength', 2) },
    '18-21': {
        pick: [
            { id: 'up', label: 'Increase', options: [delta('agility', 3), delta('intelligence', 3)] },
            { id: 'down', label: 'Reduce', options: [delta('weaponSkill', -3), delta('ballisticSkill', -3)] },
        ],
    },
    '22-25': { talent: { name: 'Quick Draw' }, fallback: delta('agility', 2) },
    '26-29': { c: [delta('perception', 3)], manual: 'Corruption rule (first corruption each session).' },
    '30-33': { c: [delta('intelligence', -3)], manual: 'Corruption rule (first corruption each session).' },
    '34-38': {
        pick: [
            { id: 'up', label: 'Increase', options: [delta('fellowship', 3), delta('strength', 3)] },
            { id: 'down', label: 'Reduce', options: [delta('toughness', -3), delta('willpower', -3)] },
        ],
    },
    '39-43': { manual: 'Mental Disorder rule.' },
    '44-49': {
        pick: [
            { id: 'up', label: 'Increase', options: [delta('toughness', 3), delta('willpower', 3)] },
            { id: 'down', label: 'Reduce', options: [delta('fellowship', -3), delta('strength', -3)] },
        ],
    },
    '50-54': { manual: 'Malignancies table rule.' },
    '55-59': {
        pick: [
            { id: 'up', label: 'Increase', options: [delta('weaponSkill', 3), delta('ballisticSkill', 3)] },
            { id: 'down', label: 'Reduce', options: [delta('agility', -3), delta('intelligence', -3)] },
        ],
    },
    '60-63': { c: [delta('perception', -3)], manual: 'Insanity rule (first insanity each session).' },
    '64-67': { c: [delta('willpower', 3)], manual: 'Insanity rule (first insanity each session).' },
    '68-71': { c: [delta('perception', 2)], manual: 'Awareness re-roll rule.' },
    '72-75': { c: [delta('toughness', -3)], manual: 'Damage bonus rule (first damage each session).' },
    '76-79': { talent: { name: 'Resistance', choose: ['Cold', 'Heat', 'Fear'] }, fallback: delta('toughness', 2) },
    '80-83': { manual: 'Fatigue rule (first fatigue each session).' },
    '84-87': { talent: { name: 'Keen Intuition' }, fallback: delta('intelligence', 2) },
    '88-91': { skill: { skill: 'dodge' }, fallback: delta('agility', 2) },
    '92-95': { talent: { name: 'Clues from the Crowds' }, fallback: delta('fellowship', 2) },
    '96-99': { manual: 'Fate threshold burning rule.' },
    '100': { fate: 1 },
};

export function divinationEffect(divination) {
    return divination ? (DIVINATION_EFFECTS[divination.roll] ?? { manual: divination.effect }) : null;
}

export { DEFAULT_STARTING_XP };
