import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Handlebars from 'handlebars';
import { ROW_CONTROLS, hasDescription, isFreeAreaClick } from '../src/module/rules/item-description.mjs';

test('description present: text, formatting, links, images; absent: empty markup and whitespace', () => {
    assert.equal(hasDescription('A sturdy lasgun.'), true);
    assert.equal(hasDescription('<p>Text with <b>bold</b></p>'), true);
    assert.equal(hasDescription('@UUID[Item.abc]{Rules}'), true);
    assert.equal(hasDescription('<p><img src="x.webp"></p>'), true);
    assert.equal(hasDescription(''), false);
    assert.equal(hasDescription(undefined), false);
    assert.equal(hasDescription(null), false);
    assert.equal(hasDescription('<p></p>'), false);
    assert.equal(hasDescription('<p>&nbsp;</p><br>'), false);
    assert.equal(hasDescription('   \n  '), false);
});

// a click target as the browser reports it: closest() finds the control the click happened in
const target = (inside) => ({ closest: (selector) => (inside && selector === ROW_CONTROLS ? {} : null) });

test('bubbling: a click on the free area folds the row, a click inside any control does not', () => {
    assert.equal(isFreeAreaClick(target(false)), true);
    assert.equal(isFreeAreaClick(target(true)), false);
    assert.equal(isFreeAreaClick(null), true);
    for (const control of ['button', 'a', 'input', 'select', 'textarea', 'label', '.gear-detail']) assert.ok(ROW_CONTROLS.includes(control), control);
});

function render(items) {
    const hb = Handlebars.create();
    hb.registerHelper('eq', (a, b) => a === b);
    hb.registerHelper('helperMissing', () => '');
    const template = hb.compile(readFileSync(new URL('../src/templates/actor/dossier/gear.hbs', import.meta.url), 'utf8'));
    return template({ dossier: { gear: { allGroups: [], encumbrance: {}, groups: [{ id: 'g', label: 'Gear', types: ['gear'], items }] } } });
}
const item = (over = {}) => ({ id: 'i1', name: 'Lasgun', img: 'a.webp', type: 'weapon', weight: 3, equipped: true, canEquip: true, hasDescription: true, ...over });

test('gear row with a description: arrow button with aria, hidden description region, name and image open the item', () => {
    const html = render([item()]);
    assert.match(html, /class="gear-toggle" data-action="toggleGearDetail" data-item-id="i1" aria-expanded="false" aria-controls="gear-detail-i1"/);
    assert.match(html, /id="gear-detail-i1" role="region"[^>]*aria-hidden="true"/);
    assert.match(html, /class="gear-img item-edit" data-item-id="i1"/);
    assert.match(html, /class="gear-name item-edit grow" data-item-id="i1"/);
    assert.match(html, /gear-row [^"]*has-detail/);
    assert.match(html, /aria-label="Show the description of Lasgun"/);
});

test('gear row without a description: no arrow button, no fold-out area, no empty space', () => {
    const html = render([item({ hasDescription: false })]);
    assert.doesNotMatch(html, /data-action="toggleGearDetail"/);
    assert.doesNotMatch(html, /class="gear-detail"/);
    assert.doesNotMatch(html, /has-detail/);
    assert.match(html, /gear-toggle gear-toggle--none/); // keeps the column of the arrow
});

test('the existing controls are unchanged: equip, chat, edit, delete', () => {
    const html = render([item()]);
    assert.match(html, /data-action="toggleEquipped" data-item-id="i1"/);
    assert.match(html, /class="icon-btn item-vocalize" data-item-id="i1"/);
    assert.match(html, /class="icon-btn item-edit" data-item-id="i1"/);
    assert.match(html, /class="icon-btn item-delete" data-item-id="i1"/);
    // the arrow is not an item-edit control: its click must not open the item window
    const arrow = html.match(/<button[^>]*gear-toggle[^>]*>/)[0];
    assert.doesNotMatch(arrow, /item-edit/);
    // the description region is not inside a button
    assert.doesNotMatch(html, /<button[^>]*>[^<]*<div class="gear-detail"/);
});
