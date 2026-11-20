/** World setting "wounds-formula": 'manual' (default, maximum as entered / rolled in character creation) or 'im' (Imperium Maledictum, IM-001, switched off by default) */
export const WOUNDS_FORMULA_SETTING = 'wounds-formula';

export function woundsFormulaIsIM() {
    try {
        return (game.settings.get('dark-heresy-2nd', WOUNDS_FORMULA_SETTING) ?? 'manual') === 'im';
    } catch {
        // settings are not registered yet while the very first documents are prepared: use the default
        return false;
    }
}
