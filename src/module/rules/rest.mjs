/**
 * Rest planning and the rest engine (pure: no Foundry, dice and document changes are injected through `handlers`).
 *
 * IMPORTANT: everything about encounters, watches and sleep checks is a CONFIGURABLE GAME MASTER RULE of this system, not an official
 * Dark Heresy 2 rule. The defaults are only starting suggestions.
 *
 * Time: all offsets are game seconds since the start of the rest. The rest never keeps a clock; the runner sets the Foundry world time to
 * `startWorldTime + elapsed`, so a reload or a change of the GM client cannot count time twice.
 */

export const HOUR = 3600;

/** Suggested start values per environment (labels for the GM, no rule): chance in percent per encounter check */
export const ENVIRONMENTS = {
    safe: { label: 'Sheltered / safe', chance: 5 },
    normal: { label: 'Ordinary', chance: 15 },
    dangerous: { label: 'Dangerous', chance: 30 },
    hostile: { label: 'Hostile / hunted', chance: 50 },
};

export const SLEEP_MODES = { never: 'Never', fatigued: 'Only when fatigued', every: 'For every watch' };

export const DEFAULT_PLAN = {
    hours: 8,
    location: '',
    environment: 'normal',
    encounters: { enabled: false, tableUuid: '', intervalMinutes: 120, chance: ENVIRONMENTS.normal.chance },
    watches: [], // { from, to (hours since the start), actors: [actorId] }
    sleep: { mode: 'never', characteristic: 'willpower', modifier: 0, markAsleep: true, addFatigue: false },
    participants: [], // actorIds: { id, name }
    secondsPerHour: 5, // real seconds per game hour of the visible time lapse
};

const num = (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);

export function normalizePlan(input = {}) {
    const p = { ...DEFAULT_PLAN, ...input };
    p.hours = Math.max(0.25, num(p.hours, 8));
    p.encounters = { ...DEFAULT_PLAN.encounters, ...(input.encounters ?? {}) };
    p.encounters.intervalMinutes = Math.max(5, Math.floor(num(p.encounters.intervalMinutes, 120)));
    p.encounters.chance = Math.min(100, Math.max(0, num(p.encounters.chance, 0)));
    p.sleep = { ...DEFAULT_PLAN.sleep, ...(input.sleep ?? {}) };
    if (!(p.sleep.mode in SLEEP_MODES)) p.sleep.mode = 'never';
    p.sleep.modifier = num(p.sleep.modifier, 0);
    p.secondsPerHour = Math.max(0.2, num(p.secondsPerHour, 5));
    p.watches = (input.watches ?? []).map((w) => ({ from: num(w.from), to: num(w.to), actors: [...(w.actors ?? [])] }));
    p.participants = [...(input.participants ?? [])];
    return p;
}

export const plannedSeconds = (plan) => Math.round(plan.hours * HOUR);
/** game seconds per real second of the time lapse */
export const lapseSpeed = (plan) => HOUR / plan.secondsPerHour;

/* ----------------------------- watch plan ----------------------------- */

/** Evenly sized watches of `hoursEach` over the rest, without anybody assigned (a gap until the GM assigns) */
export function generateWatches(totalHours, hoursEach, actorIds = []) {
    const each = Math.max(0.25, num(hoursEach, 2));
    const rows = [];
    for (let from = 0, i = 0; from < totalHours - 1e-9; from += each, i++) {
        rows.push({ from, to: Math.min(totalHours, from + each), actors: actorIds.length ? [actorIds[i % actorIds.length]] : [] });
    }
    return rows;
}

/**
 * Checks the watch plan: gaps (nobody on watch), overlaps of two entries and entries outside the rest.
 * An unguarded period is allowed (the GM may choose it), it is only reported.
 * @returns {{gaps: {from,to}[], overlaps: {from,to}[], outside: object[], problems: string[]}}
 */
