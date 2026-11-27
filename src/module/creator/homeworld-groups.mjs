/**
 * Two-step choice of a home world in the creation wizard: first the home world type, then, where it has variants, the general
 * variant or a specific world. Pure functions.
 *
 * The grouping is only a way to show the list: an entry is a variant of a type only if its data says so (`parent` names another
 * entry of the list). Everything else is a type of its own. Which values a character gets comes from the entry that is chosen, not
 * from its group.
 */

/** [{ type: def, variants: [def] }] in the order of the list; only one level (a variant of a variant is a type of its own) */
export function homeworldGroups(list) {
    const byName = new Map(list.map((h) => [h.name, h]));
    const isVariant = (h) => !!h.parent && byName.has(h.parent) && !byName.get(h.parent).parent;
    return list
        .filter((h) => !isVariant(h))
        .map((type) => ({ type, variants: list.filter((h) => isVariant(h) && h.parent === type.name) }));
}

/** The id of the type an entry belongs to (the entry itself when it is a type) */
export function typeIdOf(list, id) {
    const entry = list.find((h) => h.id === id);
    if (!entry) return null;
    const group = homeworldGroups(list).find((g) => g.type.id === id || g.variants.some((v) => v.id === id));
    return group?.type.id ?? entry.id;
}

/**
 * What a variant does differently from the general variant of its type: [{ label, general, variant }]. `labelOf` turns a
 * characteristic key into a name. Empty list = same characteristics, fate, wounds and aptitude (only the bonus differs).
 */
export function differences(general, variant, labelOf = (k) => k) {
    const out = [];
    const list = (arr) => arr.map(labelOf).join(', ');
    const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
    if (!sameSet(general.positive, variant.positive)) out.push({ label: 'Positive', general: list(general.positive), variant: list(variant.positive) });
    if (general.negative !== variant.negative) out.push({ label: 'Negative', general: labelOf(general.negative), variant: labelOf(variant.negative) });
    if (general.fateThreshold !== variant.fateThreshold) out.push({ label: 'Fate', general: String(general.fateThreshold), variant: String(variant.fateThreshold) });
    if (general.blessing !== variant.blessing) out.push({ label: 'Blessing', general: `${general.blessing}+`, variant: `${variant.blessing}+` });
    if (general.aptitude !== variant.aptitude) out.push({ label: 'Aptitude', general: general.aptitude, variant: variant.aptitude });
    if (general.wounds.base !== variant.wounds.base || general.wounds.dice !== variant.wounds.dice) out.push({ label: 'Wounds', general: `${general.wounds.base}+${general.wounds.dice}`, variant: `${variant.wounds.base}+${variant.wounds.dice}` });
    return out;
}
