# Visual effects (Sequencer + JB2A Free)

Optional. Without the modules the system plays exactly as before. World setting **Visual Effects (Sequencer + JB2A)** (default on) switches
the animations off. `src/system.json` lists both modules as *recommended*, not required.

Code: mapping `src/module/vfx/vfx-config.mjs` (pure, tested), runtime `src/module/vfx/vfx.mjs`.

## Modules / versions checked
- Sequencer (module id `sequencer`, v10.0.0 manifest, Foundry 13–14) and JB2A Free (`JB2A_DnD5e`, **0.9.4**, verified for 14).
- Asset keys were taken from the JB2A repository's own database list (`dev/dist/animations_flat.json`); the keys the mapping uses are in
  `test/fixtures/jb2a-free-keys.json`. I could **not** run Foundry here: the real playback has not been seen yet (see manual tests).

## Mapping (first existing candidate is used)
| Action | Slot | Candidates (Sequencer DB keys) |
|---|---|---|
| Las weapon (weapon type "Las": lasgun, laspistol, …) | muzzle | `jb2a.muzzle_flash.single.01.yellow` |
| | shot | `jb2a.lasershot.red` (distance variants 5–90 ft are chosen by Sequencer), fallback `jb2a.lasershot.orange` |
| | impact | `jb2a.impact.007.orange`, `jb2a.impact.005.orange`, `jb2a.impact.001.blue` |
| Psychic Bolt | shot | `jb2a.eldritch_blast.purple` (warp purple), fallback `jb2a.magic_missile.purple`, `jb2a.energy_beam.normal.bluepink.02` |
| | impact | `jb2a.impact.003.blue`, `jb2a.impact.001.blue` |
| Psychic Blast | ring | `jb2a.magic_signs.circle.02.illusion.complete.dark_purple` / `.purple` |
| | burst | `jb2a.explosion.04.blue`, `.02.blue`, `jb2a.explosion.01.orange` |
JB2A Free has no *red* ray other than the lasershot, and no dedicated warp explosion: the purple ring plus a blue explosion is the substitute.
If no candidate of a slot is known, that slot is skipped and one console warning names the candidates. `vfxReport()` in `vfx.mjs` lists what resolves.

## When something plays
- **Shot** (muzzle + beam / bolt): when the attack is executed and a target token exists (`ActionData`, before the defence request). Hit or miss
  alike. No target → no roll → no animation.
- **Impact**: when the GM client resolves a target row (`resolveTarget`) and damage was really applied: not on a missed attack, a prevented hit
  or a successful Dodge/Parry (`showsImpact`). Several targets (Barrage etc.) use the already resolved rows; nothing is recalculated.
- **Blast**: at the first target's token (the centre the rules use) when the attack hit, sized to the blast radius the rules calculated
  (`2 × radius / scene grid distance` squares). If the power has no radius data (GM enters one by hand) no animation is played.
- Animations never decide targets, dice or damage; every call is wrapped in try/catch.

## Distribution
Sequencer broadcasts an effect to every client itself when `play()` is called, so each effect is started by exactly one client (shot/blast:
the attacker's client; impact: the resolving GM client, once per row) and never with `.locally()`.

## Extending
Add an entry to `EFFECTS`, a rule to `EFFECT_RULES` (Bolter, Autogun, melee, Barrage, Storm, healing …) and, if needed, a `play…` call at the
matching point.

## Manual test steps
1. Enable Sequencer and JB2A Free; Lasgun with a targeted token → muzzle flash + red beam; hit → impact after the defence answer.
2. Same with a miss and with a successful Dodge → beam, no impact. No target → warning, no roll, no animation.
3. Psychic Bolt → purple energy to the target; Psychic Blast → ring + explosion around the first target, scale matches the radius circle.
4. Disable Sequencer / JB2A or the setting → attacks work, one info for the GM. 5. Two connected clients → one animation each.
