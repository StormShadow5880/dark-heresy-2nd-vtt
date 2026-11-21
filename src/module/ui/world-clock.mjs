/**
 * The imperial clock bar: date and time from Foundry's world time (`game.time.worldTime`), the same value the healing timers use.
 * Everybody sees it; only the GM gets the time jumps and the settings. A jump only advances the world time: it never heals anybody,
 * rest and treatment still have to be confirmed (docs/world-clock.md).
 */
import { SYSTEM_ID } from '../system-id.mjs';
import { CLOCK_MODES, HOUR, currentWatch, hoursText } from '../rules/rest.mjs';
import { clockStatus, command, currentRest, decide, publicRest, setClockMode } from '../actions/time-runner.mjs';
import { DEFAULT_CLOCK, JUMPS, clockParts, normalizeClock, parseTime, timersInFuture } from '../rules/world-clock.mjs';

const ID = 'dh-clock';

/**
 * Smooth display during a rest: the runner writes the world time only a few times per second (6 game minutes per write at the default
 * time lapse), so the bar advances the shown time itself between two writes, at the speed of the lapse, and corrects it with every
 * real update. Only the DISPLAY is interpolated: the world time itself (and with it every timer) is the written value.
 */
let sync = { world: 0, at: 0, shown: 0 };

export function markSync() {
    sync = { world: game.time.worldTime, at: performance.now(), shown: Math.max(sync.shown, game.time.worldTime) };
}

/** The time the bar shows: the world time, or its smooth prediction while a rest runs */
export function displayTime() {
    const world = game.time.worldTime;
    const rest = game.user.isGM ? currentRest() : publicRest();
    const running = rest && rest.status === 'running' && !game.paused && !rest.skipping;
    if (!running) {
        sync.shown = world;
        return world;
    }
    const perHour = Number(game.user.isGM ? rest.plan.secondsPerHour : rest.secondsPerHour) || 5;
    const end = rest.startWorldTime + rest.plannedSeconds;
    // at most 1.5 s ahead of the last real update: if the writer stalls (GM left), the display stops with it
    const ahead = Math.min(1.5, (performance.now() - sync.at) / 1000);
    const predicted = Math.min(end, sync.world + ahead * (HOUR / perHour));
    sync.shown = Math.max(world, Math.max(sync.shown, predicted)); // never backwards while running
    return sync.shown;
}
export const CLOCK_CONFIG = 'clock-config';
export const CLOCK_VISIBLE = 'clock-visible';
const { DialogV2 } = foundry.applications.api;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ''));

export const registerClockSettings = () => {
    game.settings.register(SYSTEM_ID, CLOCK_CONFIG, {
        scope: 'world',
        config: false,
        type: Object,
        default: {},
        onChange: () => renderClock(),
    });
    game.settings.register(SYSTEM_ID, CLOCK_VISIBLE, {
        name: 'Show the imperial clock bar',
        hint: 'Date and time bar at the top of the screen (this client only). The GM sets the date with the gear button of the bar.',
        scope: 'client',
        config: true,
        type: Boolean,
        default: true,
        onChange: () => renderClock(),
    });
};

export const clockConfig = () => normalizeClock({ ...DEFAULT_CLOCK, ...(game.settings.get(SYSTEM_ID, CLOCK_CONFIG) ?? {}) });

function clockElement() {
    let el = document.getElementById(ID);
    if (!el) {
        el = document.createElement('div');
        el.id = ID;
        el.className = 'dh-ui dh-clock';
        el.setAttribute('role', 'timer');
        document.body.append(el);
        el.addEventListener('click', onClick);
    }
    return el;
}

/** Draws the bar from the current world time */
export function renderClock() {
    let visible = true;
    try {
        visible = !!game.settings.get(SYSTEM_ID, CLOCK_VISIBLE);
    } catch {
        // setting not registered yet
    }
    const existing = document.getElementById(ID);
    if (!visible) {
        document.getElementById(`${ID}-sub`)?.remove();
        return existing?.remove();
    }
    const parts = clockParts(displayTime(), clockConfig());
    const el = clockElement();
    const gm = game.user.isGM;
    el.innerHTML = `
        <span class="dh-clock__seal" aria-hidden="true"><i class="fa-solid fa-skull"></i></span>
        <span class="dh-clock__date">${esc(parts.date)}</span>
        <span class="dh-clock__star" aria-hidden="true">✦</span>
        <span class="dh-clock__time">${esc(parts.time)}</span>
        ${parts.mission ? `<span class="dh-clock__missionwrap"><span class="dh-clock__star" aria-hidden="true">✦</span> <span class="dh-clock__mission">${esc(parts.mission)}</span></span>` : ''}
        ${
            gm
                ? `<span class="dh-clock__jumps">${JUMPS.map((j) => `<button type="button" data-jump="${j.seconds}" title="Advance the world time by ${esc(j.label.slice(1))}">${esc(j.label)}</button>`).join('')}
                   <button type="button" data-config="1" class="dh-clock__gear" title="Date, time and mission start"><i class="fa-solid fa-gear"></i></button></span>`
                : ''
        }`;
    renderSub();
}

