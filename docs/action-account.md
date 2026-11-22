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
