import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkRequirement, evaluatePrerequisites, normalizeName, parsePrerequisites } from '../src/module/rules/prerequisites.mjs';

const skill = (label, advance = 0, extra = {}) => ({ label, advance, isSpecialist: false, ...extra });
const spec = (label, advance = 1, taken = true) => ({ label, advance, taken });
const talentNames = ['Frenzy', 'Resistance', 'Two-Weapon Wielder', 'Ambidextrous', 'Jaded', 'Cover-Up', 'Weapon Training', 'Clues from the Crowds', 'Swift Attack'];

function view({ chars = {}, skills = {}, psy = 0, items = [] } = {}) {
    return {
        chars: { weaponSkill: 30, ballisticSkill: 30, strength: 30, toughness: 30, agility: 30, intelligence: 30, perception: 30, willpower: 30, fellowship: 30, ...chars },
        skills: {
            awareness: skill('Awareness'),
            techUse: skill('Tech Use'),
            acrobatics: skill('Acrobatics'),
            dodge: skill('Dodge'),
            parry: skill('Parry'),
            medicae: skill('Medicae'),
            psyniscience: skill('Psyniscience'),
            trade: skill('Trade', 0, { isSpecialist: true, specialities: {} }),
            commonLore: skill('Common Lore', 0, { isSpecialist: true, specialities: {} }),
            ...skills,
        },
        psyRating: psy,
        items,
        knownTalents: new Set(talentNames.map(normalizeName)),
    };
}
const talent = (name) => ({ type: 'talent', name });
const status = (text, v) => evaluatePrerequisites(text, v).status;

test('parsing: comma = all, "or" = one of them, parentheses are not split, "None" is empty', () => {
    const p = parsePrerequisites('Agility 45, Ambidextrous, Ballistic Skill 40 or Weapon Skill 40, Two-Weapon Wielder (Melee, Ranged)');
    assert.deepEqual(p.clauses.map((c) => c.text), ['Agility 45', 'Ambidextrous', 'Ballistic Skill 40 or Weapon Skill 40', 'Two-Weapon Wielder (Melee, Ranged)']);
    assert.deepEqual(p.clauses[2].alternatives, ['Ballistic Skill 40', 'Weapon Skill 40']);
    assert.equal(parsePrerequisites('None').empty, true);
    assert.equal(parsePrerequisites('').empty, true);
    assert.equal(parsePrerequisites(undefined).empty, true);
    assert.equal(evaluatePrerequisites('', view()).status, 'met');
});

test('characteristics: the total must reach the value; an unknown value is not guessed', () => {
    assert.equal(checkRequirement('Agility 30', view({ chars: { agility: 33 } })).status, 'met');
    assert.equal(checkRequirement('Agility 30', view({ chars: { agility: 30 } })).status, 'met');
    const low = checkRequirement('Agility 30', view({ chars: { agility: 28 } }));
    assert.equal(low.status, 'unmet');
    assert.match(low.detail, /28 \/ 30/);
    for (const n of ['Weapon Skill 40', 'Ballistic Skill 40', 'Willpower 45', 'Fellowship 35', 'Toughness 50', 'Strength 45', 'Intelligence 40', 'Perception 35']) {
        assert.equal(checkRequirement(n, view({ chars: { weaponSkill: 99, ballisticSkill: 99, willpower: 99, fellowship: 99, toughness: 99, strength: 99, intelligence: 99, perception: 99 } })).status, 'met', n);
    }
    const v = view();
    delete v.chars.agility;
    assert.equal(checkRequirement('Agility 30', v).status, 'manual');
});

test('alternatives: one is enough', () => {
    assert.equal(status('Ballistic Skill 45 or Weapon Skill 45', view({ chars: { weaponSkill: 46 } })), 'met');
    assert.equal(status('Ballistic Skill 45 or Weapon Skill 45', view({ chars: { weaponSkill: 40, ballisticSkill: 40 } })), 'unmet');
    assert.equal(status('Intelligence 35 or Perception 35', view({ chars: { perception: 35 } })), 'met');
    assert.equal(status('Dodge or Parry', view({ skills: { parry: skill('Parry', 1) } })), 'met');
    assert.equal(status('Dodge or Parry', view()), 'unmet');
});

