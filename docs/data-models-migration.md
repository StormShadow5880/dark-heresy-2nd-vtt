# Migration from template.json to Foundry data models

**Status: prepared, NOT activated.** The system still runs on `template.json`. Nothing was changed in the data, no data model is registered. The switch needs a running Foundry (world with real actors, items, compendia and the supported version), which was not available here; switching blind could invalidate existing documents. What exists:

- This inventory and the tests that pin it (`test/template-inventory.test.mjs`).
- The pure rule modules and data of the system are independent of the storage form (they read `system.*`), so a data model that has the same paths changes nothing for them.

## Inventory (template.json)

- 4 declared actor types (acolyte, npc, vehicle, patron) and 26 declared item types, 4 shared actor templates (base, creature, npc, vehicle) and 7 shared item templates (physicalItem, armourPoints, itemDescription, attack, damage, action, backpack).
- Known inconsistencies, pinned by tests (a data model must decide each of them explicitly, not silently inherit them):
  1. `Actor.xenos` and `Item.bonus` are defined but not declared in `types` (unused leftovers).
  2. The item type `backpack` is declared but has no definition (the `backpack` *template* is used by physical items).
  3. `weapon` and `armour` list a template `container` that does not exist; `container: true` is a field of the type itself.
  4. `aptitude` uses the key `template` (singular), which Foundry ignores: aptitude items have no `itemDescription` fields (description, source). Check what the sheets and the creator expect.
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
