/**
 * Imports rulebook packages (html + css + assets) from a folder of the user's Foundry data into journals. The
 * packages are NOT part of the system: they stay in the user's own data folder (default "dh2-rulebook"), so
 * copyrighted rulebook material is never committed to the repository or shipped in a release.
 * Package format and folder layout: docs/rulebook-package-format.md
 *
 *   <data>/dh2-rulebook/<package>/metadata.json (+ fragment, stylesheet, assets/ ...)
 *
 * Format 1.0 packages (a chapter with <section class="page" id="seite-N"> pages) become ONE journal per package with
 * one page per section, inside the journal folder "Rulebook (private import)". The first single page packages
 * (page22) are still imported as one page of the journal "Rulebook (private import)".
 */
import { SYSTEM_ID } from '../system-id.mjs';
import { buildPageHtml, collectIds, decodePath, escapeHtml, normalizeFolder, normalizeMetadata, rewriteCssUrls, rewriteFragment, scopeCss, splitPages } from './rulebook-import-lib.mjs';

const DEFAULT_FOLDER = 'dh2-rulebook';
const LEGACY_JOURNAL = 'Rulebook (private import)';
const FOLDER_NAME = 'Rulebook (private import)';
const FLAG_PAGE = 'rulebookPage';
const FLAG_PACKAGE = 'rulebookPackage';
const MAX_DEPTH = 5;

const picker = () => foundry.applications.apps.FilePicker.implementation;

async function fetchText(path) {
    const response = await fetch(encodeURI(decodePath(path)));
    if (!response.ok) throw new Error(`${decodePath(path)} could not be loaded (${response.status})`);
    return response.text();
}

const isMeta = (file) => decodePath(file).split('/').pop().toLowerCase() === 'metadata.json';

/** Package folders (they contain metadata.json) at or below the given folder, searched up to a few levels deep */
async function findPackages(folder, seen = [], depth = 0) {
    const here = await picker().browse('data', folder);
    seen.push(`${decodePath(here.target)}: ${here.dirs.length} folder(s), ${here.files.length} file(s)`);
    if (here.files.some(isMeta)) return [decodePath(here.target)];
    if (depth >= MAX_DEPTH) return [];
    const found = [];
    for (const dir of here.dirs) found.push(...(await findPackages(decodePath(dir), seen, depth + 1)));
    return found;
}

/** Reads and checks one package; throws an Error with a readable message */
async function readPackage(dir) {
    const folderName = dir.split('/').pop();
    let raw;
    try {
        raw = JSON.parse(await fetchText(`${dir}/metadata.json`));
    } catch (error) {
        throw new Error(`metadata.json is not readable: ${error.message}`);
    }
    const meta = normalizeMetadata(raw, folderName);
    if (meta.errors.length) throw new Error(meta.errors.join('; '));
    const fragment = await fetchText(`${dir}/${meta.fragment}`);
    const css = await fetchText(`${dir}/${meta.stylesheet}`);
    return { meta, fragment, css, dir };
}

async function ensureFolder() {
    let folder = game.folders.find((f) => f.type === 'JournalEntry' && f.name === FOLDER_NAME);
    if (!folder) folder = await Folder.create({ name: FOLDER_NAME, type: 'JournalEntry' });
    return folder;
}

async function ensureLegacyJournal() {
    let entry = game.journal.find((j) => j.name === LEGACY_JOURNAL);
    if (!entry) entry = await JournalEntry.create({ name: LEGACY_JOURNAL, ownership: { default: 0 } });
    return entry;
}

async function upsertPages(entry, pages) {
    const created = [];
    for (const data of pages) {
        const key = data.flags[SYSTEM_ID][FLAG_PAGE];
        const existing = entry.pages.find((p) => p.getFlag(SYSTEM_ID, FLAG_PAGE) === key);
        if (existing) await existing.update(data);
        else created.push(data);
    }
    if (created.length) await entry.createEmbeddedDocuments('JournalEntryPage', created);
}

const textPage = (name, content, key, sort, extraFlags = {}) => ({
    name,
    type: 'text',
    sort,
    text: { format: 1, content },
    flags: { [SYSTEM_ID]: { [FLAG_PAGE]: key, ...extraFlags } },
});

/** Format 1.0: one journal per package, one page per <section class="page"> */
async function importChapter(pkg) {
    const { meta, fragment, css, dir } = pkg;
    const prefix = `${meta.id}-`;
    const ids = collectIds(fragment);
    const scoped = scopeCss(rewriteCssUrls(css, dir), { ids, prefix });
    const folder = await ensureFolder();
    let entry = game.journal.find((j) => j.getFlag(SYSTEM_ID, FLAG_PACKAGE)?.id === meta.id);
    const flags = { [SYSTEM_ID]: { [FLAG_PACKAGE]: { id: meta.id, dir }, rulebookCss: scoped } };
    if (entry) await entry.update({ name: meta.title, folder: folder.id, flags });
    else entry = await JournalEntry.create({ name: meta.title, folder: folder.id, ownership: { default: 0 }, flags });

    const pages = [];
    if (!meta.verified || meta.limitations.length) {
        const items = meta.limitations.map((l) => `<li>${escapeHtml(l)}</li>`).join('');
        pages.push(textPage('Import notes', `<p><strong>This chapter is a working draft, the text is not verified against the book.</strong></p>${items ? `<ul>${items}</ul>` : ''}`, `${meta.id}:_notes`, 0));
    }
    for (const [i, page] of splitPages(fragment).entries()) {
        const { html } = rewriteFragment(page.html, { prefix, base: dir, ids });
        pages.push(textPage(page.name, `<div class="dh2-rulebook">${html}</div>`, `${meta.id}:${page.id}`, 100 * ((page.number ?? i) + 1)));
    }
    await upsertPages(entry, pages);
    return { entry, count: pages.length };
}

