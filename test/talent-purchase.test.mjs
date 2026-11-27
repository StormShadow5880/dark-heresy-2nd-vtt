import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { installFoundryStubs, makeActor } from './helpers.mjs';

const notes = installFoundryStubs();
const adv = await import('../src/module/rules/advancement.mjs');
const { TALENT_COSTS, TALENT_SPECIALISATIONS } = await import('../src/module/rules/advancement-data.mjs');
const { purchaseAdvancement } = await import('../src/module/rules/experience.mjs');
const { evaluatePrerequisites, normalizeName, viewOf } = await import('../src/module/rules/prerequisites.mjs');

const docs = yaml.loadAll(readFileSync(new URL('../src/packs/talents/talents.yml', import.meta.url), 'utf8')).filter(Boolean);
const talentOf = (d) => ({ id: d.name, name: d.name, img: 'x.webp', aptitudes: d.data?.aptitudes ?? d.system?.aptitudes, tier: d.data?.tier ?? d.system?.tier, prerequisites: d.data?.prerequisites ?? d.system?.prerequisites ?? '', system: { benefit: 'text' } });
const byName = Object.fromEntries(docs.map((d) => [d.name, talentOf(d)]));
const index = docs.map((d) => ({ name: d.name }));
globalThis.game.packs = { get: () => ({ index }) };

test.beforeEach(() => {
    notes.warnings.length = 0;
    game.user.isGM = false;
});

/** A character with 40 in every characteristic, some aptitudes and plenty of EP */
const actorWith = ({ chars = {}, aptitudes = [], talents = [], extraItems = [], total = 20000 } = {}) => {
    const actor = makeActor({ total, aptitudes, talents });
    for (const [key, value] of Object.entries(chars)) actor.system.characteristics[key].total = value;
    actor.items.push(...extraItems);
    for (const c of Object.values(actor.system.characteristics)) c.total = c.total ?? 30;
    actor.system.skills.awareness.label = 'Awareness';
    return actor;
};

test('every talent of the compendium can be priced: valid tier, two aptitudes, price from the table for 0, 1 and 2 matching aptitudes', () => {
    assert.ok(docs.length >= 100);
    for (const d of docs) {
        const t = talentOf(d);
        const groups = adv.parseRequirement(t.aptitudes);
        assert.equal(groups.length, 2, `${t.name}: aptitudes "${t.aptitudes}"`);
        assert.ok([1, 2, 3].includes(Number(t.tier)), `${t.name}: tier ${t.tier}`);
        const choice = adv.isMultipleTalent(t.name) ? (TALENT_SPECIALISATIONS[t.name]?.[0] ?? 'X') : '';
        const price = (names) => adv.talentQuote(actorWith({ aptitudes: names }), t, choice).cost;
        // "General" is implicit for everybody: a talent with General starts with one match
        const implicit = groups.filter((g) => g.includes('general')).length;
        const first = groups.find((g) => !g.includes('general'));
        const aptitudeNamesOf = (group) => group.map((id) => adv.aptitudeName(id));
        assert.equal(price([]), TALENT_COSTS[Math.min(2, implicit)][Number(t.tier) - 1], `${t.name}: no aptitudes`);
        if (first) assert.equal(price([aptitudeNamesOf(first)[0]]), TALENT_COSTS[Math.min(2, implicit + 1)][Number(t.tier) - 1], `${t.name}: one aptitude`);
        const all = groups.flatMap((g) => aptitudeNamesOf(g)[0]);
        assert.equal(price(all), TALENT_COSTS[2][Number(t.tier) - 1], `${t.name}: both aptitudes`);
    }
});

test('the choice talents of the system need a choice and the other talents do not', () => {
    for (const name of ['Weapon Training', 'Exotic Weapon Training', 'Peer', 'Resistance', 'Hatred', 'Enemy', 'Two-Weapon Wielder']) {
        const q = adv.talentQuote(actorWith(), byName[name]);
        assert.equal(q.multiple, true, name);
        assert.equal(q.advanceable, false, name);
        assert.match(q.error, /choice/, name);
    }
    assert.equal(adv.talentQuote(actorWith(), byName.Frenzy).advanceable, true);
});

