import test from 'node:test';
import assert from 'node:assert/strict';
import { degreesOfFailure, degreesOfSuccess, toRuleDegrees } from '../src/module/rules/degrees.mjs';

test('degrees of success are the difference of the tens digits: 69 vs 70 is +1', () => {
    assert.equal(degreesOfSuccess(69, 70), 1);
    assert.equal(degreesOfSuccess(32, 54), 2); // 5 - 3
    assert.equal(degreesOfSuccess(5, 54), 5); // 5 - 0
    assert.equal(degreesOfSuccess(1, 8), 0); // roll 01, tens equal
});

test('same tens digit means +0 degrees, the test is still a success when the roll is not above the target', () => {
    assert.equal(degreesOfSuccess(61, 69), 0);
    assert.equal(degreesOfSuccess(70, 70), 0);
    assert.equal(degreesOfSuccess(12, 19), 0);
});

test('degrees of failure are the tens difference the other way round', () => {
    assert.equal(degreesOfFailure(83, 40), 4);
    assert.equal(degreesOfFailure(71, 70), 0);
    assert.equal(degreesOfFailure(67, 43), 2);
});

test('never negative, also for automatic results (01 always succeeds, 100 always fails)', () => {
    assert.equal(degreesOfSuccess(1, -5), 0);
    assert.equal(degreesOfFailure(100, 130), 0);
    assert.equal(degreesOfFailure(100, 40), 6);
});

test('the rule count of the DH2 texts is the shown degree plus the success / failure itself', () => {
    assert.equal(toRuleDegrees(0), 1);
    assert.equal(toRuleDegrees(1), 2);
    assert.equal(toRuleDegrees(4), 5);
    assert.equal(toRuleDegrees(-2), 1);
});
