import test from 'node:test';
import assert from 'node:assert/strict';
import { prettyFormula, prettyRange, prettifyDescription, evaluatePsyFormula } from '../src/module/rules/psy-text.mjs';

test('formulas are readable and calculated with the psy rating', () => {
    assert.equal(prettyFormula('2*@pr'), '2 × PR');
    assert.equal(prettyFormula('2*@pr', 3), '2 × PR = 6');
    assert.equal(prettyFormula('@pr/2', 3), 'PR ÷ 2 = 2', 'fractions are rounded up');
    assert.equal(prettyFormula('1k*@pr', 2), '1 000 × PR = 2000');
    assert.equal(prettyRange('0', 4), '0');
    assert.equal(prettyRange('5*@pr', 4), '5 × PR = 20');
});

test('descriptions: only inline formulas with @pr are replaced', () => {
    const out = prettifyDescription('Gain [[2*@pr]] and [[@pr]] allies, deal [[1d10]].', 3);
    assert.match(out, /<span class="dh-pr"[^>]*>6<\/span>/);
    assert.match(out, />3<\/span> allies/);
    assert.ok(out.includes('[[1d10]]'));
    assert.match(prettifyDescription('[[@pr*2]]'), />PR × 2<\/span>/);
});

test('unsafe input is not evaluated', () => {
    assert.equal(evaluatePsyFormula('@pr;process.exit()', 3), null);
    assert.equal(evaluatePsyFormula('5*@pr', NaN), null);
});

test('PR / 2 is rounded up for psy rating 1 to 5 (general rule), an exception takes precedence', () => {
    assert.deepEqual([1, 2, 3, 4, 5].map((pr) => evaluatePsyFormula('@pr/2', pr)), [1, 1, 2, 2, 3]);
    assert.deepEqual([1, 2, 3, 4, 5].map((pr) => evaluatePsyFormula('@pr/2', pr, 'down')), [0, 1, 1, 2, 2]);
    assert.equal(evaluatePsyFormula('@pr/2', 3, 'none'), 1.5);
    // multiplications are whole numbers anyway
    assert.equal(evaluatePsyFormula('5*@pr', 3), 15);
    assert.equal(prettyFormula('5*@pr', 3), '5 × PR = 15');
    assert.match(prettifyDescription('[[@pr/2]] targets', 3), />2<\/span> targets/);
    assert.match(prettifyDescription('[[@pr/2]]', 3), /rounded up/);
});

test('no power of the data names a rounding rule of its own (all 14 use the general rule)', async () => {
    const fs = await import('node:fs');
    const yaml = (await import('js-yaml')).default;
    const docs = yaml.loadAll(fs.readFileSync(new URL('../src/packs/psychic-powers/psychic-powers.yml', import.meta.url), 'utf8')).filter(Boolean);
    const withDivision = docs.filter((d) => /@pr\s*\/\s*\d/.test(JSON.stringify(d)));
    assert.equal(withDivision.length, 14);
    for (const d of withDivision) assert.equal(/round(ed|ing)? (up|down)|rounded/i.test(JSON.stringify(d)), false, d.name);
});
