/**
 * Imports rulebook page packages (html fragment + css + assets) from a folder of the user's Foundry data into a
 * journal. The packages are NOT part of the system: they stay in the user's own data folder (default
 * "dh2-rulebook"), so copyrighted rulebook material is never committed to the repository or shipped in a release.
 *
 * Folder layout (the same the package was delivered in):
 *   <data>/dh2-rulebook/<package>/metadata.json, page22.fragment.html, page22.css, assets/...
 * A folder that directly contains metadata.json is one package, otherwise every sub folder is tried.
 */
import { SYSTEM_ID } from '../system-id.mjs';
import { buildPageHtml } from './rulebook-import-lib.mjs';

const DEFAULT_FOLDER = 'dh2-rulebook';
const JOURNAL_NAME = 'Rulebook (private import)';
const FLAG = 'rulebookPage';

const picker = () => foundry.applications.apps.FilePicker.implementation;

async function fetchText(path) {
    const response = await fetch(encodeURI(path));
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.text();
}

/** Package folders below (or at) the given folder */
async function findPackages(folder) {
    const here = await picker().browse('data', folder);
    if (here.files.some((f) => f.endsWith('/metadata.json') || f === 'metadata.json')) return [here.target];
    const found = [];
    for (const dir of here.dirs) {
        const sub = await picker().browse('data', dir);
        if (sub.files.some((f) => f.endsWith('metadata.json'))) found.push(sub.target);
    }
    return found;
}

async function readPackage(dir) {
    const meta = JSON.parse(await fetchText(`${dir}/metadata.json`));
    const fragment = await fetchText(`${dir}/${meta.fragment}`);
    const css = await fetchText(`${dir}/${meta.stylesheet}`);
    return { meta, fragment, css, dir };
}

async function ensureJournal() {
    let entry = game.journal.find((j) => j.name === JOURNAL_NAME);
    if (!entry) entry = await JournalEntry.create({ name: JOURNAL_NAME, ownership: { default: 0 } });
    return entry;
}

/** Creates or updates one journal page per package; returns what happened */
export async function importRulebookPages(folder = null) {
    if (!game.user.isGM) return ui.notifications.warn('Only a GM can import rulebook pages.');
    const path = folder ?? (await askFolder());
    if (!path) return;
    let dirs;
    try {
        dirs = await findPackages(path);
    } catch (error) {
        return ui.notifications.error(`Folder "${path}" could not be read in your Foundry data: ${error.message}`);
    }
    if (!dirs.length) return ui.notifications.warn(`No rulebook package (metadata.json) found in "${path}".`);

    const entry = await ensureJournal();
    const done = [];
    for (const dir of dirs) {
        try {
            const pkg = await readPackage(dir);
            const prefix = `p${pkg.meta.printed_page ?? done.length + 1}-`;
            const html = buildPageHtml({ fragment: pkg.fragment, css: pkg.css, prefix, base: dir });
            const name = `Page ${pkg.meta.printed_page ?? '?'} - ${pkg.meta.title ?? dir}`;
            const existing = entry.pages.find((p) => p.getFlag(SYSTEM_ID, FLAG) === dir);
            const data = { name, type: 'text', text: { format: 1, content: html }, flags: { [SYSTEM_ID]: { [FLAG]: dir } } };
            if (existing) await existing.update(data);
            else await entry.createEmbeddedDocuments('JournalEntryPage', [data]);
            done.push(name);
        } catch (error) {
            console.error('Dark Heresy 2e | rulebook import failed for', dir, error);
            ui.notifications.error(`Import of "${dir}" failed: ${error.message}`);
        }
    }
    if (done.length) {
        ui.notifications.info(`Imported ${done.length} rulebook page(s) into "${JOURNAL_NAME}".`);
        entry.sheet.render(true);
    }
    return done;
}

async function askFolder() {
    return foundry.applications.api.DialogV2.prompt({
        window: { title: 'Import rulebook pages' },
        content: `<p>Folder in your Foundry <em>Data</em> directory that contains the page package(s) (with metadata.json).</p>
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
