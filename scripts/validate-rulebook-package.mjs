#!/usr/bin/env node
/**
 * Checks a rulebook package folder before it is uploaded to Foundry:
 *   node scripts/validate-rulebook-package.mjs <package folder> [more folders ...]
 * Same rules as the importer (src/module/tools/rulebook-import-lib.mjs), see docs/rulebook-package-format.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { collectIds, normalizeMetadata, splitPages } from '../src/module/tools/rulebook-import-lib.mjs';

function check(dir) {
    const problems = [];
    const notes = [];
    const file = (name) => path.join(dir, name);
    if (!fs.existsSync(file('metadata.json'))) return { problems: ['metadata.json is missing'], notes };
    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(file('metadata.json'), 'utf8'));
    } catch (error) {
        return { problems: [`metadata.json is not valid JSON: ${error.message}`], notes };
    }
    const meta = normalizeMetadata(raw, path.basename(dir));
    problems.push(...meta.errors);
    if (!meta.modern) notes.push('old single page format (no schema_version): still importable, but use format 1.0 for new packages');
    if (meta.errors.length) return { problems, notes };
    for (const name of [meta.fragment, meta.stylesheet]) if (!fs.existsSync(file(name))) problems.push(`${name} is missing`);
    if (problems.length) return { problems, notes };

    const fragment = fs.readFileSync(file(meta.fragment), 'utf8');
    const css = fs.readFileSync(file(meta.stylesheet), 'utf8');
    const pages = splitPages(fragment);
    notes.push(`${meta.title}: ${pages.length} page(s)${pages[0]?.single ? ' (no <section class="page">: imported as one page)' : ''}`);
    const ids = collectIds(fragment);
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dup.length) problems.push(`duplicate ids: ${[...new Set(dup)].join(', ')}`);
    const refs = [...fragment.matchAll(/\ssrc="([^"]+)"/g), ...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1]).filter((r) => !/^(data:|https?:|\/)/.test(r));
    for (const ref of new Set(refs)) if (!fs.existsSync(file(decodeURI(ref)))) problems.push(`referenced file is missing: ${ref}`);
    for (const m of fragment.matchAll(/\shref="#([^"]+)"/g)) if (!ids.includes(m[1])) problems.push(`link to an unknown anchor: #${m[1]}`);
    if (/<script\b/i.test(fragment)) problems.push('<script> is not allowed');
    if (!meta.verified) notes.push('status says: not verified / not ready for production - the importer adds an "Import notes" page');
    return { problems, notes };
}

const dirs = process.argv.slice(2);
if (!dirs.length) {
    console.error('usage: node scripts/validate-rulebook-package.mjs <package folder> [...]');
    process.exit(2);
}
let failed = false;
for (const dir of dirs) {
    const { problems, notes } = check(dir);
    console.log(`\n${dir}`);
    for (const n of notes) console.log(`  i  ${n}`);
    for (const p of problems) console.log(`  X  ${p}`);
    if (!problems.length) console.log('  OK');
    failed ||= problems.length > 0;
}
process.exit(failed ? 1 : 0);
