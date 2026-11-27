import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './creator-helpers.mjs';

const { env } = setup();
const data = await import('../src/module/creator/data.mjs');
const rules = await import('../src/module/creator/rules.mjs');
const ch = await import('../src/module/creator/character.mjs');
const dr = await import('../src/module/creator/draft.mjs');
const fin = await import('../src/module/creator/finalize.mjs');

const resolve = async () => null; // empty compendium: everything becomes a placeholder, listed as missing

/** A complete draft: rolls everything with fixed dice and answers every open choice with its first option */
function complete(homeWorld, background, role, { roll = true } = {}) {
    const d = ch.newDraft();
    dr.setHomeWorld(d, data.HOMEWORLDS.find((h) => h.name === homeWorld).id);
    dr.setBackground(d, data.BACKGROUNDS.find((b) => b.name === background).id);
    dr.setRole(d, data.ROLES.find((r) => r.name === role).id);
    const home = data.HOMEWORLDS.find((h) => h.name === homeWorld);
    for (const k of data.CHARACTERISTIC_KEYS) dr.setCharacteristicRoll(d, k, rules.characteristicKind(home, k) === 'normal' ? [6, 5] : [8, 5, 3]);
    d.wounds.roll = 2;
    d.fate.roll = 5;
    d.divination.roll = 50; // table text only (no automated change)
    d.corruptionRoll = 4;
    d.biography = { name: `${role} ${background}` };
    for (let i = 0; i < 40; i++) {
        const open = ch.computeCharacter(d, env).choices.filter((c) => c.required && !c.resolved);
        if (!open.length) break;
        for (const c of open) d.choices[c.id] = c.text ? 'Test' : c.options[0].value;
    }
    return d;
}

const concepts = [
    ['Feral World', 'Imperial Guard', 'Warrior'],
    ['Forge World', 'Adeptus Mechanicus', 'Sage'],
    ['Hive World', 'Outcast', 'Assassin'],
    ['Voidborn', 'Adeptus Astra Telepathica', 'Mystic'],
    ['Highborn', 'Adeptus Administratum', 'Hierophant'],
];

for (const [hw, bg, role] of concepts) {
    test(`concept ${hw} / ${bg} / ${role} can be finalized`, async () => {
        const d = complete(hw, bg, role);
        const state = ch.computeCharacter(d, env);
        const status = ch.stepStatus(state, d);
        assert.equal(status.review, true, JSON.stringify(status));
        const { data: actor, missing } = await fin.buildCharacterData(d, env, resolve);
        assert.equal(actor.system.experience.total, 1000);
        assert.equal(actor.system.experience.used, 0);
        assert.ok(actor.system.wounds.max > 0);
        assert.ok(actor.system.fate.max >= 2);
        const aptitudes = actor.items.filter((i) => i.type === 'aptitude').map((i) => i.name);
        assert.equal(new Set(aptitudes).size, aptitudes.length, 'duplicate aptitude items');
        assert.ok(aptitudes.includes('General'));
        assert.ok(actor.items.filter((i) => i.type === 'talent').length >= 2);
        assert.ok(missing.length > 0); // nothing is invented: unknown items are reported
        assert.equal(actor.system.bio.role, role);
        assert.equal(actor.system.bio.background, bg);
        assert.equal(actor.system.bio.homeWorld, hw);
        for (const k of data.CHARACTERISTIC_KEYS) assert.ok(Number.isFinite(actor.system.characteristics[k].base), k);
    });
}

test('Mystic: Psyker elite advance data reaches the actor', async () => {
    const d = complete('Voidborn', 'Adeptus Astra Telepathica', 'Mystic');
    const { data: actor } = await fin.buildCharacterData(d, env, resolve);
    assert.equal(actor.system.bio.elite, 'Psyker');
    assert.equal(actor.system.psy.rating, 1);
    const traits = actor.items.filter((i) => i.type === 'trait').map((i) => i.name);
    assert.ok(traits.includes('Psyker') && traits.includes('Sanctioned'));
    assert.equal(actor.system.experience.used, 0); // not charged
    assert.ok(!actor.system.corruption);
    const rogue = complete('Hive World', 'Outcast', 'Mystic');
    const { data: rogueActor } = await fin.buildCharacterData(rogue, env, resolve);
    assert.equal(rogueActor.system.corruption, 7); // 1d10 (4) + 3
    assert.ok(!rogueActor.items.some((i) => i.name === 'Sanctioned'));
});

