import { actionDialog } from './dialog-helpers.mjs';
import { awardExperience, purchaseTargets, spendExperience } from '../rules/experience.mjs';

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ''));
const options = (list) => list.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');

export async function prepareSpendExperience(actor) {
    const t = purchaseTargets(actor);
    const available = actor.system.experience.total - actor.system.experience.used;
    const content = `
        <div class="dossier-dialog">
            <p class="hint">Available: <strong>${available} EP</strong>. Advancement costs are not stored in the system - enter the cost from the rulebook.</p>
            <div class="form-group"><label>Improvement</label>
                <select id="xp-target">
                    <optgroup label="Characteristics">${options(t.chars)}</optgroup>
                    <optgroup label="Skills">${options(t.skills)}</optgroup>
                    ${t.specs.length ? `<optgroup label="Specialist Skills">${options(t.specs)}</optgroup>` : ''}
                    <optgroup label="Other">
                        <option value="psy">Psy Rating</option>
                        <option value="talent">Talent</option>
                        <option value="other">Other</option>
                    </optgroup>
                </select>
            </div>
            <div class="form-group"><label>Name (talent / other)</label><input type="text" id="xp-label" /></div>
            <div class="form-group"><label>Cost (EP)</label><input type="number" id="xp-cost" min="1" step="1" /></div>
            <div class="form-group"><label>Note</label><input type="text" id="xp-note" /></div>
            ${game.user.isGM ? `<div class="form-group"><label>GM override</label><input type="checkbox" id="xp-override" /></div>` : ''}
        </div>`;
    await actionDialog({
        title: 'Spend Experience',
        content,
        width: 420,
        action: {
            label: 'Spend',
            icon: 'fa-solid fa-coins',
            callback: async (el) =>
                spendExperience(actor, {
                    target: el.querySelector('#xp-target').value,
                    cost: el.querySelector('#xp-cost').value,
                    customLabel: el.querySelector('#xp-label').value.trim(),
                    note: el.querySelector('#xp-note').value.trim(),
                    gmOverride: !!el.querySelector('#xp-override')?.checked,
                }),
        },
    });
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
