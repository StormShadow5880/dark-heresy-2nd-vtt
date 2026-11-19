import { markTooltips } from '../ui/tooltips.mjs';

const { DialogV2 } = foundry.applications.api;

/** classes that put a dialog into the imperial UI */
export const DIALOG_CLASSES = ['dh-ui', 'dh-dialog'];

/**
 * Shows a yes/no confirmation dialog.
 * @param title {string}
 * @param content {string} HTML content
 * @param yes {Function} [optional] called when confirmed
 * @returns {Promise<boolean>} true if confirmed
 */
export async function confirmDialog({ title, content, yes }) {
    const result = await DialogV2.confirm({
        classes: DIALOG_CLASSES,
        window: { title },
        content,
        rejectClose: false,
        modal: false,
    });
    const confirmed = result === true;
    if (confirmed && yes) await yes();
    return confirmed;
}

/**
 * Shows a dialog with a primary action button and a cancel button.
 * The callback receives the dialog element (the form) to read values from.
 *
 * @param title {string}
 * @param content {string} HTML content
 * @param action {{label: string, icon: string, callback: (element: HTMLElement) => Promise<void>|void}}
 * @param width {number}
 */
export async function actionDialog({ title, content, action, width = 300 }) {
    const dialog = new DialogV2({
        classes: DIALOG_CLASSES,
        window: { title },
        position: { width },
        content,
        buttons: [
            {
                action: 'confirm',
                label: action.label,
                icon: action.icon,
                default: true,
                callback: async (event, button, dialog) => await action.callback(dialog.element),
            },
            {
                action: 'cancel',
                label: 'Cancel',
                icon: 'fa-solid fa-xmark',
            },
        ],
    });
    await dialog.render({ force: true });
    markTooltips(dialog.element);
    return dialog;
}
