import test from 'node:test';
import assert from 'node:assert/strict';
import { sororitasInsanity, sororitasOffer } from '../src/module/rules/origin-grants.mjs';

test('Sororitas: Corruption gain becomes Insanity minus 1 (minimum 0)', () => {
    assert.equal(sororitasInsanity(1), 0);
    assert.equal(sororitasInsanity(2), 1);
    assert.equal(sororitasInsanity(4), 3);
    assert.equal(sororitasInsanity(0), 0);
    assert.equal(sororitasInsanity(-3), 0);
});

test('Sororitas: offer only for the background and for gains of at least 1', () => {
    assert.equal(sororitasOffer('Adepta Sororitas', 1), true);
    assert.equal(sororitasOffer('Adepta Sororitas', 0), false);
    assert.equal(sororitasOffer('Adepta Sororitas', -2), false);
    assert.equal(sororitasOffer('Mutant', 3), false);
});
