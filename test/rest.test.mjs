import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CLOCK_MODES, HOUR, analyzeWatches, buildSchedule, cancelRest, clockAdvance, clockHalt, continueRest, createRest, currentWatch, generateWatches,
    normalizePlan, pauseRest, recoverRest, resolveEncounter, resolveRecovery, restSummary, resumeRest, sleepCheckers, stepRest,
} from '../src/module/rules/rest.mjs';

const chars = [{ id: 'a', name: 'Anna' }, { id: 'b', name: 'Bruno' }];
const mkPlan = (extra = {}) => normalizePlan({ hours: 8, participants: chars, secondsPerHour: 5, ...extra });
const handlers = (over = {}) => {
    const calls = { enc: [], sleep: [], fatigue: [], persist: 0 };
    return {
        calls,
        persist: async () => { calls.persist++; },
        fatigueOf: (id) => (id === 'a' ? 1 : 0),
        rollEncounter: async (e) => { calls.enc.push(e.id); return { triggered: false }; },
        sleepCheck: async (id, e) => { calls.sleep.push(`${id}@${e.id}`); return { success: true, text: '' }; },
        applyFatigue: async (id) => calls.fatigue.push(id),
        ...over,
    };
};
const run = async (state, h, real = 1000) => stepRest(state, real, h);

test('clock: pause, 1:1 and 1:3, nothing while paused / in combat / during a rest', () => {
    assert.equal(CLOCK_MODES.normal.factor, 1);
    assert.equal(CLOCK_MODES.roleplay.factor, 3);
    assert.equal(clockAdvance({ mode: 'pause', realSeconds: 10 }), 0);
    assert.equal(clockAdvance({ mode: 'normal', realSeconds: 10 }), 10); // 1 real minute = 1 game minute
    assert.equal(clockAdvance({ mode: 'roleplay', realSeconds: 10 }), 30);
    assert.equal(clockAdvance({ mode: 'roleplay', realSeconds: 10, gamePaused: true }), 0);
    assert.equal(clockAdvance({ mode: 'normal', realSeconds: 10, inCombat: true }), 0);
    assert.equal(clockAdvance({ mode: 'normal', realSeconds: 10, restActive: true }), 0);
    assert.equal(clockAdvance({ mode: 'normal', realSeconds: 3600 }), 60); // a sleeping tab does not jump
    assert.equal(clockHalt({ mode: 'normal', inCombat: true }), 'Combat');
    assert.equal(clockHalt({ mode: 'pause', inCombat: true }), '');
});

test('plan: durations, defaults and the schedule of checks', () => {
    const plan = mkPlan({ encounters: { enabled: true, intervalMinutes: 120, chance: 20 } });
    assert.equal(plan.hours, 8);
    const s = buildSchedule(plan);
    assert.deepEqual(s.map((e) => e.id), ['e:1', 'e:2', 'e:3']); // 2h, 4h, 6h (not at the end)
    assert.equal(buildSchedule(mkPlan()).length, 0);
});

test('watches: gaps, overlaps and outside entries are reported, an unguarded period is allowed', () => {
    assert.deepEqual(analyzeWatches(generateWatches(8, 2, ['a', 'b']), 8).problems, []);
    const gap = analyzeWatches([{ from: 0, to: 3, actors: ['a'] }, { from: 4, to: 8, actors: ['b'] }], 8);
    assert.match(gap.problems[0], /Unguarded: 3:00 h–4:00 h/);
    const overlap = analyzeWatches([{ from: 0, to: 5, actors: ['a'] }, { from: 4, to: 8, actors: ['b'] }], 8);
    assert.match(overlap.problems.join(), /overlap: 4:00 h–5:00 h/);
    assert.equal(analyzeWatches([{ from: 0, to: 4, actors: ['a'] }], 8).gaps.length, 1);
    assert.equal(analyzeWatches(generateWatches(8, 4), 8).gaps.length, 2); // nobody assigned
    assert.match(analyzeWatches([{ from: 6, to: 12, actors: ['a'] }], 8).problems.join(), /outside/);
});

