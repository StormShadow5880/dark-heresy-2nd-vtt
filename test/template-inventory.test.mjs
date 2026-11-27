import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Inventory of template.json for the planned move to Foundry data models (docs/data-models-migration.md). These tests do not change
 * anything: they pin the known inconsistencies, so that a migration cannot overlook them and a new one shows up as a failure.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/template.json'), 'utf8'));
const typesOf = (kind) => Object.keys(T[kind]).filter((k) => !['types', 'templates'].includes(k));

test('declared types and definitions match exactly (cleaned up: no leftovers, no declared type without a definition)', () => {
    for (const kind of ['Actor', 'Item']) {
        assert.deepEqual(typesOf(kind).filter((x) => !T[kind].types.includes(x)), [], `${kind}: defined but not declared`);
        assert.deepEqual(T[kind].types.filter((x) => !typesOf(kind).includes(x)), [], `${kind}: declared but not defined`);
    }
});

test('every template that a type lists exists', () => {
    const missing = [];
    for (const kind of ['Actor', 'Item'])
        for (const type of typesOf(kind)) for (const name of T[kind][type].templates ?? []) if (!T[kind].templates[name]) missing.push(`${kind}.${type}:${name}`);
    assert.deepEqual(missing, []);
});

test('the key is "templates" everywhere (a singular "template" is ignored by Foundry); aptitude items have description and source', () => {
    for (const kind of ['Actor', 'Item']) for (const type of typesOf(kind)) assert.equal('template' in T[kind][type], false, `${kind}.${type}`);
    assert.deepEqual(T.Item.aptitude.templates, ['itemDescription']);
    assert.equal(T.Item.templates.itemDescription.description, '');
});

test('the number of declared types is stable (4 actor types, 26 item types)', () => {
    assert.equal(T.Actor.types.length, 4);
    assert.equal(T.Item.types.length, 26);
});
