/**
 * The imperial clock bar: date and time from Foundry's world time (`game.time.worldTime`), the same value the healing timers use.
 * Everybody sees it; only the GM gets the time jumps and the settings. A jump only advances the world time: it never heals anybody,
 * rest and treatment still have to be confirmed (docs/world-clock.md).
 */
import { SYSTEM_ID } from '../system-id.mjs';
import { DEFAULT_CLOCK, JUMPS, clockParts, normalizeClock, parseTime, timersInFuture } from '../rules/world-clock.mjs';

const ID = 'dh-clock';
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
    if (!visible) return existing?.remove();
    const parts = clockParts(game.time.worldTime, clockConfig());
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

export function initWorldClock() {
    renderClock();
    Hooks.on('updateWorldTime', (worldTime, delta) => {
        renderClock();
        refreshSheets();
        if (Number(delta) < 0) warnRewind();
    });
}
