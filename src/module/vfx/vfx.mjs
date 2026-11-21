/**
 * Visual effects with Sequencer and JB2A Free (both optional). Mapping: vfx-config.mjs. Nothing here changes rules, dice or damage;
 * every call is wrapped so that a missing module, asset, token or scene never blocks a roll.
 *
 * Distribution: Sequencer plays an effect on EVERY client when `.play()` is called on one client (it does its own socket
 * broadcast). So each effect is started by exactly one client and never with `.locally()`:
 *   shot / blast  the client of the user who performs the attack
 *   impact        the GM client that resolves the target row (once, the row is marked done before)
 */
import { SYSTEM_ID } from '../system-id.mjs';
import { EFFECTS, REQUIRED_MODULES, blastDiameterInSquares, effectFor, resolveAsset } from './vfx-config.mjs';

export const VFX_SETTING = 'vfx-enabled';
let warned = false;

export const vfxEnabled = () => {
    try {
        return !!game.settings.get(SYSTEM_ID, VFX_SETTING);
    } catch {
        return false;
    }
};

/** Both modules active and the Sequencer API there? Says why not (once, as a short notice to the GM). */
export function vfxAvailable({ notify = true } = {}) {
    if (!vfxEnabled()) return false;
    const sequencer = game.modules?.get(REQUIRED_MODULES.sequencer)?.active && typeof globalThis.Sequence === 'function' && globalThis.Sequencer?.Database;
    const jb2a = game.modules?.get(REQUIRED_MODULES.jb2a)?.active;
    if (sequencer && jb2a) return true;
    if (notify && !warned && game.user?.isGM) {
        warned = true;
        ui.notifications?.info(`Visual effects are on, but ${!sequencer ? 'Sequencer' : 'JB2A Free'} is not active: attacks work without animations.`);
    }
    return false;
}

const exists = (key) => globalThis.Sequencer.Database.entryExists(key);
const missing = new Set();
function asset(effectName, slot) {
    const key = resolveAsset(EFFECTS[effectName]?.[slot], exists);
    if (!key && !missing.has(`${effectName}.${slot}`)) {
        missing.add(`${effectName}.${slot}`);
        console.warn(`Dark Heresy 2e | no JB2A asset found for ${effectName}.${slot} (candidates: ${EFFECTS[effectName]?.[slot]?.join(', ')})`);
    }
    return key;
}

const tokenOfActor = (actor) => actor?.token?.object ?? actor?.getActiveTokens?.()[0] ?? null;

async function safely(label, fn) {
    try {
        await fn();
    } catch (error) {
        console.warn(`Dark Heresy 2e | visual effect "${label}" failed`, error);
    }
}

/** Effect key of an attack roll (rollData): weapon / power -> 'laser' | 'psychicBolt' | 'psychicBlast' | null */
export function effectOfRoll(rd) {
    return effectFor({
        weapon: rd?.weapon ? { type: rd.weapon.system?.type, name: rd.weapon.name, class: rd.weapon.system?.class } : null,
        power: rd?.power ? { attackType: rd.power.system?.attackType, name: rd.power.name } : null,
    });
}

/**
 * The attack is executed: muzzle flash and shot from the attacker to the target. Called whether it hits or not.
 * Needs a target token; without one (no roll happened) nothing plays.
 */
export async function playShot(rd) {
    const name = effectOfRoll(rd);
    if (!name || EFFECTS[name].kind !== 'projectile' || !vfxAvailable()) return;
    const from = tokenOfActor(rd.sourceActor);
    const to = tokenOfActor(rd.targetActor);
    if (!from || !to || from === to) return;
    await safely(`${name} shot`, async () => {
        const shot = asset(name, 'shot');
        if (!shot) return;
        const seq = new globalThis.Sequence();
        const muzzle = asset(name, 'muzzle');
        if (muzzle) seq.effect().file(muzzle).atLocation(from).rotateTowards(to).scaleToObject(1.5);
        seq.effect().file(shot).atLocation(from).stretchTo(to);
        await seq.play();
    });
}

/** A hit that really did damage (after Dodge / Parry / Take the hit): impact at the target */
export async function playImpact(effectName, targetUuid) {
    if (!effectName || EFFECTS[effectName]?.kind !== 'projectile' || !vfxAvailable({ notify: false })) return;
    const to = tokenOfActor((await fromUuid(targetUuid))?.actor ?? (await fromUuid(targetUuid)));
    if (!to) return;
    await safely(`${effectName} impact`, async () => {
        const impact = asset(effectName, 'impact');
        if (impact) await new globalThis.Sequence().effect().file(impact).atLocation(to).scaleToObject(1.4).play();
    });
}

/** Blast: the area at the centre token the rules use, sized to the radius the rules calculated (metres) */
export async function playBlast(rd, centreToken, radius) {
    const name = effectOfRoll(rd);
    if (name !== 'psychicBlast' || !vfxAvailable() || !centreToken) return;
    const squares = blastDiameterInSquares(radius, canvas?.scene?.grid?.distance);
    if (!squares) return;
    await safely('psychic blast', async () => {
        const seq = new globalThis.Sequence();
        const ring = asset(name, 'ring');
        const burst = asset(name, 'burst');
        if (!ring && !burst) return;
        const at = { x: centreToken.center.x, y: centreToken.center.y };
        if (ring) seq.effect().file(ring).atLocation(at).size(squares, { gridUnits: true }).belowTokens().fadeOut(400);
        if (burst) seq.effect().file(burst).atLocation(at).size(squares, { gridUnits: true });
        await seq.play();
    });
}

/** For the settings menu / console: which assets of the mapping are available (no invented paths) */
export function vfxReport() {
    if (!vfxAvailable({ notify: false })) return 'Sequencer or JB2A Free is not active (or effects are switched off).';
    const lines = [];
    for (const [name, def] of Object.entries(EFFECTS)) {
        for (const slot of Object.keys(def).filter((k) => Array.isArray(def[k]))) lines.push(`${name}.${slot}: ${resolveAsset(def[slot], exists) ?? 'MISSING'}`);
    }
    return lines.join('\n');
}