test('prerequisites: nothing is met by accident and nothing perfect is blocked (sweep over the whole compendium)', () => {
    const known = new Set(docs.map((d) => normalizeName(d.name)));
    const chars = ['weaponSkill', 'ballisticSkill', 'strength', 'toughness', 'agility', 'intelligence', 'perception', 'willpower', 'fellowship'];
    const strong = actorWith({ chars: Object.fromEntries(chars.map((k) => [k, 99])), talents: docs.map((d) => d.name) });
    for (const s of Object.values(strong.system.skills)) {
        if (s.isSpecialist) Object.values(s.specialities).forEach((sp) => Object.assign(sp, { advance: 4, taken: true }));
        else s.advance = 4;
    }
    strong.system.psy.rating = 3;
    // talents with a choice are owned with their choice
    for (const name of ['Resistance (Fear)', 'Resistance (Psychic Powers)', 'Two-Weapon Wielder (Melee)', 'Two-Weapon Wielder (Ranged)']) strong.items.push({ type: 'talent', name });
    const weak = actorWith({ chars: Object.fromEntries(chars.map((k) => [k, 10])) });
    let withCharacteristic = 0;
    for (const d of docs) {
        const t = talentOf(d);
        if (!t.prerequisites) continue;
        const good = evaluatePrerequisites(t.prerequisites, viewOf(strong, known));
        assert.notEqual(good.status, 'unmet', `${t.name}: a perfect character must not be blocked (${good.unmet})`);
        const bad = evaluatePrerequisites(t.prerequisites, viewOf(weak, known));
        if (/\b(Weapon Skill|Ballistic Skill|Strength|Toughness|Agility|Intelligence|Perception|Willpower|Fellowship) \d\d/.test(t.prerequisites)) {
            withCharacteristic++;
            // a requirement with a characteristic is decided: never "met" for a character with 10 everywhere unless an alternative without it is met
            assert.ok(['unmet', 'manual'].includes(bad.status) || /\bor\b/.test(t.prerequisites), `${t.name}: ${bad.status}`);
        }
    }
    assert.ok(withCharacteristic >= 40);
});

test('purchase: a talent without prerequisites is bought at its price, the item carries the data, EP and log are written', async () => {
    const actor = actorWith({ aptitudes: ['Strength', 'Offence'], total: 1000 });
    const r = await purchaseAdvancement(actor, { kind: 'talent', key: 'Frenzy', talent: byName.Frenzy });
    assert.equal(r.ok, true, r.errors?.join());
    assert.equal(r.quote.cost, 200); // tier 1, both aptitudes
    assert.equal(actor.system.experience.used, 200);
    const item = actor.items.find((i) => i.name === 'Frenzy');
    assert.equal(item.type, 'talent');
    assert.equal(item.system.cost, 200);
    assert.equal(item.system.tier, '1');
    assert.equal(item.system.benefit, 'text');
    assert.equal(actor.flags.xpLog.at(-1).category, 'Talent');
    assert.equal(actor.flags.xpLog.at(-1).cost, 200);
});

test('purchase: a characteristic prerequisite blocks the purchase and changes nothing; reaching it allows it', async () => {
    const actor = actorWith({ chars: { agility: 25 } });
    const blocked = await purchaseAdvancement(actor, { kind: 'talent', key: 'Ambidextrous', talent: byName.Ambidextrous, silent: true });
    assert.equal(blocked.ok, false);
    assert.match(blocked.errors[0], /Prerequisites not met: Agility 30/);
    assert.equal(actor.system.experience.used, 0);
    assert.equal(actor.items.some((i) => i.name === 'Ambidextrous'), false);
    actor.system.characteristics.agility.total = 30;
    const ok = await purchaseAdvancement(actor, { kind: 'talent', key: 'Ambidextrous', talent: byName.Ambidextrous, silent: true });
    assert.equal(ok.ok, true);
});

test('purchase: a talent that needs another talent, and alternatives', async () => {
    const actor = actorWith({ chars: { weaponSkill: 40, agility: 45 } });
    const no = await purchaseAdvancement(actor, { kind: 'talent', key: 'Hammer Blow', talent: byName['Hammer Blow'], silent: true });
    assert.equal(no.ok, false);
    assert.match(no.errors[0], /Crushing Blow/);
    assert.equal((await purchaseAdvancement(actor, { kind: 'talent', key: 'Crushing Blow', talent: byName['Crushing Blow'], silent: true })).ok, true);
    assert.equal((await purchaseAdvancement(actor, { kind: 'talent', key: 'Hammer Blow', talent: byName['Hammer Blow'], silent: true })).ok, true);
    // alternatives: Ballistic Skill 45 OR Weapon Skill 45
    const alt = actorWith({ chars: { weaponSkill: 46, ballisticSkill: 30 } });
    assert.equal((await purchaseAdvancement(alt, { kind: 'talent', key: 'Deathdealer', talent: byName.Deathdealer, silent: true })).ok, true);
    const none = actorWith({ chars: { weaponSkill: 44, ballisticSkill: 44 } });
    assert.equal((await purchaseAdvancement(none, { kind: 'talent', key: 'Deathdealer', talent: byName.Deathdealer, silent: true })).ok, false);
});