test('all home world x background x role combinations are possible (unusual combinations stay allowed)', async () => {
    let count = 0;
    for (const h of data.HOMEWORLDS)
        for (const b of data.BACKGROUNDS)
            for (const r of data.ROLES) {
                const d = complete(h.name, b.name, r.name);
                const s = ch.computeCharacter(d, env);
                assert.equal(ch.stepStatus(s, d).review, true, `${h.name}/${b.name}/${r.name}`);
                const ids = s.aptitudes.map((a) => a.id);
                assert.equal(new Set(ids).size, ids.length);
                count++;
            }
    assert.equal(count, data.HOMEWORLDS.length * data.BACKGROUNDS.length * data.ROLES.length);
});

test('point buy character: values come from the distribution and stay valid after a reload', () => {
    const d = ch.newDraft();
    dr.setHomeWorld(d, 'homeworld.highborn');
    d.characteristics.method = 'pointbuy';
    d.characteristics.points = { fellowship: 10, influence: 10, intelligence: 10, perception: 10, willpower: 10, agility: 10 };
    const s = ch.computeCharacter(d, env);
    assert.equal(s.characteristicsComplete, true);
    assert.equal(s.characteristics.fellowship, 40);
    assert.equal(s.characteristics.toughness, 20); // negative on Highborn
    assert.deepEqual(ch.computeCharacter(JSON.parse(JSON.stringify(d)), env).characteristics, s.characteristics);
    d.characteristics.points.agility = 11;
    assert.equal(ch.computeCharacter(d, env).characteristicsComplete, false);
});

test('XP purchases and free start abilities stay separate; unspent XP stays available', async () => {
    const d = complete('Feral World', 'Imperial Guard', 'Warrior');
    d.advances.push({ kind: 'char', key: 'weaponSkill' }); // Warrior: Weapon Skill + Offence = 2 matches -> 100
    const { data: actor } = await fin.buildCharacterData(d, env, resolve);
    assert.equal(actor.system.experience.total - actor.system.experience.used, 900);
    // the free talents of the creation cost nothing
    assert.ok(actor.items.filter((i) => i.type === 'talent').every((i) => i.system.cost === 0));
});

test('GM / expert mode can finish an incomplete draft, guided mode can not', async () => {
    const d = complete('Feral World', 'Imperial Guard', 'Warrior');
    delete d.choices['eq-eq-1'];
    await assert.rejects(fin.buildCharacterData(d, env, resolve), /not complete/);
    d.mode = 'expert';
    d.overrides.push({ user: 'GM', what: 'equipment left open' });
    const { data: actor } = await fin.buildCharacterData(d, env, resolve);
    assert.equal(actor.flags['dark-heresy-2nd'].creator.overrides.length, 1);
});

test('starting XP is configurable', async () => {
    const d = complete('Feral World', 'Imperial Guard', 'Warrior');
    const { data: actor } = await fin.buildCharacterData(d, { ...env, startingXp: 1500 }, resolve);
    assert.equal(actor.system.experience.total, 1500);
});

test('veteran variant rolls with a base of 25', () => {
    const d = complete('Feral World', 'Imperial Guard', 'Warrior');
    d.characteristics.veteran = true;
    const s = ch.computeCharacter(d, env);
    assert.equal(s.characteristics.agility, 25 + 6 + 5);
});

test('finalize: one Actor.create call; an inconsistent actor is deleted again (rollback)', async () => {
    const d = complete('Feral World', 'Imperial Guard', 'Warrior');
    let created = 0;
    let deleted = 0;
    globalThis.Actor = {
        async create(payload) {
            created++;
            return { name: payload.name, items: { size: payload.items.length - 1 }, system: payload.system, async delete() { deleted++; } };
        },
    };
    await assert.rejects(fin.finalizeCharacter(d, env, resolve), /missing items/);
    assert.equal(created, 1);
    assert.equal(deleted, 1);
    globalThis.Actor = {
        async create(payload) {
            created++;
            return { name: payload.name, items: { size: payload.items.length }, system: payload.system, async delete() { deleted++; } };
        },
    };
    const result = await fin.finalizeCharacter(d, env, resolve);
    assert.equal(result.actor.name, 'Warrior Imperial Guard');
    assert.equal(deleted, 1);
    delete globalThis.Actor;
});
