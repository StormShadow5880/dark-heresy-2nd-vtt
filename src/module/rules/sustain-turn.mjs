/**
 * Sustained powers at the start of the turn of a psyker. Pure rules, no Foundry access.
 *
 * Each power says in its "Sustained" field which action it costs to keep it going: Free Action, Half Action or Full Action.
 * A character has 1 Full Action per turn = 2 Half Actions ("action account"). Free actions cost nothing. The psyker
 * chooses which powers he keeps; the cost of the kept ones is taken from the account, the others end.
 * "Special" cannot be calculated (the power describes it itself): it costs nothing here and is marked as manual.
 */

/** Half actions in the account of a turn (1 Full Action) */
export const TURN_BUDGET = 2;

const COSTS = { free: 0, half: 1, full: 2 };

/** `Half Action` → 1, `Free Action` → 0, `Full Action` → 2, other text → null (manual) */
export function sustainCost(text) {
    const key = String(text ?? '')
        .trim()
        .toLowerCase()
        .split(/\s+/)[0];
    return key in COSTS ? COSTS[key] : null;
}

export function costLabel(cost) {
    return cost === 0 ? 'Free' : cost === 1 ? 'Half Action' : cost === 2 ? 'Full Action' : 'Special';
}

export function budgetLabel(halfActions) {
    if (halfActions >= 2) return halfActions === 2 ? '1 Full Action (= 2 Half Actions)' : `${halfActions} Half Actions`;
    if (halfActions === 1) return '1 Half Action';
    return 'no action';
}

/**
 * The entries of the dialog. `powers` = [{ id, name, sustained }] of the active, sustainable powers.
 * `manual` marks "Special" and other texts the rules cannot calculate.
 */
export function sustainEntries(powers) {
    return powers.map((p) => {
        const cost = sustainCost(p.sustained);
        return { id: p.id, name: p.name, sustained: p.sustained, cost: cost ?? 0, manual: cost === null, label: costLabel(cost) };
    });
}

/**
 * Checks a choice. `kept` = ids the psyker keeps. Returns what is kept, what ends and what is left of the account.
 * ok is false when the kept powers cost more than the account holds.
 */
export function planSustain(entries, kept, budget = TURN_BUDGET) {
    const keep = new Set(kept);
    const keptEntries = entries.filter((e) => keep.has(e.id));
    const dropped = entries.filter((e) => !keep.has(e.id));
    const spent = keptEntries.reduce((sum, e) => sum + e.cost, 0);
    const remaining = budget - spent;
    return {
        kept: keptEntries,
        dropped,
        spent,
        remaining,
        ok: remaining >= 0,
        error: remaining < 0 ? `Not enough actions: ${budgetLabel(spent)} needed, ${budgetLabel(budget)} available.` : '',
    };
}

/** Is there anything to ask at the start of the turn: at least one active power that is sustainable */
export function needsSustainPrompt(entries) {
    return entries.length > 0;
}

/** Once per round and turn: the marker that is stored on the combatant */
export function turnKey(round, turn) {
    return `${round}:${turn}`;
}
