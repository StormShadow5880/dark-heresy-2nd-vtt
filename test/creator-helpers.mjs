import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFoundryStubs } from './helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function merge(target, source) {
    for (const [k, v] of Object.entries(source)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) target[k] = merge(target[k] ?? {}, v);
        else target[k] = JSON.parse(JSON.stringify(v));
    }
    return target;
}

/** Default system data of an acolyte, built from template.json like Foundry does (game.model.Actor.acolyte) */
export function acolyteDefaults() {
    const actor = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/template.json'), 'utf8')).Actor;
    const system = {};
    for (const name of actor.acolyte.templates) merge(system, actor.templates[name]);
    const { templates, ...own } = actor.acolyte;
    merge(system, own);
    return system;
}

export function setup() {
    const notes = installFoundryStubs();
    return { notes, env: { startingXp: 1000, systemDefaults: acolyteDefaults() } };
}

/** Fills a draft with fixed dice, so a rules test is deterministic */
export function rollAll(draft, dice = [5, 6]) {
    for (const k of ['weaponSkill', 'ballisticSkill', 'strength', 'toughness', 'agility', 'intelligence', 'perception', 'willpower', 'fellowship', 'influence']) {
        draft.characteristics.rolls[k] = { dice: [...dice, ...(draft.__three ? [1] : [])] };
    }
}
