/** World setting "wounds-formula": 'im' (default: Imperium Maledictum, IM-001, the maximum is calculated and fixed) or 'manual' (maximum as entered / rolled in character creation; only the GM can change it) */
export const WOUNDS_FORMULA_SETTING = 'wounds-formula';

export function woundsFormulaIsIM() {
    try {
        return (game.settings.get('dark-heresy-2nd', WOUNDS_FORMULA_SETTING) ?? 'im') === 'im';
    } catch {
        // settings are not registered yet while the very first documents are prepared: use the default
        return true;
    }
}
