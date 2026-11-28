# Fatigue

**Source note:** the consequences below come from a summary of the official Dark Heresy 2nd Edition errata (FAQ v1.1/v1.2) that was passed on by the player, not from the rulebook text itself. They are marked "to be verified against the printed rules".

- **Limit (threshold):** Toughness Bonus + Willpower Bonus, calculated from the bonuses **before** fatigue (otherwise the limit would shrink while the fatigue rises; the errata leave this open, so this is our decision).
- **Characteristics:** a characteristic whose bonus is lower than the fatigue is halved (existing rule of the system). The affected characteristics (orange frame, ▼) and the skills based on them (orange value and bar) are marked on the sheet.
- **Over the limit:** unconscious. The state is shown in the header next to the wounds, where "Dead" appears (orange "Unconscious"; "Dead (fatigue)" in red above twice the limit), and as a banner on the overview. The sheet shows a banner and the chat gets a message once when the limit is crossed. Unconscious for **10 − Toughness Bonus** minutes.
- **Unconscious time on the game clock:** when the limit is crossed a timer (`flags.dark-heresy-2nd.fatigueTimer`, world seconds) starts. The banner shows "Wakes up in …" and follows the clock. When the time is over, the active GM client wakes the character up automatically (also after a time jump or a reload). The "Wake up" button wakes up earlier after a confirmation.
- **Waking up:** fatigue drops by the Toughness Bonus; if it is still above the limit the character wakes up one level below the limit. The timer ends when the fatigue is lowered below the limit in any other way.
- **Rest (game clock):** the rest planner (time lapse with watches) reduces fatigue when it ends: 1 level per full hour of rest (hours on watch do not count), 6 hours or more remove everything; a character whose rest was interrupted gets nothing. The "24 h rest" dialog of the GM now also lists fatigued characters and removes all fatigue for a confirmed rest.
- **Fate Point:** the star button at the fatigue counter removes all fatigue for one Fate Point.
- **Death:** more than twice the limit. The errata contradict each other (the main rule says "more than", the GM screen says "reaches"), we use "more than"; the sheet shows a banner, nothing is deleted.

Not automated: the unconscious state is not set as a status on the token. Rest outside the rest planner and the 24 h dialog is not detected (the GM can lower the counter by hand).
Code: `rules/fatigue.mjs` (tested in `test/fatigue.test.mjs`).

## Review against the rules summary of the project notes (core rulebook p. 233, FAQ/errata)

Source status: the rules text comes from a summary of the printed rules and of the official FAQ/errata v1.2, passed on by the project owner. It was not checked against the book here.

| Rule | Status in the system |
| --- | --- |
| A characteristic is exhausted when the fatigue is higher than its Characteristic Bonus | done: compared with the bonus *before* fatigue (unnatural bonus included) |
| Structured time: exhausted characteristic counts half, rounded up | done: total is halved and rounded up for the whole sheet (tests, skills); the stored values (base, advances, modifiers) are not touched, the effect is calculated again with every refresh |
| FAQ: the bonus of an exhausted characteristic is reduced for its uses (movement, melee damage, Toughness damage reduction) | done as "the bonus is calculated from the halved total", so all bonuses of the sheet follow. The wording of the FAQ may mean something else for single uses: **not decided, open** |
| Narrative time: tasks with a test on an exhausted characteristic take twice as long | not automated (narrative decision of the GM); the sheet marks the exhausted characteristics and skills |
| Threshold = Toughness Bonus + Willpower Bonus | done, from the bonuses before fatigue (see below) |
| Over the threshold: unconscious for 10 − Toughness Bonus minutes; on waking the fatigue drops by the Toughness Bonus, at most to one below the threshold | done (timer on the world clock, automatic wake-up, banner) |
| Death: the long errata text says "more than twice the threshold", the GM screen "reaches twice" | long text used, conflict documented; the banner shows it, nothing is deleted |
| 1 hour of complete rest −1, 6 hours all; a Fate Point removes all | done for the rest planner (hours on watch do not count) and the 24 h dialog; a plain time jump is not a rest; Fate Point button on the counter |
| Talent / effect / GM exceptions | none known in the data; the GM can change the counter by hand at any time |

**Threshold and exhausted Toughness/Willpower (open question):** if the reduced bonuses were used for the threshold, a rising fatigue would lower its own limit (Toughness and Willpower are exhausted first). That is a self-reinforcing loop, so it is **not** introduced. Options: (1) threshold from the bonuses before fatigue (implemented, tested: `test/fatigue.test.mjs`); (2) threshold from the reduced bonuses once, without feedback (calculate the limit with the fatigue value at the time of the last change); (3) GM decision per case. Switch the implementation only after the rule is confirmed.

## Blood Loss (page 243 of the project notes)

Existing behaviour (checked in the code, not changed): a character with the effect "Bleeding" gets a chat card at the start of its turn (processed on the first GM client, setting "Active Effect Processing"); the card has an "Apply Fatigue" button for the +1 fatigue and the note that a Difficult (−10) Medicae test as a Free Action (once per round) ends it. **Not automated:** the Medicae test and ending the effect (the GM or player removes the effect by hand), the Willpower test of the talent The Hard, the Medicae mechadendrite (Half Action), the limit of one attempt per round; nothing is calculated outside combat (no time scale is invented for bleeding outside combat). The "Staunch Bleeding" power exists as a compendium power.

## Origins that change fatigue (Outcast, Kalto)

Source status: the bonus texts stored in the system ("Never Quit", "Deny Thyself"); the wording was checked against secondary summaries only, not against the book.

- **Outcast ("Never Quit": counts the Toughness Bonus as two higher for purposes of determining Fatigue):** the fatigue **threshold** is Toughness Bonus + 2 + Willpower Bonus. The Toughness Bonus for damage reduction and all other uses is **not** raised; the unconscious time (10 − Toughness Bonus) and the waking up (fatigue − Toughness Bonus) use the real Toughness Bonus. **Open rule question:** the wording "for determining Fatigue" may also affect other fatigue calculations (for example which characteristics are exhausted); that is not decided and not applied.
- **Kalto ("Deny Thyself": ignores the effects of the first level of fatigue):** the first level is stored and shown but has no effect. **Project decision (interpretation, not a checked rule):** all effects are calculated with `max(0, stored fatigue − 1)`: stored 0, 1, 2, 3 → effect as 0, 0, 1, 2. The stored fatigue is never changed; the sheet shows "stored → effective" (counter, banner, tooltip). Exhausted characteristics, the threshold crossing, unconscious, death and waking up use the effective value; rest recovery and the Fate Point work on the stored value. The "+2 Toughness Bonus for starvation" of Kalto is **not** applied to the threshold or to damage (there is no starvation rule in the system).
- Both origins together are possible (tested): stored 9 with Kalto = effect 8, limit 9 with Outcast.
- Code: `fatigueOrigin`, `effectiveFatigue` in `rules/fatigue.mjs`; tests in `test/fatigue.test.mjs`.
