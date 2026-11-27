# Talents without a direct combat use

Status: **nothing is automated here on purpose.** The sheet shows the stored benefit text of the talent (Talents tab, with the prerequisites); skill tests, social tests, investigation and healing are rolled as usual and the modifier is applied by the GM or the player. A talent is only automated when its rule text is in the system data completely and its effect is unambiguous; a narrative effect is a decision of the GM, not a calculation.

| Talent | Tier | Prerequisites | Benefit text in the compendium |
| --- | --- | --- | --- |
| Clues from the Crowds | 1 | Fellowship 30 | yes (86 characters) |
| Contact Network | 2 | Cover-Up, Intelligence 35 | yes (58 characters) |
| Cover-Up | 2 | Intelligence 35 | yes (47 characters) |
| Coordinated Interrogation | 2 | Clues from the Crowds, Strength 40 or Willpower 40 | yes (105 characters) |
| Delicate Interrogation | 3 | Coordinated Interrogation, Fellowship 50 | yes (135 characters) |
| Face in a Crowd | 2 | Clues from the Crowds, Fellowship 35 | yes (53 characters) |
| Flash of Insight | 3 | Contact Network, Coordinated Interrogation, Intelligence 40 | yes (36 characters) |
| Infused Knowledge | 3 | Intelligence 40, Lore (any one) | yes (78 characters) |
| Keen Intuition | 1 | Intelligence 35 | yes (47 characters) |
| Mastery | 3 | Rank 4 in selected skill | yes (182 characters) |
| Peer | 1 | Fellowship 30 | yes (196 characters) |
| Technical Knock | 1 | Intelligence 30 | yes (26 characters) |
| Weapon-Tech | 1 | Intelligence 40, Tech Use +10 | yes (206 characters) |
| Superior Chirurgeon | 3 | Rank 2 in the Medicae skill | yes (120 characters) |
| Halo of Command | 3 | Fellowship 40, Willpower 40 | yes (54 characters) |
| Sound Constitution | 1 | — | yes (25 characters) |
| Constant Vigilance | 2 | Awareness +10, Intelligence 35 or Perception 35 | yes (106 characters) |
| Armor-Monger | 2 | Intelligence 35, Tech-Use, Trade (Armourer) | yes (381 characters) |
| Exotic Weapon Training | 2 | — | yes (45 characters) |
| Ambassador Imperialis | 2 | — | yes (203 characters) |
| Archivator | 2 | — | yes (116 characters) |
| Lexographer | 2 | — | yes (139 characters) |
| Xenosavant | 2 | — | yes (149 characters) |
| Inspiring Aura | 2 | — | yes (250 characters) |
| Field Vivisection | 2 | — | yes (294 characters) |

**What is missing for a safe automation (per kind of talent):**
- *Test bonuses* (for example Technical Knock, Weapon-Tech, Keen Intuition, Clues from the Crowds, Face in a Crowd): the compendium text has to name the skill, the situation (when it applies) and the size of the bonus unambiguously; the roll dialogs have no field "talent bonus that applies in this situation", so a bonus would have to be offered as a tick box the roller sets. Needs the exact printed wording per talent.
- *Information, contacts, favours* (Contact Network, Cover-Up, Peer, Coordinated Interrogation, Flash of Insight): narrative and GM decisions; the relationship system (Patron and contacts) could carry Peer and Contact Network, but how they change the relationship values is not defined in the data.
- *Healing* (Superior Chirurgeon): the healing module takes Medicae results; the effect on the healing amount or on the First Aid modifiers needs the printed text.
- *Resource changes* (Sound Constitution, Halo of Command): change wounds, fatigue or what allies get; need the exact rule text before they can modify the derived values.

Other non-combat talents of the compendium are not listed one by one here because their effects are not available as structured data. Open for the owner: the printed benefit text of the talents above (or an import package), then the test-bonus tick box can be built generically.
