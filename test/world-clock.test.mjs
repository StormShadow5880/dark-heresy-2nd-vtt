import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CLOCK, clockParts, normalizeClock, parseTime, timeChange, timersInFuture, JUMPS } from '../src/module/rules/world-clock.mjs';

const cfg = { ...DEFAULT_CLOCK, startTime: '08:35' };

test('clock: date and time from the world time and the configured start', () => {
    const p = clockParts(0, cfg);
    assert.equal(p.date, '145.024.M41');
    assert.equal(p.time, '08:35');
});

test('clock: the four jumps advance time and date', () => {
    assert.deepEqual(JUMPS.map((j) => j.seconds), [600, 3600, 28800, 86400]);
    assert.equal(clockParts(600, cfg).time, '08:45');
    assert.equal(clockParts(3600, cfg).time, '09:35');
    assert.equal(clockParts(8 * 3600, cfg).time, '16:35');
    const next = clockParts(86400, cfg);
    assert.equal(next.time, '08:35');
    assert.equal(next.date, '145.025.M41');
    // across midnight
    assert.equal(clockParts(16 * 3600, cfg).date, '145.025.M41');
});

test('clock: year rollover follows the configured days per year', () => {
    const c = { ...cfg, startDay: 365 };
    assert.equal(clockParts(86400, c).date, '146.001.M41');
    assert.equal(clockParts(86400, { ...c, daysPerYear: 400 }).date, '145.366.M41');
});

test('clock: anchor ties the start values to a world time; earlier times count backwards', () => {
    const c = { ...cfg, anchor: 1000 };
    assert.equal(clockParts(1000, c).time, '08:35');
    assert.equal(clockParts(1000 - 3600, c).time, '07:35');
    assert.equal(clockParts(1000 - 9 * 3600, c).date, '145.023.M41');
});

test('clock: mission day counts calendar days from the mission start', () => {
    const c = { ...cfg, missionEnabled: true, missionStart: 0 };
    assert.equal(clockParts(0, c).mission, 'Tag 1 der Untersuchung');
    assert.equal(clockParts(11 * 86400, c).missionDay, 12);
    assert.equal(clockParts(0, { ...c, missionEnabled: false }).mission, '');
    assert.equal(clockParts(-86400, c).missionDay, null); // before the start
    assert.equal(clockParts(0, { ...c, missionStart: null }).mission, '');
});

test('clock: inputs are checked', () => {
    assert.equal(parseTime('08:35'), 8 * 3600 + 35 * 60);
    assert.equal(parseTime('25:00'), null);
    assert.equal(parseTime('abc'), null);
    assert.equal(normalizeClock({ startTime: 'x', daysPerYear: 0 }).startTime, '08:00');
    assert.equal(normalizeClock({ daysPerYear: 0 }).daysPerYear, 1);
});

test('clock: a set-back world time is recognised and finds timers in the future (nothing is modified)', () => {
    assert.equal(timeChange(5000, 4000).backwards, true);
    assert.equal(timeChange(4000, 5000).backwards, false);
    const stored = { firstAid: 9000, endurance: 100 };
    assert.deepEqual(timersInFuture(stored, 5000), ['firstAid']);
    assert.deepEqual(stored, { firstAid: 9000, endurance: 100 });
});

import { existsSync } from 'node:fs';
test('clock bar: the image assets of the design are part of the system', () => {
    for (const f of ['frame-cap-left', 'frame-cap-right', 'frame-center', 'frame-tile', 'button-plaque', 'chronometer']) {
        assert.ok(existsSync(new URL(`../src/images/timeline/${f}.webp`, import.meta.url)), `${f}.webp is missing`);
    }
});
