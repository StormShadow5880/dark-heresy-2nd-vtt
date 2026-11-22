/**
 * The catalogue of "Spend EP" (pure): everything a character can buy, in four lists with price, value, aptitudes and the result of the
 * prerequisites. The prices and the checks come from advancement.mjs / prerequisites.mjs, nothing is calculated twice.
 *
 * row: { tab, kind, key, id, name, sub, level, value, matches, cost, tier, discipline, multiple, learned, status, statusText,
 *        canBuy, reason, check }
 *   status: 'met' | 'unmet' | 'manual' | 'none'   (prerequisites; 'none' = there are none)
 */
import { availableXp, buildQuotes, isMultipleTalent, knownTalentSet, ownedTalentNames, powerQuote, talentQuote } from './advancement.mjs';

const STATUS_TEXT = { met: 'Prerequisites met', unmet: 'Prerequisites not met', manual: 'Check the prerequisites yourself', none: '' };

function statusOf(check) {
    if (!check || check.empty) return 'none';
    return check.status;
}

/** Can this row be bought right now? and if not, why */
export function buyability(quote, available, { isGM = false } = {}) {
    if (quote.error && !quote.advanceable && !quote.maxed) return { canBuy: false, reason: quote.error };
    if (quote.maxed) return { canBuy: false, reason: quote.error ?? 'Already at the maximum / learned.' };
    if (!quote.advanceable) return { canBuy: false, reason: quote.error ?? 'Not available.' };
    if (!Number.isFinite(quote.cost) || quote.cost <= 0) return { canBuy: false, reason: 'No price could be determined.' };
    if (quote.cost > available) return { canBuy: false, reason: `Not enough EP (${quote.cost} needed, ${available} available).` };
    const check = quote.prerequisiteCheck;
    if (check && !check.empty && check.status === 'unmet' && !isGM) return { canBuy: false, reason: `Prerequisites not met: ${check.unmet.join('; ')}.` };
    return { canBuy: true, reason: '' };
}

function advanceRow(tab, q, available, isGM) {
    const { canBuy, reason } = buyability(q, available, { isGM });
    return {
        tab,
        kind: q.kind,
        key: q.key,
        id: `${q.kind}:${q.key}`,
        name: q.label,
        sub: q.required.join(' + '),
        level: q.maxed ? 'Maximum' : `${q.fromName} → ${q.toName}`,
        value: !q.maxed && q.valueFrom != null && q.valueTo != null ? `${q.valueFrom} → ${q.valueTo}` : '',
        matches: q.matches,
        cost: q.maxed ? null : q.cost,
        maxed: !!q.maxed,
        status: 'none',
        statusText: '',
        canBuy,
        reason,
    };
}

/**
 * @param actor
 * @param catalog {{talents: object[], powers: object[]}} the entries of the compendia (talents: {id,name,img,aptitudes,tier,prerequisites};
 *                powers: {id,name,img,discipline,cost})
 */
export function buildCatalog(actor, { talents = [], powers = [] } = {}, { isGM = false } = {}) {
    const available = availableXp(actor);
    const quotes = buildQuotes(actor);
    const known = knownTalentSet();
    const owned = ownedTalentNames(actor);

    const talentRows = talents.map((t) => {
        const multiple = isMultipleTalent(t.name);
        // a choice talent is priced with a placeholder choice; the real choice is asked when buying
        const q = talentQuote(actor, t, multiple ? 'choice' : '', undefined, { knownTalents: known });
        const learned = !multiple && owned.has(String(t.name).trim().toLowerCase());
        const check = q.prerequisiteCheck ?? null;
        const status = statusOf(check);
        const { canBuy, reason } = multiple ? { canBuy: !learned && Number.isFinite(q.cost) && q.cost <= available && !(status === 'unmet' && !isGM), reason: '' } : buyability(q, available, { isGM });
        return {
            tab: 'talent',
            kind: 'talent',
            key: t.name,
            id: `talent:${t.id ?? t.name}`,
            entryId: t.id,
            name: t.name,
            sub: q.required?.join(' + ') ?? '',
            level: learned ? 'Learned' : `Tier ${q.tier || t.tier}`,
            value: '',
            matches: q.matches,
            cost: learned ? null : q.cost,
            tier: Number(q.tier || t.tier) || 0,
            multiple,
            learned,
            status,
            statusText: STATUS_TEXT[status],
            check,
            prerequisites: t.prerequisites ?? '',
            canBuy,
            reason: learned ? 'Already learned.' : reason || (multiple && !canBuy ? (status === 'unmet' ? `Prerequisites not met: ${check.unmet.join('; ')}.` : q.cost > available ? `Not enough EP (${q.cost} needed, ${available} available).` : '') : ''),
        };
    });

    const powerRows = powers.map((p) => {
        const q = powerQuote(actor, p);
        const check = q.prerequisiteCheck ?? null;
        const status = statusOf(check);
        const { canBuy, reason } = buyability(q, available, { isGM });
        return {
            tab: 'power',
            kind: 'power',
            key: p.name,
            id: `power:${p.id ?? p.name}`,
            entryId: p.id,
            name: p.name,
            sub: p.discipline ?? '',
            level: q.maxed ? 'Learned' : p.discipline ?? '',
            value: '',
            matches: null,
            cost: q.maxed ? null : q.cost,
            discipline: p.discipline ?? '',
            learned: !!q.maxed,
            status,
            statusText: STATUS_TEXT[status],
            check,
            prerequisites: q.prerequisites ?? '',
            canBuy,
            reason,
        };
    });

    return {
        available,
        tabs: {
            char: quotes.characteristics.map((q) => advanceRow('char', q, available, isGM)),
            skill: quotes.skills.map((q) => advanceRow('skill', q, available, isGM)),
            talent: talentRows,
            power: powerRows,
        },
    };
}

/** Filter and search for one list */
export function filterRows(rows, { search = '', onlyBuyable = false } = {}) {
    const s = String(search).trim().toLowerCase();
    return rows.filter((r) => (!s || `${r.name} ${r.sub}`.toLowerCase().includes(s)) && (!onlyBuyable || r.canBuy));
}
