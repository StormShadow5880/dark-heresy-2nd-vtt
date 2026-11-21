/**
 * Runtime of the automatic game clock and of the rest (rules: rules/rest.mjs). Foundry's world time (`game.time.worldTime`) stays the only
 * clock: the automatic clock and the rest only call `game.time.advance()`, and only on the client of the ACTIVE GM. The rest sets the world
 * time to `startWorldTime + elapsed`, so a reload or a change of the GM client cannot count time twice.
 *
 * Where things are stored:
 *  - the automatic clock mode: world setting `clock-run` (nothing secret)
 *  - the public part of a rest (status, start, length, watch roster): world setting `rest-public`, read by every client for the bar
 *  - the full state of the rest with the secret results (encounters, sleep checks): a Journal entry that only GMs can see
 *    (ownership default NONE). World settings are sent to all clients, so secrets are never put there.
 */
import { SYSTEM_ID } from '../system-id.mjs';
import {
    CLOCK_MODES,
    HOUR,
    cancelRest,
    clockAdvance,
    clockHalt,
    continueRest,
    createRest,
    currentWatch,
    hoursText,
    normalizePlan,
    pauseRest,
    recoverRest,
    resolveEncounter,
    resolveRecovery,
    restSummary,
    resumeRest,
    stepRest,
} from '../rules/rest.mjs';

export const CLOCK_RUN = 'clock-run';
export const REST_PUBLIC = 'rest-public';
const SOCKET = `system.${SYSTEM_ID}`;
const TICK_MS = 250;
const { DialogV2 } = foundry.applications.api;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ''));

export const registerTimeSettings = () => {
    for (const key of [CLOCK_RUN, REST_PUBLIC]) {
        game.settings.register(SYSTEM_ID, key, { scope: 'world', config: false, type: Object, default: {}, onChange: () => window.dispatchEvent(new CustomEvent('dh-clock-changed')) });
    }
};

export const clockMode = () => game.settings.get(SYSTEM_ID, CLOCK_RUN)?.mode ?? 'pause';
export const publicRest = () => {
    const p = game.settings.get(SYSTEM_ID, REST_PUBLIC);
    return p?.active ? p : null;
};
export const isActiveGM = () => !!game.user?.isGM && game.users.activeGM?.id === game.user.id;

/* ------------------------------ conflicts ------------------------------ */

const OTHER_CONTROLLERS = { 'foundryvtt-simple-calendar': 'Simple Calendar', 'about-time': 'About Time', smalltime: 'SmallTime', calendaria: 'Calendaria', 'seasons-and-stars': 'Seasons & Stars' };

/** Other things that may move the world time as well (a double advance must be avoided) */
export function timeConflicts() {
    const found = Object.entries(OTHER_CONTROLLERS).filter(([id]) => game.modules.get(id)?.active).map(([, name]) => name);
    if (Number(CONFIG.time?.roundTime) > 0) found.push(`Foundry combat time (${CONFIG.time.roundTime} s per round)`);
    return found;
}

async function confirmNoConflict(what) {
    const conflicts = timeConflicts();
    if (!conflicts.length) return true;
    return (
        (await DialogV2.confirm({
            classes: ['dh-ui', 'dh-dialog'],
            window: { title: 'Another time controller' },
            content: `<p>${esc(conflicts.join(', '))} can also advance the world time. Using ${esc(what)} at the same time may count time twice.</p><p>Continue anyway?</p>`,
            rejectClose: false,
            modal: false,
        })) === true
    );
}

/* ------------------------------ state storage ------------------------------ */

let cache = null; // the state of the rest as this client knows it
let doc = null;

function findDoc() {
    return game.journal?.find((j) => j.getFlag(SYSTEM_ID, 'restStore')) ?? null;
}

async function ensureDoc() {
    doc = findDoc();
    if (!doc && game.user.isGM) {
        doc = await JournalEntry.create({ name: 'Dark Heresy: rest log (GM only)', ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }, flags: { [SYSTEM_ID]: { restStore: true } } });
    }
    return doc;
}

export function loadState() {
    const d = findDoc();
    const text = d?.getFlag(SYSTEM_ID, 'restJson');
    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return null;
    }
}

async function saveState(state) {
    cache = state;
    const d = doc ?? (await ensureDoc());
    if (d) await d.setFlag(SYSTEM_ID, 'restJson', JSON.stringify(state));
}

const isActive = (s) => !!s && ['running', 'paused', 'encounter', 'interrupted', 'recovery'].includes(s.status);
export const currentRest = () => (game.user.isGM ? (cache ??= loadState()) : null);
export const restActive = () => isActive(game.user.isGM ? currentRest() : publicRest());