test('watch: the current watch and sleeping watchers', () => {
    const plan = mkPlan({ watches: generateWatches(8, 2, ['a', 'b']) });
    assert.deepEqual(currentWatch(plan, 0).actors, ['a']);
    assert.deepEqual(currentWatch(plan, 2 * HOUR).actors, ['b']);
    assert.equal(currentWatch(plan, 2 * HOUR, ['b']).guarded, false);
});

test('sleep checks: never / only fatigued / every watch', () => {
    const fat = (id) => (id === 'a' ? 2 : 0);
    assert.deepEqual(sleepCheckers('never', ['a', 'b'], fat), []);
    assert.deepEqual(sleepCheckers('fatigued', ['a', 'b'], fat), ['a']);
    assert.deepEqual(sleepCheckers('every', ['a', 'b'], fat), ['a', 'b']);
});

test('an uneventful rest runs to the end and is complete', async () => {
    const st = createRest(mkPlan(), 5000);
    const h = handlers();
    await run(st, h);
    assert.equal(st.status, 'done');
    assert.equal(st.elapsed, 8 * HOUR);
    const sum = restSummary(st);
    assert.equal(sum.complete, true);
    assert.ok(sum.characters.every((c) => c.fullRest));
});

test('the time lapse follows the configured speed (one game hour per 5 real seconds)', async () => {
    const st = createRest(mkPlan(), 0);
    await stepRest(st, 5, handlers());
    assert.equal(st.elapsed, HOUR);
    await stepRest(st, 2.5, handlers());
    assert.equal(st.elapsed, 1.5 * HOUR);
});

test('encounter in the middle stops the lapse exactly at its time; continue, then end', async () => {
    const plan = mkPlan({ encounters: { enabled: true, intervalMinutes: 120, chance: 100 } });
    const st = createRest(plan, 0);
    const h = handlers({ rollEncounter: async (e) => ({ triggered: e.id === 'e:2', text: 'Ork patrol', tableName: 'Night' }) });
    await run(st, h);
    assert.equal(st.status, 'encounter');
    assert.equal(st.elapsed, 4 * HOUR); // not a second further
    assert.equal(st.pending.text, 'Ork patrol');
    resolveEncounter(st, 'continue');
    assert.equal(st.status, 'running');
    await run(st, h);
    assert.equal(st.status, 'done');
    assert.equal(st.elapsed, 8 * HOUR);
});

test('encounter played out: the rest is interrupted, continues on request, is never reported as complete', async () => {
    const st = createRest(mkPlan({ encounters: { enabled: true, intervalMinutes: 120, chance: 100 } }), 0);
    const h = handlers({ rollEncounter: async (e) => ({ triggered: e.id === 'e:1', text: 'Noise' }) });
    await run(st, h);
    resolveEncounter(st, 'play');
    assert.equal(st.status, 'interrupted');
    await run(st, h); // nothing happens while interrupted
    assert.equal(st.elapsed, 2 * HOUR);
    continueRest(st, { hours: 10 });
    assert.equal(st.status, 'running');
    assert.equal(st.plannedSeconds, 10 * HOUR);
    await run(st, h);
    assert.equal(st.status, 'done');
    assert.equal(restSummary(st).complete, false);
    assert.ok(restSummary(st).characters.every((c) => c.interrupted && !c.fullRest));
});

test('cancel keeps the time that was reached; a played-out rest can be cancelled separately', async () => {
    const st = createRest(mkPlan(), 0);
    await stepRest(st, 10, handlers()); // 2 h
    cancelRest(st);
    assert.equal(st.status, 'cancelled');
    assert.equal(st.elapsed, 2 * HOUR);
    const s2 = createRest(mkPlan({ encounters: { enabled: true, intervalMinutes: 60, chance: 100 } }), 0);
    await run(s2, handlers({ rollEncounter: async () => ({ triggered: true, text: 'x' }) }));
    resolveEncounter(s2, 'play');
    continueRest(s2, { cancel: true });
    assert.equal(s2.status, 'cancelled');
});