export function analyzeWatches(watches, totalHours) {
    const entries = watches.filter((w) => w.to > w.from).sort((a, b) => a.from - b.from);
    const outside = watches.filter((w) => !(w.to > w.from) || w.from < 0 || w.to > totalHours + 1e-9);
    const gaps = [];
    const overlaps = [];
    let covered = 0; // end of the guarded stretch so far
    for (const w of entries) {
        const from = Math.max(0, w.from);
        const to = Math.min(totalHours, w.to);
        if (from < covered - 1e-9) overlaps.push({ from, to: Math.min(to, covered) });
        else if (from > covered + 1e-9) gaps.push({ from: covered, to: from });
        if (w.actors.length === 0 && to > from) gaps.push({ from, to });
        covered = Math.max(covered, to);
    }
    if (covered < totalHours - 1e-9) gaps.push({ from: covered, to: totalHours });
    const fmt = (g) => `${hoursText(g.from)}–${hoursText(g.to)}`;
    const problems = [
        ...gaps.map((g) => `Unguarded: ${fmt(g)}`),
        ...overlaps.map((g) => `Two watches overlap: ${fmt(g)}`),
        ...outside.map((w) => `Watch ${hoursText(w.from)}–${hoursText(w.to)} is outside the rest or empty`),
    ];
    return { gaps, overlaps, outside, problems };
}

export const hoursText = (h) => {
    const mins = Math.round(h * 60);
    return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')} h`;
};

/** The watch entries that are on duty at `offset` seconds (a sleeping watcher is not counted) */
export function currentWatch(plan, offset, asleep = []) {
    const h = offset / HOUR;
    const active = plan.watches.filter((w) => h >= w.from - 1e-9 && h < w.to - 1e-9);
    const actors = [...new Set(active.flatMap((w) => w.actors))].filter((id) => !asleep.includes(id));
    return { entries: active, actors, guarded: actors.length > 0 };
}

/* ----------------------------- schedule ----------------------------- */

/**
 * Everything that has to happen during the rest, in order: watch starts (with the sleep checks of the watchers) and encounter checks.
 * Event ids are stable, so a plan whose duration changes keeps the ids of the events already processed.
 */
export function buildSchedule(plan) {
    const end = plannedSeconds(plan);
    const events = [];
    plan.watches.forEach((w, index) => {
        const at = Math.round(w.from * HOUR);
        if (at < end && w.actors.length) events.push({ id: `w:${index}`, type: 'watch', at, index, actors: w.actors });
    });
    if (plan.encounters.enabled) {
        const step = plan.encounters.intervalMinutes * 60;
        for (let k = 1; k * step < end; k++) events.push({ id: `e:${k}`, type: 'encounter', at: k * step });
    }
    const order = { watch: 0, encounter: 1 };
    return events.sort((a, b) => a.at - b.at || order[a.type] - order[b.type] || a.id.localeCompare(b.id));
}

/** Who has to roll a sleep check at the start of a watch: nobody / the tired ones / everybody */
export function sleepCheckers(mode, actors, fatigueOf) {
    if (mode === 'never') return [];
    if (mode === 'every') return [...actors];
    return actors.filter((id) => Number(fatigueOf(id)) >= 1);
}

/* ----------------------------- state machine ----------------------------- */

export function createRest(plan, startWorldTime) {
    const p = normalizePlan(plan);
    return {
        version: 1,
        status: 'running', // running | paused | encounter | interrupted | recovery | done | cancelled
        plan: p,
        startWorldTime: Number(startWorldTime),
        plannedSeconds: plannedSeconds(p),
        elapsed: 0,
        skipping: false,
        processed: {}, // eventId -> result
        claimed: {}, // eventId -> true (started, result not yet saved)
        asleep: {}, // actorId -> true (fell asleep on watch: the watch is not guarded by them)
        interrupted: false, // the rest was interrupted by a played-out encounter
        pending: null, // { eventId, text, tableName } while the GM decides
        log: [],
        characters: Object.fromEntries(p.participants.map((c) => [c.id, { name: c.name, interrupted: false, sleepFails: 0 }])),
    };
}

const log = (state, text, secret = false) => state.log.push({ at: state.elapsed, text, secret });

/** The first event that is not processed yet, or null */
export const nextEvent = (state) => buildSchedule(state.plan).find((e) => !(e.id in state.processed)) ?? null;

/**
 * Advances the rest by `realSeconds` of the visible time lapse (or, when skipping, as far as the next event). Stops at every event:
 * a watch change, a check or an encounter is never jumped over.
 * handlers (async): rollEncounter(event) -> {triggered, text, tableName}; sleepCheck(actorId, event) -> {success, text};
 *                   applyFatigue(actorId); persist(state)
 * @returns {Promise<object>} the state (the same object, changed)
 */
