# Rules imported from Imperium Maledictum (IM)

This system implements **Dark Heresy 2nd Edition (DH2)**. A few rules were taken over on purpose from the game
**Imperium Maledictum (IM)**. This page is the register of those imports, so it stays traceable later which part of
the system comes from IM and which from DH2.

**Conventions**

- Every IM rule gets an ID (`IM-001`, `IM-002`, …) and is listed here and in [`CHANGELOG.md`](../CHANGELOG.md).
- The code of an IM rule lives in [`src/module/rules/imperium-maledictum.mjs`](../src/module/rules/imperium-maledictum.mjs)
  (the calculation) and is marked with the ID in comments wherever it is used.
- If possible an IM rule can be switched off with a setting, so worlds can return to the DH2 behaviour.
- To find every place that uses IM rules: search the repository for `IM-0`.

## Register

| ID | Rule | Source | System version | Setting | Replaces (DH2) |
|---|---|---|---|---|---|
| IM-001 | Maximum wounds | Imperium Maledictum | 1.9.0 | `wounds-formula` (world), default *Imperium Maledictum* | Maximum wounds entered by hand / rolled from the home world |

---

## IM-001 – Maximum wounds

**Formula (IM):**

```
Max Wounds = Strength Bonus + (2 × Toughness Bonus) + Willpower Bonus
```

**Where it is implemented**

| What | File |
|---|---|
| Formula, breakdown text, keeping damage constant | `src/module/rules/imperium-maledictum.mjs` (`maxWounds`, `maxWoundsBreakdown`, `reconcileWounds`) |
| Applied to the actor (derived value) | `src/module/documents/acolyte.mjs` → `_computeWounds()` |
| Synchronising the stored values when something changes | `src/module/actions/wounds-sync.mjs` |
| Setting | `src/module/dark-heresy-settings.mjs` (`wounds-formula`), read via `src/module/rules/wounds-setting.mjs` |
| Display | `src/templates/actor/dossier/header.hbs` (maximum with tooltip, modifier field) |
| Tests | `test/imperium-maledictum.test.mjs` |

**Behaviour and decisions** (these are our decisions, not text of IM or DH2)

1. **Bonus:** the characteristic bonus of the sheet is used (tens digit of the characteristic plus the *unnatural*
   bonus). The **fatigue penalty is not applied**: the maximum must not move up and down with fatigue.
2. **Only player characters (`acolyte`).** NPCs and vehicles keep the values entered on the sheet.
3. **Automatic updates.** The maximum is a derived value, calculated after Active Effects are applied. When a power
   becomes active (for example Iron Arm raising Toughness and Strength), when a trait, talent or other item changes, or
   when an Active Effect is created, changed or removed, the maximum follows.
4. **Damage stays constant.** Wounds are stored as *remaining* wounds. When the maximum changes, the remaining wounds
   change by the same amount, so a character who has taken 4 damage still has taken 4 damage. If the maximum drops
   below the damage, the remaining wounds stop at 0, they never become negative.
5. **Modifier.** `system.wounds.modifier` (field next to the maximum in the header) is added to the result. It can also
   be changed by Active Effects (`system.wounds.modifier`, mode *Add*).
6. **Existing characters.** At world start the stored maximum is brought in line with the calculation once; the
   remaining wounds move with it (see 4).
7. **Home world.** The "roll wounds and fate" question after changing the home world rolls only fate while this rule is
   active, because the maximum is calculated.
8. **Switching back.** World setting *Maximum Wounds Rule* → *Manual (as entered)* uses the stored maximum again.
   The stored value always holds the last calculated maximum, so nothing is lost.

**Example**

Strength Bonus 4, Toughness Bonus 3, Willpower Bonus 4 → `4 + 2×3 + 4 = 14`.
A power that gives +3 Unnatural Toughness and +3 Unnatural Strength → `7 + 2×6 + 4 = 23` (+9). A character with 4 damage
goes from 10 to 19 remaining wounds and still has 4 damage.

## How to add the next IM rule

1. Put the calculation into `src/module/rules/imperium-maledictum.mjs` with the next ID, add it to `IM_IMPORTS`.
2. Add a row and a section to this page (formula, files, decisions).
3. Add an entry in `CHANGELOG.md` under *Imported from Imperium Maledictum*.
4. Offer a world setting to switch it off if the rule replaces DH2 behaviour.
5. Mark the places that use it with a comment containing the ID.
