# Gear tab: fold-out descriptions

- **Click on the free area of an item row** folds the description open or closed directly under the row (only if the item has a description).
- **Click on the name or the image** opens the item window (the same `item-edit` handling as the pencil button).
- **Arrow** (left of the image): a real button with `aria-expanded` / `aria-controls`, reachable with Tab, Enter and Space; it shows that a description exists and turns when open. Rows without a description have no arrow button and no fold-out area, only an empty cell that keeps the columns aligned.
- **Equip, chat, edit, delete** work as before; their clicks neither fold the description nor open the item (the row only reacts when the click was not inside a button, link, input, select, textarea, label, summary or the description itself: `isFreeAreaClick`, `rules/item-description.mjs`).
- **Text:** prepared on the first opening with Foundry's `TextEditor.enrichHTML` (the method the system already uses for talents and powers): formatting and links are kept and the HTML is made safe. The open rows and the prepared texts survive a redraw of the sheet; an edited description is prepared again.
- **Layout:** the fold uses the same slide / fade as skills and powers (switched off with "reduce motion"); on narrow sheets the row wraps and the text is less indented.

## What was checked
- Node tests (`test/gear.test.mjs`): description detection (text, links, images, empty markup, `&nbsp;`), the bubbling predicate, and the rendered template (arrow with aria and region only with a description; name and image carry `item-edit`; the four existing buttons and their classes; the arrow is not an `item-edit` control).
- Chromium with the real template, stylesheet and predicate (a test page, **not Foundry**): free-area click folds / unfolds; name and image only open (stubbed) the item; equip, chat, edit and delete only trigger themselves; arrow by mouse, Enter and Space; a click inside the description or on a link inside it does not fold; a row without a description has no arrow and does nothing.
- **Not checked in Foundry itself:** the real item window, `enrichHTML` with content links and inline rolls, drag and drop of the rows with the new buttons, and the exact look with Font Awesome (the test page had no icons). Please try one item with and one without a description.
