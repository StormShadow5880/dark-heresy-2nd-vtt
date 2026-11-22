/**
 * Patron actor: a character-like record of a patron (imitating Imperium Maledictum). It carries only the PUBLIC data in `system`
 * (see rules/relations-data.mjs); everything confidential is in the GM-only store (relations/store.mjs). No wounds, characteristics or
 * tokens bars: the patron is not a combatant.
 */
export class DarkHeresyPatron extends Actor {
    async _preCreate(data, options, user) {
        await super._preCreate(data, options, user);
        this.updateSource({
            img: data.img ?? 'icons/svg/mystery-man.svg',
            // nobody sees a patron until the GM assigns it to a character (the GM client sets the owners, see store.mjs)
            ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, [user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
        });
    }
}
