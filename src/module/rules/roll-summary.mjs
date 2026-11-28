/**
 * The result line of a roll dialog: which modifiers are really calculated, and the target number that comes out.
 * Same limits as the roll itself: the sum of all modifiers is at most +60 and at least -60.
 */
export const MODIFIER_LIMIT = 60;

export const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '+0');

const LABELS = { bonus: 'Rating Bonus', focus: 'Focus', power: 'Power', difficulty: 'Difficulty', modifier: 'Modifier', 'target-size': 'Target size', aim: 'Aim', attack: 'Attack', weapon: 'Weapon', relation: 'Relationship' };
const labelOf = (key) => LABELS[key] ?? String(key).replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase());

/**
 * @param base the base target (characteristic or skill)
 * @param modifiers { key: number|string }, anything that is not a whole number or is 0 is left out
 * @returns {{ lines: {label:string, value:number, text:string}[], sum:number, applied:number, capped:boolean, target:number, text:string }}
 */
export function summariseModifiers(base, modifiers = {}) {
    const lines = [];
    for (const [key, raw] of Object.entries(modifiers)) {
        const value = Number.parseInt(raw, 10);
        if (!Number.isFinite(value) || value === 0) continue;
        lines.push({ label: labelOf(key), value, text: signed(value) });
    }
    const sum = lines.reduce((a, l) => a + l.value, 0);
    const applied = Math.max(-MODIFIER_LIMIT, Math.min(MODIFIER_LIMIT, sum));
    const b = Number(base) || 0;
    const target = b + applied;
    const parts = [`${b}`, ...lines.map((l) => `${l.text} ${l.label}`)];
    return { lines, sum, applied, capped: applied !== sum, target, text: `${parts.join(' ')} = ${target}` };
}
