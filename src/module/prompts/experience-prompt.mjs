import { actionDialog } from './dialog-helpers.mjs';
import { awardExperience } from '../rules/experience.mjs';

/** "Spend EP": the catalogue of characteristics, skills, talents and psychic powers (prompts/spend-catalog.mjs). */
export async function prepareSpendExperience(actor, preselect = null) {
    const { SpendCatalog } = await import('./spend-catalog.mjs');
    return SpendCatalog.open(actor, preselect);
}

export async function prepareAwardExperience(actor) {
    const content = `
        <div class="dossier-dialog">
            <div class="form-group"><label>Amount (EP)</label><input type="number" id="xp-amount" min="1" step="1" /></div>
            <div class="form-group"><label>Note</label><input type="text" id="xp-note" /></div>
        </div>`;
    await actionDialog({
        title: 'Award Experience',
        content,
        width: 380,
        action: {
            label: 'Award',
            icon: 'fa-solid fa-plus',
            callback: async (el) =>
                awardExperience(actor, {
                    amount: el.querySelector('#xp-amount').value,
                    note: el.querySelector('#xp-note').value.trim(),
                }),
        },
    });
}