async function publish(state) {
    const active = isActive(state);
    const secretToPublic = { encounter: 'paused', interrupted: 'paused', recovery: 'paused' };
    const watches = state?.plan?.watches?.map((w) => ({ from: w.from, to: w.to, names: w.actors.map((id) => state.characters[id]?.name ?? '?') })) ?? [];
    const value = active
        ? { active: true, status: secretToPublic[state.status] ?? state.status, startWorldTime: state.startWorldTime, plannedSeconds: state.plannedSeconds, secondsPerHour: state.plan.secondsPerHour, location: state.plan.location, watches }
        : {};
    if (JSON.stringify(value) !== JSON.stringify(game.settings.get(SYSTEM_ID, REST_PUBLIC) ?? {})) await game.settings.set(SYSTEM_ID, REST_PUBLIC, value);
}

/* ------------------------------ handlers (dice and documents) ------------------------------ */

const actorById = (id) => game.actors.get(id);

function handlers() {
    return {
        persist: saveState,
        fatigueOf: (id) => Number(actorById(id)?.system?.fatigue?.value ?? 0),
        applyFatigue: async (id) => {
            const a = actorById(id);
            if (a) await a.update({ 'system.fatigue.value': Number(a.system.fatigue?.value ?? 0) + 1 });
        },
        sleepCheck: async (id, event) => {
            const a = actorById(id);
            const s = cache.plan.sleep;
            const char = a?.getCharacteristicFuzzy?.(s.characteristic);
            if (!a || !char) return { success: true, text: 'no test possible' };
            const target = Number(char.total) + Number(s.modifier || 0);
            const check = await a.rollCheck(target);
            return { success: check.success, text: `${char.short} ${check.roll.total} vs ${target}` };
        },
        rollEncounter: async (event) => {
            const e = cache.plan.encounters;
            const roll = await new Roll('1d100').evaluate();
            if (roll.total > e.chance) return { triggered: false };
            let text = 'Encounter (no table chosen)';
            let tableName = '';
            if (e.tableUuid) {
                const table = await fromUuid(e.tableUuid);
                if (table) {
                    tableName = table.name;
                    const draw = await table.draw({ displayChat: false });
                    const plain = (html) => String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                    text = draw.results.map((r) => [r.name, plain(r.description ?? r.text)].filter(Boolean).join(': ')).filter(Boolean).join('; ') || `${table.name}: no result`;
                }
            }
            return { triggered: true, text, tableName };
        },
    };
}

/* ------------------------------ the loop ------------------------------ */

let last = Date.now();
let carry = 0; // fractions of game seconds of the automatic clock
let busy = false;
let announced = null;

async function tick() {
    const now = Date.now();
    const dt = (now - last) / 1000;
    last = now;
    if (!isActiveGM() || busy) return;
    busy = true;
    try {
        cache ??= loadState();
        if (cache && isActive(cache)) await restTick(dt);
        else await clockTick(dt);
    } catch (error) {
        console.error('Dark Heresy 2e | time runner failed', error);
    } finally {
        busy = false;
    }
}

async function clockTick(dt) {
    const add = clockAdvance({ mode: clockMode(), realSeconds: dt, gamePaused: game.paused, inCombat: !!game.combat?.started, restActive: false });
    carry += add;
    if (carry >= 5) {
        const whole = Math.floor(carry);
        carry -= whole;
        await game.time.advance(whole);
    }
}

/** Keeps the world time at start + elapsed (never advances twice, adopts a later time set by hand) */
async function syncWorldTime(state) {
    const target = state.startWorldTime + state.elapsed;
    const now = game.time.worldTime;
    if (now < target) await game.time.advance(target - now);
    else if (now > target && state.status === 'running') state.elapsed = Math.min(state.plannedSeconds, now - state.startWorldTime);
}

async function restTick(dt) {
    let state = cache;
    if (state.status === 'running' && !game.paused) {
        const before = state.status;
        await stepRest(state, dt, handlers());
        await syncWorldTime(state);
        if (state.status !== before || Date.now() - (state._saved ?? 0) > 5000) {
            state._saved = Date.now();
            await saveState(state);
        }
    } else if (state.status === 'running') last = Date.now();
    await publish(state);
    await announce(state);
}

/** Dialogs and chat messages for the states that need the GM (once per state; after a reload they are shown again) */
async function announce(state) {
    const key = `${state.status}:${state.pending?.eventId ?? ''}`;
    if (announced === key) return;
    if (state.status === 'encounter') {
        announced = key;
        await whisper(`<h3>Rest: encounter</h3>${summaryHtml(state)}<p><b>${esc(state.pending.tableName || 'Encounter')}</b>: ${esc(state.pending.text)}</p><p><i>Only you can see this. You decide what the characters notice.</i></p>`);
        encounterDialog();
    } else if (state.status === 'recovery') {
        announced = key;
        recoveryDialog();
    } else if (state.status === 'interrupted') {
        announced = key;
    } else if (['done', 'cancelled'].includes(state.status) && !state.summarized) {
        announced = key;
        state.summarized = true;
        await saveState(state);
        await finalMessages(state);
        await publish(state);
    }
}

