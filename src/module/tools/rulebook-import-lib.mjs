/**
 * Pure helpers of the rulebook page importer: they turn a rulebook page package (html fragment + css + assets) into
 * HTML that can live in a Foundry journal page without touching the rest of the UI:
 *  - the CSS is limited to a wrapper class (global selectors like body, *, h2 would restyle all of Foundry)
 *  - ids and anchors get a prefix (no clashes between pages and with Foundry)
 *  - relative asset paths point to the folder the package was read from
 */

const SCOPE = 'dh2-rulebook';

/** assets/dice.png -> <base>/assets/dice.png (spaces and umlauts encoded) */
export function assetUrl(base, relative) {
    const clean = String(relative).replace(/^\.?\//, '');
    return encodeURI(`${String(base).replace(/\/+$/, '')}/${clean}`);
}

export function rewriteCssUrls(css, base) {
    return css.replace(/url\(\s*(['"]?)(?!data:|https?:|\/)([^'")]+)\1\s*\)/g, (m, q, path) => `url(${q}${assetUrl(base, path)}${q})`);
}

export function collectIds(html) {
    return [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
}

/** Splits a css text into top-level blocks, keeping @media blocks together */
function splitRules(css) {
    const rules = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') {
            depth--;
            if (depth === 0) {
                rules.push(css.slice(start, i + 1));
                start = i + 1;
            }
        }
    }
    return rules.map((r) => r.trim()).filter(Boolean);
}

function scopeSelector(selector, ids, prefix) {
    let sel = selector.trim();
    for (const id of ids) sel = sel.replace(new RegExp(`#${id}(?![\\w-])`, 'g'), `#${prefix}${id}`);
    if (sel === '*' || sel === 'body' || sel === 'html') return sel === '*' ? `.${SCOPE} *` : `.${SCOPE}`;
    if (sel.startsWith('*')) return `.${SCOPE} ${sel}`;
    return `.${SCOPE} ${sel}`;
}

/**
 * Prefixes every selector with the wrapper class (body/html become the wrapper itself) and the ids with the page prefix.
 * Handles @media blocks; other at-rules are left alone.
 */
export function scopeCss(css, { ids = [], prefix = '' } = {}) {
    return splitRules(css)
        .map((rule) => {
            const open = rule.indexOf('{');
            const head = rule.slice(0, open).trim();
            const body = rule.slice(open + 1, rule.lastIndexOf('}'));
            if (head.startsWith('@media') || head.startsWith('@supports')) return `${head}{${scopeCss(body, { ids, prefix })}}`;
            if (head.startsWith('@')) return rule;
            const selectors = head.split(',').map((s) => scopeSelector(s, ids, prefix));
            return `${selectors.join(',')}{${body}}`;
        })
        .join('\n');
}

/** Prefixes ids and in-page anchors and points assets to the package folder */
export function rewriteFragment(html, { prefix, base }) {
    const ids = collectIds(html);
    let out = html.replace(/(\sid=")([^"]+)"/g, (m, a, id) => `${a}${prefix}${id}"`);
    out = out.replace(/(\shref=")#([^"]+)"/g, (m, a, id) => `${a}#${ids.includes(id) ? prefix : ''}${id}"`);
    out = out.replace(/(\ssrc=")(?!data:|https?:|\/)([^"]+)"/g, (m, a, path) => `${a}${assetUrl(base, path)}"`);
    return { html: out, ids };
}

/** The complete journal page content: scoped style + wrapper + fragment */
export function buildPageHtml({ fragment, css, prefix, base }) {
    const { html, ids } = rewriteFragment(fragment, { prefix, base });
    const style = scopeCss(rewriteCssUrls(css, base), { ids, prefix });
    return `<style>\n${style}\n</style>\n<div class="${SCOPE}">${html}</div>`;
}

export { SCOPE };
