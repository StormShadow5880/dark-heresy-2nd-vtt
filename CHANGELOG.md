# Changelog

All notable changes of the Dark Heresy 2nd Edition system for Foundry VTT.
Rules that were **taken over from Imperium Maledictum** are marked with **[IM]** and described in
[`docs/imperium-maledictum-imports.md`](docs/imperium-maledictum-imports.md). Search the repository for `IM-0` to find them.

## [1.9.0] – Unreleased

### Imported from Imperium Maledictum

- **[IM-001] Maximum wounds.** `Max Wounds = Strength Bonus + (2 × Toughness Bonus) + Willpower Bonus`, calculated
  automatically for player characters. The maximum updates when a trait, talent, item, Active Effect or an active
  psychic power changes a characteristic; the damage a character has taken stays the same. New field
  *Wounds modifier*; world setting *Maximum Wounds Rule* (*Imperium Maledictum* / *Manual*) switches back to the
  entered maximum. NPCs and vehicles are unchanged. Details and decisions:
  [docs/imperium-maledictum-imports.md](docs/imperium-maledictum-imports.md#im-001--maximum-wounds).
  Files: `src/module/rules/imperium-maledictum.mjs`, `src/module/documents/acolyte.mjs`,
  `src/module/actions/wounds-sync.mjs`.

### Foundry VTT 13 / 14

- System ported to Foundry VTT 13 and 14 (compatibility 13–14, verified 14.369): namespaced APIs, scene controls,
  `renderChatMessageHTML`, Active Effect `name`/`img`, `prototypeToken`, string-only dice formulas.
- Compendium packs are built as LevelDB (`@foundryvtt/foundryvtt-cli`); sources converted to the `system` data schema.
- Sheets, roll prompts and dialogs migrated to ApplicationV2 / DialogV2. Fixed: roll prompts did not open
  (one root element per window part), dice formulas given as numbers.

### Character sheet

- New **dossier character sheet** for player characters (default; the classic sheet stays selectable):
  slim document header with wounds track, characteristics as brass cards with detail pop-up, status emblems
  (Fatigue, Fate, Corruption, Insanity), key skills, personal file, tabs for Skills, Combat, Gear, Talents,
  Psychic, Advancement and Biography.
- Wounds track: the bar shows wounds taken, minor / serious zone (first 2 × Toughness Bonus), critical damage with
  ten pips (dead at 10). Damage beyond the maximum becomes critical damage, healing reverses it.
- Experience spending with log (costs are entered by hand, limits and available XP are validated).

### Psychic powers

- A successful manifestation switches a power on if it can be sustained (*Sustained* not *No*): it counts as sustained
  (psy rating reduced) and is listed as active until it is ended by hand.
- Effects of powers (Active Effects on characteristics) are defined in `src/data/psychic-effects.yml`, written into the
  compendium at build time and editable on the power sheet (tab *effects*, read-only in locked compendiums).
  Iron Arm is defined; the other sustainable powers are prepared.
- Derived values (armour, skills, encumbrance) are calculated after Active Effects.

### Chat and dialogs

- All system chat messages use one dark card design (new design system `src/scss/ui/`); roll dialogs and prompts
  share it. Client setting *Dark Chat* darkens the whole chat.
- Client-side tests: `npm test`.
