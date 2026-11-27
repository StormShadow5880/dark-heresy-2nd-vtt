import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATE_FLAGS, describeFlags, valueText } from '../src/module/rules/state-flags.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('flags of a document: known ones with label and reset rule, unknown ones listed but not resettable', () => {
    const rows = describeFlags({ healingTimers: { firstAid: 5 }, xpLog: [], mystery: 1, actionAccount: { spent: 1 } }, 'actor');
    assert.deepEqual(rows.map((r) => r.key).sort(), ['healingTimers', 'mystery', 'xpLog'], 'actionAccount belongs to a combatant, not to an actor');
    assert.equal(rows.find((r) => r.key === 'healingTimers').resettable, true);
    assert.equal(rows.find((r) => r.key === 'xpLog').resettable, false, 'the experience log cannot be rebuilt');
    assert.equal(rows.find((r) => r.key === 'mystery').known, false);
});

test('the registry has every flag once and says whether it can be reset', () => {
    assert.equal(new Set(STATE_FLAGS.map((f) => f.key)).size, STATE_FLAGS.length);
    for (const f of STATE_FLAGS) assert.ok(f.key && f.on && f.label && f.note && typeof f.resettable === 'boolean', f.key);
});

test('every flag that the code writes with setFlag is in the registry (a new flag must be registered)', () => {
    const files = [];
    (function walk(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p);
            else if (p.endsWith('.mjs')) files.push(p);
        }
    })(path.join(ROOT, 'src/module'));
    const written = new Set();
    for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/setFlag\(\s*SYSTEM_ID,\s*'([A-Za-z]+)'/g)) written.add(m[1]);
    // not documents of a character: world storage and settings-like records of other features
    const other = new Set(['rulebookCss', 'restStore', 'restJson', 'patronJson', 'relation', 'pending', 'peer', 'aptitude']);
    const known = new Set(STATE_FLAGS.map((f) => f.key));
    const missing = [...written].filter((k) => !known.has(k) && !other.has(k));
    assert.deepEqual(missing, [], 'register the new flag in rules/state-flags.mjs');
});

test('long values are shortened for the overview', () => {
    assert.equal(valueText({ a: 1 }), '{"a":1}');
    assert.ok(valueText('x'.repeat(200)).length <= 80);
});