test('skills: known, with a bonus, as a rank, a speciality, Lore', () => {
    assert.equal(status('Tech-Use', view({ skills: { techUse: skill('Tech Use', 1) } })), 'met');
    assert.equal(status('Tech-Use', view()), 'unmet');
    assert.equal(status('Awareness +10', view({ skills: { awareness: skill('Awareness', 2) } })), 'met');
    assert.equal(status('Awareness +10', view({ skills: { awareness: skill('Awareness', 1) } })), 'unmet');
    assert.equal(status('Tech Use +10', view({ skills: { techUse: skill('Tech Use', 3) } })), 'met');
    assert.equal(status('Rank 2 in the Medicae skill', view({ skills: { medicae: skill('Medicae', 2) } })), 'met');
    assert.equal(status('Rank 2 in the Medicae skill', view({ skills: { medicae: skill('Medicae', 1) } })), 'unmet');
    const armourer = { trade: skill('Trade', 0, { isSpecialist: true, specialities: { armourer: spec('Armourer', 1) } }) };
    assert.equal(status('Trade (Armourer)', view({ skills: armourer })), 'met');
    assert.equal(status('Trade (Armourer)', view({ skills: { trade: skill('Trade', 0, { isSpecialist: true, specialities: { cook: spec('Cook', 1) } }) } })), 'unmet');
    assert.equal(status('Lore (any one)', view({ skills: { commonLore: skill('Common Lore', 0, { isSpecialist: true, specialities: { imperium: spec('Imperium', 1) } }) } })), 'met');
    assert.equal(status('Lore (any one)', view()), 'unmet');
});

test('psy rating', () => {
    assert.equal(status('Psy rating', view({ psy: 1 })), 'met');
    assert.equal(status('Psy rating', view({ psy: 0 })), 'unmet');
});

test('talents: by name, with a choice, with several choices; case and hyphens do not matter', () => {
    assert.equal(status('Frenzy', view({ items: [talent('Frenzy')] })), 'met');
    assert.equal(status('Frenzy', view()), 'unmet');
    assert.equal(status('Cover-Up', view({ items: [talent('Cover Up')] })), 'met');
    assert.equal(status('Clues from the Crowds', view({ items: [talent('Clues From The Crowds')] })), 'met');
    assert.equal(status('Resistance (Fear)', view({ items: [talent('Resistance (Fear)')] })), 'met');
    assert.equal(status('Resistance (Fear)', view({ items: [talent('Resistance (Psychic Powers)')] })), 'unmet');
    assert.equal(status('Resistance (Fear)', view({ items: [talent('Resistance')] })), 'unmet');
    assert.equal(status('Two-Weapon Wielder (Melee, Ranged)', view({ items: [talent('Two-Weapon Wielder (Melee)')] })), 'unmet');
    assert.equal(status('Two-Weapon Wielder (Melee, Ranged)', view({ items: [talent('Two-Weapon Wielder (Melee)'), talent('Two-Weapon Wielder (Ranged)')] })), 'met');
    assert.equal(status('Two-Weapon Wielder (Melee, Ranged)', view({ items: [talent('Two-Weapon Wielder (Melee, Ranged)')] })), 'met');
    assert.equal(status('Jaded', view({ items: [{ type: 'trait', name: 'Jaded' }] })), 'met'); // an owned item of the name counts
});