const whisper = (content) => ChatMessage.create({ content, whisper: ChatMessage.getWhisperRecipients('GM').map((u) => u.id), speaker: { alias: 'Rest' } });

function summaryHtml(state) {
    const elapsed = state.elapsed;
    const w = currentWatch(state.plan, elapsed, Object.keys(state.asleep));
    const names = w.entries.flatMap((e) => e.actors.map((id) => state.characters[id]?.name ?? id));
    const watchLine = state.plan.watches.length ? `Watch: ${names.length ? esc(names.join(', ')) : 'nobody'}${w.guarded || !names.length ? '' : ' (they are asleep)'}` : 'No watch planned';
    return `<p>Elapsed ${hoursText(elapsed / HOUR)} of ${hoursText(state.plannedSeconds / HOUR)}, ${hoursText((state.plannedSeconds - elapsed) / HOUR)} left.<br>${watchLine}</p>`;
}

async function finalMessages(state) {
    const sum = restSummary(state);
    const rows = sum.characters
        .map((c) => `<li><b>${esc(c.name)}</b>: rested ${hoursText(c.rested / HOUR)}, watch ${hoursText(c.watched / HOUR)}${c.interrupted ? ', <b>interrupted</b>' : ''}${c.sleepFails ? `, asleep on watch ${c.sleepFails}×` : ''}${c.fullRest ? ', full rest' : ''}</li>`)
        .join('');
    const head = state.status === 'cancelled' ? 'Rest cancelled' : sum.complete ? 'Rest finished' : 'Rest finished (interrupted)';
    await ChatMessage.create({ content: `<h3>${head}</h3><p>${state.plan.location ? `${esc(state.plan.location)}: ` : ''}${hoursText(state.elapsed / HOUR)} of ${hoursText(state.plannedSeconds / HOUR)} passed.</p>`, speaker: { alias: 'Rest' } });
    await whisper(`<h3>${head}: details</h3><ul>${rows}</ul><p>Nothing was healed. Open the 24 h rest dialog to confirm which rest, treatment or recovery effects apply; an interrupted rest is not complete rest.</p><p><button type="button" data-dh-rest-effects>Open the 24 h rest dialog</button></p>`);
}

/** The whispered summary has a button for the existing 24 h rest dialog */
export function bindRestMessage(message, html) {
    const button = html.querySelector('[data-dh-rest-effects]');
    if (!button || !game.user.isGM) return;
    button.addEventListener('click', async (ev) => {
        ev.preventDefault();
        (await import('./healing-manager.mjs')).finishRest();
    });
}

/* ------------------------------ GM dialogs ------------------------------ */

async function encounterDialog() {
    const choice = await DialogV2.wait({
        classes: ['dh-ui', 'dh-dialog'],
        window: { title: 'Encounter during the rest' },
        content: `${summaryHtml(cache)}<p><b>${esc(cache.pending?.tableName || 'Encounter')}</b>: ${esc(cache.pending?.text)}</p><p class="notes">Only you see this.</p>`,
        buttons: [
            { action: 'play', label: 'Play out the encounter', default: true },
            { action: 'continue', label: 'Continue the rest' },
            { action: 'cancel', label: 'Cancel the rest' },
        ],
        rejectClose: false,
        modal: false,
    }).catch(() => null);
    if (choice) await command(choice === 'play' ? 'encounter-play' : choice === 'continue' ? 'encounter-continue' : 'cancel');
}

async function recoveryDialog() {
    const choice = await DialogV2.wait({
        classes: ['dh-ui', 'dh-dialog'],
        window: { title: 'Rest: check interrupted' },
        content: `<p>The connection or the GM client changed while a check of the rest was being made. It may or may not have been rolled.</p><p>Roll it again, or skip it?</p>`,
        buttons: [
            { action: 'reroll', label: 'Roll it again', default: true },
            { action: 'skip', label: 'Skip it' },
        ],
        rejectClose: false,
        modal: false,
    }).catch(() => null);
    if (choice) await command(choice === 'skip' ? 'recovery-skip' : 'recovery-reroll');
}

