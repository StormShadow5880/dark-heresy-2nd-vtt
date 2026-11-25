# Fatigue

**Source note:** the consequences below come from a summary of the official Dark Heresy 2nd Edition errata (FAQ v1.1/v1.2) that was passed on by the player, not from the rulebook text itself. They are marked "to be verified against the printed rules".

- **Limit (threshold):** Toughness Bonus + Willpower Bonus, calculated from the bonuses **before** fatigue (otherwise the limit would shrink while the fatigue rises; the errata leave this open, so this is our decision).
- **Characteristics:** a characteristic whose bonus is lower than the fatigue is halved (existing rule of the system). The affected characteristics (orange frame, ▼) and the skills based on them (orange value and bar) are marked on the sheet.
- **Over the limit:** unconscious. The sheet shows a banner and the chat gets a message once when the limit is crossed. Unconscious for **10 − Toughness Bonus** minutes.
- **Unconscious time on the game clock:** when the limit is crossed a timer (`flags.dark-heresy-2nd.fatigueTimer`, world seconds) starts. The banner shows "Wakes up in …" and follows the clock. When the time is over, the active GM client wakes the character up automatically (also after a time jump or a reload). The "Wake up" button wakes up earlier after a confirmation.
- **Waking up:** fatigue drops by the Toughness Bonus; if it is still above the limit the character wakes up one level below the limit. The timer ends when the fatigue is lowered below the limit in any other way.
- **Rest (game clock):** the rest planner (time lapse with watches) reduces fatigue when it ends: 1 level per full hour of rest (hours on watch do not count), 6 hours or more remove everything; a character whose rest was interrupted gets nothing. The "24 h rest" dialog of the GM now also lists fatigued characters and removes all fatigue for a confirmed rest.
- **Fate Point:** the star button at the fatigue counter removes all fatigue for one Fate Point.
- **Death:** more than twice the limit. The errata contradict each other (the main rule says "more than", the GM screen says "reaches"), we use "more than"; the sheet shows a banner, nothing is deleted.

Not automated: the unconscious state is not set as a status on the token. Rest outside the rest planner and the 24 h dialog is not detected (the GM can lower the counter by hand).
Code: `rules/fatigue.mjs` (tested in `test/fatigue.test.mjs`).
