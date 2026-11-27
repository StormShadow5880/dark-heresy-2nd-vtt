/**
 * Backgrounds: the bonus text and the source of every background.
 * Only what the sheet and the character creation read from here is kept (name, bonus, source); starting skills, talents, equipment and
 * aptitude choices live ONCE in the structured definitions of creator/data.mjs.
 */
export function backgrounds() {
    return [
        {
            name: 'Adeptus Administratum',
            background_bonus: {
                name: 'Master of Paperwork',
                benefit:
                    'An Adeptus Administratum character counts the Availability of all items as one level more available (Very Rare items count as Rare, Average items count as Common, etc.).',
            },
            source: 'PG 46 CB',
        },
        {
            name: 'Adeptus Arbites',
            background_bonus: {
                name: 'The Face of the Law',
                benefit:
                    'An Arbitrator can intimidation and Interrogation test, and can substitute his Willpower bonus for his degrees of success on these tests.',
            },
            source: 'PG 48 CB',
        },
        {
            name: 'Adeptus Astra Telepathica',
            background_bonus: {
                name: 'The Constant Threat',
                benefit:
                    'When the character or an ally within 10 meters triggers a roll on the Psychic Phenomenon table. Adeptus Astra Telepathica character can increase or decrease the result by amount equal to his Willpower bonus.Tested on Terra: If the character takes the Psyker elite advance during character creation, he also gains the Sanctioned trait.',
            },
            source: 'PG 50 CB',
        },
        {
            name: 'Adeptus Mechanicus',
            background_bonus: {
                name: 'Replace the Weak Flesh',
                benefit:
                    'An Adeptus Mechanicus character counts the Availability of all cybernetics as two levels more available (Rare items count as Average, Very Rare items count as Scarce, etc.). Starting Trait: Mechanicus Implants.',
            },
            source: 'PG 52 CB',
        },
        {
            name: 'Adeptus Ministorum',
            background_bonus: {
                name: 'Faith is All',
                benefit: 'When spending a Fate point to gain a+10 bonus to any one test, an Adeptus Ministorum character gains a +20 bonus instead.',
            },
            source: 'PG 54 CB',
        },
        {
            name: 'Imperial Guard',
            background_bonus: {
                name: 'Hammer of the Emperor',
                benefit:
                    "When attacking a target that an ally attacked since the end of the Guardsman's last turn, the Guardsman can re-roll any results of 1 or 2 damage rolls.",
            },
            source: 'PG 56 CB',
        },
        {
            name: 'Outcast',
            background_bonus: {
                name: 'Never Quit',
                benefit: 'An Outcast character counts his Toughness bonus as two higher for purposes of determining Fatigue.',
            },
            source: 'PG 58 CB',
        },
        {
            name: 'Adepta Sororitas',
            background_bonus: {
                name: 'Incorruptible Devotion',
                benefit:
                    'Whenever an Adepta Sororitas Character would gain 1 or more Corruption Points, she gains that many Insanity Points minus 1 (to a minimum of 0) instead.',
            },
            source: 'PG 30 EI',
        },
        {
            name: 'Mutant',
            background_bonus: {
                name: 'Twisted Flesh',
                benefit:
                    'A Mutant character can always choose to fail any test associated with resisting malignancy or mutation. Whenever he would gain a malignancy, he may roll on Table 8-16 to gain a mutation instead. A Mutant character begins play with 10 Corruption points. Instead of rolling as normal for malignancy or mutation, roll 5d10 on to determine a starting mutation.',
            },
            source: 'PG 32 EI',
        },
        {
            name: 'Heretek',
            background_bonus: {
                name: 'Master of Hidden Lores',
                benefit:
                    'When a Heretek makes a Tech-Use test to comprehend, use, repair, or modify an unfamiliar device, he gains a +20 bonus if he has one or more relevant Forbidden Lore skill specialisations at Rank 1 (Known) or higher.',
            },
            source: 'PG 32 EO',
        },
        {
            name: 'Imperial Navy',
            background_bonus: {
                name: 'Close Quarters Discipline',
                benefit:
                    'An Imperial Navy character scores one additional degree of success on successful Ballistic Skill tests he makes against targets at Point-Blank range, at Short range, and with whom he is engaged in melee.',
            },
            source: 'PG 34 EO',
        },
        {
            name: 'Rogue Trader',
            background_bonus: {
                name: 'Inured to the Xenos',
                benefit:
                    'A character from a Rogue Trader Fleet gains a +10 bonus to Fear tests caused by aliens and a +20 bonus to Interaction skill tests with alien characters.',
            },
            source: 'PG 36 EO',
        },
        {
            name: 'Exorcised',
            background_bonus: {
                name: 'Touched by a Daemon',
                benefit:
                    'An Exorcised character starts with one Malignancy Chosen from the Malignancies table. An Exorcised character counts his Insanity bonus as 2 higher for purposes of avoiding Fear Tests. Additionally, he can never again become possessed by the same Daemon that once possessed him.',
            },
            source: 'PG 32 EB',
        },
    ];
}

export function backgroundNames() {
    return backgrounds().map((b) => b.name);
}
