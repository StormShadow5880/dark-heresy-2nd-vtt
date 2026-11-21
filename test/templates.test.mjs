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

hbs.registerHelper('eqs', (a, b) => String(a) === String(b));

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
    .filter((rel) => /^(actor\/dossier\/[^/]+|actor\/actor-[^/]+-sheet|item\/item-[^/]+-sheet|prompt\/(weapon|psychic|force|assign)[^/]*|creator\/creator)\.hbs$/.test(rel));

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

test('creator wizard: every step renders with exactly one root and a navigation', () => {
    const template = hbs.compile(fs.readFileSync(path.join(ROOT, 'creator/creator.hbs'), 'utf8'));
    for (const step of ['welcome', 'homeworld', 'characteristics', 'background', 'role', 'aptitudes', 'skills', 'vitals', 'elite', 'xp', 'equipment', 'biography', 'review']) {
        for (const method of ['roll', 'pointbuy']) {
            const html = template({
                at: { [step]: true },
                method,
                steps: [{ id: 'welcome', label: 'Welcome', index: 1, current: true }],
                chars: [{ key: 'strength', label: 'Strength', short: 'S', kind: 'positive', formula: '3d10', rolled: false }],
                xp: { talents: [], characteristics: [], skills: [], purchases: [], failed: [] },
                vitals: {},
                elite: {},
                state: { aptitudes: [], bonuses: [], talents: [], traits: [] },
                summary: { chars: [], aptitudes: [] },
                review: { checklist: [], warnings: [], ready: false },
                bio: {},
                pointBuy: { errors: [] },
            });
            assert.equal(countRoots(html), 1, `${step}/${method}`);
            assert.match(html, /creator__nav/);
            assert.match(html, /data-action="next"/);
        }
    }
});

test('attack automation chat cards render their data', () => {
    const request = hbs.compile(fs.readFileSync(path.join(ROOT, 'chat/defence-request-chat.hbs'), 'utf8'))({
        targetName: 'Cultist', attackerName: 'Voss', weaponName: 'Lasgun', hitCount: 2, multiple: true,
        choices: [{ id: 'dodge', label: 'Dodge', icon: 'fa-person-running', target: 45 }, { id: 'none', label: 'Take the hit', icon: 'fa-burst' }],
    });
    assert.match(request, /Cultist/);
    assert.match(request, /2 hits/);
    assert.match(request, /data-choice="dodge"/);
    assert.match(request, /data-choice="none"/);
    const result = hbs.compile(fs.readFileSync(path.join(ROOT, 'chat/attack-result-chat.hbs'), 'utf8'))({
        attackerName: 'Voss', targetName: 'Cultist', weaponName: 'Lasgun', evaded: false, maxWounds: 12,
        evasion: { label: 'Dodge', roll: 80, target: 45, success: false },
        result: { damage: 6, critical: 0, wounds: 6, criticalTotal: 0, hits: [{ location: 'Body', rawDamage: 12, damageType: 'Energy', usableArmour: 3, toughnessBonus: 3, wounds: 6, critical: 0, fatigue: 0 }] },
    });
    assert.match(result, /Dodge failed/);
    assert.match(result, /12 Energy − armour 3 − TB 3 = 6/);
    assert.match(result, /6 \/ 12/);
    const evaded = hbs.compile(fs.readFileSync(path.join(ROOT, 'chat/attack-result-chat.hbs'), 'utf8'))({ targetName: 'X', evaded: true, evasion: { label: 'Parry', roll: 10, target: 40, success: true, degrees: 4 } });
    assert.match(evaded, /Parry succeeded/);
    assert.match(evaded, /no damage/);
});

test('barrage / storm chat cards', () => {
    const request = hbs.compile(fs.readFileSync(path.join(ROOT, 'chat/spread-request-chat.hbs'), 'utf8'))({
        attackType: 'Psychic Barrage', powerName: 'Mind Lash', attackerName: 'Voss', targetName: 'Cultist', hitCount: 3, extraHits: 2, manyExtra: true, range: 2,
    });
    assert.match(request, /Choose 2 targets/);
    assert.match(request, /within 2 metres/);
    assert.match(request, /dh-spread__choose/);
    const result = hbs.compile(fs.readFileSync(path.join(ROOT, 'chat/spread-result-chat.hbs'), 'utf8'))({
        attackType: 'Psychic Storm', powerName: 'X', groups: [{ targetName: 'A', count: 1, many: false }, { targetName: 'B', count: 2, many: true }],
    });
    assert.match(result, /<b>A<\/b>: 1 hit – answers in the chat/);
    assert.match(result, /<b>B<\/b>: 2 hits/);
});

test('blast chat cards', () => {
    const request = hbs.compile(fs.readFileSync(path.join(ROOT, 'chat/blast-request-chat.hbs'), 'utf8'))({ label: 'Psychic Blast', powerName: 'Flame', attackerName: 'Voss', targetName: 'Cultist', radius: 4 });
    assert.match(request, /\(4 m\)/);
    assert.match(request, /dh-blast__choose/);
    const result = hbs.compile(fs.readFileSync(path.join(ROOT, 'chat/blast-result-chat.hbs'), 'utf8'))({
        label: 'Blast', powerName: 'Frag', radius: 4, count: 2, many: true, targets: [{ name: 'A', distance: 0 }, { name: 'B', distance: 3, blocked: true }],
    });
    assert.match(result, /2 targets in 4 m/);
    assert.match(result, /<b>B<\/b> · 3 m from the centre · way out blocked/);
});

test('defence cards show the rules for several hits and for areas', () => {
    const request = hbs.compile(fs.readFileSync(path.join(ROOT, 'chat/defence-request-chat.hbs'), 'utf8'))({
        targetName: 'A', attackerName: 'B', weaponName: 'W', hitCount: 3, multiple: true, notes: ['Each degree of success prevents one hit.'], choices: [{ id: 'none', label: 'Take the hit', icon: 'fa-burst' }],
    });
    assert.match(request, /Each degree of success prevents one hit/);
    const partial = hbs.compile(fs.readFileSync(path.join(ROOT, 'chat/attack-result-chat.hbs'), 'utf8'))({
        targetName: 'A', evaded: false, partial: true, prevented: 1, total: 3, manyHits: true, maxWounds: 10,
        evasion: { label: 'Dodge', roll: 44, target: 45, success: true, degrees: 1 },
        result: { damage: 4, critical: 0, wounds: 6, criticalTotal: 0, hits: [] },
    });
    assert.match(partial, /1 degree of success: 1 of 3 hits prevented/);
    assert.match(partial, /1 of 3 hits prevented, the others strike/);
    const missed = hbs.compile(fs.readFileSync(path.join(ROOT, 'chat/attack-result-chat.hbs'), 'utf8'))({
        targetName: 'A', evaded: true, prevented: 3, total: 3, manyHits: true,
        evasion: { label: 'Dodge', roll: 10, target: 45, success: true, degrees: 4 },
    });
    assert.match(missed, /the attack missed/);
});
