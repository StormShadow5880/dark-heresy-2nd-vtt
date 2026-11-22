# Talent prerequisites and buying talents

## Data
The prerequisites of the core talents (core rulebook pp. 123–133) are in `src/packs/talents/talents.yml` in the field `prerequisites`, in the original English wording ("None" = empty), extracted from the rulebook by a script and **to be checked against the PDF**.
72 core talents have prerequisites; talents of other books keep an empty field (they have none in the data).

## Reading (`rules/prerequisites.mjs`)
A comma separates requirements that **all** have to be met, " or " inside a requirement offers alternatives (**one** is enough); text in parentheses is never split ("Two-Weapon Wielder (Melee, Ranged)" is one requirement).
Each requirement is checked against the character when its meaning is clear:
| Requirement | Check |
|---|---|
| `Agility 40` (any characteristic) | the total value |
| `Tech-Use`, `Trade (Armourer)`, `Dodge or Parry` | the skill / speciality is known |
| `Awareness +10`, `Rank 2 in the Medicae skill` | the skill advance (+10 = trained, rank 2 …) |
| `Psy rating` | at least 1 |
| `Lore (any one)` | any Lore speciality is known |
| `Frenzy`, `Resistance (Fear)`, `Two-Weapon Wielder (Melee, Ranged)` | an owned talent, with its choice (every choice must be owned) |
| `Mechanicus Implants` … | an owned item of that name counts as proof |
Everything else (`Weapon Training (any melee)`, `Rank 4 in selected skill`, an implant the character does not own) is **never decided**: it is shown with "?" and has to be confirmed.

## Buying (`checkPurchase`, `purchaseAdvancement`)
- A requirement that is **not met** blocks the purchase; nothing is changed. Confirming does not help. Only a GM can tick "GM override" in the spend dialog.
- A requirement that **cannot be read** has to be confirmed ("I have checked the prerequisites marked ?").
- Price, tier and aptitudes: as before (`TALENT_COSTS`). A learned talent or the same choice twice cannot be bought again; a double click buys once.
- The spend dialog marks every talent: ✓ met, ✗ not met, ? to be checked, with its price; the prerequisites are listed requirement by requirement.

## Checked
`test/prerequisites.test.mjs` (parsing, every kind of requirement, combinations) and `test/talent-purchase.test.mjs`: all talents of the compendium (price for 0 / 1 / 2 aptitudes; a perfect character is never blocked, a weak one is never let through by accident) and the purchase end to end (characteristic, other talents, alternatives, choices, implants, GM override, EP, double click).

## Open
- **Two-Weapon Wielder** is one talent in the data; the book has a Melee and a Ranged version (and Two-Weapon Master needs both). Price and prerequisites are not split yet.
- The extracted prerequisites and the cost table have to be verified against the printed book.
