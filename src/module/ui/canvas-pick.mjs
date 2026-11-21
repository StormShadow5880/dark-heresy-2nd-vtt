/**
 * Lets the user pick tokens on the canvas with the left mouse button (no need to target them first).
 * A small bar at the top shows the picks and offers Undo / Cancel; Esc cancels. The picked tokens carry a target marker while picking.
 *
 * @param count {number} the most clicks (the same token may be picked several times if `accept` allows it)
 * @param minCount {number} the fewest picks; with minCount < count a Done button ends the picking early
 * @param onRefuse {(reason: string, token: Token) => void} called when `accept` refuses a token
 * @param title {string} text of the bar
 * @param label {(index: number) => string} what the next click is for, e.g. "Hit 2"
 * @param accept {(token: Token, picks: Token[]) => true|string} true, or the reason why the token cannot be picked
 * @returns {Promise<Token[]|null>} the tokens in the order of the clicks, null if cancelled
 */
export function pickTokensOnCanvas({ count, minCount = count, title, label = (i) => `Pick ${i + 1}`, accept = () => true, onRefuse = null }) {
    return new Promise((resolve) => {
        const picks = [];
        const view = canvas.app.view;
        const bar = document.createElement('div');
        bar.className = 'dh-ui dh-pick';
        bar.innerHTML = '<div class="dh-pick__title"></div><ol class="dh-pick__list"></ol><div class="dh-pick__buttons"><button type="button" data-done><i class="fa-solid fa-check"></i> Done</button><button type="button" data-undo><i class="fa-solid fa-rotate-left"></i> Undo</button><button type="button" data-cancel><i class="fa-solid fa-xmark"></i> Cancel</button></div>';
        document.body.append(bar);

        const refresh = () => {
            bar.querySelector('.dh-pick__title').textContent = picks.length < count ? `${title} — click ${label(picks.length)}` : title;
            bar.querySelector('.dh-pick__list').innerHTML = Array.from({ length: count }, (_, i) => {
                const t = picks[i];
                return `<li class="${t ? 'is-set' : i === picks.length ? 'is-next' : ''}">${foundry.utils.escapeHTML(label(i))}: ${t ? foundry.utils.escapeHTML(t.name) : '…'}</li>`;
            }).join('');
            bar.querySelector('[data-undo]').disabled = !picks.length;
            const done = bar.querySelector('[data-done]');
            done.hidden = minCount >= count;
            done.disabled = picks.length < minCount;
        };

        const markers = () => {
            // the picked tokens show the target marker, everything else is released
            game.user.targets.forEach((t) => t.setTarget(false, { releaseOthers: false, groupSelection: true }));
            new Set(picks).forEach((t) => t.setTarget(true, { releaseOthers: false, groupSelection: true }));
        };

        const finish = (result) => {
            view.removeEventListener('pointerdown', onPointer, true);
            document.removeEventListener('keydown', onKey, true);
            bar.remove();
            game.user.targets.forEach((t) => t.setTarget(false, { releaseOthers: false, groupSelection: true }));
            resolve(result);
        };

        function onPointer(event) {
            if (event.button !== 0) return;
            const point = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
            const token = canvas.tokens.placeables.find((t) => t.visible && t.actor && t.bounds.contains(point.x, point.y));
            if (!token) return;
            // the click belongs to the picking: it must not select, drag or target the token as well
            event.stopPropagation();
            event.preventDefault();
            const verdict = accept(token, picks);
            if (verdict !== true) {
                onRefuse?.(verdict, token);
                return ui.notifications.warn(verdict);
            }
            picks.push(token);
            markers();
            refresh();
            if (picks.length >= count) setTimeout(() => finish([...picks]), 150);
        }
        function onKey(event) {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            finish(null);
        }

        bar.querySelector('[data-undo]').addEventListener('click', () => {
            picks.pop();
            markers();
            refresh();
        });
        bar.querySelector('[data-cancel]').addEventListener('click', () => finish(null));
        bar.querySelector('[data-done]').addEventListener('click', () => finish([...picks]));
        view.addEventListener('pointerdown', onPointer, true);
        document.addEventListener('keydown', onKey, true);
        refresh();
    });
}
