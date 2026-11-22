/**
 * Descriptions of items in lists (pure).
 */

/** Does an item description contain anything to show? Empty markup, whitespace and non-breaking spaces do not count; an image or an embed does. */
export function hasDescription(html) {
    const text = String(html ?? '');
    if (/<(img|iframe|video|audio|picture)\b/i.test(text)) return true;
    return (
        text
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;|&#160;/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim().length > 0
    );
}

/** Controls inside a list row: a click on them is theirs and must neither fold the description nor open the item */
export const ROW_CONTROLS = 'button, a, input, select, textarea, label, summary, .gear-detail';

/** A click on the free area of a row folds / unfolds its description */
export const isFreeAreaClick = (target) => !(target && typeof target.closest === 'function' && target.closest(ROW_CONTROLS));
