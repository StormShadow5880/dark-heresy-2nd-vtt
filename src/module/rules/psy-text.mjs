/**
 * Readable psy-rating formulas. The compendium keeps formulas such as `2*@pr` or `[[@pr/2]]` so that they can be rolled and
 * calculated; on a sheet they are shown as "2 × PR" and, when the psy rating of the character is known, with the result
 * ("2 × PR = 6"). Pure functions, no Foundry access.
 */

const SAFE = /^[\d@pr*/+\-.() kK]+$/i;

/** Calculates a formula like `5*@pr` / `@pr/2` / `1k*@pr`; null if it is not such a formula. */
export function evaluatePsyFormula(expr, pr) {
    const text = String(expr ?? '').trim();
    if (!text || !/@pr/i.test(text) || !SAFE.test(text) || !Number.isFinite(Number(pr))) return null;
    const js = text.replace(/(\d+)k/gi, (_, n) => `${n}*1000`).replace(/@pr/gi, `(${Number(pr)})`);
    if (!/^[\d*/+\-.() ]+$/.test(js)) return null;
    try {
        const value = Function(`"use strict"; return (${js});`)();
        return Number.isFinite(value) ? value : null;
    } catch {
        return null;
    }
}

/** `5*@pr` → `5 × PR`, `@pr/2` → `PR ÷ 2`, `@pr` → `PR`. Text without @pr stays unchanged. */
export function symbolic(expr) {
    return String(expr ?? '')
        .trim()
        .replace(/(\d+)k/gi, '$1 000')
        .replace(/@pr/gi, 'PR')
        .replace(/\s*\*\s*/g, ' × ')
        .replace(/\s*\/\s*/g, ' ÷ ')
        .replace(/\s*\+\s*/g, ' + ')
        .replace(/\s+-\s+|(?<=[\dR])-(?=[\dP])/g, ' − ');
}

function shown(value) {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

/** Display text of one formula: `2 × PR = 6` (the result only if the psy rating is known). */
export function prettyFormula(expr, pr) {
    if (!/@pr/i.test(String(expr ?? ''))) return String(expr ?? '');
    const value = evaluatePsyFormula(expr, pr);
    return value === null ? symbolic(expr) : `${symbolic(expr)} = ${shown(value)}`;
}

/** Range of a power: a plain number stays as it is, a formula is made readable. */
export function prettyRange(range, pr) {
    return prettyFormula(range, pr);
}

/**
 * Replaces the inline formulas `[[...@pr...]]` of a description with a readable `<span class="dh-pr">` before the text is
 * enriched. Dice formulas without @pr (e.g. `[[1d10]]`) are left alone, so they stay rollable.
 */
export function prettifyDescription(html, pr) {
    return String(html ?? '').replace(/\[\[\s*(?:\/r(?:oll)?\s+)?([^\]]*@pr[^\]]*?)\s*\]\]/gi, (_, expr) => {
        const value = evaluatePsyFormula(expr, pr);
        const text = value === null ? symbolic(expr) : shown(value);
        const title = value === null ? '' : ` title="${symbolic(expr)} with Psy Rating ${Number(pr)}"`;
        return `<span class="dh-pr"${title}>${text}</span>`;
    });
}
