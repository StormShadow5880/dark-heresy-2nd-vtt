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

**Not part of the character creation wizard:** the wizard offers the six core home worlds and the core backgrounds and roles with curated choices; expansion content is chosen in the sheet header.
