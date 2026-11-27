import test from 'node:test';
import assert from 'node:assert/strict';
import { homeworldGroups, typeIdOf, differences } from '../src/module/creator/homeworld-groups.mjs';
import { HOMEWORLDS } from '../src/module/creator/data.mjs';
import * as ch from '../src/module/creator/character.mjs';
import * as dr from '../src/module/creator/draft.mjs';

const hw = (name) => HOMEWORLDS.find((h) => h.name === name);

test('types and variants come from the data (parent), nothing is invented', () => {
    const groups = homeworldGroups(HOMEWORLDS);
    const all = groups.flatMap((g) => [g.type, ...g.variants]);
    assert.equal(all.length, HOMEWORLDS.length, 'every entry is shown exactly once');
    assert.equal(new Set(all.map((h) => h.id)).size, HOMEWORLDS.length);
    // 15 types: 6 core and 9 expansion archetypes, plus Agri-World (Novo Arcadia) (no `parent` in the data, so a type of its own)
    assert.equal(groups.length, 16);
    assert.ok(groups.some((g) => g.type.name === 'Agri-World (Novo Arcadia)' && !g.variants.length));
    const hive = groups.find((g) => g.type.name === 'Hive World');
    assert.deepEqual(hive.variants.map((v) => v.name), ["Snope's World", 'Vouxis Prime', 'Hive Desoleum']);
    const voidborn = groups.find((g) => g.type.name === 'Voidborn');
    assert.equal(voidborn.variants.length, 3);
    assert.equal(groups.find((g) => g.type.name === 'Highborn').variants.length, 0);
    for (const g of groups) for (const v of g.variants) assert.equal(v.parent, g.type.name);
});

test('a variant is found from its type and the other way round', () => {
    assert.equal(typeIdOf(HOMEWORLDS, hw('Vouxis Prime').id), hw('Hive World').id);
    assert.equal(typeIdOf(HOMEWORLDS, hw('Hive World').id), hw('Hive World').id);
    assert.equal(typeIdOf(HOMEWORLDS, 'homeworld.unknown'), null);
});

test('a variant that does not name its parent in the list is a type of its own', () => {
    const list = [
        { id: 'a', name: 'A', parent: null },
        { id: 'b', name: 'B', parent: 'A' },
        { id: 'c', name: 'C', parent: 'Nowhere' },
        { id: 'd', name: 'D', parent: 'B' },
    ];
    const groups = homeworldGroups(list);
    assert.deepEqual(groups.map((g) => g.type.id), ['a', 'c', 'd']);
    assert.deepEqual(groups[0].variants.map((v) => v.id), ['b']);
});

test('differences between a location and its general home world', () => {
    const label = (k) => k;
    // Pellenne has no values of its own: same mechanics as Forge World
    assert.deepEqual(differences(hw('Forge World'), hw('Pellenne'), label), []);
    // Hrax has the mechanics of Feudal World
    assert.deepEqual(differences(hw('Feudal World'), hw('Hrax'), label), []);
});

test('choosing a variant: the values of the variant are used, the group changes nothing', () => {
    const env = { startingXp: 1000 };
    const d = ch.newDraft();
    dr.setHomeWorld(d, hw('Vouxis Prime').id);
    const state = ch.computeCharacter(d, env);
    assert.equal(state.homeWorld.name, 'Vouxis Prime');
    assert.equal(state.homeWorld.aptitude, hw('Hive World').aptitude);
    assert.deepEqual(state.homeWorld.talents, [{ talent: 'Blind Fighting' }]);
    // the bonus (and its not automated parts) stays visible in the creation data
    assert.ok(state.bonuses.some((b) => b.source === 'Home World' && b.name === 'Art from Below'));
    // changing the choice before the end
    dr.setHomeWorld(d, hw('Hive World').id);
    assert.equal(ch.computeCharacter(d, env).homeWorld.name, 'Hive World');
});
