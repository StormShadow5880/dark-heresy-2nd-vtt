# Psy rating ÷ 2 and rounding

General DH2 rule used here: fractions are rounded **up** unless a specific rule says otherwise. An explicit rounding in the data takes precedence (`PR_ROUNDING_EXCEPTIONS` in `rules/psy-text.mjs`, empty; the Active Effects of powers have their own `round` setting: `up` for Iron Arm and Regeneration, see `src/data/psychic-effects.yml`; Endurance healing is `⌈PR ÷ 2⌉` in `rules/healing.mjs`).

The 14 powers of the compendium with a psy rating ÷ 2 in their text: Iron Arm, Regeneration, Misfortune, Crush, Telekine Shield, Dominate, Hallucination, Psychic Shriek, Cursed Earth, Possession (twice), Time Shift, Chronological Removal, Chrono Shield, Time Warp. None of the stored texts names an own rounding (test `test/psy-text.test.mjs` checks this), so all use the general rule. **Not checked:** the special wording of the printed powers (only what is stored in the system data was available); if a printed power rounds differently, enter it in `PR_ROUNDING_EXCEPTIONS`.

Shown values: PR 1, 2, 3, 4, 5 give 1, 1, 2, 2, 3. Multiplications (`5*@pr`, `[[@pr*2]]`) are whole numbers and are not rounded; ranges are shown unrounded.
