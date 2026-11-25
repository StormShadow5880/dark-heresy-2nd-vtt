# Codex item sheets

Light "archive page" design for item sheets: parchment, dark red header with emblem, gold plaque and divider.

## Which sheets

All item sheets use the same kit, so they look alike. Only the fields differ.

| Sheet | Stat bar | Facts | Section / tabs |
| --- | --- | --- | --- |
| Weapon | Damage, Type, Pen, Range (ranged) | Class, Weapon Type, Weight, Availability, Craftsmanship, Attack Bonus, Equipped, In Backpack | Ammunition section (Single, Burst, Full, Current/Max, Reload); tabs Stats (loaded ammo, mods, specials) / Description / Active Effects |
| Armour | six tiles: Head, Arms, Body, Legs | Type, Max Agility, Weight, Availability, Craftsmanship, Equipped, In Backpack | tabs Stats (armour mods) / Description / Active Effects |
| Psychic power (violet variant) | Damage, Type, Pen, Range | XP Cost, Prerequisites, Action, Sustained, Subtype, Attack; the discipline is in the plaque | tabs Action / Description / Effects |
| Gear, consumable, drug, tool | - | Weight, Availability, Craftsmanship, In Backpack | Description |
| Cybernetic | armour points (only with "Has Armour Points") | Weight, Availability, Craftsmanship, Has Armour Points, Equipped | Description |
| Force field | Protection | Weight, Availability, Craftsmanship, Activated, Overloaded, Equipped, In Backpack | Description |
| Ammunition | - | Weapon Types, Weight, Availability, In Backpack | Effect |
| Weapon modification | - | Weight, Availability, Craftsmanship, Equipped, In Backpack | Description |
| Attack special | Level (only with "Has Level") | Has Level, Enabled | Description |
| Critical injury | - | Type, Part | Description |
| Peer / Enemy | Modifier | - | Description |
| Journal entry | - | Place, Time | Description |
| Storage location | - | - | tabs Contents / Description; centred rule headings, table (Item, Type, + button, "No items stored"), Description below |
| Talent | plaque Tier | Aptitudes, Prerequisites, XP Cost | Benefit |
| Trait | plaque Level | - | Description |
| All other items (aptitude, mutation, malignancy …) | - | - | Description |

## Building blocks

- `templates/item/partial/codex-head.hbs`: image, name, optional plaque (`plaqueLabel`, `plaqueField`, `plaqueValue`) and source.
- `codex-stat.hbs` (tile of the stat bar: `icon`, `label`, `name`, `value`, `number`, `options`), `codex-fact.hbs` (row of the two-column facts grid, same parameters), `codex-check.hbs` (checkbox row: `label`, `name`, `value`), `codex-col.hbs` (column of a section panel). A new sheet is built from these; the markup of a section is `.dh-codex__section` with `.dh-codex__cols`.
- `scss/sheets/_codex.scss`: all styles (`.dh-codex`, `__head`, `__row`, `__label`, `__field`, `__divider`, `__heading`, `__text`). Sizes use container units (`cqw`), so the page keeps its proportions at every window size; below 520 px the label sits above the value and the emblem is hidden.
- `images/codex/*.webp`: cut (transparent borders removed, faint edge pixels cleared) and compressed from the supplied asset pack, about 120 KB in total.

## Rules

- The pictures only decorate. Name, image, tier/level, source, aptitudes, prerequisites, cost and text stay real form fields with the old data paths (`name`, `img`, `system.*`).
- Long values wrap (name, aptitudes, prerequisites and the text area grow with their content). Enter in the name field does not add a line break.
- Rules and data are untouched.

## Psychic power variant

`dh-codex--psychic` sets the pictures and colours (CSS variables `--cx-*`): violet warp header, eye emblem, violet parchment (`arkanes-pergament`), violet ribbons and tabs. Files: `warp-header`, `psyker-emblem`, `plakette-psy`, `icon-rahmen-psy`, `auge-trennlinie` (cut and compressed from the psychic asset pack; `auge-trennlinie` is prepared but not used yet because the layout has no divider). A further variant (e.g. for another item group) only needs its own set of variables.