/** Second slim row: automatic clock (buttons for the GM) and the rest */
function renderSub() {
    let el = document.getElementById(`${ID}-sub`);
    const gm = game.user.isGM;
    const status = clockStatus();
    const rest = gm ? currentRest() : publicRest();
    const restOn = rest && rest.status && !['done', 'cancelled'].includes(rest.status) && (gm ? true : rest.active);
    if (!gm && !restOn && !status.running) return el?.remove();
    if (!el) {
        el = document.createElement('div');
        el.id = `${ID}-sub`;
        el.className = 'dh-ui dh-clock-sub';
        document.body.append(el);
        el.addEventListener('click', onSubClick);
    }
    let html = '';
    if (restOn) {
        const planned = rest.plannedSeconds;
        const start = rest.startWorldTime;
        const elapsed = Math.min(planned, Math.max(0, displayTime() - start));
        const labels = { running: 'Resting', paused: 'Rest paused', encounter: gm ? 'Encounter: decide' : 'Rest paused', interrupted: gm ? 'Rest interrupted' : 'Rest paused', recovery: gm ? 'Check: decide' : 'Rest paused' };
        const plan = gm ? rest.plan : rest;
        const w = currentWatch({ watches: (plan.watches ?? []).map((x) => ({ from: x.from, to: x.to, actors: x.actors ?? x.names ?? [] })) }, elapsed);
        const watchNames = gm ? w.actors.map((id) => rest.characters[id]?.name ?? id) : w.actors;
        const pct = planned ? Math.round((elapsed / planned) * 100) : 0;
        html += `<span class="dh-clock-sub__state is-rest" role="status"><i class="fa-solid fa-campground"></i> <b>${labels[rest.status] ?? 'Rest'}</b>${plan.location ? ` · ${esc(plan.location)}` : ''}
            · <span class="dh-clock-sub__elapsed">${hoursText(elapsed / HOUR)}</span> / ${hoursText(planned / HOUR)}${(plan.watches ?? []).length ? ` · Watch: ${watchNames.length ? esc(watchNames.join(', ')) : 'none'}` : ''}</span>
            <span class="dh-clock-sub__bar" aria-hidden="true"><i style="width:${pct}%"></i></span>`;
        if (gm) {
            const needs = ['encounter', 'interrupted', 'recovery'].includes(rest.status);
            html += `<span class="dh-clock-sub__buttons">
                ${needs ? '<button type="button" data-rest="decide" class="is-alert">Decide …</button>' : ''}
                ${rest.status === 'paused' ? '<button type="button" data-rest="resume">Resume</button>' : rest.status === 'running' ? '<button type="button" data-rest="pause">Pause</button>' : ''}
                ${rest.status === 'running' ? '<button type="button" data-rest="skip" title="Fast forward: no watch change, check or encounter is skipped">Skip</button>' : ''}
                <button type="button" data-rest="cancel" title="The world time stays where it is">Cancel</button></span>`;
        }
    } else {
        const dot = status.running ? 'is-on' : '';
        const text = status.mode === 'pause' ? 'Clock paused' : status.halt ? `${status.label}: halted (${status.halt})` : `${status.label}: running`;
        html += `<span class="dh-clock-sub__state ${dot}" role="status"><i class="dh-clock-sub__dot"></i> <b>${esc(text)}</b></span>`;
        if (gm) {
            html += `<span class="dh-clock-sub__buttons">${Object.entries(CLOCK_MODES)
                .map(([mode, m]) => `<button type="button" data-mode="${mode}" aria-pressed="${status.mode === mode}" class="${status.mode === mode ? 'is-active' : ''}">${esc(m.label)}</button>`)
                .join('')}<button type="button" data-rest="start">Rest …</button></span>`;
        }
    }
    el.innerHTML = html;
}

async function onSubClick(event) {
    const b = event.target.closest('button');
    if (!b || !game.user.isGM) return;
    if (b.dataset.mode) return setClockMode(b.dataset.mode);
    const act = b.dataset.rest;
    if (act === 'start') return (await import('./rest-dialog.mjs')).openRestDialog();
    if (act === 'decide') return decide();
    if (act) await command(act);
}

async function onClick(event) {
    const button = event.target.closest('button');
    if (!button || !game.user.isGM) return;
    if (button.dataset.jump) await game.time.advance(Number(button.dataset.jump));
    else if (button.dataset.config) await openClockConfig();
}

