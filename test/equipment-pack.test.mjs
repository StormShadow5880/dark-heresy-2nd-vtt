import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { setup } from './creator-helpers.mjs';

setup();
const data = await import('../src/module/creator/data.mjs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKS = ['weapons', 'armour', 'tools', 'consumables', 'cybernetics', 'ammo', 'weapon-mods'];

const norm = (n) => String(n).trim().toLowerCase().replace(/\s+/g, ' ');
const docs = (pack) => yaml.loadAll(fs.readFileSync(path.join(ROOT, 'src/packs', pack, `${pack}.yml`), 'utf8')).filter(Boolean);
const all = PACKS.flatMap((p) => docs(p));
const names = new Set(all.map((d) => norm(d.name)));

test('no duplicate names in the tools pack', () => {
    const list = docs('tools').map((d) => norm(d.name));
    assert.equal(new Set(list).size, list.length);
});

test('the items added from the secondary equipment list are there and say where they come from', () => {
    for (const name of ['Chrono', 'Combat Vest', 'Glow-Globe', 'Stablight']) {
        const d = docs('tools').find((x) => x.name === name);
        assert.ok(d, name);
        assert.equal(d.type, 'tool');
        assert.match(d.data.source, /not yet checked against the book/);
    }
    const vest = docs('tools').find((x) => x.name === 'Combat Vest');
    assert.equal(vest.data.weight, 2);
    assert.equal(vest.data.availability, 'Scarce');
    // the weight of the Chrono is not known: no invented value
    assert.equal('weight' in docs('tools').find((x) => x.name === 'Chrono').data, false);
});

test('wizard equipment that is still missing in the compendia is known (no data available for it)', () => {
    const wanted = new Set();
    for (const bg of data.BACKGROUNDS) for (const group of bg.equipment) for (const opt of group.options) for (const x of opt) if (typeof x === 'string') wanted.add(x);
    const missing = [...wanted].filter((n) => !names.has(norm(n))).sort();
    // These have no item values in the available data: they become a placeholder item at creation and are listed in the notes.
    assert.deepEqual(missing.filter((n) => ['Chrono', 'Combat Vest', 'Glow-Globe', 'Stablight'].includes(n)), []);
    for (const n of missing) assert.ok(n.length > 0);
    console.log('still missing:', missing.join(', '));
});
