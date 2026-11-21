/**
 * Clock bar maths (pure). The ONLY time base is Foundry's world time (`game.time.worldTime`, seconds); the healing timers store the
 * same value. Nothing here keeps a clock of its own.
 *
 * The date is a GM configuration, not a canonical Imperial calendar: the GM states which year number, day number and millennium text
 * the world time `anchor` stands for, how many days a year has, and the text template. Defaults (145 / 24 / M41, template
 * "{year}.{day}.{mil}") reproduce the placeholder of the design and mean nothing else.
 */

export const DAY = 86400;

export const DEFAULT_CLOCK = {
    anchor: 0, // world time (s) at which the start values below apply
    startYear: 145,
    startDay: 24, // 1-based day of the year at the anchor
    startTime: '08:00', // time of day at the anchor
    millennium: 'M41',
    daysPerYear: 365,
    template: '{year}.{day}.{mil}',
    padYear: 3,
    padDay: 3,
    missionEnabled: false,
    missionName: 'Untersuchung',
    missionLabel: 'Tag {n} der {name}',
    missionStart: null, // world time (s) of the mission start; the day counts from that calendar day on
};

const int = (v, f) => (Number.isFinite(Number(v)) ? Math.floor(Number(v)) : f);
const mod = (a, n) => ((a % n) + n) % n;

/** "08:35" -> seconds of the day, or null */
export function parseTime(text) {
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(text ?? '').trim());
    if (!m) return null;
    const [h, min, s] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
    return h < 24 && min < 60 && s < 60 ? h * 3600 + min * 60 + s : null;
}

export const normalizeClock = (cfg = {}) => {
    const c = { ...DEFAULT_CLOCK, ...cfg };
    c.daysPerYear = Math.max(1, int(c.daysPerYear, 365));
    c.startDay = Math.min(c.daysPerYear, Math.max(1, int(c.startDay, 1)));
    c.startYear = int(c.startYear, 0);
    c.anchor = Number.isFinite(Number(c.anchor)) ? Number(c.anchor) : 0;
    if (parseTime(c.startTime) === null) c.startTime = DEFAULT_CLOCK.startTime;
    return c;
};

/** Calendar day index (0 = the start day of the anchor) and second of the day for a world time */
function position(worldTime, c) {
    const total = parseTime(c.startTime) + (Number(worldTime) - c.anchor);
    return { dayIndex: Math.floor(total / DAY), secondOfDay: mod(Math.floor(total), DAY) };
}

const pad = (n, width) => String(Math.abs(n)).padStart(width, '0');

/**
 * @returns {{date: string, time: string, year: number, day: number, missionDay: number|null, mission: string}}
 */
export function clockParts(worldTime, config) {
    const c = normalizeClock(config);
    const { dayIndex, secondOfDay } = position(worldTime, c);
    const absoluteDay = c.startDay - 1 + dayIndex;
    const year = c.startYear + Math.floor(absoluteDay / c.daysPerYear);
    const day = mod(absoluteDay, c.daysPerYear) + 1;
    const date = c.template.replaceAll('{year}', pad(year, c.padYear)).replaceAll('{day}', pad(day, c.padDay)).replaceAll('{mil}', c.millennium);
    const time = `${pad(Math.floor(secondOfDay / 3600), 2)}:${pad(Math.floor((secondOfDay % 3600) / 60), 2)}`;
    let missionDay = null;
    let mission = '';
    if (c.missionEnabled && c.missionStart !== null && Number.isFinite(Number(c.missionStart))) {
        const start = position(Number(c.missionStart), c).dayIndex;
        const n = dayIndex - start + 1;
        if (n >= 1) {
            missionDay = n;
            mission = c.missionLabel.replaceAll('{n}', n).replaceAll('{name}', c.missionName);
        }
    }
    return { date, time, year, day, missionDay, mission };
}

/** What a change of the world time means: how far, and whether it went backwards (a warning for the GM, nothing is changed) */
export function timeChange(previous, next) {
    const delta = Number(next) - Number(previous);
    return { delta, backwards: delta < 0 };
}

/** Actors whose stored timestamps lie after the given world time (set back clock) */
export function timersInFuture(timers, now) {
    return Object.entries(timers ?? {}).filter(([, t]) => Number.isFinite(Number(t)) && Number(t) > Number(now)).map(([key]) => key);
}

export const JUMPS = [
    { label: '+10 min', seconds: 600 },
    { label: '+1 h', seconds: 3600 },
    { label: '+8 h', seconds: 8 * 3600 },
    { label: '+24 h', seconds: DAY },
];
