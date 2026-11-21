/**
 * The "Rest …" dialog of the GM: length, place, environment, encounters, watches and sleep checks of a rest. Encounters, watches and sleep
 * checks are configurable GAME MASTER rules of this system, not official Dark Heresy 2 rules; the defaults are only suggestions.
 */
import { ENVIRONMENTS, SLEEP_MODES, analyzeWatches, generateWatches, normalizePlan } from '../rules/rest.mjs';
import { command } from '../actions/time-runner.mjs';

const { DialogV2 } = foundry.applications.api;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ''));
const CHARACTERISTICS = ['willpower', 'toughness', 'intelligence', 'perception', 'agility', 'strength', 'fellowship', 'weaponSkill', 'ballisticSkill'];

export async function openRestDialog() {
    if (!game.user.isGM) return;
    const actors = game.actors.filter((a) => a.type === 'acolyte');
    if (!actors.length) return ui.notifications.warn('There are no player characters to rest.');
    const preset = actors.filter((a) => a.hasPlayerOwner);
    const state = { watches: [], hours: 8 };
    const tables = game.tables.contents;

    const content = `
    <form class="dh-rest">
        <fieldset><legend>Rest</legend>
            <div class="form-group"><label>Duration (hours)</label><div class="form-fields">
                ${[4, 8, 12].map((h) => `<button type="button" data-hours="${h}">${h} h</button>`).join('')}
                <input type="number" name="hours" value="8" min="0.25" step="0.25" /></div></div>
            <div class="form-group"><label>Place (optional)</label><input type="text" name="location" placeholder="e.g. abandoned chapel" /></div>
            <div class="form-group"><label>Environment</label><select name="environment">${Object.entries(ENVIRONMENTS).map(([k, v]) => `<option value="${k}" ${k === 'normal' ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></div>
            <div class="form-group"><label>Time lapse (real seconds per game hour)</label><input type="number" name="secondsPerHour" value="5" min="0.2" step="0.5" /></div>
            <div class="form-group"><label>Who rests</label><div class="form-fields">${actors.map((a) => `<label><input type="checkbox" name="p-${a.id}" ${preset.includes(a) ? 'checked' : ''} /> ${esc(a.name)}</label>`).join(' ')}</div></div>
        </fieldset>
        <fieldset><legend>Encounters <small>(game master rule)</small></legend>
            <div class="form-group"><label><input type="checkbox" name="encEnabled" /> Random encounters</label></div>
            <div class="form-group"><label>Roll table</label><select name="encTable"><option value="">– none –</option>${tables.map((t) => `<option value="${t.uuid}">${esc(t.name)}</option>`).join('')}</select></div>
            <div class="form-group"><label>Check every (minutes)</label><input type="number" name="encInterval" value="120" min="5" step="5" /></div>
            <div class="form-group"><label>Chance per check (%)</label><input type="number" name="encChance" value="${ENVIRONMENTS.normal.chance}" min="0" max="100" /></div>
            <p class="notes">The suggested chance per environment is only a starting point, not a rule. A check rolls 1d100 against the chance, a hit draws the table.</p>
        </fieldset>
        <fieldset><legend>Watches</legend>
            <div class="form-group"><label>Watch length (hours)</label><div class="form-fields"><input type="number" name="watchEach" value="2" min="0.25" step="0.25" />
                <button type="button" data-gen="rotate">Create, rotating</button><button type="button" data-gen="empty">Create, empty</button><button type="button" data-gen="clear">No watch</button></div></div>
            <div class="dh-rest__watches"></div>
            <p class="dh-rest__problems notes"></p>
        </fieldset>
        <fieldset><legend>Falling asleep on watch <small>(game master rule, not an official Dark Heresy 2 rule)</small></legend>
            <div class="form-group"><label>Sleep check</label><select name="sleepMode">${Object.entries(SLEEP_MODES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
            <div class="form-group"><label>Test</label><select name="sleepChar">${CHARACTERISTICS.map((c) => `<option value="${c}" ${c === 'willpower' ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
            <div class="form-group"><label>Modifier</label><input type="number" name="sleepMod" value="0" step="5" /></div>
            <div class="form-group"><label><input type="checkbox" name="sleepAsleep" checked /> On failure: the watcher falls asleep (the watch is unguarded)</label></div>
            <div class="form-group"><label><input type="checkbox" name="sleepFatigue" /> On failure: +1 fatigue</label></div>
        </fieldset>
    </form>`;

    const render = (event, dialog) => {
        const el = dialog.element;
        const form = el.querySelector('form');
        const chosenActors = () => actors.filter((a) => form.elements[`p-${a.id}`]?.checked);
        const redraw = () => {
            const who = chosenActors();
            form.querySelector('.dh-rest__watches').innerHTML = state.watches.length
                ? state.watches
                      .map(
                          (w, i) => `<div class="dh-rest__watch" data-i="${i}">
                    <input type="number" data-f="from" value="${w.from}" step="0.25" min="0" /> – <input type="number" data-f="to" value="${w.to}" step="0.25" min="0" /> h
                    ${who.map((a) => `<label><input type="checkbox" data-a="${a.id}" ${w.actors.includes(a.id) ? 'checked' : ''} /> ${esc(a.name)}</label>`).join(' ')}
                    <button type="button" data-del="${i}" title="Remove">×</button></div>`,
                      )
                      .join('') + '<button type="button" data-add="1">+ Add a watch</button>'
                : '<p class="notes">No watch: the whole rest is unguarded (allowed).</p><button type="button" data-add="1">+ Add a watch</button>';
            const hours = Number(form.elements.hours.value) || 0;
            const problems = state.watches.length ? analyzeWatches(state.watches, hours).problems : [];
            form.querySelector('.dh-rest__problems').innerHTML = problems.length ? `⚠ ${problems.map(esc).join('<br>⚠ ')}<br><i>An unguarded period is allowed if you want it.</i>` : state.watches.length ? '✓ The watch plan covers the whole rest.' : '';
        };
        form.addEventListener('click', (ev) => {
            const b = ev.target.closest('button');
            if (!b) return;
            ev.preventDefault();
            const hours = Number(form.elements.hours.value) || 8;
            if (b.dataset.hours) form.elements.hours.value = b.dataset.hours;
            else if (b.dataset.gen) {
                const each = Number(form.elements.watchEach.value) || 2;
                state.watches = b.dataset.gen === 'clear' ? [] : generateWatches(hours, each, b.dataset.gen === 'rotate' ? chosenActors().map((a) => a.id) : []);
            } else if (b.dataset.add !== undefined) state.watches.push({ from: state.watches.at(-1)?.to ?? 0, to: Math.min(hours, (state.watches.at(-1)?.to ?? 0) + 2), actors: [] });
            else if (b.dataset.del !== undefined) state.watches.splice(Number(b.dataset.del), 1);
            else return;
            redraw();
        });
        form.addEventListener('change', (ev) => {
            const row = ev.target.closest('.dh-rest__watch');
            if (row) {
                const w = state.watches[Number(row.dataset.i)];
                if (ev.target.dataset.f) w[ev.target.dataset.f] = Number(ev.target.value) || 0;
                if (ev.target.dataset.a) w.actors = [...row.querySelectorAll('[data-a]')].filter((c) => c.checked).map((c) => c.dataset.a);
            }
            if (ev.target.name === 'environment') form.elements.encChance.value = ENVIRONMENTS[ev.target.value]?.chance ?? 0;
            redraw();
        });
        redraw();
    };

    const result = await DialogV2.prompt({
        classes: ['dh-ui', 'dh-dialog'],
        window: { title: 'Plan a rest', resizable: true },
        position: { width: 640 },
        content,
        render,
        ok: {
            label: 'Begin the rest',
            callback: (ev, button) => {
                const f = button.form.elements;
                const who = actors.filter((a) => f[`p-${a.id}`]?.checked).map((a) => ({ id: a.id, name: a.name }));
                return normalizePlan({
                    hours: Number(f.hours.value),
                    location: f.location.value,
                    environment: f.environment.value,
                    secondsPerHour: Number(f.secondsPerHour.value),
                    participants: who,
                    encounters: { enabled: f.encEnabled.checked, tableUuid: f.encTable.value, intervalMinutes: Number(f.encInterval.value), chance: Number(f.encChance.value) },
                    watches: state.watches.map((w) => ({ ...w, actors: w.actors.filter((id) => who.some((p) => p.id === id)) })),
                    sleep: { mode: f.sleepMode.value, characteristic: f.sleepChar.value, modifier: Number(f.sleepMod.value), markAsleep: f.sleepAsleep.checked, addFatigue: f.sleepFatigue.checked },
                });
            },
        },
        rejectClose: false,
        modal: false,
    });
    if (!result) return;
    if (!result.participants.length) return ui.notifications.warn('Choose who rests.');
    await command('start', { plan: result });
}