test('purchase: choice talents are checked with their choice (Adamantium Faith needs Jaded and Resistance (Fear))', async () => {
    const actor = actorWith({ chars: { willpower: 50 } });
    const buy = (name, choice = '') => purchaseAdvancement(actor, { kind: 'talent', key: name, talent: byName[name], choice, silent: true });
    assert.equal((await buy('Adamantium Faith')).ok, false);
    assert.equal((await buy('Jaded')).ok, true);
    assert.equal((await buy('Resistance', 'Psychic Powers')).ok, true);
    assert.equal((await buy('Adamantium Faith')).ok, false); // Resistance (Fear) is not the same as Resistance (Psychic Powers)
    assert.equal((await buy('Resistance', 'Fear')).ok, true);
    assert.equal((await buy('Resistance', 'Fear')).ok, false); // the same choice twice
    assert.equal((await buy('Adamantium Faith')).ok, true);
    assert.deepEqual(actor.items.filter((i) => i.type === 'talent').map((i) => i.name).sort(), ['Adamantium Faith', 'Jaded', 'Resistance (Fear)', 'Resistance (Psychic Powers)']);
});

test('purchase: what cannot be checked automatically has to be confirmed; an owned implant counts as proof', async () => {
    const actor = actorWith();
    const without = await purchaseAdvancement(actor, { kind: 'talent', key: 'Mechadendrite Use', talent: byName['Mechadendrite Use'], silent: true });
    assert.equal(without.ok, false);
    assert.match(without.errors[0], /Check these prerequisites yourself and confirm them: Mechanicus Implants/);
    const confirmed = await purchaseAdvancement(actor, { kind: 'talent', key: 'Mechadendrite Use', talent: byName['Mechadendrite Use'], prerequisitesConfirmed: true, silent: true });
    assert.equal(confirmed.ok, true);
    const owner = actorWith({ extraItems: [{ type: 'cybernetic', name: 'Mechanicus Implants' }] });
    assert.equal((await purchaseAdvancement(owner, { kind: 'talent', key: 'Mechadendrite Use', talent: byName['Mechadendrite Use'], silent: true })).ok, true);
});

test('purchase: an unmet prerequisite cannot be confirmed away; only a GM can override it', async () => {
    const actor = actorWith({ chars: { toughness: 30 } });
    const base = { kind: 'talent', key: 'Hardy', talent: byName.Hardy, silent: true };
    assert.equal((await purchaseAdvancement(actor, { ...base, prerequisitesConfirmed: true })).ok, false);
    assert.equal((await purchaseAdvancement(actor, { ...base, gmOverride: true })).ok, false); // a player's request for an override is ignored
    game.user.isGM = true;
    assert.equal((await purchaseAdvancement(actor, { ...base, gmOverride: true })).ok, true);
    assert.equal(actor.system.experience.used, adv.talentQuote(actorWith(), byName.Hardy).cost);
});

test('purchase: not enough EP, a learned talent and a double click change nothing', async () => {
    const poor = actorWith({ total: 100 });
    const r = await purchaseAdvancement(poor, { kind: 'talent', key: 'Frenzy', talent: byName.Frenzy, silent: true });
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /Not enough EP/);
    assert.equal(poor.items.some((i) => i.name === 'Frenzy'), false);
    const actor = actorWith();
    const [a, b] = await Promise.all([
        purchaseAdvancement(actor, { kind: 'talent', key: 'Frenzy', talent: byName.Frenzy, silent: true }),
        purchaseAdvancement(actor, { kind: 'talent', key: 'Frenzy', talent: byName.Frenzy, silent: true }),
    ]);
    assert.deepEqual([a.ok, b.ok].sort(), [false, true]);
    assert.equal(actor.items.filter((i) => i.name === 'Frenzy').length, 1);
    assert.equal(actor.system.experience.used, 600);
    assert.equal((await purchaseAdvancement(actor, { kind: 'talent', key: 'Frenzy', talent: byName.Frenzy, silent: true })).ok, false);
});

