/**
 * Reactions in combat. Pure rules, no Foundry access.
 *
 * Semantics (documented decision, see docs/action-account.md): a character has ONE Reaction per combat round, counted per global
 * round of the combat (it is available again when the round counter changes, not at the start of its own turn). Taking a Dodge or a
 * Parry uses it; "Take the Hit" does not. Defensive Stance gives one additional Reaction, All Out Attack gives up the Reaction of the
 * round. Both effects count for the round in which the action was taken (limit: they do not carry over into the next round).
 * A character without a Reaction left can still try after the GM confirms (the rules do not forbid the GM to allow it).
 */

export const BASE_REACTIONS = 1;

/** The stored state of the round; a state of another round counts as fresh */
export function readReaction(stored, round) {
    if (stored && stored.round === round) {
        return { round, used: Number(stored.used) || 0, extra: Number(stored.extra) || 0, forfeited: !!stored.forfeited, keys: Array.isArray(stored.keys) ? stored.keys : [] };
    }
    return { round, used: 0, extra: 0, forfeited: false, keys: [] };
}

/** Reactions that are left (never below 0) */
export function reactionsLeft(state) {
    if (state.forfeited) return 0;
    return Math.max(0, BASE_REACTIONS + state.extra - state.used);
}

export const reactionsTotal = (state) => (state.forfeited ? 0 : BASE_REACTIONS + state.extra);

/**
 * Uses a Reaction. `key` identifies the event (for example the attack and the target): the same key never uses a second one, so a
 * repeated socket message or a redraw cannot use it twice. Returns the new state and what happened.
 */
export function useReaction(state, key) {
    if (key && state.keys.includes(key)) return { state, status: 'already', used: false };
    if (reactionsLeft(state) <= 0) return { state, status: 'none-left', used: false };
    return { state: { ...state, used: state.used + 1, keys: key ? [...state.keys, key] : state.keys }, status: 'used', used: true };
}

/** The GM allows a Reaction although none is left: it is counted (the number may exceed the total, shown as "over") */
export function forceReaction(state, key) {
    if (key && state.keys.includes(key)) return { state, status: 'already', used: false };
    return { state: { ...state, used: state.used + 1, keys: key ? [...state.keys, key] : state.keys }, status: 'forced', used: true };
}

export const addExtraReaction = (state, n = 1) => ({ ...state, extra: state.extra + n });
export const forfeitReaction = (state) => ({ ...state, forfeited: true });
export const restoreReaction = (state) => ({ ...state, used: Math.max(0, state.used - 1), keys: state.keys.slice(0, -1) });

export function reactionView(state) {
    const total = reactionsTotal(state);
    const left = reactionsLeft(state);
    return {
        total,
        left,
        over: state.used > total,
        forfeited: state.forfeited,
        pips: Array.from({ length: Math.max(total, 0) }, (_, i) => ({ on: i < left })),
        text: state.forfeited ? 'Reaction given up this round' : left > 0 ? `${left} Reaction${left === 1 ? '' : 's'} left` : state.used > total ? 'Reaction over the limit' : 'No Reaction left',
    };
}
