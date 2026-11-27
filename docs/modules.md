# Core and optional modules

The **core** is always on: character and item sheets, rolls, advancement and Spend EP, the character creation wizard, wounds, fatigue (including the unconscious time on the world clock), healing actions and the 24 h rest dialog.

The **optional parts** can be switched off in the system settings (each shows "Module: ..."). A part that is off does not start, does not listen and shows nothing. Stored data is never changed by switching a part on or off.

| Setting | What it covers when off |
| --- | --- |
| Module: Time (`module-time`) | no world clock bar, no automatic clock, no rest planner (no time loop on the GM client, no time socket). The world time itself and the timers of First Aid, Endurance, Invigourate and fatigue keep working. Needs a reload. |
| Module: Patrons, contacts and relationships (`module-relations`) | no "Patron & Relationships" panel on the biography tab, no relationship section in social tests, no Patrons / Factions tools, no relation socket and no patron migration. Existing patron actors and contacts stay stored. Needs a reload. |
| Module: Action account and reactions in combat (`action-account`) | no action account, no Reaction tracking, no panel on the Combat tab, no pips in the tracker |
| Module: sustained powers at the start of the turn (`sustain-prompt`) | no question about sustained powers at the start of a turn |
| Module: Visual effects (`vfx`) | no animations and sounds |

Code: `src/module/modules.mjs` (`moduleOn(name)`); the places that check it are the start in `hooks-manager.mjs`, the sheet context and the templates of the biography and combat tab.

## State overview

All hidden state of the system (timers, combat counters, locks, the sustained marker) is named once in `src/module/rules/state-flags.mjs` with what it is for and whether it can be reset safely. The GM sees it per character with the "Module state" button (database icon) in the header of the dossier and can reset single entries; the experience log, the creation record and the relationships cannot be reset there. A test requires every flag that the code writes to be registered, so new state cannot appear unnoticed. The data stays where it is (no migration); only the overview and the rule "every flag is registered" are new.