/** First single page packages: one page in the shared journal */
async function importLegacyPage(pkg) {
    const { meta, fragment, css, dir } = pkg;
    const prefix = `p${meta.printedPage ?? meta.id}-`;
    const { html, css: scoped } = buildPageHtml({ fragment, css, prefix, base: dir });
    const entry = await ensureLegacyJournal();
    const name = `Page ${meta.printedPage ?? '?'} - ${meta.title}`;
    await upsertPages(entry, [textPage(name, html, dir, 0, { rulebookCss: scoped })]);
    return { entry, count: 1 };
}

/**
 * Imports every package in the folder (default "dh2-rulebook" in the Foundry Data directory).
 * @returns {Promise<string[]>} the imported package titles
 */
export async function importRulebookPages(folder = null) {
    if (!game.user.isGM) return ui.notifications.warn('Only a GM can import rulebook pages.');
    const typed = folder ?? (await askFolder());
    if (!typed) return;
    const path = normalizeFolder(typed);
    const seen = [];
    let dirs;
    try {
        dirs = await findPackages(path, seen);
    } catch (error) {
        console.error('Dark Heresy 2e | rulebook import: folder could not be read', error);
        return ui.notifications.error(`Folder "${path}" could not be read in your Foundry data (relative to the Data folder): ${error.message}`);
    }
    if (!dirs.length) {
        console.warn('Dark Heresy 2e | rulebook import: no metadata.json found. Looked at:', seen);
        return ui.notifications.warn(`No rulebook package (metadata.json) found in "${path}" or below it. Looked at: ${seen.slice(0, 4).join(' | ')} (details in the console, F12).`);
    }

    const done = [];
    const failed = [];
    let last = null;
    for (const dir of dirs.sort()) {
        try {
            const pkg = await readPackage(dir);
            const result = pkg.meta.modern ? await importChapter(pkg) : await importLegacyPage(pkg);
            last = result.entry;
            done.push(`${pkg.meta.title} (${result.count} page${result.count === 1 ? '' : 's'})`);
        } catch (error) {
            console.error('Dark Heresy 2e | rulebook import failed for', dir, error);
            failed.push(`${dir}: ${error.message}`);
        }
    }
    applyRulebookStyles();
    if (done.length) ui.notifications.info(`Rulebook import: ${done.join('; ')}.`);
    if (failed.length) ui.notifications.error(`Rulebook import failed for ${failed.length} package(s): ${failed.join(' | ')}`, { permanent: true });
    if (done.length === 1 && last) last.sheet.render(true);
    return done;
}

async function askFolder() {
    return foundry.applications.api.DialogV2.prompt({
        window: { title: 'Import rulebook' },
        content: `<p>Folder in your Foundry <em>Data</em> directory that contains the rulebook package(s) (every package has a metadata.json).</p>
            <div class="form-group"><label>Folder</label><input type="text" name="folder" value="${DEFAULT_FOLDER}" /></div>`,
        ok: { label: 'Import', callback: (event, button) => button.form.elements.folder.value.trim() },
        rejectClose: false,
        modal: false,
    });
}

/** Creates the world macro that starts the import (once; deleting it is respected) */
export async function ensureImportMacro() {
    if (!game.user.isGM) return;
    if (game.settings.get(SYSTEM_ID, 'rulebook-macro-created')) return;
    if (!game.macros.some((m) => m.name === 'Import Rulebook Pages')) {
        await Macro.create({
            name: 'Import Rulebook Pages',
            type: 'script',
            img: 'icons/svg/book.svg',
            command: 'await game.dh.importRulebookPages();',
        });
    }
    await game.settings.set(SYSTEM_ID, 'rulebook-macro-created', true);
}

const STYLE_ID = 'dh2-rulebook-css';

/**
 * Foundry removes <style> elements from journal pages. The scoped css of the imported rulebook (kept in a flag of the
 * journal, or of the page for single page packages) is therefore put into one style element of the document. Every
 * rule starts with the wrapper class of the imported pages, so nothing else in Foundry is affected.
 */
export function applyRulebookStyles() {
    const css = [];
    for (const entry of game.journal ?? []) {
        const own = entry.getFlag?.(SYSTEM_ID, 'rulebookCss');
        if (own) css.push(own);
        for (const page of entry.pages) {
            const text = page.getFlag?.(SYSTEM_ID, 'rulebookCss');
            if (text) css.push(text);
        }
    }
    let style = document.getElementById(STYLE_ID);
    if (!css.length) return style?.remove();
    if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
        document.head.append(style);
    }
    style.textContent = css.join('\n');
}
