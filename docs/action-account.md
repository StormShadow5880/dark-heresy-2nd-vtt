# Action account

Each turn a character has **1 Full Action = 2 Half Actions**. Everything that costs an action is taken from this account.

- **When it counts:** only in a running combat (started), for the combatant whose turn it is, and only if the world setting "Action account in combat" is on. The account belongs to one turn (round + turn); in the next turn it is full again. It is stored on the combatant (`flags.dark-heresy-2nd.actionAccount`), so it survives a reload.
- **Taken automatically:**
  - **Weapon attacks** (when you press the roll button of the attack dialog): the cost follows the chosen combat action (Standard Attack = Half Action, All Out Attack/Charge/Called Shot = Full Action …). Where the rulebook text allows Half or Full (Aim, Grapple, Reload), the Half Action is taken and the sheet says so.
  - **Psychic powers** (roll button of the power dialog): the cost is the "Action" field of the power (Free/Half/Full Action; "2 Full Actions" takes the whole account of this turn; "N/A" and "Special" cost nothing and are not checked).
  - **Sustained powers** at the start of the turn (see `sustained-powers.md`).
  - A **re-roll with a Fate Point** is not taken again.
- **Not enough left:** a dialog says what is missing and asks whether to do it anyway; "yes" lets the account go below zero (shown in red).
- **By hand:** the Combat tab of the dossier shows the account (pips and text). "Take an action" lists all combat actions with their cost plus "Other Half/Full Action" (moving, aiming, reloading …); the arrow gives the last action back, the circle makes the account full again.
- **Combat tracker:** the current combatant shows two pips behind the name (best effort).
- **Not part of it:** Reactions (Evasion, Parry …), skill tests, damage rolls and anything that is not rolled through the weapon or power dialog (take those by hand).

Code: `rules/action-account.mjs` (pure, tested in `test/action-account.test.mjs`), `combat/action-account.mjs` (Foundry side), account panel `templates/actor/dossier/action-account.hbs`.

## Reactions

- **Semantics (documented decision):** one Reaction per combat round, counted per **global round** of the combat: it is available again when the round counter changes, not at the start of the character's own turn. The sources available to the project say "one Reaction per round" but do not settle whether a reset at the start of the own turn is identical; nothing was changed silently: there was no reaction rule before. If the table prefers the reset at the own turn, only `readReaction(stored, key)` in `rules/reactions.mjs` has to be given a different key (round → round and turn).
- **What uses it:** a Dodge or a Parry answered on an attack card (the evasion test in `combat-resolution-manager.mjs`, which runs only on the GM client). "Take the Hit" does not use it. The key is "message id + target": a repeated answer, a second socket message or a redraw never uses a second Reaction (test `test/reactions.test.mjs`; the attack row is also closed after the first answer).
- **None left:** the GM is asked whether to allow the Dodge/Parry anyway; if he declines, nothing happens and the target can still choose Take the Hit. Allowed over the limit it is shown as "over the limit".
- **Other actions:** Defensive Stance (taken from the action account) gives one additional Reaction, All Out Attack gives up the Reaction of the round; both count for the round in which the action was taken (they do not carry over). Other talents or effects with additional or limited Reactions are **not** modelled (no rule text in the project data); the GM can use the buttons on the Combat tab.
- **Display:** the Combat tab shows the Reaction of the round (pips and text) whenever the character is in a running combat (also outside of its own turn), with buttons to use it by hand or give it back.
- **Combat edge cases:** state lives on the combatant (flag `reactionState`, keyed by the round), so a reload keeps it; a defeated combatant is ignored; navigating the combat tracker backwards gives the state of the earlier round back as fresh (the stored round does not match). Not tested in a running Foundry.
- **Not covered:** the evasion of area attacks (blast) is not counted as a Reaction yet; outside of a combat nothing is counted.
