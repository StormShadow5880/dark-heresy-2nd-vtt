import test from 'node:test';
import assert from 'node:assert/strict';
import { prettyFormula, prettyRange, prettifyDescription, evaluatePsyFormula } from '../src/module/rules/psy-text.mjs';

test('formulas are readable and calculated with the psy rating', () => {
    assert.equal(prettyFormula('2*@pr'), '2 × PR');
    assert.equal(prettyFormula('2*@pr', 3), '2 × PR = 6');
    assert.equal(prettyFormula('@pr/2', 3), 'PR ÷ 2 = 1.5');
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
