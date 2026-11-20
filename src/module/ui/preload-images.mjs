import { SYSTEM_ID } from '../system-id.mjs';

/**
 * Images the dossier sheet draws with CSS. Without this the browser loads and decodes each one the first time its tab is
 * shown, which makes the sheet flicker while switching tabs.
 */
const FILES = [
    'frame', 'shield', 'ring', 'banner', 'figure', 'parchment', 'char-card', 'char-eagle',
    'emblem-fatigue', 'emblem-corruption', 'emblem-insanity',
    'wcap-l', 'wcap-r', 'wcell-empty', 'wcell-full',
    'card-paper', 'card-aquila', 'card-frame', 'card-badge',
].map((name) => `systems/${SYSTEM_ID}/images/dossier/${name}.webp`);

const cache = [];

/** Loads and decodes the images once; the references are kept so the browser does not drop them */
export function preloadDossierImages() {
    if (cache.length) return;
    for (const src of FILES) {
        const img = new Image();
        img.src = src;
        cache.push(img);
        img.decode?.().catch(() => {});
    }
}
