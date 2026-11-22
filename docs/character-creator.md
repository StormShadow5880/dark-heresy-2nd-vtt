# Character Creation Wizard (Dark Heresy 2E, core rulebook)

Opens from the **Create Character** button in the Actors directory (a full-width row under the buttons) (or `game.dh.openCreator()`). It builds a draft,
and finalizing creates one `acolyte` actor with all embedded items in a single `Actor.create` call.

## Architecture

| Layer | File | Notes |
|---|---|---|
| Rule data | `src/module/creator/data.mjs` | 6 home worlds, 7 backgrounds, 8 roles with stable ids (`homeworld.feral-world`, `background.imperial-guard`, `role.mystic`), source id `dh2-core`. Texts come from `rules/homeworlds.mjs`, `backgrounds.mjs`, `roles.mjs`, `divinations.mjs` (one text only). |
| Dice rules | `src/module/creator/rules.mjs` | 2d10 / best-two / worst-two of 3d10, point buy (25/30/20, 60 points, max 40), wounds, fate (Emperor's Blessing), divination table 1-100 and its effects. Dice are passed in, so the rules are testable. |
| Computation | `src/module/creator/character.mjs` | `computeCharacter(draft, env)`: pure, deterministic. Aptitudes (General + home world + background + role + elite, duplicates -> replacement choice), skills (a skill granted twice gets +1 rank), talents, traits, bonuses, equipment, psyker rules, divination effects. `replayAdvances()` replays XP purchases on a simulated actor with the **same** `purchaseAdvancement` / cost functions as the Advancement tab (`rules/advancement.mjs`). `stepStatus()` tells which steps are complete. |
| Draft | `src/module/creator/draft.mjs` | Changes of early decisions (home world, background, role) remove dependent choices (`pruneChoices`), keep still-valid dice, drop purchases that are no longer possible (`revalidateAdvances`). The draft only stores decisions; nothing derived, so nothing is added twice. |
| Commit | `src/module/creator/finalize.mjs` | `buildCharacterData()` (validates, resolves compendium items, prepares the whole actor) and `finalizeCharacter()` (one create call, verifies the item count, deletes an inconsistent actor). |
| UI | `src/module/creator/wizard.mjs`, `src/templates/creator/creator.hbs`, `src/scss/creator.scss` | ApplicationV2, 13 steps, navigation left, step in the middle, live summary right. The draft is autosaved in a user flag (continue later / start over / cancel). |

Settings (world): *Creation: Starting XP* (1000), *Creation: Veteran Variant* (off), *Creation: Random Choices* (on).

## Rules implemented

* Characteristics: normal `20 + 2d10`, positive `20 + best two of 3d10`, negative `20 + worst two of 3d10`; **one** re-roll for the whole
  generation, the second result counts; every roll is documented (draft log + self-roll in the chat). Optional veteran base 25.
  Point buy: 60 points, start 25 / 30 / 20, max 40, all ten characteristics, the budget must be spent exactly.
* Home world: fate threshold, Emperor's Blessing (1d10 >= threshold -> +1), wounds `base + 1d5`, aptitude, bonus.
  *Wounds*: Feral 9, Forge 8, Highborn 9, **Hive 8, Shrine 7**, Voidborn 7 (`rules/homeworlds.mjs` had Hive 7 / Shrine 8 and was corrected to the specification).
* Aptitudes: unique set, source recorded (`flags.dark-heresy-2nd.creator.aptitudes`); a duplicate must be replaced by the aptitude of a characteristic the
  character does not have; nothing is dropped silently.
* Start skills at rank Known, free of XP; a skill granted twice gets one more rank (core FAQ); specialities are separate.
* Start talents/traits cost no XP (item `system.cost = 0`); talents granted twice count once (warning shown).
* Role: 5 aptitudes (Assassin chooses Ballistic Skill or Weapon Skill), one of two talents (Resistance/Hatred ask for their choice).
* Mystic: Psyker elite advance **free**: Psyker trait + aptitude, psy rating 1; sanctioned with the Adeptus Astra Telepathica background
  (Sanctioned trait), otherwise rogue: 1d10+3 corruption (rolled in the wizard). Warning if Willpower < 40.
* Divination: 1d100 table; effects on characteristics (also "X or Y" choices), talent-or-bonus, Dodge skill and fate threshold are applied; session based rule
  text stays visible as the divination entry and is marked "not automated" in the wizard.
* XP: 1000 (configurable), purchases are simulated in the draft and become the Advancement History (starting XP entry + one entry per purchase).
* Equipment: background choice groups ("Lasgun" or "Laspistol and Sword"), quantities, items from the compendia.

## Home world / background / role bonuses

A = existing mechanic, B = new mechanic needed, C = rule entry only. All bonuses are stored through `bio.homeWorld / background / role` and shown on the sheet
(`backgroundEffects`). Voidborn (Strong Minded) and Forge World (Technical Knock or Weapon-Tech) are granted as talents (A). All others (The Old Ways,
Breeding Counts, Teeming Masses, Faith in the Creed, every background and role bonus) are **C**: visible, not automated yet.

## Known limits / missing rule data (nothing was invented)

* The AnyFlip rulebook and the FAQ could not be read here. The data are the system's own rule files plus the tables of the specification. **The
  full divination text, the starting equipment variants and talent prerequisites still have to be checked against the book before release.**
* `recommendedBackgrounds` / `recommendedRoles` are empty (no data).
* Veteran variant: only the roll base (25) is defined; point buy is switched off with it (limits not given).
* Item model has no quantity field: quantities are written into the item name, e.g. `Lho-Sticks (×12)`.
* Compendium gaps (Autoquill, Chrono, Combat Vest, Backpack, Armoured Body Glove spelling ...): a placeholder *gear* item is created and the item is listed
  as missing; `NAME_SYNONYMS` in `finalize.mjs` maps known spelling differences.
* Missing Common Lore specialities (e.g. Adeptus Ministorum) are added to the actor's skill data.
* The Sanctioned trait for the AAT background is derived from the Psyker elite advance text.
* Divination parts that need the Malignancies table, Phobia disorder, etc. are not automated.
* Maximum wounds: with the world setting "Imperium Maledictum (calculated)" the sheet shows the calculated maximum; the rolled wounds are stored in the actor.
* Psychic powers and disciplines are bought on the finished character (no automatic price yet).
* Talent prerequisites are free text in the data: shown and confirmed by the player, not machine-checked.
* Not tested in a live Foundry (persistence after restart, pack lookups, chat roll messages, window layout).

## Tests

`test/creator.test.mjs`, `creator-finalize.test.mjs`, `creator-concepts.test.mjs`: dice, point buy, all home worlds, divination table coverage, 7 backgrounds, 8 roles,
5 character concepts, all 336 combinations, duplicate aptitude, doubled skill, Mystic/Psyker (sanctioned and rogue), XP accounting, draft save/reload, changing earlier decisions,
rollback.
