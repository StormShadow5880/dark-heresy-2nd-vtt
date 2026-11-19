import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Handlebars from 'handlebars';

/**
 * ApplicationV2 (HandlebarsApplicationMixin) requires every part template to render exactly ONE root element.
 * A second top-level element makes the window fail to open (this once broke the weapon attack prompt).
 */
const ROOT = path.resolve('src/templates');
const hbs = Handlebars.create();

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? walk(p) : p.endsWith('.hbs') ? [p] : [];
    });
}
const all = walk(ROOT);
for (const file of all) hbs.registerPartial('systems/dark-heresy-2nd/templates/' + path.relative(ROOT, file).replaceAll('\\', '/'), fs.readFileSync(file, 'utf8'));
hbs.registerHelper('helperMissing', () => '');
for (const name of ['selectOptions', 'arrayToObject', 'checked', 'toLowerCase', 'gt', 'and', 'eq', 'not', 'concat', 'option', 'defaultVal', 'hideIf', 'hideIfNot', 'isExpanded', 'dhlog', 'getBioOptions', 'cleanFieldName', 'capitalize', 'localize']) {
    hbs.registerHelper(name, () => '');
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** Counts the top-level elements of an HTML fragment (comments and text are ignored). */
function countRoots(html) {
    const stripped = html.replace(/<!--[\s\S]*?-->/g, '');
    let depth = 0;
    let roots = 0;
    for (const m of stripped.matchAll(/<\/?([a-zA-Z][\w-]*)[^>]*?(\/?)>/g)) {
        const tag = m[1].toLowerCase();
        const closing = m[0].startsWith('</');
        const selfClosing = m[2] === '/' || VOID.has(tag);
        if (closing) depth--;
        else {
            if (depth === 0) roots++;
            if (!selfClosing) depth++;
        }
    }
    assert.equal(depth, 0, 'unbalanced tags');
    return roots;
}

// Templates that are used as the (only) part of an ApplicationV2 window
const parts = all
    .map((f) => path.relative(ROOT, f).replaceAll('\\', '/'))
    .filter((rel) => /^(actor\/dossier\/[^/]+|actor\/actor-[^/]+-sheet|item\/item-[^/]+-sheet|prompt\/(weapon|psychic|force|assign)[^/]*)\.hbs$/.test(rel));

const context = {
    actor: { system: { bio: {} }, items: [] },
    item: { system: {}, effects: [] },
    dossier: { res: { wounds: { bar: {} }, fate: {}, fatigue: {} }, development: {}, psychic: {}, combat: {}, gear: {}, relations: {}, progression: {}, statusTiles: [] },
    rollData: {},
    weapons: [],
    dh: {},
};

test('there are window parts to check', () => {
    assert.ok(parts.length > 20, `found ${parts.length}`);
    assert.ok(parts.includes('prompt/weapon-roll-prompt.hbs'));
    assert.ok(parts.includes('actor/dossier/header.hbs'));
});

for (const rel of parts) {
    test(`${rel} renders exactly one root element`, () => {
        const html = hbs.compile(fs.readFileSync(path.join(ROOT, rel), 'utf8'))(context);
        assert.equal(countRoots(html), 1);
    });
}

const chatContext = {
    id: 'roll1',
    rollData: {
        name: 'Lasgun', action: 'Standard Attack', baseTarget: 55, modifiedTarget: 65, activeModifiers: { aim: 10 }, success: true, dos: 2, roll: { total: 41 },
        showDamage: true, targetActor: { uuid: 'Actor.abc' }, difficulties: {}, damage: 0,
    },
    effectOutput: [],
    damageData: { hits: [{ location: 'Body', totalDamage: 9, totalPenetration: 1, totalFatigue: 0, damageType: 'Energy', damageRoll: { formula: '1d10', result: 5 }, effects: [], righteousFury: [] }] },
    actor: { name: 'Severin', uuid: 'Actor.abc', system: { wounds: { value: 3, max: 12, critical: 0 }, fatigue: { value: 0, max: 5 } } },
    damage: 5, hit: { location: 'Body', damageType: 'Energy' }, hasDamage: true, damageTaken: 4,
};
const chatTemplates = all.map((f) => path.relative(ROOT, f).replaceAll('\\', '/')).filter((rel) => rel.startsWith('chat/'));

for (const rel of chatTemplates) {
    test(`${rel} renders one dark card (dh-ui dh-card) and no legacy markup`, () => {
        const html = hbs.compile(fs.readFileSync(path.join(ROOT, rel), 'utf8'))(chatContext);
        assert.equal(countRoots(html), 1);
        assert.match(html, /class="dh-ui dh-card/);
        assert.doesNotMatch(html, /dh-wrapper|material-icons/);
    });
}

test('interactive chat controls keep the classes and data attributes the chat handlers rely on', () => {
    const action = hbs.compile(fs.readFileSync(path.join(ROOT, 'chat/action-roll-chat.hbs'), 'utf8'))(chatContext);
    assert.match(action, /roll-control__hide-control[^>]*data-toggle="roll1"/);
    assert.match(action, /roll-control__refund[^>]*data-roll-id="roll1"/);
    assert.match(action, /roll-control__fate-reroll[^>]*data-roll-id="roll1"/);
    assert.match(action, /id="roll1"[^>]*style="display: none"/); // the damage block the hide control toggles
    for (const attr of ['data-location', 'data-total-damage', 'data-total-penetration', 'data-total-fatigue', 'data-target-uuid', 'data-damage-type']) {
        assert.match(action, new RegExp(`roll-control__assign-damage[^>]*${attr}=`, 's'));
    }
    const burning = hbs.compile(fs.readFileSync(path.join(ROOT, 'chat/burning-chat.hbs'), 'utf8'))({ ...chatContext, success: false, roll: { total: 80 }, target: 50 });
    for (const attr of ['data-type="Energy"', 'data-ignore-armour="true"', 'data-uuid="Actor.abc"', 'data-damage=', 'data-fatigue="1"']) {
        assert.ok(burning.includes(attr), attr);
    }
    const psychic = hbs.compile(fs.readFileSync(path.join(ROOT, 'chat/psychic-action-chat.hbs'), 'utf8'))(chatContext);
    assert.match(psychic, /roll-control__hide-control[^>]*data-toggle="roll1"/);
    assert.match(psychic, /roll-control__fate-reroll[^>]*data-roll-id="roll1"/);
});

test('the root counter detects a second top-level element', () => {
    assert.equal(countRoots('<div><p>a</p></div>'), 1);
    assert.equal(countRoots('<div></div><div></div>'), 2);
    assert.equal(countRoots('<!-- c --><div><img src="x"><input></div>'), 1);
});
