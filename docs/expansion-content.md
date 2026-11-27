# Expansion content (DLC) and sources

Everything that is not in the Core Rulebook is expansion content ("DLC"). Each home world, background and role carries its source in the rules data (`source: 'PG 24 EI'` = page 24, book code); `rules/sources.mjs` turns it into a book name.

| Code | Book |
| --- | --- |
| CB | Core Rulebook |
| EI | Enemies Within |
| EO | Enemies Without |
| EB | Enemies Beyond |
| FG | Forgotten Gods |

**Where the source is shown**
- The selects Home World, Background and Role in the header of the character sheet are grouped by book ("Enemies Within (DLC)" …); the tooltip of the select and of every option shows "Book, p. N".
- Origin Bonuses on the Talents tab: the pill shows "Homeworld · DLC", the opened entry has the line "Source: Enemies Within, p. 24 (expansion content)".

**Home worlds from `DH2_Expanded_Home_Worlds_EN.csv`**
- The nine archetypes (Agri-World, Feudal World, Frontier World, Death World, Garden World, Research Station, Daemon World, Penal Colony, Quarantine World) were already in the system and match the file, with these corrections taken from the file: Quarantine World gets +Perception (it had +Intelligence), bonus names "At Home in Armour" and "Survivor's Paranoia".
- 21 specific locations are new (Hrax, Kalto, Pellenne, Port Aquila, Rund, Selvanus Binary, Snope's World, Temperance, Forraliss, Dark Echo (P3482XW), Gregorn, Vouxis Prime, Yanth, Kul, Nexum, Ossuar, The Emperor's Song, Tuchulcha, Hive Desoleum, The Oath Unspoken, Thaur). Each has the mechanics of its parent home world (`parent`) and its own bonus; where the file gives no values, the values of the parent are used.
- The bonus texts are the short summaries of the file, not the printed text. Mechanics that need a decision (starting talents or skills of a location, Fatigue, Fate effects …) are text only, they are not automated.

**Backgrounds and roles from `DH2_Expanded_Backgrounds_and_Roles_EN.csv`**
- Adepta Sororitas, Mutant, Heretek, Imperial Navy, Exorcised and the roles Fanatic, Penitent, Ace and Crusader were already in the system with the same aptitudes and bonuses; they are now marked as expansion content with their book. "Rogue Trader Fleet" of the file is the existing background "Rogue Trader" (the name stays, characters store it).

**Character creation wizard**
- The wizard offers the expansion content too, marked "DLC" with book and page: 31 home worlds (9 archetypes, Agri-World (Novo Arcadia), 21 locations), 6 backgrounds (Adepta Sororitas, Mutant, Heretek, Imperial Navy, Rogue Trader, Exorcised) and 4 roles (Fanatic, Penitent, Ace, Crusader). Everything the core content does is done for them: aptitudes, skill choices, talent packages, equipment choices, role talent choice.
- Home world step in two stages: first the type (core types and expansion types in two sections), then — where the data has specific worlds — the general variant or one of them as cards (name and source on the left, description, values, bonus and the differences from the general variant on the right). A type without specific worlds is chosen directly. The grouping uses the `parent` field of the data only; "Agri-World (Novo Arcadia)" has no `parent` and is therefore listed as a type of its own (not clear from the data whether it is a variant of Agri-World). The grouping does not change any value: what a character gets comes from the chosen entry. Code: `creator/homeworld-groups.mjs`.
- Home worlds: the starting talent is granted where the bonus text names it without a choice (Temperance: Weapon Training (Flame), Rund: Hatred (Heretics), The Emperor's Song: Deny the Witch, Vouxis Prime: Blind Fighting, Pellenne: Resistance (Radiation)). Skills, traits, rolls and choices of the bonus text (for example Trade rank 1 of Pellenne, the Mutant's mutations, the Exorcised's malignancy, Corruption of the Daemon World) are shown as the bonus text only and have to be applied by hand.
- Equipment names that are not in the equipment compendium become a placeholder item and are listed in the creation notes (Chrono, Stablight, Combat Vest, Expander Bullets, Man-Stopper Rounds, Filtration Plugs, Combat Shotgun, Rebreather, Auspex, Glow-Globe; the first, second, fourth and eighth are used by core backgrounds too).
- Code: `creator/data.mjs` (`EXPANSION_HOMEWORLD_DEFS`, `EXPANSION_BACKGROUND_DEFS`, `EXPANSION_ROLE_DEFS`).

**Locked:** home world, background and role of every character (type acolyte) cannot be changed by a player: the selects are disabled with a lock symbol, and an update by another way (macro, other form) is rejected in `preUpdateActor`. The GM can change them, and can lift the lock of one character with the lock button next to "Home World" in the header (flag `originUnlocked`) and lock it again. Code: `rules/origin-lock.mjs`.
