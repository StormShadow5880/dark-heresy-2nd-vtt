import { DarkHeresyBaseActor } from './base-actor.mjs';

/**
 * Patron actor: a character-like record of a patron (imitating Imperium Maledictum). It carries only the PUBLIC data in `system`
 * (see rules/relations-data.mjs); everything confidential is in the GM-only store (relations/store.mjs). No wounds, characteristics or
 * token bars: the patron is not a combatant.
 *
 * It extends DarkHeresyBaseActor only because Foundry's Actors collection accepts instances of CONFIG.Actor.documentClass (a proxy of that
 * class) and nothing else; the characteristic based behaviour of the base class is switched off here.
 */
export class DarkHeresyPatron extends DarkHeresyBaseActor {
    async _preCreate(data, options, user) {
        // not the base implementation (it sets token bars for wounds and fate): the core one
        const proceed = await foundry.documents.Actor.prototype._preCreate.call(this, data, options, user);
        if (proceed === false) return false;
        this.updateSource({
            img: data.img ?? 'icons/svg/mystery-man.svg',
            // nobody sees a patron until the GM assigns it to a character (the GM client sets the owners, see store.mjs)
            ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, [user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
        });
    }

    /** No characteristics, initiative or movement to calculate */
    prepareDerivedData() {
        foundry.documents.Actor.prototype.prepareDerivedData.call(this);
    }

    get characteristics() {
        return {};
    }

    get initiative() {
        return {};
    }

    get wounds() {
        return undefined;
    }

    get size() {
        return 0;
    }

    get movement() {
        return undefined;
    }
}
