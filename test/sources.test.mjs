import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSource, sourceLabel, isDlc, groupedOptions } from '../src/module/rules/sources.mjs';
import { homeworlds } from '../src/module/rules/homeworlds.mjs';
import { backgrounds } from '../src/module/rules/backgrounds.mjs';
import { roles } from '../src/module/rules/roles.mjs';

test('sources are read and shown with the book name', () => {
    assert.deepEqual(parseSource('PG 24 EI'), { code: 'EI', page: 24, book: 'Enemies Within', dlc: true });
    assert.equal(sourceLabel('PG 32 CB'), 'Core Rulebook, p. 32');
    assert.equal(sourceLabel('PG 7 FG'), 'Forgotten Gods, p. 7');
    assert.equal(isDlc('PG 32 CB'), false);
    assert.equal(isDlc('PG 26 EO'), true);
    assert.equal(sourceLabel('something else'), 'something else');
});

test('options are grouped by book, the selected one is marked', () => {
    const groups = groupedOptions([{ name: 'A', source: 'PG 1 CB' }, { name: 'B', source: 'PG 2 EI' }, { name: 'C', source: 'PG 3 CB' }], 'B');
    assert.deepEqual(groups.map((g) => g.label), ['Core Rulebook', 'Enemies Within (DLC)']);
    assert.deepEqual(groups[0].options.map((o) => o.name), ['A', 'C']);
    assert.equal(groups[1].options[0].selected, true);
    assert.equal(groupedOptions([], 'Old value')[0].options[0].selected, true, 'a value that is not in the list stays selectable');
});

test('every home world, background and role has a readable source', () => {
    for (const list of [homeworlds(), backgrounds(), roles()]) for (const e of list) assert.ok(parseSource(e.source).page, `${e.name} has no source`);
});

test('the specific locations of the expansion books are home worlds of their parent', () => {
    const all = homeworlds();
    const locations = all.filter((h) => h.parent);
    assert.equal(locations.length, 21);
    for (const h of locations) {
        const parent = all.find((p) => p.name === h.parent);
        assert.ok(parent, `${h.name}: unknown parent ${h.parent}`);
        assert.equal(h.bonus_characteristics.length, 2, h.name);
        assert.ok(h.negative_characteristic && h.aptitude && /^\d+\+1d5$/.test(h.wounds), h.name);
        assert.ok(Number.isFinite(h.fate_threshold) && Number.isFinite(h.emperors_blessing), h.name);
        assert.ok(h.home_world_bonus.name && h.home_world_bonus.benefit, h.name);
        assert.equal(isDlc(h.source), true, h.name);
    }
    // a location without own values has the mechanics of its parent
    const pellenne = all.find((h) => h.name === 'Pellenne');
    const forge = all.find((h) => h.name === 'Forge World');
    assert.deepEqual(pellenne.bonus_characteristics, forge.bonus_characteristics);
    assert.equal(pellenne.wounds, forge.wounds);
    assert.equal(all.find((h) => h.name === 'Thaur').source, 'PG 109 FG');
});

test('names are unique (an actor stores the name)', () => {
    for (const list of [homeworlds(), backgrounds(), roles()]) assert.equal(new Set(list.map((e) => e.name)).size, list.length);
});