export async function stepRest(state, realSeconds, handlers) {
    if (state.status !== 'running') return state;
    let budget = state.skipping ? Infinity : Math.max(0, realSeconds) * lapseSpeed(state.plan);
    for (let guard = 0; guard < 10000 && state.status === 'running'; guard++) {
        const next = nextEvent(state);
        if (next && next.at <= state.plannedSeconds && next.at <= state.elapsed + budget) {
            budget -= Math.max(0, next.at - state.elapsed);
            state.elapsed = Math.max(state.elapsed, next.at); // an event that is already due is processed at once ("late")
            await processEvent(state, next, handlers);
            continue;
        }
        state.elapsed = Math.min(state.plannedSeconds, state.skipping ? (next && next.at <= state.plannedSeconds ? next.at : state.plannedSeconds) : state.elapsed + budget);
        if (state.elapsed >= state.plannedSeconds && !(nextEvent(state)?.at <= state.plannedSeconds)) finishRest(state);
        break;
    }
    return state;
}

async function processEvent(state, event, h) {
    state.claimed[event.id] = true;
    await h.persist?.(state); // claimed first: after a crash the event is not rolled again silently (see recoverRest)
    let result = { at: event.at };
    if (event.type === 'watch') result = { ...result, ...(await runWatchStart(state, event, h)) };
    else if (event.type === 'encounter') result = { ...result, ...(await runEncounter(state, event, h)) };
    state.processed[event.id] = result;
    delete state.claimed[event.id];
    await h.persist?.(state);
}

async function runWatchStart(state, event, h) {
    const { mode, addFatigue, markAsleep } = state.plan.sleep;
    const checkers = sleepCheckers(mode, event.actors, (id) => h.fatigueOf?.(id) ?? 0);
    const checks = [];
    for (const id of checkers) {
        const r = await h.sleepCheck(id, event);
        checks.push({ id, ...r });
        if (!r.success) {
            const c = state.characters[id];
            if (c) c.sleepFails += 1;
            if (markAsleep) state.asleep[id] = true;
            if (addFatigue) await h.applyFatigue?.(id);
            log(state, `${c?.name ?? id}: failed the sleep check on watch${r.text ? ` (${r.text})` : ''}.`, true);
        } else if (r.text) log(state, `${state.characters[id]?.name ?? id}: kept awake (${r.text}).`, true);
    }
    // a new watch begins: those who slept on the previous one are awake again for the new one only if they are assigned again
    return { checks, watchers: event.actors };
}

async function runEncounter(state, event, h) {
    const r = await h.rollEncounter(event);
    if (r.triggered) {
        state.status = 'encounter';
        state.pending = { eventId: event.id, text: r.text ?? '', tableName: r.tableName ?? '' };
        log(state, `Encounter check at ${hoursText(event.at / HOUR)}: ${r.text || 'an encounter'}`, true);
    } else log(state, `Encounter check at ${hoursText(event.at / HOUR)}: nothing.`, true);
    return { triggered: !!r.triggered, text: r.text ?? '' };
}

export function finishRest(state) {
    state.status = 'done';
    state.elapsed = Math.min(state.elapsed, state.plannedSeconds);
}

/** The GM's decision after an encounter: 'play' (time stops, the rest counts as interrupted), 'continue', 'cancel' */
export function resolveEncounter(state, decision) {
    if (state.status !== 'encounter') return state;
    const id = state.pending?.eventId;
    if (decision === 'cancel') {
        state.status = 'cancelled';
    } else if (decision === 'play') {
        state.status = 'interrupted';
        state.interrupted = true;
        for (const c of Object.values(state.characters)) c.interrupted = true;
        log(state, 'The encounter is played out: the rest is interrupted until the GM continues it.', true);
    } else {
        state.status = 'running';
        log(state, 'The GM continued the rest after the encounter.', true);
    }
    if (decision !== 'play' && id) state.pending = null;
    return state;
}

