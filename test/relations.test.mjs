import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNetwork, capModifier, describeRelation, isSocialSkill, level, levelToModifier, needsGmResolution, personalLevel, resolveRelation, signed } from '../src/module/rules/relations.mjs';
import { contactOf, emptyPatron, mergePatron, normalizeRelations, patronOwnership, patronRelation, playerView, publicRollSummary, shouldProcess, splitPatron } from '../src/module/rules/relations-data.mjs';
import { degreesOfSuccess } from '../src/module/rules/degrees.mjs';

const personal = (f, c, extra = {}) => resolveRelation({ skill: 'charm', mode: 'personal', factionLevel: f, contactLevel: c, ...extra });

test('levels: positive, negative and neutral faction and contact values', () => {
    assert.equal(levelToModifier(1), 10);
    assert.equal(levelToModifier(-2), -20);
    assert.equal(levelToModifier(0), 0);
    assert.equal(level('3'), 3);
    assert.equal(level('x'), 0);
    assert.equal(level(1.9), 1);
    assert.equal(signed(-1), '−1');
    assert.equal(signed(0), '0');
});

test('personal: faction level + contact value = personal level, 1 level = ±10 (the example −1 + 2 = +1 → +10)', () => {
    assert.equal(personalLevel(-1, 2), 1);
    const r = personal(-1, 2);
    assert.equal(r.level, 1);
    assert.equal(r.modifier, 10);
    assert.deepEqual(r.parts, [{ label: 'Faction', value: -1 }, { label: 'Contact', value: 2 }]);
    assert.equal(personal(2, -3).modifier, -10);
    assert.equal(personal(0, 0).modifier, 0);
    assert.equal(personal(2, 1).modifier, 30);
});

test('personal: a contact without a faction uses only its own value; a faction alone uses only its level', () => {
    assert.equal(personal(null, 2).modifier, 20);
    assert.deepEqual(personal(null, 2).parts, [{ label: 'Contact', value: 2 }]);
    assert.equal(personal(-1, null).modifier, -10);
});

test('patron: the patron value replaces the personal combination, nothing is added twice', () => {
    const r = resolveRelation({ skill: 'charm', mode: 'patron', factionLevel: 2, contactLevel: 2, patronLevel: -1, affiliation: 'known' });
    assert.equal(r.level, -1);
    assert.equal(r.modifier, -10);
    assert.deepEqual(r.parts, [{ label: 'Patron', value: -1 }]);
    assert.equal(r.needsGm, false);
});

test('affiliation: known applies, unknown / hidden need the GM, the GM can override for one roll', () => {
    const base = { skill: 'command', mode: 'patron', patronLevel: 2 };
    assert.equal(resolveRelation({ ...base, affiliation: 'known' }).applies, true);
    const unknown = resolveRelation({ ...base, affiliation: 'unknown' });
    assert.equal(unknown.needsGm, true);
    assert.equal(unknown.applies, false);
    assert.equal(resolveRelation({ ...base, affiliation: 'hidden' }).needsGm, true);
    assert.equal(resolveRelation({ ...base, affiliation: 'unknown', gm: { apply: true } }).modifier, 20);
    assert.equal(resolveRelation({ ...base, affiliation: 'known', gm: { apply: false } }).applies, false);
    assert.equal(resolveRelation({ ...base, affiliation: 'unknown', gm: { affiliation: 'known' } }).modifier, 20);
    // the GM can change the mode for this roll
    assert.equal(resolveRelation({ ...base, mode: 'patron', factionLevel: 1, contactLevel: 1, affiliation: 'unknown', gm: { mode: 'personal' } }).modifier, 20);
});

test('secret patron value: no number in the result, always the GM', () => {
    const r = resolveRelation({ skill: 'charm', mode: 'patron', patronLevel: 3, patronSecret: true, affiliation: 'known' });
    assert.equal(r.secret, true);
    assert.equal(r.needsGm, true);
    assert.equal(r.modifier, 0);
    assert.equal(r.level, 0);
    assert.deepEqual(r.parts, []);
    assert.doesNotMatch(JSON.stringify(r), /3/);
    assert.deepEqual(describeRelation(r, { skillLabel: 'Charm', base: 43 }).at(-1), { label: 'Influence', value: 'unknown' });
});

