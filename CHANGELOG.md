# Changelog

All notable changes of the Dark Heresy 2nd Edition system for Foundry VTT.
Rules that were **taken over from Imperium Maledictum** are marked with **[IM]** and described in
[`docs/imperium-maledictum-imports.md`](docs/imperium-maledictum-imports.md). Search the repository for `IM-0` to find them.

## [1.9.0] – Unreleased

### Psychic: sustained powers at the start of the turn

- In combat the psyker is asked at the start of his turn which sustained powers he keeps. Free actions cost nothing, the others are taken from the actions of the turn (1 Full Action); powers that are not ticked end. See `docs/sustained-powers.md`.

### Item sheets: codex design

- Talent, trait, gear, weapon, psychic power and generic item sheets use the new parchment design (dark red header, emblem, tier/level plaque, gold divider). All fields and data paths are unchanged. See `docs/codex-sheets.md`.

### Psychic powers: readable formulas

- Formulas like `2*@pr` or `[[@pr/2]]` are shown as "2 × PR" / the calculated value with the psy rating of the character (descriptions, range, chat). Dice formulas stay rollable; the compendium data is unchanged.

### Talents and Spend EP

- The prerequisites of the core talents are in the compendium and are **checked when buying** (characteristics, skills and ranks, other talents with their choice, alternatives, Psy Rating, Lore): a requirement that is not met blocks the purchase (only the GM can override), one that cannot be read has to be confirmed. "Spend EP" is now a catalogue of characteristics, skills, talents and psychic powers with price, value, aptitudes and prerequisites; the advancement overview shows the value now → after the advance. See [docs/talent-prerequisites.md](docs/talent-prerequisites.md).

### Gear

- Item rows in the Gear tab fold their description open (click on the free area of the row or the arrow); name and image open the item window. See [docs/gear-descriptions.md](docs/gear-descriptions.md).

### Actors directory

- "Create Acolyte" is now **Create Character** in its own full-width row. "Create Actor" / "Create Folder" are hidden for players. Patrons, Factions and 24 h rest moved from the directory to the scene controls (GM only).

### Patrons and relationships

- One faction list for the world (standard factions + custom ones added by the GM); characters and patrons choose their relations from it. The patron sheet follows the dossier design, boons/liabilities have a title and a description, relations a note, and every change is saved automatically.

- Patrons are actors of their own type (drag one onto the patron field of a character: the stats come from the patron, nothing is copied); existing journal patrons are converted automatically.
- Patron dossiers (GM-managed, one patron for several characters, secret liabilities and relation values kept in a GM-only store), Patron & Relationships panel in the Biography (factions with contacts, calculation and modifier), contact "Test" button and a relationship section in social roll dialogs (house rule: 1 level = ±10 on the target), GM-resolved rolls for secret values. New settings for an optional limit and GM confirmation. See [docs/patrons.md](docs/patrons.md).

### Running clock and rest

- Automatic game clock (Pause, 1:1, 1:3) that stops while the game is paused, in combat and during a rest, and a rest planner ("Rest …") with a visible time lapse, watches, optional random encounters and sleep checks (all configurable GM rules), skip/pause/cancel, GM-only encounter decisions and a summary that heals nothing by itself. See [docs/rest-and-clock.md](docs/rest-and-clock.md).

### Psychic

- The power dialog warns when the chosen Psy Rating is above the current rating (pushing) and enforces the maximum of the kind of psyker (Bound +2, Unbound +4, Daemonic +3). See [docs/psychic-push.md](docs/psychic-push.md).

### Imperial clock

- Slim date/time bar on the Foundry world time (GM time jumps +10 min / +1 h / +8 h / +24 h, GM-configured date and optional mission day), timers of First Aid and the Psychic recovery on the combat tab, a warning when the world time is set back. Nothing heals by time alone. See [docs/world-clock.md](docs/world-clock.md).

### Visual effects

- Optional Sequencer + JB2A Free animations for Las weapons (red beam), Psychic Bolt and Psychic Blast (area sized to the blast radius), impact only after a real hit. New setting *Visual Effects*. See [docs/visual-effects.md](docs/visual-effects.md).

### Healing

- First Aid, Fate: Heal 1d5, Biomancy Endurance / Invigourate and a GM dialog for 24 hours of rest, all through one healing card that the GM client applies exactly once. Critical damage first, never above the maximum, injury states Lightly/Heavily/Critically Damaged. New setting *First Aid: what starts the 24 hour limit*. See [docs/healing.md](docs/healing.md).

