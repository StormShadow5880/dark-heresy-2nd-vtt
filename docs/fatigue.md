# Fatigue

**Source note:** the consequences below come from a summary of the official Dark Heresy 2nd Edition errata (FAQ v1.1/v1.2) that was passed on by the player, not from the rulebook text itself. They are marked "to be verified against the printed rules".

- **Limit (threshold):** Toughness Bonus + Willpower Bonus, calculated from the bonuses **before** fatigue (otherwise the limit would shrink while the fatigue rises; the errata leave this open, so this is our decision).
- **Characteristics:** a characteristic whose bonus is lower than the fatigue is halved (existing rule of the system). The affected characteristics (orange frame, ▼) and the skills based on them (orange value and bar) are marked on the sheet.
- **Over the limit:** unconscious. The sheet shows a banner and the chat gets a message once when the limit is crossed. Unconscious for **10 − Toughness Bonus** minutes.
- **Waking up** ("Wake up" button in the banner): fatigue drops by the Toughness Bonus; if it is still above the limit the character wakes up one level below the limit.
- **Death:** more than twice the limit. The errata contradict each other (the main rule says "more than", the GM screen says "reaches"), we use "more than"; the sheet shows a banner, nothing is deleted.

Not automated: recovering fatigue by rest (1 hour of rest: −1, 6 hours: all) and spending a Fate Point to remove all fatigue; the unconscious state is not set as a status on the token and the time is not counted down.
Code: `rules/fatigue.mjs` (tested in `test/fatigue.test.mjs`).
