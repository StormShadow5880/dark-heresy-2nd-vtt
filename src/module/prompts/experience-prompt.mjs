import { actionDialog, DIALOG_CLASSES } from './dialog-helpers.mjs';
import { markTooltips } from '../ui/tooltips.mjs';
import { SYSTEM_ID } from '../system-id.mjs';
import { awardExperience, purchaseAdvancement, purchaseTargets, spendExperience } from '../rules/experience.mjs';
import { availableXp, characteristicQuote, checkPurchase, isMultipleTalent, knownTalentSet, ownedTalentNames, skillQuote, talentQuote } from '../rules/advancement.mjs';

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ''));

const { DialogV2 } = foundry.applications.api;

/** The prerequisites of a talent, requirement by requirement: ✓ met, ✗ not met, ? to be checked by hand */
function prerequisiteHtml(quote) {
    const pc = quote.prerequisiteCheck;
    if (!pc || pc.empty) return `<span class="warn">${esc(quote.prerequisites)}</span>`;
    const mark = { met: '✓', unmet: '✗', manual: '?' };
    return pc.clauses
        .map((c) => {
            const detail = c.alternatives.map((a) => (a.detail ? `${a.text}: ${a.detail}` : a.text)).join(' / ');
            return `<div class="prereq prereq--${c.status}" title="${esc(detail)}"><b>${mark[c.status]}</b> ${esc(c.text)}${c.status !== 'met' ? ` <small>(${esc(detail)})</small>` : ''}</div>`;
        })
        .join('');
}

/** Talents of the system compendium with the fields the price needs */
async function loadTalentIndex() {
    const pack = game.packs.get(`${SYSTEM_ID}.talents`);
    if (!pack) return [];
    const index = await pack.getIndex({ fields: ['img', 'system.aptitudes', 'system.tier', 'system.prerequisites'] });
    return [...index]
        .map((e) => ({
            id: e._id,
            name: e.name,
            img: e.img,
            aptitudes: e.system?.aptitudes ?? '',
            tier: e.system?.tier ?? 0,
            prerequisites: e.system?.prerequisites ?? '',
        }))
        .sort((x, y) => x.name.localeCompare(y.name));
}

/**
 * The dialog for spending EP. Characteristic, skill and talent advances show their aptitudes, matches and price
 * and are bought at that price; "Manual entry" keeps the free cost field for psychic powers and everything else.
 * @param actor
 * @param preselect {{kind: string, key: string}} [optional] opens with this advance selected
 */
