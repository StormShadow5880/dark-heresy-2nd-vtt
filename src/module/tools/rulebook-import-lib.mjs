/**
 * Pure helpers of the rulebook page importer: they turn a rulebook page package (html fragment + css + assets) into
 * HTML that can live in a Foundry journal page without touching the rest of the UI:
 *  - the CSS is limited to a wrapper class (global selectors like body, *, h2 would restyle all of Foundry)
 *  - ids and anchors get a prefix (no clashes between pages and with Foundry)
 *  - relative asset paths point to the folder the package was read from
 */

const SCOPE = 'dh2-rulebook';
// The wrapper class is repeated so the rules beat Foundry's own journal styles (which have several classes in front of h2, p, ...)
const SCOPE_SELECTOR = `.${SCOPE}.${SCOPE}.${SCOPE}.${SCOPE}`;

/** Foundry's file browser may return encoded paths (%20): decode first, so encoding later never doubles */
export function decodePath(path) {
    try {
        return decodeURI(String(path));
    } catch {
        return String(path);
    }
}

/**
 * The folder as typed by the user -> path relative to the Foundry Data directory.
 * Accepts "dh2-rulebook", "/dh2-rulebook/", Windows slashes and a pasted full server path ("/home/.../Data/dh2-rulebook").
 */
export function normalizeFolder(input) {
    let path = String(input ?? '').trim().replace(/\\/g, '/');
    // a pasted server path: everything after the LAST "/Data/" is relative to the Data folder
    const absolute = /^([a-z]:)?\//i.test(path) && path.toLowerCase().includes('/data/');
    const marker = path.toLowerCase().lastIndexOf('/data/');
    if (absolute && marker >= 0) path = path.slice(marker + 6);
    return path.replace(/^\/+|\/+$/g, '');
}

/** assets/dice.png -> <base>/assets/dice.png (spaces and umlauts encoded) */
export function assetUrl(base, relative) {
    const clean = decodePath(relative).replace(/^\.?\//, '');
    return encodeURI(`${decodePath(base).replace(/\/+$/, '')}/${clean}`);
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
    if (sel === '*' || sel === 'body' || sel === 'html') return sel === '*' ? `${SCOPE_SELECTOR} *` : SCOPE_SELECTOR;
    return `${SCOPE_SELECTOR} ${sel}`;
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
export function rewriteFragment(html, { prefix, base, ids = collectIds(html) }) {
    let out = html.replace(/(\sid=")([^"]+)"/g, (m, a, id) => `${a}${prefix}${id}"`);
    out = out.replace(/(\shref=")#([^"]+)"/g, (m, a, id) => `${a}#${ids.includes(id) ? prefix : ''}${id}"`);
    out = out.replace(/(\ssrc=")(?!data:|https?:|\/)([^"]+)"/g, (m, a, path) => `${a}${assetUrl(base, path)}"`);
    return { html: out, ids };
}

/**
 * The journal page content (wrapper + fragment) and the scoped css. Foundry removes <style> from journal pages,
 * so the css is returned separately: the importer stores it with the page and injects it into the document.
 */
export function buildPageHtml({ fragment, css, prefix, base }) {
    const { html, ids } = rewriteFragment(fragment, { prefix, base });
    const style = scopeCss(rewriteCssUrls(css, base), { ids, prefix });
    return { html: `<div class="${SCOPE}">${html}</div>`, css: style };
}

export const escapeHtml = (text) =>
    String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

/** Package id -> something usable as id prefix / flag value ("dh2-core-chapter-1" -> "dh2-core-chapter-1") */
export const slugify = (text) =>
    String(text ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

/**
 * Reads metadata.json of both package formats:
 *  - format 1.0 (schema_version "1.0"): id, title, entry_points { fragment, stylesheet }, status, source
 *  - the first single page packages (no schema_version): fragment, stylesheet, printed_page at the top level
 * Missing required values are reported in `errors` (a readable list, never "undefined" in a request).
 */
export function normalizeMetadata(meta, folderName = 'package') {
    const errors = [];
    const m = meta && typeof meta === 'object' ? meta : {};
    const modern = !!m.schema_version;
    const fragment = modern ? m.entry_points?.fragment : m.fragment;
    const stylesheet = modern ? m.entry_points?.stylesheet : m.stylesheet;
    if (!fragment || typeof fragment !== 'string') errors.push(modern ? 'metadata.json: entry_points.fragment is missing' : 'metadata.json: "fragment" is missing');
    if (!stylesheet || typeof stylesheet !== 'string') errors.push(modern ? 'metadata.json: entry_points.stylesheet is missing' : 'metadata.json: "stylesheet" is missing');
    const title = m.title || folderName;
    const id = slugify(m.id || (modern ? title : `page-${m.printed_page ?? folderName}`)) || slugify(folderName);
    const status = m.status ?? {};
    return {
        errors,
        modern,
        id,
        title,
        fragment,
        stylesheet,
        printedPage: m.printed_page ?? null,
        language: m.language ?? 'en',
        verified: modern ? status.transcription_verified !== false && status.ready_for_production_import !== false : true,
        limitations: Array.isArray(status.limitations) ? status.limitations.map(String) : [],
        rights: m.rights ?? m.provenance_note ?? '',
    };
}

/**
 * Splits a chapter fragment into its pages: every <section class="page" id="..."> is one page.
 * Header / navigation / preview-only parts around the sections are dropped.
 * A fragment without such sections is one page (single page packages).
 * @returns {{id: string, number: number|null, name: string, html: string}[]}
 */
export function splitPages(fragment) {
    const pages = [];
    for (const m of fragment.matchAll(/<section\b[^>]*\bclass="[^"]*\bpage\b[^"]*"[^>]*>([\s\S]*?)<\/section>/g)) {
        const tag = m[0].slice(0, m[0].indexOf('>') + 1);
        const id = /\bid="([^"]+)"/.exec(tag)?.[1] ?? `page-${pages.length + 1}`;
        let body = m[1];
        const heading = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(body);
        if (heading) body = body.replace(heading[0], ''); // the page name is shown by Foundry
        const number = /(\d+)$/.exec(id)?.[1];
        const headingText = heading ? heading[1].replace(/<[^>]+>/g, '').trim() : '';
        pages.push({ id, number: number ? Number(number) : null, name: number ? `Page ${number}` : headingText || id, html: body.trim() });
    }
    if (!pages.length) pages.push({ id: 'page', number: null, name: 'Page', html: fragment, single: true });
    return pages;
}

export { SCOPE };
