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

test('known inconsistencies between the declared types and the definitions', () => {
    const diff = (kind) => ({
        definedNotDeclared: typesOf(kind).filter((x) => !T[kind].types.includes(x)),
        declaredNotDefined: T[kind].types.filter((x) => !typesOf(kind).includes(x)),
    });
    // "xenos" and "bonus" are defined but not declared (unused leftovers); the item type "backpack" is declared without a definition
    assert.deepEqual(diff('Actor'), { definedNotDeclared: ['xenos'], declaredNotDefined: [] });
    assert.deepEqual(diff('Item'), { definedNotDeclared: ['bonus'], declaredNotDefined: ['backpack'] });
});

test('known inconsistency: weapon and armour list a template "container" that does not exist (the flag is a field of the type itself)', () => {
    const missing = [];
    for (const kind of ['Actor', 'Item'])
        for (const type of typesOf(kind)) for (const name of T[kind][type].templates ?? []) if (!T[kind].templates[name]) missing.push(`${kind}.${type}:${name}`);
    assert.deepEqual(missing.sort(), ['Item.armour:container', 'Item.weapon:container']);
    assert.equal(T.Item.weapon.container, true);
    assert.equal(T.Item.armour.container, true);
});

test('known inconsistency: "aptitude" uses the key "template" (singular), which Foundry ignores: it has no itemDescription fields', () => {
    const singular = [];
    for (const kind of ['Actor', 'Item']) for (const type of typesOf(kind)) if ('template' in T[kind][type]) singular.push(`${kind}.${type}`);
    assert.deepEqual(singular, ['Item.aptitude']);
});

test('the number of declared types is stable (4 actor types, 26 item types)', () => {
    assert.equal(T.Actor.types.length, 4);
    assert.equal(T.Item.types.length, 26);
});
