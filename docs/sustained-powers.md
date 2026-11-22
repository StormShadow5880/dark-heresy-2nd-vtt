# Sustained powers at the start of the turn

In combat the psyker is asked at the start of his turn which sustained powers he keeps.

- **When:** when the turn of a combatant changes (also at the start of the combat), for characters that have at least one active power with "Sustained" Free, Half or Full Action. Defeated combatants are skipped. Switch off with the world setting "Ask about sustained powers at the start of the turn".
- **Who sees it:** an active player who owns the character, otherwise the active GM (every client calculates the same user, so the dialog opens once).
- **List:** every sustained power with its cost. Free actions are ticked and cost nothing. The psyker ticks what he keeps; the cost is taken from the actions of the turn (1 Full Action = 2 Half Actions). A power that no longer fits cannot be ticked.
- **Result:** ticked powers stay, the others end (their effect is removed and the sustained count goes down). A chat message shows what is kept, what ended and what is left of the account. The answer is stored on the combatant (`flags.dark-heresy-2nd.sustainTurn`) so the dialog does not open twice in the same turn (also after a reload).
- **Decide later** changes nothing and does not mark the turn as answered.
- **Special:** powers whose cost is "Special" cannot be calculated; they cost nothing here and are marked "check the power".

The system has no other action tracking; the remaining actions are shown in the dialog and the chat message only.
Code: `rules/sustain-turn.mjs` (pure), `ui/sustain-dialog.mjs`, hook in `actions/combat-action-manager.mjs`.