test('what cannot be read is never decided: manual', () => {
    assert.equal(checkRequirement('Weapon Training (any melee)', view()).status, 'manual');
    assert.equal(checkRequirement('Rank 4 in selected skill', view()).status, 'manual');
    assert.equal(checkRequirement('Mechanicus Implants', view()).status, 'manual');
    assert.equal(checkRequirement('Mechanicus Implants', view({ items: [{ type: 'cybernetic', name: 'Mechanicus Implants' }] })).status, 'met');
    assert.equal(status('Mechanicus Implants', view()), 'manual');
    assert.equal(checkRequirement('Something unknown (x)', view()).status, 'manual');
});

test('the whole text: all requirements must hold, unmet beats manual, manual beats met', () => {
    const text = 'Awareness +10, Intelligence 35 or Perception 35';
    assert.equal(status(text, view({ skills: { awareness: skill('Awareness', 2) }, chars: { intelligence: 36 } })), 'met');
    assert.equal(status(text, view({ skills: { awareness: skill('Awareness', 1) }, chars: { intelligence: 36 } })), 'unmet');
    assert.equal(status(text, view({ skills: { awareness: skill('Awareness', 2) } })), 'unmet');
    const mixed = evaluatePrerequisites('Agility 40, Mechanicus Implants', view({ chars: { agility: 30 } }));
    assert.equal(mixed.status, 'unmet');
    assert.deepEqual(mixed.unmet, ['Agility 40']);
    assert.deepEqual(mixed.manual, ['Mechanicus Implants']);
    const onlyManual = evaluatePrerequisites('Agility 30, Mechanicus Implants', view({ chars: { agility: 40 } }));
    assert.equal(onlyManual.status, 'manual');
    const twoWeapon = 'Agility 45, Ambidextrous, Ballistic Skill 40 or Weapon Skill 40, Two-Weapon Wielder (Melee, Ranged)';
    assert.equal(status(twoWeapon, view({ chars: { agility: 45, ballisticSkill: 41 }, items: [talent('Ambidextrous'), talent('Two-Weapon Wielder (Melee)'), talent('Two-Weapon Wielder (Ranged)')] })), 'met');
    assert.equal(status(twoWeapon, view({ chars: { agility: 45, ballisticSkill: 41 }, items: [talent('Ambidextrous')] })), 'unmet');
});

test('the compendium: every prerequisite text of the talents is readable and the core talents are filled in', async () => {
    const yaml = (await import('js-yaml')).default;
    const docs = yaml.loadAll(readFileSync(new URL('../src/packs/talents/talents.yml', import.meta.url), 'utf8')).filter(Boolean);
    const withText = docs.filter((d) => String(d.data.prerequisites ?? '').trim());
    assert.ok(withText.length >= 72, `only ${withText.length} talents have prerequisites`);
    const known = new Set(docs.map((d) => normalizeName(d.name)));
    const full = view({ chars: Object.fromEntries(['weaponSkill', 'ballisticSkill', 'strength', 'toughness', 'agility', 'intelligence', 'perception', 'willpower', 'fellowship'].map((k) => [k, 40])) });
    full.knownTalents = known;
    for (const d of withText) {
        const r = evaluatePrerequisites(d.data.prerequisites, full);
        assert.ok(['met', 'unmet', 'manual'].includes(r.status), d.name);
        assert.ok(r.clauses.length > 0, d.name);
        for (const c of r.clauses) assert.ok(c.alternatives.length > 0 && c.alternatives.every((a) => a.text), `${d.name}: ${c.text}`);
    }
    const byName = Object.fromEntries(docs.map((d) => [d.name, d.data.prerequisites]));
    assert.equal(byName['Two-Weapon Master'], 'Agility 45, Ambidextrous, Ballistic Skill 40 or Weapon Skill 40, Two-Weapon Wielder (Melee, Ranged)');
    assert.equal(byName['Ambidextrous'], 'Agility 30');
    assert.equal(byName['Frenzy'], '');
    assert.equal(byName['Armor-Monger'], 'Intelligence 35, Tech-Use, Trade (Armourer)');
    assert.equal(byName['Favored by the Warp'], 'Willpower 35');
});