/** After a played-out scene: continue with the rest (optionally another length) or cancel */
export async function continueDialog() {
    const s = currentRest();
    if (!s || s.status !== 'interrupted') return;
    const left = (s.plannedSeconds - s.elapsed) / HOUR;
    const data = await DialogV2.prompt({
        classes: ['dh-ui', 'dh-dialog'],
        window: { title: 'Continue the rest' },
        content: `<p>${esc(hoursText(s.elapsed / HOUR))} of the rest have passed, ${esc(hoursText(left))} are left. The rest stays marked as interrupted.</p>
            <div class="form-group"><label>Total length (hours)</label><input type="number" name="hours" min="${(s.elapsed / HOUR + 0.25).toFixed(2)}" step="0.25" value="${(s.plannedSeconds / HOUR).toFixed(2)}" /></div>`,
        ok: { label: 'Continue', callback: (ev, b) => ({ hours: Number(new foundry.applications.ux.FormDataExtended(b.form).object.hours) }) },
        rejectClose: false,
        modal: false,
    });
    if (data) await command('continue', data);
}

/* ------------------------------ commands (any GM client; applied by the active GM) ------------------------------ */

export async function command(cmd, args = {}) {
    if (!game.user.isGM) return;
    if (isActiveGM()) return apply(cmd, args);
    if (!game.users.activeGM) return ui.notifications.warn('No GM client is active.');
    game.socket.emit(SOCKET, { type: 'rest-command', cmd, args });
}

export function registerTimeSocket() {
    game.socket.on(SOCKET, (data) => {
        if (data?.type !== 'rest-command' || !isActiveGM()) return;
        apply(data.cmd, data.args ?? {});
    });
    Hooks.on('updateJournalEntry', (entry) => {
        if (entry.getFlag?.(SYSTEM_ID, 'restStore') && game.user.isGM && !isActiveGM()) cache = loadState();
    });
}

async function apply(cmd, args) {
    cache ??= loadState();
    const s = cache;
    if (cmd === 'start') {
        if (isActive(s)) return ui.notifications.warn('A rest is already in progress.');
        if (!(await confirmNoConflict('the rest'))) return;
        cache = createRest(args.plan, game.time.worldTime);
        announced = null;
        await saveState(cache);
        await publish(cache);
        return;
    }
    if (!s) return;
    const done = {
        pause: () => pauseRest(s),
        resume: () => resumeRest(s),
        skip: () => {
            if (s.status === 'running') s.skipping = true;
        },
        cancel: () => cancelRest(s),
        'encounter-play': () => resolveEncounter(s, 'play'),
        'encounter-continue': () => resolveEncounter(s, 'continue'),
        continue: () => continueRest(s, { hours: args.hours }),
        'recovery-skip': () => resolveRecovery(s, 'skip'),
        'recovery-reroll': () => resolveRecovery(s, 'reroll'),
    }[cmd];
    if (!done) return;
    done();
    // "skip" lasts until the next stop: it is a speed, not a state
    if (cmd !== 'skip' && s.skipping) s.skipping = false;
    if (cmd === 'recovery-skip' || cmd === 'recovery-reroll') resumeRest(s);
    await saveState(s);
    await publish(s);
    await announce(s);
}

export async function setClockMode(mode) {
    if (!game.user.isGM || !(mode in CLOCK_MODES)) return;
    if (mode !== 'pause' && !(await confirmNoConflict('the automatic clock'))) return;
    await game.settings.set(SYSTEM_ID, CLOCK_RUN, { mode });
}

/** Status text and halt reason of the automatic clock, for the bar */
export function clockStatus() {
    const mode = clockMode();
    const halt = clockHalt({ mode, gamePaused: game.paused, inCombat: !!game.combat?.started, restActive: restActive() });
    return { mode, label: CLOCK_MODES[mode]?.label ?? 'Pause', running: !!CLOCK_MODES[mode]?.factor && !halt, halt };
}

export function initTimeRunner() {
    if (game.user.isGM) {
        cache = loadState();
        if (cache && isActive(cache) && isActiveGM()) {
            // after a reload: the stored state is checked and continued under control
            recoverRest(cache);
            if (cache.status === 'running') cache.status = 'paused';
            saveState(cache);
        }
    }
    last = Date.now();
    setInterval(tick, TICK_MS);
    for (const hook of ['pauseGame', 'updateCombat', 'deleteCombat', 'createCombat']) Hooks.on(hook, () => window.dispatchEvent(new CustomEvent('dh-clock-changed')));
}

/** The GM clicked "Decide": opens the dialog that belongs to the current state of the rest */
export function decide() {
    const s = currentRest();
    if (!s) return;
    if (s.status === 'encounter') encounterDialog();
    else if (s.status === 'recovery') recoveryDialog();
    else if (s.status === 'interrupted') continueDialog();
}
