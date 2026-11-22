import test from 'node:test';
import assert from 'node:assert/strict';
import { installFoundryStubs, makeActor } from './helpers.mjs';

installFoundryStubs();
const { buildCatalog, buyability, filterRows } = await import('../src/module/rules/catalog.mjs');
globalThis.game.packs = { get: () => ({ index: [{ name: 'Frenzy' }, { name: 'Hardy' }, { name: 'Weapon Training' }, { name: 'Ambidextrous' }] }) };

const talents = [
    { id: 't1', name: 'Frenzy', img: '', aptitudes: 'Strength, Offence', tier: '1', prerequisites: '' },
    { id: 't2', name: 'Hardy', img: '', aptitudes: 'Toughness, Defence', tier: '2', prerequisites: 'Toughness 40' },
    { id: 't3', name: 'Weapon Training', img: '', aptitudes: 'General, Finesse', tier: '1', prerequisites: '' },
    { id: 't4', name: 'Ambidextrous', img: '', aptitudes: 'Weapon Skill, Ballistic Skill', tier: '1', prerequisites: 'Agility 30' },
];
const powers = [
    { id: 'p1', name: 'Aura of Fear', discipline: 'Minor', cost: 100 },
    { id: 'p2', name: 'Mystery Power', discipline: 'Minor', cost: 0 },
];
const actor = (opts = {}) => {
    const a = makeActor({ total: 1000, ...opts });
    a.system.psy.rating = opts.psy ?? 1;
    return a;
};
const row = (cat, tab, name) => cat.tabs[tab].find((r) => r.name === name);

test('the catalogue has the four lists: characteristics, skills, talents, psychic powers', () => {
    const cat = buildCatalog(actor(), { talents, powers });
    assert.equal(cat.available, 1000);
    assert.ok(cat.tabs.char.length >= 9);
    assert.ok(cat.tabs.skill.length >= 1);
    assert.equal(cat.tabs.talent.length, 4);
    assert.equal(cat.tabs.power.length, 2);
    const ws = cat.tabs.char[0];
    assert.match(ws.value, /\d+ → \d+/); // the value now and after the advance
    assert.ok(ws.cost > 0);
    assert.ok(row(cat, 'skill', 'Awareness').value.includes('→'));
});

test('talents: price, tier, prerequisites status and whether they can be bought', () => {
    const cat = buildCatalog(actor({ aptitudes: ['Strength', 'Offence'] }), { talents, powers });
    const frenzy = row(cat, 'talent', 'Frenzy');
    assert.equal(frenzy.cost, 200);
    assert.equal(frenzy.status, 'none');
    assert.equal(frenzy.canBuy, true);
    const hardy = row(cat, 'talent', 'Hardy');
    assert.equal(hardy.status, 'unmet'); // Toughness is 30
    assert.equal(hardy.canBuy, false);
    assert.match(hardy.reason, /Toughness 40/);
    const gm = buildCatalog(actor(), { talents, powers }, { isGM: true });
    assert.equal(row(gm, 'talent', 'Hardy').canBuy, true); // a GM may override
    const wt = row(cat, 'talent', 'Weapon Training');
    assert.equal(wt.multiple, true); // asks for the choice when buying
    assert.equal(wt.canBuy, true);
});

test('talents: a learned talent and not enough EP', () => {
    const cat = buildCatalog(actor({ talents: ['Frenzy'], total: 100 }), { talents, powers });
    assert.equal(row(cat, 'talent', 'Frenzy').learned, true);
    assert.equal(row(cat, 'talent', 'Frenzy').canBuy, false);
    const poor = row(cat, 'talent', 'Ambidextrous');
    assert.equal(poor.canBuy, false);
    assert.match(poor.reason, /Not enough EP/);
});

test('psychic powers: the price of the data, a power without a price and a character without Psy Rating', () => {
    const cat = buildCatalog(actor(), { talents, powers });
    assert.equal(row(cat, 'power', 'Aura of Fear').cost, 100);
    assert.equal(row(cat, 'power', 'Aura of Fear').canBuy, true);
    assert.equal(row(cat, 'power', 'Mystery Power').canBuy, false);
    assert.match(row(cat, 'power', 'Mystery Power').reason, /no price/);
    const none = buildCatalog(actor({ psy: 0 }), { talents, powers });
    const aura = row(none, 'power', 'Aura of Fear');
    assert.equal(aura.status, 'manual'); // not decided: the player / GM confirms
    assert.equal(aura.canBuy, true);
    const learned = actor();
    learned.items.push({ type: 'psychicPower', name: 'Aura of Fear' });
    assert.equal(row(buildCatalog(learned, { talents, powers }), 'power', 'Aura of Fear').learned, true);
});

test('buyability and filters', () => {
    assert.equal(buyability({ advanceable: true, cost: 100 }, 50).canBuy, false);
    assert.equal(buyability({ advanceable: true, cost: 100 }, 100).canBuy, true);
    assert.equal(buyability({ advanceable: true, maxed: true, cost: null }, 500).canBuy, false);
    const cat = buildCatalog(actor({ total: 250 }), { talents, powers });
    assert.ok(filterRows(cat.tabs.talent, { search: 'frenz' }).every((r) => r.name === 'Frenzy'));
    assert.ok(filterRows(cat.tabs.talent, { onlyBuyable: true }).every((r) => r.canBuy));
    assert.ok(filterRows(cat.tabs.talent, { onlyBuyable: true }).length < cat.tabs.talent.length);
});
