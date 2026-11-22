/**
 * The action account of a turn. Pure rules, no Foundry access.
 *
 * A character has 1 Full Action per turn = 2 Half Actions. Everything that costs an action is taken from this account:
 * attacks, psychic powers, sustaining powers and, by hand, everything else (moving, reloading, aiming …). Free Actions cost
 * nothing, Reactions are not part of the account. The account belongs to one turn (combat round + turn); in the next turn it
 * is full again. It is stored on the combatant, see combat/action-account.mjs.
 */

/** Half actions per turn (1 Full Action) */
export const ACCOUNT_SIZE = 2;

const TYPE_COST = { free: 0, half: 1, full: 2, '2full': 4, '3full': 6 };

/** The cost of a combat action from its type list, e.g. ['Half'] → 1, ['Full', 'Half'] → 1 and variable, ['Reaction'] → no cost */
export function costFromTypes(types = []) {
    const list = [...types].map((t) => String(t).trim().toLowerCase());
    if (list.includes('reaction')) return { cost: 0, reaction: true, variable: false };
    const costs = [...new Set(list.map((t) => TYPE_COST[t]).filter((c) => c !== undefined))].sort((a, b) => a - b);
    if (!costs.length) return { cost: null, reaction: false, variable: false };
    return { cost: costs[0], reaction: false, variable: costs.length > 1 };
}

/** The cost of a psychic power from its "Action" field: Free Action 0, Half Action 1, Full Action 2, null = cannot be calculated */
export function costFromActionText(text) {
    const t = String(text ?? '').trim().toLowerCase();
    if (!t || t === 'n/a' || t === 'special') return null;
    const multi = t.match(/^(\d+)\s*full/);
    if (multi) return Number(multi[1]) * 2;
    const first = t.split(/\s+/)[0];
    return first in TYPE_COST ? TYPE_COST[first] : null;
}

/** Actions that take more than one turn use the whole account of this turn */
export function cappedCost(cost, size = ACCOUNT_SIZE) {
    return Math.min(Number(cost) || 0, size);
}

export function costLabel(cost) {
    if (cost === 0) return 'Free';
    if (cost === 1) return 'Half Action';
    if (cost === 2) return 'Full Action';
    return cost === null || cost === undefined ? 'Special' : `${cost / 2} Full Actions`;
}

export function accountKey(round, turn) {
    return `${round}:${turn}`;
}

/** The stored account of the turn; a stored account of another turn counts as full again */
export function readAccount(stored, key) {
    if (stored && stored.key === key) return { key, spent: Number(stored.spent) || 0, log: Array.isArray(stored.log) ? stored.log : [] };
    return { key, spent: 0, log: [] };
}

export function remainingOf(account, size = ACCOUNT_SIZE) {
    return size - (Number(account?.spent) || 0);
}

export function canAfford(account, cost, size = ACCOUNT_SIZE) {
    return cappedCost(cost, size) <= remainingOf(account, size);
}

/** The account after paying for an action (a new object; it may become negative when the player insists) */
export function chargeAccount(account, { name, cost }, size = ACCOUNT_SIZE) {
    const paid = cappedCost(cost, size);
    if (paid <= 0) return { ...account, log: [...account.log, { name, cost: 0 }] };
    return { ...account, spent: account.spent + paid, log: [...account.log, { name, cost: paid }] };
}

/** Takes the last entry back (and gives its cost back) */
export function refundLast(account) {
    const log = [...account.log];
    let entry = log.pop();
    while (entry && entry.cost === 0 && log.length) entry = log.pop();
    if (!entry) return account;
    return { ...account, spent: Math.max(0, account.spent - (entry.cost || 0)), log };
}

/** The sentence that explains why an action does not fit */
export function shortage(account, name, cost, size = ACCOUNT_SIZE) {
    const need = cappedCost(cost, size);
    const left = Math.max(0, remainingOf(account, size));
    return `${name} costs ${costLabel(need)}, but only ${left === 0 ? 'no action' : left === 1 ? '1 Half Action' : `${left} Half Actions`} left this turn.`;
}

/** What the sheet and the combat tracker show */
export function accountView(account, size = ACCOUNT_SIZE) {
    const remaining = remainingOf(account, size);
    const shown = Math.max(0, remaining);
    return {
        size,
        spent: account.spent,
        remaining,
        over: remaining < 0,
        pips: Array.from({ length: size }, (_, i) => ({ on: i < shown })),
        text: remaining < 0 ? `${-remaining} Half Action${remaining === -1 ? '' : 's'} over` : remaining === size ? '1 Full Action left' : remaining === 1 ? '1 Half Action left' : 'No action left',
        log: account.log.filter((l) => l.name).map((l) => ({ name: l.name, label: costLabel(l.cost) })),
        canRefund: account.log.some((l) => l.cost > 0),
    };
}
