# Pushing psychic powers

In the dialog of a psychic power ("Psychic Rating" field) a value **above the rating that is currently available** means the psyker pushes.
The dialog then shows a warning box ("Pushing (+N)") with the numbers; the Perils / Psychic Phenomena check of the roll already treated this case.

| Kind of psyker | Maximum (base Psy Rating +) |
|---|---|
| Bound (e.g. sanctioned) | +2 |
| Unbound (e.g. unsanctioned) | +4 |
| Daemonic (daemon or daemon host) | +3 |

- Code: `src/module/rules/psychic-push.mjs` (tested in `test/psychic-push.test.mjs`), dialog `prompts/psychic-power-prompt.mjs`.
- The kind is read from the sheet field **Class** (`system.psy.class`, free text): `bound`/`sanctioned`, `unbound`/`unsanctioned`, `daemon…`. New characters from the wizard are `bound`.
- Reading: the maximum is **base** Psy Rating (`system.psy.rating`) + the bonus; sustained powers lower the free rating (pushing starts earlier) but not the maximum. Tell us if the book reads differently.
- A value above the maximum shows the warning in red and the roll is refused until the rating is lowered.
- Unknown text in the Class field: no limit is enforced, the dialog says so (no limit is invented).
