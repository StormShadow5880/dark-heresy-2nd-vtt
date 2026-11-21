# Healing

Central code: `src/module/rules/healing.mjs` (pure rules, tested in `test/healing.test.mjs`) and
`src/module/actions/healing-manager.mjs` (chat card, GM socket, First Aid, Fate, Endurance, Invigourate, rest dialog).

## How it works
Every healing is **one healing card** in the chat. It is applied by the **GM client** (socket, like the attack card), exactly once:
the card state goes `pending → working → done/rejected`, a second request finds it taken (no double application). Players never
change another character directly. Critical damage is healed **before** normal damage where the source allows it; wounds never rise
above the maximum; points that cannot be used are shown as "could not be used".

Data model: `wounds.value` = remaining wounds, `wounds.max`, `wounds.critical` = critical damage (kept apart from normal damage).

## Injury states (reading)
- **Lightly Damaged**: damage up to 2 × Toughness Bonus (the same zone the sheet's wound bar already uses)
- **Heavily Damaged**: more damage than that, no critical damage
- **Critically Damaged**: critical damage > 0
This is the project's reading; compare it with page 244 and tell us if it differs.

## First Aid (Combat tab, "First Aid (Target)" / "Treat myself")
- Needs Medicae trained and a patient (Target, or yourself). No patient → message, **no roll**.
- **Range:** only in an active combat (`game.combat.started`) the patient must be within **1.5 m** of the healer (centre to centre); outside of combat there is no limit, and treating yourself is always possible. Too far or no token in combat → message, no roll.
- Challenging (+0); −10 for Heavily Damaged; −10 per critical point for Critically Damaged; free extra modifier in the dialog.
- Healing = Intelligence Bonus + degrees of success. **Degrees = rule count (`ruleDos`)**: the success itself is the first degree, every
  further tens digit one more; the card shows the shown value (+0 for a plain success) and the rule count. The first success is not counted twice.
- 24 h limit per patient (actor flag `healingTimers.firstAid`, world time). World setting *First Aid: what starts the 24 hour limit*:
  **default only a success**, alternative every attempt. A running limit can be overridden by the GM (dialog); if the world time is 0
  (clock not used) the GM is asked as well.
- Hardy is **not** automated (HARDY_NOTE on the card).

## Fate: Heal 1d5
The GM client spends exactly one Fate Point, rolls 1d5 and heals **normal damage only**. No fate point → nothing happens.

## Biomancy
- **Endurance** (after a successful manifestation, effective Psy Rating = the PR of that manifestation): the psyker plus up to PR allies within
  3 m × PR (picked on the map), each heals ⌈PR/2⌉ (critical first), Pinning is shown as overcome (no Pinned condition exists in the system),
  12 h recovery per healed character. Allies out of range/not healable are listed as skipped.
- **Invigourate**: allies within 1 m, dialog distributes up to PR fatigue levels in total, no wound healing, 12 h recovery.
- GM decision: the 12 h recovery is stored **per recipient** (not per psyker). Tell us if the rulebook means it per psyker.

## 24 hours of rest (GM, Actors directory button)
Never heals because the clock advanced. The GM ticks the characters, confirms the rest type (none / full / bed rest) and enters the
natural healing and Extended Care amounts. Critically damaged characters roll a Toughness test; a failed test removes the natural healing.
**Open:** the rule values of p. 244 (amount per state) and p. 109 (Extended Care with healer/assistants/days) are not stored in the system
data, so the GM enters the amounts; once they are supplied they can be calculated.

## Manual tests
1. Target a token → First Aid; without target → warning, no roll. 2. Heavily/Critically damaged patient: check modifiers on the card.
3. Heal twice within 24 h (world time advanced less) → refused; GM can override. 4. Fate: Heal with 0 fate / with critical damage.
5. Cast Endurance / Invigourate with tokens inside/outside the range. 6. Press "Apply now" twice → second does nothing.