test('only social skills: no relation on combat, repair or other tests', () => {
    for (const skill of ['charm', 'command', 'commerce', 'deceive', 'inquiry', 'intimidate']) assert.equal(isSocialSkill(skill), true);
    for (const skill of ['techUse', 'dodge', 'security', 'weaponSkill', 'awareness', '']) {
        assert.equal(isSocialSkill(skill), false);
        const r = resolveRelation({ skill, mode: 'personal', factionLevel: 3, contactLevel: 3 });
        assert.equal(r.applies, false);
        assert.equal(r.modifier, 0);
    }
    assert.equal(resolveRelation({ skill: 'charm', mode: 'none' }).applies, false);
});

test('GM limit: none by default, configurable maximum for both signs, separate from the DH2 ±60 limit', () => {
    assert.deepEqual(capModifier(50), { value: 50, capped: false });
    assert.deepEqual(capModifier(50, { mode: 'none', max: 20 }), { value: 50, capped: false });
    assert.deepEqual(capModifier(50, { mode: 'cap', max: 20 }), { value: 20, capped: true });
    assert.deepEqual(capModifier(-50, { mode: 'cap', max: 20 }), { value: -20, capped: true });
    assert.deepEqual(capModifier(10, { mode: 'cap', max: 20 }), { value: 10, capped: false });
    assert.equal(personal(3, 2, { cap: { mode: 'cap', max: 30 } }).modifier, 30);
    assert.equal(personal(3, 2, { cap: { mode: 'cap', max: 30 } }).capped, true);
    assert.equal(personal(3, 2).modifier, 50); // no extra limit: 50 stays (the roll itself limits all modifiers to ±60)
});

test('DH2 roll rules stay: the modifier changes only the target, success and degrees come from the unchanged calculation', () => {
    const base = 43;
    const mod = personal(-1, 2).modifier;
    assert.equal(base + mod, 53);
    assert.equal(degreesOfSuccess(50, base + mod), 0);
    assert.equal(degreesOfSuccess(23, base + mod), 3);
});

test('dialog lines: the example Charm 43, Mechanicus −1, Magos +2, level +1, +10, target 53', () => {
    const lines = describeRelation(personal(-1, 2), { skillLabel: 'Charm', base: 43, factionName: 'Mechanicus', contactName: 'Magos' });
    assert.deepEqual(lines.map((l) => `${l.label}: ${l.value}`), [
        'Charm: 43',
        'Mechanicus: −1',
        'Magos: +2',
        'Personal relationship level: +1',
        'Relationship modifier: +10',
        'Target before other modifiers: 53',
    ]);
});

test('GM resolution: secret, unclear affiliation or "confirm every one"', () => {
    assert.equal(needsGmResolution(personal(1, 1)), false);
    assert.equal(needsGmResolution(personal(1, 1), { confirmAll: true }), true);
    assert.equal(needsGmResolution(resolveRelation({ skill: 'charm', mode: 'patron', patronLevel: 1, affiliation: 'unknown' })), true);
    assert.equal(needsGmResolution(resolveRelation({ skill: 'charm', mode: 'patron', patronLevel: 1, affiliation: 'known' })), false);
    assert.equal(needsGmResolution(resolveRelation({ skill: 'charm', mode: 'none' })), false);
});

test('network: factions with contacts, contacts without a faction, the total per contact', () => {
    const net = buildNetwork(
        [{ id: 'f1', name: 'Mechanicus', level: -1 }, { id: 'f2', name: 'Arbites', level: 0 }],
        [{ id: 'c1', name: 'Magos Rho-Assay', factionId: 'f1', level: 2 }, { id: 'c2', name: 'Old friend', factionId: null, level: 1 }, { id: 'c3', name: 'Orphan', factionId: 'gone', level: 3 }],
    );
    assert.equal(net.groups[0].contacts[0].total, 1);
    assert.equal(net.groups[0].contacts[0].modifier, 10);
    assert.equal(net.groups[0].contacts[0].formula, '−1 +2 = +1');
    assert.equal(net.groups[1].contacts.length, 0);
    assert.deepEqual(net.loose.map((c) => c.name), ['Old friend', 'Orphan']);
    assert.equal(net.loose[0].modifier, 10);
});

