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

## Design (imperial assets)
Images live in `src/images/timeline/` (WebP with alpha, transparent margins cropped). Source: the three provided images (frame, button plaque, chronometer);
the project folder `Imperiale_Zeitleiste_Assets/` was not part of the checkout, so the images attached to the request were used. Replace the WebP files with the originals if you like (same names).
- **Frame** (top bar): **not stretched.** The frame has a text field of only 42 % of its height and ornamental ends, so it is drawn at a fixed height (`--bar-h`, 56 / 50 / 44 px) from four pieces:
  left cap, right cap, centre piece and a tile that repeats along the bar. Width follows the content, the proportions are never distorted. The dark text field is a CSS surface placed over the frame's field.
- **Plaque**: used as a 9-slice `border-image` for all buttons (corner rivets and gold edge keep their size) and for the second row. Active mode = a CSS gold plate. Hover = brighter, keyboard focus = 2 px light outline, `is-alert` pulses (not with reduced motion), disabled = greyed.
- **Chronometer**: 28 px icon in front of the date (CSS background, decorative, `aria-hidden`).
- All texts and buttons are real text and real `<button>` elements (tab order, Enter/Space). The gear has an `aria-label`. Missing images only remove the artwork: the bar falls back to dark red CSS surfaces and nothing blocks.
- **Narrow windows:** below 1000 px the time jumps and the gear move to the second row (the same buttons, one set visible), below 640 px the mission text goes. The bar never covers the Foundry controls at the top left on windows narrower than about 1000 px because it is centred and shrinks with its content.
- Rows: top = icon, date, time, mission day, jumps, gear; second = status and controls (Pause, Normal (1:1), Roleplay (1:3), Rest …; during a rest: Pause/Resume, Skip, Cancel, Decide …).
