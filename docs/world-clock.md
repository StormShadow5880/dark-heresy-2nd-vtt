# Imperial clock bar

A slim dark red bar at the top centre (gold accents) shows date, time and, optionally, the mission day. Code: `src/module/rules/world-clock.mjs`
(pure, tested), `src/module/ui/world-clock.mjs` (bar, GM dialog), `src/scss/ui/_clock.scss`.

## Time base
**Foundry's world time (`game.time.worldTime`, seconds) is the only clock.** The bar is calculated from it, and the healing timers
(`flags.dark-heresy-2nd.healingTimers.<key>`, First Aid 24 h, Endurance / Invigourate 12 h) store and compare the same value. There is no second clock.
The bar redraws on the `updateWorldTime` hook, which Foundry fires on every connected client (Foundry v14, the project's verified version);
the time jumps use `game.time.advance()`, which only a GM may call, so players cannot change the time.

## Calendar configuration (GM)
The format `145.024.M41` of the design is only a placeholder: no official Imperial calendar is calculated. The GM configures (gear button of the bar):
- the year number, day of the year and time that the **current** world time stands for (it is fixed to the current world time; "anchor"),
- the millennium text (`M41`), days per year (default 365) and the template (`{year}.{day}.{mil}`, numbers padded to 3 digits),
- optionally the mission day: name, text (`Tag {n} der {name}`) and "the mission starts today"; the day counts calendar days from the mission start.
Everything is stored in the world setting `clock-config`. Client setting *Show the imperial clock bar* hides the bar for one client.
Without the date dialog the defaults 145 / 24 / M41 at 08:00 apply (world time 0).

## Controls
GM: **+10 min, +1 h, +8 h, +24 h** and the gear. Players see date and time only. On windows narrower than 900 px the mission text is hidden, below 560 px the seal and the sizes shrink.
No calendar module is needed. Existing worlds keep their data: nothing is migrated.

## Healing and time
- A time jump **never heals** and never triggers Extended Care: nothing listens to the world time except the display. Rest still happens in the GM's "24 h rest" dialog and First Aid is still rolled.
- The Combat tab of the sheet lists the existing timers with their remaining time: `First Aid (24 h) 5 h 10 min`, ready, or a warning.
- Timer states (`timerStatus`): no stored time → ready, nothing shown; **invalid** stored time → shown as "timestamp invalid, ignored", the action may go on with a notice; **set-back clock** (stored time later than the world time) → stays **locked**, labelled "world time was set back", a GM can override; stored times are never rewritten.
- When the world time is set back, the GM gets a warning that lists the characters whose timestamps lie in the future; nothing is healed or changed.

## Manual tests
1. GM and a player: the bar shows the same date/time; only the GM sees the buttons. 2. Press each jump on the GM client: all clients update.
3. Make a First Aid, jump +8 h (still locked, remaining time on the sheet), +24 h (ready). Same with Endurance and 12 h.
4. Set the world time back (e.g. Simple Calendar or `game.time.advance(-3600)` in the console): warning, locks stay, flags unchanged.
5. Jump time with injured characters: nobody is healed. 6. Narrow window / phone width: bar stays readable. 7. Disable the setting: the bar disappears.