/** GM dialog: date, time, calendar and mission. "Apply" fixes the entered date/time to the CURRENT world time. */
export async function openClockConfig() {
    if (!game.user.isGM) return;
    const c = clockConfig();
    const now = clockParts(game.time.worldTime, c);
    const field = (label, name, value, type = 'text', extra = '') => `<div class="form-group"><label>${label}</label><input type="${type}" name="${name}" value="${esc(value)}" ${extra} /></div>`;
    const data = await DialogV2.prompt({
        classes: ['dh-ui', 'dh-dialog'],
        window: { title: 'Imperial clock' },
        content: `
            <p class="notes">GM configuration, not an official calendar. The world time (${game.time.worldTime} s) is the only clock: the values below are fixed to the CURRENT world time.</p>
            <div class="form-group"><label><input type="checkbox" name="applyDate" checked /> Set date and time to these values now</label></div>
            ${field('Year number', 'year', now.year, 'number')}
            ${field('Day of the year', 'day', now.day, 'number', 'min="1"')}
            ${field('Time (hh:mm)', 'time', now.time)}
            ${field('Millennium text', 'mil', c.millennium)}
            ${field('Days per year', 'dpy', c.daysPerYear, 'number', 'min="1"')}
            ${field('Date template ({year} {day} {mil})', 'template', c.template)}
            <hr />
            <div class="form-group"><label><input type="checkbox" name="missionEnabled" ${c.missionEnabled ? 'checked' : ''} /> Show the mission day</label></div>
            ${field('Mission name', 'missionName', c.missionName)}
            ${field('Mission text ({n} {name})', 'missionLabel', c.missionLabel)}
            <div class="form-group"><label><input type="checkbox" name="missionNow" /> The mission starts today (day 1)${c.missionStart !== null ? ' — replaces the current start' : ''}</label></div>
            <p class="notes">Changing the date does not heal anybody and does not touch stored treatment times.</p>`,
        ok: { label: 'Apply', callback: (ev, button) => new foundry.applications.ux.FormDataExtended(button.form).object },
        rejectClose: false,
        modal: false,
    });
    if (!data) return;
    const next = { ...(game.settings.get(SYSTEM_ID, CLOCK_CONFIG) ?? {}), millennium: data.mil || c.millennium, daysPerYear: data.dpy, template: data.template || c.template, missionEnabled: !!data.missionEnabled, missionName: data.missionName, missionLabel: data.missionLabel };
    if (data.applyDate) {
        if (parseTime(data.time) === null) return ui.notifications.warn('Time must look like 08:35.');
        Object.assign(next, { anchor: game.time.worldTime, startYear: Number(data.year), startDay: Number(data.day), startTime: data.time });
    } else Object.assign(next, { anchor: c.anchor, startYear: c.startYear, startDay: c.startDay, startTime: c.startTime });
    if (data.missionNow) next.missionStart = game.time.worldTime;
    await game.settings.set(SYSTEM_ID, CLOCK_CONFIG, normalizeClock({ ...DEFAULT_CLOCK, ...next }));
}

/** The world time was set back: tell the GM, change nothing (the stored treatment times stay as they are) */
function warnRewind() {
    if (!game.user.isGM) return;
    const now = game.time.worldTime;
    const affected = (game.actors ?? []).filter((a) => timersInFuture(a.getFlag?.(SYSTEM_ID, 'healingTimers'), now).length);
    ui.notifications.warn(
        `The world time was set back. ${affected.length ? `${affected.map((a) => a.name).join(', ')} have treatment or recovery times in the future: their locks stay until the time catches up (a GM can override a lock). ` : ''}Nothing was healed or changed.`,
        { permanent: !!affected.length },
    );
}

/** Open character sheets show timers: redraw their combat tab when the time changes */
function refreshSheets() {
    for (const app of foundry.applications.instances.values()) {
        if (app.actor && app.options?.classes?.includes('dossier') && app.rendered) app.render({ parts: ['combat'] });
    }
}

function renderSubTexts(sub, shown) {
    const rest = game.user.isGM ? currentRest() : publicRest();
    if (!rest?.plannedSeconds) return;
    const elapsed = Math.min(rest.plannedSeconds, Math.max(0, shown - rest.startWorldTime));
    const text = sub.querySelector('.dh-clock-sub__elapsed');
    if (text && text.textContent !== hoursText(elapsed / HOUR)) text.textContent = hoursText(elapsed / HOUR);
    const bar = sub.querySelector('.dh-clock-sub__bar i');
    if (bar) bar.style.width = `${Math.round((elapsed / rest.plannedSeconds) * 100)}%`;
}

/** Light redraw: only the texts that change with the time (the buttons keep their focus and clicks) */
function paintClock() {
    const el = document.getElementById(ID);
    if (!el) return;
    const shown = displayTime();
    const parts = clockParts(shown, clockConfig());
    const set = (selector, text) => {
        const node = el.querySelector(selector);
        if (node && node.textContent !== text) node.textContent = text;
    };
    set('.dh-clock__date', parts.date);
    set('.dh-clock__time', parts.time);
    set('.dh-clock__mission', parts.mission);
    const sub = document.getElementById(`${ID}-sub`);
    if (sub) renderSubTexts(sub, shown);
}

export function initWorldClock() {
    markSync();
    renderClock();
    window.addEventListener('dh-clock-changed', () => renderClock());
    // while a rest runs the bar is redrawn ~7 times per second with the predicted time (minute by minute)
    setInterval(() => {
        const rest = game.user.isGM ? currentRest() : publicRest();
        if (rest?.status === 'running' && !game.paused) paintClock();
    }, 150);
    Hooks.on('updateWorldTime', (worldTime, delta) => {
        markSync();
        renderClock();
        refreshSheets();
        if (Number(delta) < 0) warnRewind();
    });
}
