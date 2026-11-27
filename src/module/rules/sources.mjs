/**
 * Where rules content comes from. The rules data carries a short source such as "PG 24 EI" (page, book code). Everything that
 * is not in the Core Rulebook is expansion content ("DLC"): it is shown with its book name so that it is always clear where
 * a home world, background, role or bonus comes from. Pure functions.
 */

export const BOOKS = {
    CB: { name: 'Core Rulebook', dlc: false },
    EI: { name: 'Enemies Within', dlc: true },
    EO: { name: 'Enemies Without', dlc: true },
    EB: { name: 'Enemies Beyond', dlc: true },
    FG: { name: 'Forgotten Gods', dlc: true },
};

/** "PG 24 EI" → { code: 'EI', page: 24, book: 'Enemies Within', dlc: true } (an unknown code keeps the text) */
export function parseSource(source) {
    const text = String(source ?? '').trim();
    const m = text.match(/^PG\s+(\d+)\s+([A-Z]{2})$/i);
    if (!m) return { code: '', page: null, book: text, dlc: false };
    const code = m[2].toUpperCase();
    const book = BOOKS[code];
    return { code, page: Number(m[1]), book: book?.name ?? code, dlc: book ? book.dlc : true };
}

/** "Enemies Within, p. 24" */
export function sourceLabel(source) {
    const s = parseSource(source);
    if (!s.page) return s.book;
    return `${s.book}, p. ${s.page}`;
}

export const isDlc = (source) => parseSource(source).dlc;

/** The group label of a select: "Core Rulebook" or "Enemies Within (DLC)" */
export function sourceGroup(source) {
    const s = parseSource(source);
    return s.dlc ? `${s.book} (DLC)` : s.book || 'Other';
}

/**
 * The options of a select grouped by book, in the order of first appearance. entries: [{ name, source }].
 * The selected name is marked. A selected name that is not in the list (old data) stays selectable in its own group.
 */
export function groupedOptions(entries, selected = '') {
    const groups = [];
    for (const e of entries) {
        const label = sourceGroup(e.source);
        let g = groups.find((x) => x.label === label);
        if (!g) groups.push((g = { label, options: [] }));
        g.options.push({ name: e.name, selected: e.name === selected, source: sourceLabel(e.source) });
    }
    if (selected && !entries.some((e) => e.name === selected)) groups.push({ label: 'Other', options: [{ name: selected, selected: true, source: '' }] });
    return groups;
}