/* ---- data: patrons, secrecy, existing characters ---- */

const patron = () => ({
    ...emptyPatron(),
    name: 'Inquisitor Voss',
    liabilities: [{ id: 'l1', name: 'Debt', text: 'Publicly known debt', secret: false }, { id: 'l2', name: 'SECRET TITLE', text: 'SECRET: heretical past', secret: true }],
    relations: [{ id: 'r1', faction: 'Mechanicus', level: 2, note: 'public note on r1', secret: false }, { id: 'r2', faction: 'Ecclesiarchy', level: -3, note: 'SECRET RELATION NOTE', secret: true }],
    gmNotes: 'SECRET GM NOTE',
    notes: 'public note',
});

test('secrets: the public document contains no confidential text or value', () => {
    const { pub, secret } = splitPatron(patron());
    const json = JSON.stringify(pub);
    assert.doesNotMatch(json, /SECRET/);
    assert.doesNotMatch(json, /heretical|SECRET TITLE|SECRET RELATION NOTE/);
    assert.match(json, /public note on r1/);
    assert.doesNotMatch(json, /-3|−3/);
    assert.deepEqual(pub.relations.find((r) => r.id === 'r2'), { id: 'r2', factionId: null, faction: 'Ecclesiarchy', secret: true });
    assert.equal(pub.liabilities.length, 1);
    assert.equal(secret.notes, 'SECRET GM NOTE');
    assert.equal(secret.liabilities[0].text, 'SECRET: heretical past');
    assert.equal(secret.relationLevels.r2, -3);
});

test('secrets: the player view shows only public data, secret values as unknown', () => {
    const { pub } = splitPatron(patron());
    const view = playerView(pub);
    const json = JSON.stringify(view);
    assert.doesNotMatch(json, /SECRET|heretical|-3/);
    assert.equal(view.relations.find((r) => r.id === 'r2').label, 'unknown');
    assert.equal(view.relations.find((r) => r.id === 'r1').label, '2');
    assert.equal(view.assigned, undefined);
});

test('the GM gets everything back: split and merge are lossless', () => {
    const full = patron();
    const { pub, secret } = splitPatron(full);
    const back = mergePatron(pub, secret);
    assert.equal(back.gmNotes, 'SECRET GM NOTE');
    assert.equal(back.relations.find((r) => r.id === 'r2').level, -3);
    assert.equal(back.liabilities.length, 2);
    assert.equal(back.liabilities.find((l) => l.secret).text, 'SECRET: heretical past');
    assert.equal(back.liabilities.find((l) => l.secret).name, 'SECRET TITLE');
    assert.equal(back.relations.find((r) => r.id === 'r2').note, 'SECRET RELATION NOTE');
    assert.equal(patronRelation(back, 'mechanicus').level, 2);
    assert.equal(patronRelation(pub, 'Ecclesiarchy').level, undefined); // the public data has no value
});

test('one patron for several characters without duplicating data', () => {
    const p = { ...emptyPatron(), assigned: ['a1', 'a2', 'a3'] };
    assert.equal(p.assigned.length, 3);
    const owners = patronOwnership([['u1'], ['u2', 'u3'], ['u1']]);
    assert.deepEqual(owners, { default: 0, u1: 2, u2: 2, u3: 2 }); // nobody else can see the patron
    assert.deepEqual(patronOwnership([]), { default: 0 });
});