/** After a played-out scene: continue (optionally with a new total duration in hours) or cancel */
export function continueRest(state, { hours = null, cancel = false } = {}) {
    if (state.status !== 'interrupted') return state;
    state.pending = null;
    if (cancel) {
        state.status = 'cancelled';
        return state;
    }
    if (hours !== null && Number.isFinite(Number(hours))) {
        state.plan = normalizePlan({ ...state.plan, hours: Math.max(state.elapsed / HOUR + 0.25, Number(hours)) });
        state.plannedSeconds = plannedSeconds(state.plan);
    }
    state.status = 'running';
    log(state, `The rest continues (${hoursText((state.plannedSeconds - state.elapsed) / HOUR)} left); it stays marked as interrupted.`, true);
    return state;
}

export const pauseRest = (state) => {
    if (state.status === 'running') state.status = 'paused';
    return state;
};
export const resumeRest = (state) => {
    if (state.status === 'paused') state.status = 'running';
    return state;
};
export const cancelRest = (state) => {
    if (!['done', 'cancelled'].includes(state.status)) state.status = 'cancelled';
    return state;
};

/**
 * After a reload / client change: an event that was claimed but has no result may have been rolled without being saved. The rest stops in
 * 'recovery' and the GM decides to roll it again or skip it. Nothing is rolled silently twice.
 */
export function recoverRest(state) {
    const open = Object.keys(state.claimed ?? {});
    if (!open.length || ['done', 'cancelled'].includes(state.status)) return state;
    state.status = 'recovery';
    state.pending = { eventId: open[0], text: 'The rest was interrupted while this check was being made.', tableName: '' };
    return state;
}

export function resolveRecovery(state, decision) {
    if (state.status !== 'recovery') return state;
    const id = state.pending.eventId;
    delete state.claimed[id];
    if (decision === 'skip') state.processed[id] = { at: state.elapsed, skipped: true };
    state.pending = null;
    state.status = 'paused';
    return state;
}

/* ----------------------------- summary ----------------------------- */

/** Seconds of [0, elapsed] in which a character kept watch */
export function watchedSeconds(plan, actorId, elapsed) {
    return plan.watches
        .filter((w) => w.actors.includes(actorId))
        .reduce((sum, w) => sum + Math.max(0, Math.min(elapsed, w.to * HOUR) - w.from * HOUR), 0);
}

/**
 * Per character: time slept / rested, time on watch, interruption, failed sleep checks. Interrupted rest is reported as such, never as
 * complete rest; the GM decides what applies (nothing heals by itself).
 */
export function restSummary(state) {
    const planned = state.plannedSeconds;
    return {
        status: state.status,
        planned,
        elapsed: state.elapsed,
        complete: state.status === 'done' && !state.interrupted,
        interrupted: state.interrupted,
        characters: Object.entries(state.characters).map(([id, c]) => {
            const watched = Math.min(state.elapsed, watchedSeconds(state.plan, id, state.elapsed));
            return { id, name: c.name, watched, rested: Math.max(0, state.elapsed - watched), interrupted: c.interrupted, sleepFails: c.sleepFails, fullRest: state.status === 'done' && !c.interrupted && watched === 0 };
        }),
    };
}

/* ----------------------------- automatic clock ----------------------------- */

export const CLOCK_MODES = {
    pause: { label: 'Pause', factor: 0 },
    normal: { label: 'Normal (1:1)', factor: 1 }, // one real minute = one game minute
    roleplay: { label: 'Roleplay (1:3)', factor: 3 }, // one real minute = three game minutes
};

/**
 * Game seconds the automatic clock adds after `realSeconds`. Nothing while the game is paused, during a combat (combat has its own
 * time handling) or while a rest runs (the rest moves the time itself).
 */
export function clockAdvance({ mode, realSeconds, gamePaused = false, inCombat = false, restActive = false }) {
    const factor = CLOCK_MODES[mode]?.factor ?? 0;
    if (!factor || gamePaused || inCombat || restActive) return 0;
    return Math.max(0, Math.min(Number(realSeconds) || 0, 60)) * factor; // at most one minute of real time per step (a sleeping tab must not jump)
}

/** Why the clock does not run although a mode is set (for the status line) */
export function clockHalt({ mode, gamePaused, inCombat, restActive }) {
    if (!CLOCK_MODES[mode]?.factor) return '';
    if (restActive) return 'Rest in progress';
    if (gamePaused) return 'Game paused';
    if (inCombat) return 'Combat';
    return '';
}
