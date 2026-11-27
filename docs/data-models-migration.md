# Migration from template.json to Foundry data models

**Status: prepared, NOT activated.** The system still runs on `template.json`. Nothing was changed in the data, no data model is registered. The switch needs a running Foundry (world with real actors, items, compendia and the supported version), which was not available here; switching blind could invalidate existing documents. What exists:

- This inventory and the tests that pin it (`test/template-inventory.test.mjs`).
- The pure rule modules and data of the system are independent of the storage form (they read `system.*`), so a data model that has the same paths changes nothing for them.

## Inventory (template.json)

- 4 declared actor types (acolyte, npc, vehicle, patron) and 26 declared item types, 4 shared actor templates (base, creature, npc, vehicle) and 7 shared item templates (physicalItem, armourPoints, itemDescription, attack, damage, action, backpack).
- Cleaned up (tests in `test/template-inventory.test.mjs` now require a consistent template): the unused leftovers `Actor.xenos` and `Item.bonus` were removed (they were never declared, so no document can exist); the item type `backpack` (declared, `isBackpack` exists in the code) got a definition (physicalItem + itemDescription); `weapon` and `armour` no longer list the non-existing template `container` (`container: true` stays); the key of `aptitude` is `templates` now, so aptitude items get description and source fields (empty by default, stored data untouched).
- Other data outside the template that must survive: flags (`creator`, `xpLog`, `healingTimers`, `fatigueTimer`, `actionAccount`, `reactionState`, `originUnlocked`, `sustainTurn`, patron flags), Active Effects with the `psyEffect` flag, embedded items of containers (`system.items`?), the creation draft in the user flag.

## Plan (to do with a running Foundry)

1. Take a backup of the world and the compendium packs (documents the rollback).
2. Generate the schemas from the template (types from the defaults: number, string, boolean, nested objects; arrays and free objects as `ArrayField`/`ObjectField` with `required: false`). Fields that the code reads but the template does not define have to be added deliberately.
3. Register the data models next to the template (`CONFIG.Actor.dataModels`, `CONFIG.Item.dataModels`) with `static migrateData()` for old shapes (numbers stored as strings, missing optional fields); no default value may overwrite a stored value.
4. Declare the types in `system.json` (`documentTypes`) and remove `template.json` only after a world with old and new documents opened without validation errors.
5. A versioned migration (`flags.dark-heresy-2nd.dataVersion`) that only runs where a change is needed, is idempotent (a second run changes nothing) and reports what it changed.
6. Tests in Foundry: open an old world, a fresh actor of each type, an imported pack item, a creator draft saved before the switch, a character with Active Effects and sustained powers.

## What is blocked

The switch itself (steps 3-6) needs a Foundry runtime; the type conformance of the compendium data against the inferred schema could not be run completely here (template merges with objects over strings need the Foundry merge semantics, for example the `attack` template's `target.bonus`).
