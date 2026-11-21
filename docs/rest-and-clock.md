# Running clock and rest

Extends the imperial clock bar ([world-clock.md](world-clock.md)). The only time base stays Foundry's **world time** (`game.time.worldTime`); the
First Aid / Psychic timers store and read the same value. Nothing is migrated and no stored timestamp is changed.
Code: rules `src/module/rules/rest.mjs` (pure, tested in `test/rest.test.mjs`), runtime `src/module/actions/time-runner.mjs`,
dialog `src/module/ui/rest-dialog.mjs`, bar `src/module/ui/world-clock.mjs`.

## Automatic clock (second row under the bar)
GM buttons **Pause**, **Normal (1:1)** (1 real minute = 1 game minute) and **Roleplay (1:3)** (1 real minute = 3 game minutes). The row shows the mode and a
green dot while the clock really runs; players see the status (not the buttons). The manual jumps (+10 min … +24 h) work independently of the mode.
- Only the **active GM client** advances the time (`game.users.activeGM`); other clients never do. A GM change takes over without a double advance.
- The clock stops while the Foundry game is **paused**, during a **started combat** (both modes; the row says "halted (Combat)") and during a **rest**. It resumes by itself afterwards, the mode is kept.
- Combat time: this system adds none. Foundry itself adds `CONFIG.time.roundTime` per round only if it is set above 0 (default 0).
  Other time controllers (Simple Calendar, About Time, SmallTime, Calendaria, Seasons & Stars) or a `roundTime` > 0 are detected: when the clock or a rest is started the GM gets
  a warning that time may be counted twice and can decide to go on.
- A background tab never jumps: at most one real minute is accounted per step. Time is added in steps of about 5 game seconds.

## Planning a rest ("Rest …")
Duration (4/8/12 h or free), place, environment, time lapse (default one game hour per 5 real seconds), who rests, encounters (roll table, interval in minutes, chance in %),
watches (rows from–to hours with the watching characters; generated rotating or empty), sleep checks.
**Encounters, watches and sleep checks are configurable game master rules, not official Dark Heresy 2 rules.** The chance per environment (5/15/30/50 %) is only a starting suggestion.
- Watch plan check: gaps, overlaps and entries outside the rest are listed; an unguarded period is allowed.
- Sleep check: never / only when fatigued / for every watch (checked when a watch begins, for its watchers). Test = a characteristic (default Willpower) with a modifier; on failure
  optionally *the watcher falls asleep* (the watch counts as unguarded) and/or *+1 fatigue*. Nothing else is assumed.

## The rest
1. The automatic clock pauses; the world time advances in the chosen time lapse (it is set to `start + elapsed`, never "added to").
2. The bar shows state, elapsed / planned time and the current watch. GM buttons: **Pause / Resume, Skip, Cancel**.
3. At a watch change the sleep checks are made, at each check point (every *interval* minutes, not at the very end) the encounter check: 1d100 ≤ chance draws the table.
4. **Skip** is a speed: all events are still processed in order, nothing is skipped; it stops at an encounter.
5. An encounter stops the time at its moment. The GM (only) gets a whispered summary (elapsed/left, current watch, table result) and a dialog:
   **Play out the encounter** (the rest counts as *interrupted*), **Continue the rest**, **Cancel the rest**. After a played-out scene "Decide …" offers to continue (optionally with another total length) or cancel.
6. **Cancel** keeps the world time at the time actually reached.
7. At the end: a public one-line message (no secrets) and a whispered GM summary per character (rested / watch time, interrupted, asleep on watch). **Nothing is healed.**
   A button opens the existing "24 h rest" dialog so the GM confirms which rest, treatment or recovery effects apply. An interrupted rest is never reported as full rest.

## Reliability
- The full state (with the secret results) is kept in a Journal entry "Dark Heresy: rest log (GM only)" with default ownership NONE; the public part (state, length, watch roster) in the world setting `rest-public`.
  World settings reach every client, so no secret is stored there. Assumption: Foundry does not send a NONE-ownership journal to players (not verified here).
  Players never see encounter text, sleep results or the "encounter / interrupted" state (the bar says "Rest paused").
- Every event is marked *claimed* before it is rolled and *processed* with its result afterwards. After a reload the rest comes back **paused**; events already due are processed at once;
  a claimed event without result ("check interrupted") is handed to the GM: **roll again** or **skip**. No silent double roll, no double time (time = start + elapsed).
- Commands from a GM client that is not the active one go to the active GM by socket.

## Smooth display
The runner writes the world time 4 times per second (6 game minutes per write at the default lapse). The bar therefore advances the *shown* time itself between two writes
(minute by minute, at the speed of the lapse, at most 1.5 s ahead, never backwards while the rest runs) and corrects it with every real update. Only the display is predicted; the world time and all timers use the written value.
At a stop (encounter, pause) the display may snap back by up to one tick of the lapse.

## Limits
- Verified only with the Node tests (rules, state machine, reload/recovery logic, clock factors); the Foundry UI, the sockets, the journal permission assumption and
  multi-client behaviour have not been run in Foundry.
- One rest at a time. Sleep check tests are characteristics only (no skills). The encounter table result is used as text; nothing is created on the map.

## Manual tests
1. Pause / 1:1 / 1:3: watch the world time (+1 min per real minute / +3). 2. Pause the Foundry game and start a combat: the clock halts, it resumes after.
3. Manual jumps work in every mode. 4. Eventless rest to the end (summary, no healing). 5. Encounter in the middle (use chance 100): dialog, play out, continue, cancel; players see only "Rest paused".
6. Watches with gap/overlap, unguarded period, sleep checks (every watch / fatigued). 7. Skip with checks and encounters due. 8. Look at a First Aid timer on the sheet while the lapse runs.
9. Reload the GM during a rest: it comes back paused, resume. 10. Two GM clients / a player client at the same time.