test('pause and resume; skipping still processes every watch change, check and encounter', async () => {
    const plan = mkPlan({ watches: generateWatches(8, 2, ['a', 'b']), sleep: { mode: 'every' }, encounters: { enabled: true, intervalMinutes: 120, chance: 100 } });
    const st = createRest(plan, 0);
    const h = handlers({ rollEncounter: async (e) => { h.calls.enc.push(e.id); return { triggered: false }; } });
    await stepRest(st, 5, h);
    pauseRest(st);
    await stepRest(st, 100, h);
    assert.equal(st.elapsed, HOUR);
    resumeRest(st);
    st.skipping = true;
    await stepRest(st, 0, h);
    assert.equal(st.status, 'done');
    assert.deepEqual(h.calls.enc, ['e:1', 'e:2', 'e:3']);
    assert.equal(h.calls.sleep.length, 4); // four watches, one watcher each
});

test('skipping stops at an encounter', async () => {
    const st = createRest(mkPlan({ encounters: { enabled: true, intervalMinutes: 120, chance: 100 } }), 0);
    st.skipping = true;
    await stepRest(st, 0, handlers({ rollEncounter: async (e) => ({ triggered: e.id === 'e:2', text: 't' }) }));
    assert.equal(st.status, 'encounter');
    assert.equal(st.elapsed, 4 * HOUR);
});

test('sleep checks: failure marks the watcher asleep (unguarded), counts it and can add fatigue; the result is secret in the log', async () => {
    const plan = mkPlan({ watches: generateWatches(4, 2, ['a', 'b']), sleep: { mode: 'fatigued', markAsleep: true, addFatigue: true } });
    const st = createRest(plan, 0);
    const h = handlers({ sleepCheck: async () => ({ success: false, text: 'roll 80 vs 40' }) });
    await run(st, h);
    assert.deepEqual(h.calls.fatigue, ['a']); // only 'a' is fatigued, only 'a' rolled
    assert.equal(st.asleep.a, true);
    assert.equal(st.characters.a.sleepFails, 1);
    assert.equal(currentWatch(st.plan, 0, Object.keys(st.asleep)).guarded, false);
    assert.ok(st.log.every((l) => l.secret));
});

test('no double rolls: processed events are not repeated, a claimed event needs the GM decision after a reload', async () => {
    const plan = mkPlan({ encounters: { enabled: true, intervalMinutes: 120, chance: 100 } });
    const st = createRest(plan, 0);
    const h = handlers();
    await stepRest(st, 12, h); // 2.4 h: e:1 done
    assert.deepEqual(h.calls.enc, ['e:1']);
    // a copy as it would be loaded after a reload: running again, e:1 is not rolled again
    const loaded = JSON.parse(JSON.stringify(st));
    await stepRest(loaded, 100, handlers({ rollEncounter: async (e) => { h.calls.enc.push(e.id); return { triggered: false }; } }));
    assert.deepEqual(h.calls.enc, ['e:1', 'e:2', 'e:3']);
    // crash between claim and result
    const crashed = createRest(plan, 0);
    await stepRest(crashed, 12, handlers({ persist: async (s) => { if (s.claimed['e:2']) throw new Error('connection lost'); } })).catch(() => {});
    const afterReload = JSON.parse(JSON.stringify(crashed));
    recoverRest(afterReload);
    if (Object.keys(afterReload.claimed).length) {
        assert.equal(afterReload.status, 'recovery');
        resolveRecovery(afterReload, 'skip');
        assert.equal(afterReload.status, 'paused');
        assert.equal(afterReload.processed['e:2'].skipped, true);
    }
});

test('events that are already due after a reload are processed at once (late), never skipped', async () => {
    const plan = mkPlan({ encounters: { enabled: true, intervalMinutes: 120, chance: 100 } });
    const st = createRest(plan, 0);
    st.elapsed = 5 * HOUR; // the world time was already further than the saved events
    const h = handlers();
    await stepRest(st, 0.0001, h);
    assert.deepEqual(h.calls.enc, ['e:1', 'e:2']);
});

test('summary: watch and rest time per character', async () => {
    const st = createRest(mkPlan({ watches: [{ from: 0, to: 2, actors: ['a'] }, { from: 2, to: 8, actors: ['b'] }] }), 0);
    await run(st, handlers());
    const s = restSummary(st);
    const a = s.characters.find((c) => c.id === 'a');
    assert.equal(a.watched, 2 * HOUR);
    assert.equal(a.rested, 6 * HOUR);
    assert.equal(a.fullRest, false); // kept watch: no full rest is claimed
});