const aura = { id: 'p1', name: 'Aura of Fear', discipline: 'Minor', cost: 100, data: { _id: 'p1', name: 'Aura of Fear', type: 'psychicPower', img: 'x.webp', system: { cost: 100, discipline: 'Minor' } } };

test('psychic powers: bought at the price of the data, the item is created without the compendium identity, a duplicate is refused', async () => {
    const actor = actorWith({ total: 500 });
    actor.system.psy.rating = 2;
    const r = await purchaseAdvancement(actor, { kind: 'power', key: 'Aura of Fear', power: aura, silent: true });
    assert.equal(r.ok, true, r.errors?.join());
    assert.equal(actor.system.experience.used, 100);
    const item = actor.items.find((i) => i.name === 'Aura of Fear');
    assert.equal(item.type, 'psychicPower');
    assert.equal(item.system.cost, 100);
    assert.equal(item._id, undefined);
    assert.equal(actor.flags.xpLog.at(-1).category, 'Psychic Power');
    assert.equal((await purchaseAdvancement(actor, { kind: 'power', key: 'Aura of Fear', power: aura, silent: true })).ok, false);
});

test('psychic powers: without a Psy Rating the purchase has to be confirmed; without a price it cannot be bought', async () => {
    const actor = actorWith({ total: 500 });
    actor.system.psy.rating = 0;
    const no = await purchaseAdvancement(actor, { kind: 'power', key: 'Aura of Fear', power: aura, silent: true });
    assert.equal(no.ok, false);
    assert.match(no.errors[0], /Psy Rating 0/);
    assert.equal((await purchaseAdvancement(actor, { kind: 'power', key: 'Aura of Fear', power: aura, prerequisitesConfirmed: true, silent: true })).ok, true);
    const free = await purchaseAdvancement(actorWith(), { kind: 'power', key: 'X', power: { ...aura, name: 'X', cost: 0 }, silent: true });
    assert.equal(free.ok, false);
    assert.match(free.errors[0], /no price/);
});

test('Two-Weapon Wielder is bought as Melee or Ranged, separately', () => {
    const wielder = byName['Two-Weapon Wielder'];
    assert.equal(adv.isMultipleTalent('Two-Weapon Wielder'), true);
    assert.match(adv.talentQuote(actorWith(), wielder).error, /choice/);
    assert.match(adv.talentQuote(actorWith(), wielder, 'Sideways').error, /choose Melee or Ranged/);
    const melee = adv.talentQuote(actorWith(), wielder, 'melee');
    assert.equal(melee.advanceable !== false, true);
    assert.equal(melee.label ?? melee.name, 'Two-Weapon Wielder (melee)');
    assert.equal(melee.tier, 2);
    // one specialisation does not block the other
    const owned = actorWith({ talents: ['Two-Weapon Wielder (Melee)'] });
    assert.equal(!!adv.talentQuote(owned, wielder, 'Ranged').maxed, false);
    assert.equal(adv.talentQuote(owned, wielder, 'Melee').maxed, true);
});

test('an old general Two-Weapon Wielder is not read as a specialisation: the GM decides', () => {
    const wielder = byName['Two-Weapon Wielder'];
    const old = actorWith({ talents: ['Two-Weapon Wielder'] });
    const q = adv.talentQuote(old, wielder, 'Melee');
    assert.equal(q.prerequisiteCheck.status, 'manual');
    assert.match(q.prerequisiteCheck.manual.join(' '), /old general Two-Weapon Wielder/);
    // the purchase needs the confirmation
    assert.equal(adv.checkPurchase(old, q).ok, false);
    assert.equal(adv.checkPurchase(old, q, { prerequisitesConfirmed: true }).ok, true);
    // Two-Weapon Master needs both specialisations: the old entry gives "manual", not "met"
    const master = adv.talentQuote(old, byName['Two-Weapon Master'], '');
    assert.notEqual(master.prerequisiteCheck.clauses.find((c) => /Two-Weapon Wielder/.test(c.text ?? c.requirement ?? ''))?.status, 'met');
});

test('Enemy is not bought with XP: blocked, only a GM can override', () => {
    const enemy = byName.Enemy;
    const q = adv.talentQuote(actorWith(), enemy, 'Cultists');
    assert.equal(q.prerequisiteCheck.status, 'unmet');
    const rich = Object.assign(actorWith(), {});
    rich.system.experience = { total: 5000, used: 0 };
    assert.equal(adv.checkPurchase(rich, q).ok, false);
    assert.equal(adv.checkPurchase(rich, q, { gmOverride: true }).ok, true);
});