test('existing characters and contacts are kept: a contact without flags is a contact without a faction and value 0', () => {
    const old = { id: 'i1', name: 'Old contact', img: 'x.png', system: { description: 'Met at the docks' }, flags: {} };
    const c = contactOf(old);
    assert.equal(c.name, 'Old contact');
    assert.equal(c.description, 'Met at the docks');
    assert.equal(c.factionId, null);
    assert.equal(c.level, 0);
    assert.equal(normalizeRelations(undefined).factions.length, 0);
    assert.equal(normalizeRelations({ factions: [{ name: 'Arbites', level: '2' }] }).factions[0].level, 2);
    const withFlags = contactOf({ ...old, flags: { 'dark-heresy-2nd': { relation: { factionId: 'f1', level: '2', background: 'owes me' } } } });
    assert.equal(withFlags.factionId, 'f1');
    assert.equal(withFlags.level, 2);
});

test('secret rolls: the public summary has no roll, target or modifier', () => {
    const s = publicRollSummary({ characterName: 'Anna', skillLabel: 'Charm', success: true, degrees: 2, mode: 'patron' });
    assert.deepEqual(Object.keys(s).sort(), ['characterName', 'degrees', 'influence', 'skillLabel', 'success']);
});

test('several clients: only the active GM processes a request, once', () => {
    const seen = new Set();
    assert.equal(shouldProcess({ activeGmId: 'gm1', selfId: 'gm2', requestId: 'q1', seen }), false); // a second GM client
    assert.equal(shouldProcess({ activeGmId: 'gm1', selfId: 'p1', requestId: 'q1', seen }), false); // a player client
    assert.equal(shouldProcess({ activeGmId: 'gm1', selfId: 'gm1', requestId: 'q1', seen }), true);
    assert.equal(shouldProcess({ activeGmId: 'gm1', selfId: 'gm1', requestId: 'q1', seen }), false); // the same request again
    assert.equal(shouldProcess({ activeGmId: 'gm1', selfId: 'gm1', requestId: 'q2', seen }), true);
    assert.equal(shouldProcess({ activeGmId: null, selfId: 'gm1', requestId: 'q3', seen }), false);
});

import { evaluateSelection } from '../src/module/rules/relations.mjs';

test('selection: personal with faction and contact; patron with a public and a secret value', () => {
    const ctx = {
        factions: [{ id: 'f1', name: 'Mechanicus', level: -1 }],
        contacts: [{ id: 'c1', name: 'Magos', factionId: 'f1', level: 2 }, { id: 'c2', name: 'Friend', factionId: null, level: 1 }],
        patron: { id: 'p1', name: 'Voss', affiliation: 'known', relations: [{ id: 'r1', faction: 'Mechanicus', level: 2 }, { id: 'r2', faction: 'Ecclesiarchy', secret: true }] },
    };
    const personalSel = evaluateSelection(ctx, { mode: 'personal', factionId: 'f1', contactId: 'c1' }, { skill: 'charm' });
    assert.equal(personalSel.modifier, 10);
    assert.equal(personalSel.factionName, 'Mechanicus');
    assert.equal(personalSel.contactName, 'Magos');
    assert.equal(evaluateSelection(ctx, { mode: 'personal', contactId: 'c2' }, { skill: 'charm' }).modifier, 10); // no faction
    const patronSel = evaluateSelection(ctx, { mode: 'patron', patronRelationId: 'r1' }, { skill: 'charm' });
    assert.equal(patronSel.modifier, 20);
    assert.equal(patronSel.needsGm, false);
    const secretSel = evaluateSelection(ctx, { mode: 'patron', patronRelationId: 'r2' }, { skill: 'charm' });
    assert.equal(secretSel.secret, true);
    assert.equal(secretSel.modifier, 0);
    assert.equal(evaluateSelection(ctx, { mode: 'patron', patronRelationId: 'r1' }, { skill: 'techUse' }).applies, false); // not a social test
    assert.equal(evaluateSelection(ctx, { mode: 'personal' }, { skill: 'charm' }).applies, false);
    assert.equal(evaluateSelection({ ...ctx, patron: { ...ctx.patron, affiliation: 'unknown' } }, { mode: 'patron', patronRelationId: 'r1' }, { skill: 'charm' }).needsGm, true);
});
