# Codex item sheets

Light "archive page" design for item sheets: parchment, dark red header with emblem, gold plaque and divider.

## Which sheets

| Sheet | Template | Extra |
| --- | --- | --- |
| Talent | `item-talent-sheet.hbs` | plaque **Tier**, rows Aptitudes / Prerequisites / XP Cost, section Benefit |
| Trait | `item-trait-sheet.hbs` | plaque **Level**, section Description |
| All other items without their own sheet (aptitude, mutation, malignancy, …) | `item-sheet.hbs` | no plaque, section Description |

Not changed (they have tabs, tables or many fields of their own): weapon, armour, gear, psychic power, cybernetic, force field, ammunition, peer/enemy, critical injury, attack special, weapon modification, journal entry, storage location. The header partial and the styles can be reused for them later.

## Building blocks

- `templates/item/partial/codex-head.hbs`: image, name, optional plaque (`plaqueLabel`, `plaqueField`, `plaqueValue`) and source.
- `scss/sheets/_codex.scss`: all styles (`.dh-codex`, `__head`, `__row`, `__label`, `__field`, `__divider`, `__heading`, `__text`). Sizes use container units (`cqw`), so the page keeps its proportions at every window size; below 520 px the label sits above the value and the emblem is hidden.
- `images/codex/*.webp`: cut (transparent borders removed, faint edge pixels cleared) and compressed from the supplied asset pack, about 120 KB in total.

## Rules

- The pictures only decorate. Name, image, tier/level, source, aptitudes, prerequisites, cost and text stay real form fields with the old data paths (`name`, `img`, `system.*`).
- Long values wrap (name, aptitudes, prerequisites and the text area grow with their content). Enter in the name field does not add a line break.
- Rules and data are untouched.
