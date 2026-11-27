import test from 'node:test';
import assert from 'node:assert/strict';
import { installFoundryStubs } from './helpers.mjs';

installFoundryStubs();
const { MODULES, moduleOn } = await import('../src/module/modules.mjs');

test('an optional part is on or off by its setting; unknown or unreadable counts as off', () => {
    const values = { 'module-time': false, 'module-relations': true, 'action-account': true };
    globalThis.game.settings = { get: (scope, key) => { if (!(key in values)) throw new Error('not registered'); return values[key]; } };
    assert.equal(moduleOn('time'), false);
    assert.equal(moduleOn('relations'), true);
    assert.equal(moduleOn('combat'), true);
    assert.equal(moduleOn('sustain'), false, 'a setting that is not registered counts as off');
    assert.equal(moduleOn('nothing'), false);
});

test('every optional part names a setting and a label', () => {
    for (const [name, m] of Object.entries(MODULES)) {
        assert.ok(m.setting && m.label, name);
    }
    assert.equal(new Set(Object.values(MODULES).map((m) => m.setting)).size, Object.keys(MODULES).length);
});
