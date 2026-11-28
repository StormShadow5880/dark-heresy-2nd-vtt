/**
 * Grants of an origin that are calculated at the end of the character creation. Pure functions.
 *
 * Kul (home world, "Myth Made Truth"): ranks in Forbidden Lore (The Warp) and Forbidden Lore (Daemonology) equal to half the
 * Intelligence Bonus (round down), unless already higher.
 * PROJECT DECISION (not a checked statement of the rule text): the Intelligence Bonus is taken at the END of the character creation,
 * after the XP purchases made there, and the result is written once when the character is finished. A later increase of the
 * Intelligence does not give further free ranks.
 */

export const MAX_SKILL_RANK = 4;

/** The bonus of a characteristic from its stored values: tens digit of base + 5 per advance + modifier, plus the unnatural bonus */
export function characteristicBonus(c) {
    const total = (Number(c?.base) || 0) + (Number(c?.advance) || 0) * 5 + (Number(c?.modifier) || 0);
    return Math.floor(total / 10) + (Number(c?.unnatural) || 0);
}

/** The ranks Kul grants for an Intelligence Bonus; `capped` when the maximum rank of a skill would be exceeded */
export function kulLoreRanks(intelligenceBonus) {
    const wanted = Math.floor(Math.max(0, Number(intelligenceBonus) || 0) / 2);
    return { wanted, ranks: Math.min(wanted, MAX_SKILL_RANK), capped: wanted > MAX_SKILL_RANK };
}

/**
 * Applies the grant to the skills of an actor: each specialisation gets the granted rank unless it is already higher (never lowered,
 * never added up). Returns what changed so that it can be reported.
 * @returns {{ranks: number, wanted: number, capped: boolean, changes: {key: string, from: number, to: number}[]}}
 */
export function applyKulLoreRanks(skills, intelligenceBonus) {
    const { ranks, wanted, capped } = kulLoreRanks(intelligenceBonus);
    const changes = [];
    if (ranks > 0) {
        const lore = skills?.forbiddenLore;
        if (lore?.specialities) {
            for (const key of ['theWarp', 'daemonology']) {
                const spec = lore.specialities[key];
                if (!spec) continue;
                const from = Number(spec.advance) || 0;
                const to = Math.max(from, ranks);
                if (to !== from || !spec.taken) {
                    spec.advance = to;
                    spec.taken = true;
                    changes.push({ key, from, to });
                }
            }
        }
    }
    return { ranks, wanted, capped, changes };
}

/**
 * Adepta Sororitas background: "Whenever an Adepta Sororitas Character would gain 1 or more Corruption Points,
 * she gains that many Insanity Points minus 1 (to a minimum of 0) instead."
 * The player is offered the choice (project decision: the optional wording is offered, never forced).
 * Returns the Insanity that replaces a Corruption gain.
 */
export function sororitasInsanity(corruptionGain) {
    const gain = Math.floor(Number(corruptionGain) || 0);
    return gain >= 1 ? Math.max(0, gain - 1) : 0;
}

/** True when the Sororitas offer applies to this change (background and a gain of at least 1) */
export function sororitasOffer(background, corruptionGain) {
    return background === 'Adepta Sororitas' && Math.floor(Number(corruptionGain) || 0) >= 1;
}
