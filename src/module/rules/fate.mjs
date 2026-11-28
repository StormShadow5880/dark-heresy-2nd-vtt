/**
 * Spending a Fate Point, in one place.
 *
 * Shrine World, "Faith in the Creed": when a Fate Point is spent, roll 1d10. On a 1 the chosen Fate effect happens without
 * reducing the Fate Points; on 2-10 the Point is spent normally. A Point must be available to spend. This applies to spending
 * a Point, not to burning the Fate Threshold (that is a different action and does not go through here).
 *
 * One call is one spend: a repeated request id (socket re-delivery) returns the first result without spending again, and a
 * second click while a spend of the same character is running is refused.
 */
export const isShrineWorld = (bio) => bio?.homeWorld === 'Shrine World';

/** Points the spend costs for this d10 result (the d10 only matters for Shrine World) */
export function fateCost(bio, d10) {
    return isShrineWorld(bio) && Number(d10) === 1 ? 0 : 1;
}

const done = new Map();
const inFlight = new Set();
const KEEP = 200;

async function defaultRoll() {
    const roll = await new Roll('1d10').evaluate();
    return roll.total;
}

/**
 * @param actor the acolyte (`system.fate.value`, `system.bio.homeWorld`)
 * @param {object} o { label, requestId, roll, announce }; `roll` and `announce` can be replaced (tests)
 * @returns {Promise<{ok:boolean, cost?:number, d10?:number|null, free?:boolean, repeated?:boolean, reason?:string}>}
 */
export async function spendFatePoint(actor, { label = '', requestId = null, roll = defaultRoll, announce = defaultAnnounce } = {}) {
    const key = requestId ? `${actor.id}:${requestId}` : null;
    if (key && done.has(key)) return { ...done.get(key), repeated: true };
    if (inFlight.has(actor.id)) return { ok: false, reason: 'A Fate Point is being spent already.' };
    inFlight.add(actor.id);
    try {
        const fate = Number(actor.system?.fate?.value ?? 0);
        if (!(fate >= 1)) return { ok: false, reason: 'No Fate Point left.' };
        const shrine = isShrineWorld(actor.system?.bio);
        const d10 = shrine ? Number(await roll()) : null;
        const cost = fateCost(actor.system?.bio, d10);
        if (cost) await actor.update({ 'system.fate.value': fate - cost });
        const result = { ok: true, cost, d10, free: cost === 0, repeated: false };
        if (key) {
            done.set(key, result);
            if (done.size > KEEP) done.delete(done.keys().next().value);
        }
        if (shrine && announce) await announce(actor, result, label);
        return result;
    } finally {
        inFlight.delete(actor.id);
    }
}

/** One line for notes and the chat */
export function describeSpend(result) {
    if (!result?.ok) return result?.reason ?? '';
    if (result.d10 == null) return 'Fate Point spent';
    return result.free ? `Faith in the Creed: 1d10 = ${result.d10}, the Fate Point is not spent` : `Faith in the Creed: 1d10 = ${result.d10}, the Fate Point is spent`;
}

async function defaultAnnounce(actor, result, label) {
    const esc = (t) => foundry.utils.escapeHTML(String(t));
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<p><strong>${esc(actor.name)}</strong>${label ? ` (${esc(label)})` : ''}: ${esc(describeSpend(result))}. Fate Points now ${actor.system.fate.value}.</p>`,
    });
}
