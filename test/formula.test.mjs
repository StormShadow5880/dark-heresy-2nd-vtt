import test from 'node:test';
import assert from 'node:assert/strict';
import { toFormula } from '../src/module/rules/formula.mjs';

test('numbers become strings (Foundry V13+ rejects number formulas)', () => {
    assert.equal(toFormula(0), '0');
    assert.equal(toFormula(7), '7');
    assert.equal(typeof toFormula(0), 'string');
});

test('empty values fall back to 0, real formulas are kept', () => {
    for (const empty of ['', '   ', null, undefined]) assert.equal(toFormula(empty), '0');
    assert.equal(toFormula(' 1d10+3 '), '1d10+3');
    assert.equal(toFormula('', '1'), '1');
});
