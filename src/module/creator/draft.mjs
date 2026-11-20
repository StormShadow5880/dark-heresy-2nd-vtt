/**
 * Operations on the creation draft. The draft only stores the player's decisions (ids, dice, choices); everything
 * else is computed from it (character.mjs). Changing an early decision therefore cannot leave values behind:
 * decisions that no longer exist are removed here, the rest is recalculated.
 */
import { CHARACTERISTIC_KEYS, HOMEWORLDS, byId } from './data.mjs';
import { characteristicKind } from './rules.mjs';
import { computeCharacter, replayAdvances } from './character.mjs';

/** Choices that are free text and therefore not listed with fixed options */
const TEXT_CHOICES = ['role-talent-spec', 'div-talent'];

export function logEvent(draft, text, extra = {}) {
    draft.log.push({ time: Date.now(), text, ...extra });
}

export function markStepDone(draft, step) {
    if (!draft.completedSteps.includes(step)) draft.completedSteps.push(step);
}

/**
 * Changes the home world. Dice of characteristics whose kind changes (2d10 <-> 3d10) are removed, the
 * wounds / fate / divination rolls stay (their values are still valid, the totals are recalculated).
 */
export function setHomeWorld(draft, id) {
    const before = byId(HOMEWORLDS, draft.homeWorldId);
    const after = byId(HOMEWORLDS, id);
    draft.homeWorldId = after?.id ?? null;
    for (const key of CHARACTERISTIC_KEYS) {
        if (characteristicKind(before, key) !== characteristicKind(after, key)) {
            delete draft.characteristics.rolls[key];
            if (draft.characteristics.rerollUsed === key) draft.characteristics.rerollUsed = null;
        }
    }
    draft.characteristics.points = {};
    logEvent(draft, `Home World: ${after?.name ?? 'none'}`);
}

export function setBackground(draft, id) {
    draft.backgroundId = id || null;
    logEvent(draft, `Background: ${id ?? 'none'}`);
}

export function setRole(draft, id) {
    draft.roleId = id || null;
    logEvent(draft, `Role: ${id ?? 'none'}`);
}

/** Stores the dice of one characteristic. The first roll of a characteristic cannot be overwritten. */
export function setCharacteristicRoll(draft, key, dice) {
    if (draft.characteristics.rolls[key]) return false;
    draft.characteristics.rolls[key] = { dice: dice.map(Number) };
    logEvent(draft, `${key}: rolled ${dice.join(', ')}`);
    return true;
}

/** The one allowed re-roll: the second result is final. Returns false if it was used already. */
export function rerollCharacteristic(draft, key, dice) {
    const c = draft.characteristics;
    if (c.rerollUsed || !c.rolls[key]) return false;
    c.rerollUsed = key;
    c.rolls[key] = { dice: dice.map(Number), previous: c.rolls[key].dice };
    logEvent(draft, `${key}: re-rolled (${c.rolls[key].previous.join(', ')} -> ${dice.join(', ')}), the second result counts`);
    return true;
}

/** Removes decisions that do not exist (any more) in the computed character */
export function pruneChoices(draft, env) {
    for (let pass = 0; pass < 3; pass++) {
        const state = computeCharacter(draft, env);
        const valid = new Map(state.choices.map((c) => [c.id, c]));
        let changed = false;
        for (const id of Object.keys(draft.choices)) {
            const choice = valid.get(id);
            const stale = !choice || (!choice.text && !TEXT_CHOICES.includes(id) && !choice.options.some((o) => o.value === String(draft.choices[id])));
            if (stale) {
                delete draft.choices[id];
                changed = true;
            }
        }
        if (!changed) break;
    }
}

/** Drops the XP purchases that are no longer possible after an earlier decision changed */
export async function revalidateAdvances(draft, env) {
    const state = computeCharacter(draft, env);
    const { applied, failed } = await replayAdvances(state, draft, env);
    if (failed.length) {
        draft.advances = applied.map((x) => x.adv);
        for (const f of failed) logEvent(draft, `Purchase removed: ${f.adv.key} (${f.errors.join(' ')})`);
    }
    return failed;
}
