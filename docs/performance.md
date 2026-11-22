# Performance notes

Audit of the code that runs often (timers, hooks, sheet drawing). Nothing here changes rules or data.

## What was changed
- **Time runner (GM clients, every 250 ms):** "no rest" was not cached, so every tick and every redraw of the clock bar read the rest store journal and parsed its JSON again. The state is now loaded once and kept current by `saveState()` and the journal hooks. The public part of the rest is only rebuilt when status, plan or roster change. Players no longer start the timer at all. The rest schedule is calculated once per plan instead of several times per tick.
- **Clock bar:** a change of the world time used to rebuild the HTML of both rows (several times per second during a rest). Now only the texts are repainted while the structure (buttons, mode, rest status, watch) is the same; the bar is rebuilt only when that structure changes. The repaint timer (200 ms) does nothing in a hidden browser tab. The sheets' timer rows are refreshed at most every 5 s (at once after a jump of a minute or more) and only if their text changed.
- **Character sheet:** the descriptions of the psychic powers are prepared in parallel instead of one after the other.
- **CSS:** the pulsing "Decide" button no longer animates a filter forever (a few pulses with a glow), the second bar of the clock uses a plain shadow, both clock bars are contained layers.

## Measured (Node, pure logic only)
| | time |
|---|---|
| a rest of 24 h skipped: 287 encounter checks, 48 watch changes with sleep checks | 4 ms |
| one tick of the running rest | about 9 µs |
| 200,000 calendar calculations (`clockParts`) | 355 ms (1.8 µs each) |
| 200,000 timer rows | 108 ms |
The rules are not a cost. What can cost time in Foundry is drawing and database writes, which is what the changes above reduce.

## Not measured, still worth watching
- The real frame rate in Foundry (browser profile): I could not run Foundry here. If something stutters, a Performance recording of a few seconds (F12 → Performance) with the clock running shows what.
- A character with very many items: the derived data (armour, encumbrance, experience) loops over the items on every update; this is linear and cheap, but a world with hundreds of items per character would show it first.
- Writes: a rest saves its state about every 5 s and at every event (claim and result); "skip" with many events writes in a quick series.
