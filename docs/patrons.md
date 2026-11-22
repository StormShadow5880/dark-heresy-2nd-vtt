# Patrons and relationships ("Dark Maledictum")

Combines the idea of patron and faction influence of Imperium Maledictum with the tests of Dark Heresy 2. **This is a house rule of the campaign, not an official
Dark Heresy 2 rule and not the unchanged Imperium Maledictum success-level rule.**

## The four values (kept apart)
1. **Influence**, the personal DH2 characteristic: unchanged (Requisition etc.), never touched by this system.
2. **Personal faction relation**: signed level of a character towards a faction (actor flag `relations`).
3. **Personal contact value**: signed level towards one person (flag `relation` of a contact item).
4. **Patron relation**: signed level of the patron towards a faction (patron dossier).

## Rule
One applicable relationship level = **±10 on the target number** of a fitting social test.
- In person: faction level + contact value = personal level (example: Mechanicus −1 + Magos +2 = +1 → +10).
- In the patron's name: the patron's relation to that faction **replaces** the personal combination; the values are never added.
- The modifier is added to the target BEFORE the roll (new modifier row "relation"). Success, failure and degrees are calculated as before; the DH2 limit of ±60 for all modifiers of a roll stays.
- Only the social skills Charm, Command, Commerce, Deceive, Inquiry and Intimidate (`SOCIAL_SKILLS` in `rules/relations.mjs`). Combat, repair and all other tests never get a relationship.
- Example of the dialog: Charm 43, Mechanicus −1, Magos +2, personal level +1, modifier +10, target before other modifiers 53.

## Settings (world)
- *Relationship modifier: limit*: **no additional limit (default)** or a limit; *maximum* (default 20, only used with the limit): ±20 is only a test value, nothing is built in. Separate from the DH2 limits.
- *GM confirms every relationship test of the players* (default off).

## Patron dossier (GM: Actors directory → "Patrons")
Name, image, dynasty, faction, role, motivation, demeanor, description, notes, boons, liabilities (each can be *secret*), relations to factions (level, each can be *secret*),
membership status (unknown / known / hidden), the assigned characters. One patron can have many characters; the data exists once, the characters only point to it (actor flag `patronId`).
The GM creates, edits, assigns and removes. A player sees the dossier of his character's patron (Biography → "Open dossier") with the public data only.

## Biography: Patron & Relationships
Replaces the old contact list. Factions with the personal level, below them the contacts with their own value, the calculation (`−1 +2 = +1`) and the resulting modifier (`+10`), a *Test* button per contact and per faction,
contacts without a faction. Per contact: description, background of the relationship, notes (and for the GM: confidential notes). The owner of the character edits his relations; the GM edits everything.

### Existing data
Contacts were items of type `peer`. They stay exactly as they are: without relationship data a contact is a contact **without a faction and with value 0** and appears under "Contacts without a faction" with its name and description. Nothing is migrated, nothing is lost; the new data is added to flags when you edit it.

## Rolls
- **Contact "Test"**: opens a dialog with the contact and faction; the player chooses a social skill (no skill is assumed, nothing is rolled yet); then the normal roll dialog opens with the relationship preselected.
- The normal roll dialog of a social skill has a *Relationship* section: None / Personal (faction, contact) / In the name of the patron (faction of the patron). It shows base, faction, contact, source, level, modifier and the target before other modifiers. Other skills do not get the section.
- **GM control:** a GM can set "known here / not known here" for the patron membership in the dialog; with *unknown* or *hidden* membership a player's patron roll goes to the GM, who confirms or corrects the relevance (apply / do not apply / treat as known). The system never claims that a character is recognised as an agent.

## Secrets and rights (technical)
Foundry has no field-level permissions, so hidden values are **not stored where a player can read them**:
- public patron document (JournalEntry, `patronJson`): ownership *nobody* by default, *observer* only for the owners of assigned characters; contains no secret liability, no GM notes and no value of a secret relation (only its name, marked secret);
- confidential store (one JournalEntry, default ownership NONE, `secretsJson`): secret liabilities, GM notes, the levels of secret relations, GM notes of contacts. Only GM clients read and write it;
- actor and item flags hold only the non-secret personal relations (the player owns them);
- a roll with a secret patron value goes by socket to the **active GM client only** (`shouldProcess`: active GM, each request id once); that client rolls once. The public chat card shows success/failure and degrees but **no roll, target or modifier**; the details are a whisper to the GMs.
Assumption not verified here: Foundry does not send documents with ownership NONE to players. Check once with a player client: `game.journal.contents.map(j => j.name)` must not list "Dark Heresy: patrons and relations (GM only)" and unassigned patrons.

## Limits
- Success and degrees of a secret roll are visible, as they must be; a player could estimate the modifier from many results.
- Contact notes and background of the personal relations are not secret (the owner sees them); only the GM notes are.
- The relevance of a relationship to a test is chosen by the player in the dialog, the GM checks it only when the rules above send the roll to him.
- Run in Node: rules, data separation, storage with a fake Foundry, dedupe of requests. **Not run in Foundry:** the dialogs, the sockets with several real clients, the GM confirmation and the real visibility of the journals.

## Manual tests
1. GM: create a patron, assign two characters; each player sees only his own patron. 2. Player: open the dossier, secret liabilities/relations are not there (also not in the console: `game.journal`).
3. Biography: add a faction (−1) and a contact (+2): total +1 → +10. 4. Charm roll with the relationship: modifier +10 on the card. 5. Roll in the patron's name with a secret relation: public card without numbers, GM whisper with them.
6. Membership "unknown": the roll goes to the GM. 7. Technology/dodge roll: no relationship section. 8. Set the limit to 20 and use +3: +20.