### Imported from Imperium Maledictum

- **[IM-001] Maximum wounds (switched off by default; enable with the world setting *Maximum Wounds Rule*).** `Max Wounds = Strength Bonus + (2 × Toughness Bonus) + Willpower Bonus`, calculated
  automatically for player characters. The maximum updates when a trait, talent, item, Active Effect or an active
  psychic power changes a characteristic; the damage a character has taken stays the same. New field
  *Wounds modifier*; world setting *Maximum Wounds Rule* (*Imperium Maledictum* / *Manual*) switches back to the
  entered maximum. NPCs and vehicles are unchanged. The bonuses are the tens digits only: **Unnatural bonus and the
  fatigue penalty do not count** towards wounds (e.g. Iron Arm's Unnatural Toughness does not raise the maximum).
  Details and decisions:
  [docs/imperium-maledictum-imports.md](docs/imperium-maledictum-imports.md#im-001--maximum-wounds).
  Files: `src/module/rules/imperium-maledictum.mjs`, `src/module/documents/acolyte.mjs`,
  `src/module/actions/wounds-sync.mjs`.

### Changed rules
- Psychic power roll: the psy rating in the prompt starts at the **free** rating (rating minus sustained powers) instead of
  the maximum. The +10 per level below it and the Psychic Phenomena check (pushing above it) use that free rating.

- **Degrees of success and failure** are shown as the difference of the tens digits of target and roll: roll 69 against
  70 is **+1** (before: +2, one degree was added for the success itself); equal tens digits are **+0**; failures the same
  way round. Files: `src/module/rules/degrees.mjs`, `src/module/rolls/action-data.mjs`, `src/module/documents/acolyte.mjs`.
  The rules that count degrees (semi-/full-auto bursts, Twin-Linked, Accurate, Razor Sharp, Lance, Eye of Vengeance and the
  opposed knock-down thresholds) keep working with the Dark Heresy 2E count (`ruleDos` = shown degrees + 1), so their
  behaviour is unchanged. If those rules should use the shown degrees as well, `ruleDos` has to be replaced there.

### Foundry VTT 13 / 14

- System ported to Foundry VTT 13 and 14 (compatibility 13–14, verified 14.369): namespaced APIs, scene controls,
  `renderChatMessageHTML`, Active Effect `name`/`img`, `prototypeToken`, string-only dice formulas.
- Compendium packs are built as LevelDB (`@foundryvtt/foundryvtt-cli`); sources converted to the `system` data schema.
- Sheets, roll prompts and dialogs migrated to ApplicationV2 / DialogV2. Fixed: roll prompts did not open
  (one root element per window part), dice formulas given as numbers.

### Character sheet
- The images of the dossier sheet are loaded and decoded once when the world starts, so switching tabs no longer waits
  for them (flicker).
- Overview: the ten characteristics and the four status tiles (Fatigue, Fate, Corruption, Insanity) form one horizontal row (two rows of seven on
  narrow windows); the detail pop-up opens towards the inside of the sheet.

- New **dossier character sheet** for player characters (default; the classic sheet stays selectable):
  slim document header with wounds track, characteristics as brass cards with detail pop-up, status emblems
  (Fatigue, Fate, Corruption, Insanity), key skills, personal file, tabs for Skills, Combat, Gear, Talents,
  Psychic, Advancement and Biography.
- Wounds track: the bar shows wounds taken, minor / serious zone (first 2 × Toughness Bonus), critical damage with
  ten pips (dead at 10). Damage beyond the maximum becomes critical damage, healing reverses it.
- Experience spending with log (costs are entered by hand, limits and available XP are validated).
- Characteristic fields (dossier pop-up and classic sheet) show the **stored** values (Initial, Modifier, Unnatural). Before, it showed values that already
  contained Active Effects (e.g. Unnatural from a sustained power), and saving the sheet made them permanent. The
  bonus tooltip shows how it is made up (tens digit + unnatural).

### Character creation wizard

- New **Create Acolyte** wizard (Actors directory): 13 steps (home world, characteristics by dice or point buy, background, role, aptitudes,
  starting skills/talents, wounds/fate/divination, elite advance (Mystic = Psyker), starting XP, equipment, biography, review). Drafts are
  saved and can be continued; GM / expert mode records overrides. Finalizing creates the actor and all items in one step (rollback on error).
- Uses the same cost function as the Advancement tab for the 1000 starting XP (settings: starting XP, veteran variant, random choices).
- Home world wounds corrected: Hive World 8+1d5, Shrine World 7+1d5.
- Documentation, known limits and open rule data: [docs/character-creator.md](docs/character-creator.md).

### Advancement (automatic XP prices)

- **Characteristic, skill and talent advances are priced automatically** from the aptitudes of the character
  (aptitude items on the actor, duplicates count once, *General* is implicit) with the rulebook tables:
  characteristics (Simple … Expert, +5 each), skills (Known … Veteran, specialities advance on their own), talents
  (tier 1-3). The rules are structured data in `src/module/rules/advancement-data.mjs`, the calculation is central in
  `src/module/rules/advancement.mjs` and recalculated from the actor every time (aptitude changes apply at once).
- **Advancement Overview** shows for every characteristic and skill: current → next level, required aptitudes (hover),
  matching aptitudes (n/2) and the price in EP; maxed entries say "Maximum" and cannot be bought. New *Aptitudes*
  panel on the Advancement tab.
- **Spend EP dialog** shows the advance, level change, required and owned aptitudes, matches, price, available and
  remaining EP. Talents are chosen from the talent compendium (tier and aptitudes from the talent); talents that can
  be learned more than once (Weapon Training, Peer, …) ask for a choice; prerequisites are displayed and must be
  confirmed. *Manual entry* stays for psychic powers and other entries (no automatic price yet).
- A purchase validates against fresh data and applies advance, spent XP and log entry in **one** update; a talent
  is created first and removed again if the update fails. A second purchase at the same moment is refused.
- **NaN fixed**: the "Psychic" and "Sum of entries" values were NaN because talent and psychic power costs were read
  from `item.cost` (does not exist) instead of `item.system.cost`; all sums now ignore missing/text values.
- Not included yet: automatic prices for psychic powers; machine-checking of talent prerequisites (they are free
  text in the data and are shown for confirmation).

- **Aptitudes are fixed after character creation**: no add / remove buttons on the sheets, and a hook refuses to add or delete aptitude items by hand
  (only items from the wizard pass). A GM may still edit the aptitudes of an old character that was not made with the wizard.
- Origin Bonuses unfold on click like talents; the skills of the Skills tab unfold on click (characteristic, aptitudes, next advance with price, and the
  rulebook description once it is entered in `src/module/rules/skill-descriptions.mjs` - the system data has none yet).
- Combat tab: one slim line (28 px) per equipped weapon with icon buttons (details in the tooltip), armour as six small tiles plus the worn armour as list entries.
- Overview rebuilt after the supplied layout: characteristics row, Status (wounds, fatigue, fate, corruption, insanity with −/+) next to Combat Reference, Key Skills next to Equipped Weapons (table), Active Effects & Conditions (including sustained powers), and a Quick Info column (influence, aptitudes, key talents, traits, bonuses; pencil buttons open the matching tab).
- Portrait in the sheet header: plain square picture without the ornamental shield, larger.
- Design language: lists, tables and buttons of the sheet use less height per line (rows 26 px, smaller pills and icon buttons, tighter panel titles) - one block at the end of `dossier.scss`. Fold-outs (talents, traits, bonuses, skills, psychic powers) now fade and slide smoothly (respects reduced motion).
- *Personal File* moved from the Overview to the Biography tab.

- Fixed the window header buttons (configure, controls, close) of the character sheet that showed empty boxes: a font rule for all buttons also hit them and replaced the Font Awesome icon font.

- **Private rulebook page import**: macro *Import Rulebook Pages* (`game.dh.importRulebookPages()`) reads a page package from your own Foundry data folder (default `dh2-rulebook`) into the journal *Rulebook (private import)*. The packages themselves are not in the repository. See [docs/rulebook-import.md](docs/rulebook-import.md).

- Rulebook import: finds packages up to five folders deep, accepts a pasted full server path, handles encoded paths from the file browser and says where it looked when nothing was found.

- Rulebook import: Foundry strips <style> from journal pages, so the scoped css is kept in a page flag and injected into the document instead (the imported page now keeps the look of the original).

- Rulebook import standardised: **package format 1.0** (one chapter per package, one `<section class="page">` per printed page), documented in [docs/rulebook-package-format.md](docs/rulebook-package-format.md) with a GPT prompt and a check script (`node scripts/validate-rulebook-package.mjs <folder>`). The macro imports every package below the chosen folder, one journal per chapter with one page per printed page (searchable per page), an *Import notes* page for unverified drafts, readable error messages. Fixes the import error with chapter packages (`entry_points` in metadata.json were not read).

- All red panel headers of the sheet have the same slim height (28 px); weapons on the Combat tab are tables (weapon, damage, pen, range, RoF, clip, reload, special) for both equipped and other weapons.

- **Attack automation** (world setting *Automatic Attack Resolution*, on by default): a weapon or psychic attack needs a **targeted token** (no attack roll without one; switch the setting off to attack without a target). On a hit the chat asks the target (its owner or the GM) to **Dodge**, **Parry** (melee only) or **take the hit**; the evasion test is rolled, the remaining hits are reduced by armour (minus penetration) and toughness bonus and applied to the target (wounds first, the rest critical damage, fatigue) and **one result card** shows the damage. Dodging follows rulebook page 220:
  - single hit: a successful test prevents it;
  - several hits (Semi/Full Auto, Swift / Lightning Attack, Barrage, ...): each degree of success prevents one hit, **Psychic Storm two**; the degrees are the *rule* degrees (a plain success is one degree and prevents one hit, see `ruleDos` in `rules/degrees.mjs`), the last hits are removed first, all hits prevented = the attack missed;
  - **Blast** (weapon quality or Psychic Blast): button *Check area* lists every token inside the radius (blast quality level / the power's `special.blast`, else asked), draws the area, targets the tokens and lets you uncheck anyone or mark a way out as blocked; each target answers on its own card, dodging only works if the way to the edge of the area is not longer than the Agility Bonus in metres and not blocked;
  - **Psychic Barrage / Storm**: the first hit strikes the chosen target, further hits the same target or others within 2 m (button *Choose x targets*: click the targets on the map with the left mouse button, one click per hit, no pre-targeting needed; a bar shows the picks with Undo / Cancel, tokens further than 2 m are refused), every target answers for its own hits.
  - **Distances are checked** with a clear message, e.g. "Cultist is 3.5 m away from Brute, but only 2 m are allowed.": the targets of a Barrage / Storm (within 2 m of the first target and within the range of the power) and the range of a psychic attack (no roll beyond the range of the power). A blast draws its impact area as a circle around the first target as soon as it hits; the circle stays until every target has answered.
  - The result card shows the **damage calculation** of every hit: damage roll with its modifiers, armour minus penetration (not below 0), toughness bonus, what is absorbed, damage taken, the split into wounds and critical damage (with True Grit) and the wounds before and after.
  - **One chat card per attack** (also for area attacks): a row per target with its buttons (Dodge / Parry / Take the hit) and, once answered, the result with a fold-out damage calculation; the header counts the answered targets and sums the wounds. Answers are sent to the active GM client (socket, `socket: true` in system.json), which rolls the test, applies the damage (also to NPCs) and updates the card, so players need no permissions on the NPCs; a GM has to be online. The evasion roll is shown in the row (no separate dice message).
  - Not automated yet: **Spray** (cone), force fields, parry limits per round.

### Psychic powers
- Power list: the hourglass is only an indicator for a running power (not clickable). A running power cannot be
  manifested again (Manifest greyed out); ending it is done under Sustained Powers.
- Deleting a power that is in effect ends it: its Active Effect (and so its bonus) is removed and it stops counting as
  sustained.
- Psychic tab redesigned (single column): header strip, compact profile card (ring, key figures, discipline chips,
  values in a fold-out), slim Sustained Powers line, flat power list with icon tiles that unfold on click, Manifest
  button inside the unfolded power, slim Psychic Phenomena / Perils of the Warp buttons; violet only as accent.

- A successful manifestation switches a power on if it can be sustained (*Sustained* not *No*): it counts as sustained
  (psy rating reduced) and is listed as active until it is ended by hand.
- Effects of powers (Active Effects on characteristics) are defined in `src/data/psychic-effects.yml`, written into the
  compendium at build time and editable on the power sheet (tab *effects*, read-only in locked compendiums).
  Iron Arm is defined; the other sustainable powers are prepared.
- Psychic tab: *Active Powers* are listed above the power list; the list shows one line per power, details
  (values, prerequisite, effect, description, actions) open on click.
- Derived values (armour, skills, encumbrance) are calculated after Active Effects.

### Chat and dialogs

- All system chat messages use one dark card design (new design system `src/scss/ui/`); roll dialogs and prompts
  share it. Client setting *Dark Chat* darkens the whole chat.
- Client-side tests: `npm test`.