export async function prepareSpendExperience(actor, preselect = null) {
    const targets = purchaseTargets(actor);
    const talents = await loadTalentIndex();
    const startCategory = !preselect ? 'char' : preselect.kind === 'spec' ? 'skill' : preselect.kind;
    const content = `
        <div class="dossier-dialog adv-dialog">
            <div class="form-group"><label>Type</label>
                <select id="adv-cat">
                    <option value="char" ${startCategory === 'char' ? 'selected' : ''}>Characteristic</option>
                    <option value="skill" ${startCategory === 'skill' ? 'selected' : ''}>Skill</option>
                    <option value="talent" ${startCategory === 'talent' ? 'selected' : ''}>Talent</option>
                    <option value="manual">Manual entry (psychic, other)</option>
                </select></div>
            <div class="form-group" id="adv-target-row"><label>Advance</label><select id="adv-target"></select></div>
            <div class="form-group" id="adv-choice-row" hidden><label>Choice</label><input type="text" id="adv-choice" placeholder="e.g. Las, Bolt, ..." /></div>
            <div id="adv-summary" class="adv-summary"></div>
            <div class="form-group" id="adv-prereq-row" hidden><label>I have checked the prerequisites marked "?"</label><input type="checkbox" id="adv-prereq" /></div>
            ${game.user.isGM ? `<div class="form-group" id="adv-override-row" hidden><label>GM override: buy although a prerequisite is not met</label><input type="checkbox" id="adv-override" /></div>` : ''}
            <div id="adv-manual" hidden>
                <div class="form-group"><label>Entry</label>
                    <select id="xp-target"><option value="psy">Psy Rating</option><option value="talent">Talent</option><option value="other">Other</option></select></div>
                <div class="form-group"><label>Name</label><input type="text" id="xp-label" /></div>
                <div class="form-group"><label>Cost (EP)</label><input type="number" id="xp-cost" min="1" step="1" /></div>
                ${game.user.isGM ? `<div class="form-group"><label>GM override</label><input type="checkbox" id="xp-override" /></div>` : ''}
            </div>
            <div class="form-group"><label>Note</label><input type="text" id="adv-note" /></div>
        </div>`;

    const dialog = new DialogV2({
        classes: DIALOG_CLASSES,
        window: { title: 'Spend Experience' },
        position: { width: 480 },
        content,
        buttons: [
            {
                action: 'confirm',
                label: 'Spend',
                icon: 'fa-solid fa-coins',
                default: true,
                callback: async (event, button, dlg) => {
                    await submit(dlg.element);
                },
            },
            { action: 'cancel', label: 'Cancel', icon: 'fa-solid fa-xmark' },
        ],
    });
    await dialog.render({ force: true });
    const el = dialog.element;
    const $ = (id) => el.querySelector(id);
    const confirmButton = el.querySelector('button[data-action="confirm"]');

    const fillTargets = () => {
        const cat = $('#adv-cat').value;
        let options = [];
        if (cat === 'char') {
            options = targets.chars.filter((t) => characteristicQuote(actor, t.value.slice(5)).advanceable || characteristicQuote(actor, t.value.slice(5)).maxed).map((t) => ({ value: t.value.slice(5), label: levelLabel(characteristicQuote(actor, t.value.slice(5))) + ' · ' + t.label, kind: 'char' }));
        } else if (cat === 'skill') {
            options = [...targets.skills, ...targets.specs].map((t) => {
                const [kind, ref] = t.value.split(':');
                const [skillKey, specKey] = ref.split('.');
                return { value: ref, kind, label: t.label + ' (' + levelLabel(skillQuote(actor, skillKey, specKey)) + ')' };
            });
        } else if (cat === 'talent') {
            const taken = ownedTalentNames(actor);
            const known = knownTalentSet();
            // ✓ prerequisites met, ✗ not met, ? has to be checked by you; with the price
            const mark = { met: '✓', unmet: '✗', manual: '?' };
            options = talents.map((t) => {
                const learned = taken.has(t.name.toLowerCase()) && !isMultipleTalent(t.name);
                const q = talentQuote(actor, t, isMultipleTalent(t.name) ? 'x' : '', undefined, { knownTalents: known });
                const status = q.prerequisiteCheck && !q.prerequisiteCheck.empty ? mark[q.prerequisiteCheck.status] : '✓';
                return { value: t.id, kind: 'talent', label: `${learned ? '–' : status} ${t.name} (tier ${t.tier}${q.cost ? `, ${q.cost} EP` : ''})${learned ? ' – learned' : ''}` };
            });
        }
        $('#adv-target').innerHTML = options.map((o) => `<option value="${esc(o.value)}" data-kind="${o.kind}">${esc(o.label)}</option>`).join('');
        if (preselect && cat === startCategory && options.some((o) => o.value === preselect.key)) $('#adv-target').value = preselect.key;
    };
    const levelLabel = (q) => (q.maxed ? 'Maximum' : q.advanceable ? `${q.fromName} → ${q.toName}` : '—');

    const currentQuote = () => {
        const cat = $('#adv-cat').value;
        const value = $('#adv-target').value;
        if (cat === 'char') return { purchase: { kind: 'char', key: value }, quote: characteristicQuote(actor, value) };
        if (cat === 'skill') {
            const kind = $('#adv-target').selectedOptions[0]?.dataset.kind ?? 'skill';
            const [skillKey, specKey] = value.split('.');
            return { purchase: { kind, key: value }, quote: skillQuote(actor, skillKey, kind === 'spec' ? specKey : null) };
        }
        const entry = talents.find((t) => t.id === value);
        if (!entry) return { purchase: null, quote: null };
        return { purchase: { kind: 'talent', key: entry.name, talent: entry, entry }, quote: talentQuote(actor, entry, $('#adv-choice').value.trim()) };
    };

    const refresh = () => {
        const cat = $('#adv-cat').value;
        const manual = cat === 'manual';
        $('#adv-manual').hidden = !manual;
        $('#adv-target-row').hidden = manual;
        $('#adv-summary').hidden = manual;
        $('#adv-prereq-row').hidden = true;
        $('#adv-choice-row').hidden = true;
        if (manual) {
            confirmButton.disabled = false;
            return;
        }
        const { quote } = currentQuote();
        if (!quote) {
            $('#adv-summary').innerHTML = '<p class="hint">Nothing to select.</p>';
            confirmButton.disabled = true;
            return;
        }
        $('#adv-choice-row').hidden = !quote.multiple;
        const pc = quote.prerequisiteCheck;
        $('#adv-prereq-row').hidden = !(quote.prerequisites && (pc ? pc.manual.length > 0 : true));
        if ($('#adv-override-row')) $('#adv-override-row').hidden = !(pc && pc.status === 'unmet');
        const check = checkPurchase(actor, quote, { prerequisitesConfirmed: $('#adv-prereq').checked, gmOverride: !!$('#adv-override')?.checked });
        const available = availableXp(actor);
        const rows = [
            ['Advance', esc(quote.label)],
            ['Level', quote.maxed ? 'Maximum' : esc(`${quote.fromName} → ${quote.toName}`)],
            ['Required aptitudes', esc(quote.required.join(' + ') || '—')],
            ['Your aptitudes', esc(quote.matched.join(', ') || 'none of them')],
            ['Matching', `${quote.matches} / 2`],
            ['Cost', quote.cost != null && !quote.maxed ? `<strong>${quote.cost} EP</strong>` : '—'],
            ['Available', `${available} EP`],
            ['After purchase', quote.cost != null && !quote.maxed ? `${available - quote.cost} EP` : '—'],
        ];
        if (quote.prerequisites) rows.splice(4, 0, ['Prerequisites', prerequisiteHtml(quote)]);
        $('#adv-summary').innerHTML =
            `<dl class="adv-summary__rows">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>` +
            (check.errors.length ? `<p class="adv-summary__error">${esc(check.errors[0])}</p>` : '');
        confirmButton.disabled = !check.ok;
    };

    async function submit(root) {
        const cat = root.querySelector('#adv-cat').value;
        const note = root.querySelector('#adv-note').value.trim();
        if (cat === 'manual') {
            await spendExperience(actor, {
                target: root.querySelector('#xp-target').value,
                cost: root.querySelector('#xp-cost').value,
                customLabel: root.querySelector('#xp-label').value.trim(),
                note,
                gmOverride: !!root.querySelector('#xp-override')?.checked,
            });
            return;
        }
        const { purchase } = currentQuote();
        if (!purchase) return;
        if (purchase.kind === 'talent') {
            const pack = game.packs.get(`${SYSTEM_ID}.talents`);
            const doc = await pack.getDocument(purchase.entry.id);
            purchase.talent = { ...purchase.entry, system: doc.toObject().system };
        }
        await purchaseAdvancement(actor, {
            ...purchase,
            choice: root.querySelector('#adv-choice').value.trim(),
            prerequisitesConfirmed: root.querySelector('#adv-prereq').checked,
            gmOverride: !!root.querySelector('#adv-override')?.checked,
            note,
        });
    }

    el.addEventListener('change', (ev) => {
        if (ev.target.id === 'adv-cat') {
            fillTargets();
        }
        refresh();
    });
    el.addEventListener('input', (ev) => {
        if (ev.target.id === 'adv-choice') refresh();
    });
    fillTargets();
    refresh();
    markTooltips(el);
    return dialog;
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
