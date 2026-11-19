/**
 * Foundry shows tooltips in one global element. Marking our elements with `data-tooltip-class` lets the
 * stylesheet style exactly the tooltips of this system (`#tooltip.dh-tooltip`) without touching anybody else's.
 */
export const TOOLTIP_CLASS = 'dh-tooltip';

/** @param root {HTMLElement|null} */
export function markTooltips(root) {
    if (!root) return;
    root.querySelectorAll('[data-tooltip]:not([data-tooltip-class])').forEach((el) => {
        el.dataset.tooltipClass = TOOLTIP_CLASS;
    });
}
