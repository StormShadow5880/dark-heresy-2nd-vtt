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
import { EFFECTS, REQUIRED_MODULES, SOUND_SETTINGS, SOUND_VOLUME_SETTING, blastDiameterInSquares, cleanSoundPath, effectFor, resolveAsset } from './vfx-config.mjs';

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

/** Why nothing played: one line in the browser console (F12), so a silent attack can be explained */
const skip = (why) => console.info(`Dark Heresy 2e | no animation: ${why}`);

const tokenOfActor = (actor) => actor?.token?.object ?? actor?.getActiveTokens?.()[0] ?? null;

/**
 * Sound of an effect (file from the world settings), played with the animation. A separate sequence: a missing or broken audio file
 * can never cancel the animation. Sequencer plays it on every client, like the animation.
 */
function playSound(slot, delay = 0) {
    const path = cleanSoundPath(safeSetting(SOUND_SETTINGS[slot]?.key));
    if (!path) return;
    const volume = Math.min(1, Math.max(0, Number(safeSetting(SOUND_VOLUME_SETTING)) || 0.6));
    try {
        const seq = new globalThis.Sequence();
        const sound = seq.sound().file(path).volume(volume);
        if (delay > 0) sound.delay(delay);
        Promise.resolve(seq.play()).catch((error) => console.warn(`Dark Heresy 2e | sound ${path} failed`, error));
    } catch (error) {
        console.warn(`Dark Heresy 2e | sound ${path} failed`, error);
    }
}

function safeSetting(key) {
    try {
        return key ? game.settings.get(SYSTEM_ID, key) : undefined;
    } catch {
        return undefined;
    }
}

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

/** Muzzle flash, sound and shot from one token to another; resolves when the shot is over */
async function shotBetween(name, from, to) {
    const shot = asset(name, 'shot');
    if (!shot) return skip(`no JB2A asset for ${name}.shot`);
    const seq = new globalThis.Sequence();
    const muzzle = asset(name, 'muzzle');
    if (muzzle) seq.effect().file(muzzle).atLocation(from).rotateTowards(to).scaleToObject(1.5);
    seq.effect().file(shot).atLocation(from).stretchTo(to).waitUntilFinished(-150);
    playSound(name);
    await seq.play();
}

/**
 * The attack is executed and nothing is left to resolve in the chat (a miss, or an attack the card does not handle): muzzle flash and
 * shot at once. A hit with an attack card plays its shot later, when the target has answered (playResolution).
 * Needs a target token; without one (no roll happened) nothing plays.
 */
export async function playShot(rd) {
    const name = effectOfRoll(rd);
    if (!name || EFFECTS[name].kind !== 'projectile') return skip(`no effect for this attack (weapon type "${rd?.weapon?.system?.type}", power type "${rd?.power?.system?.attackType}")`);
    if (!vfxAvailable()) return skip('effects off, or Sequencer / JB2A Free not active');
    const from = tokenOfActor(rd.sourceActor);
    const to = tokenOfActor(rd.targetActor);
    if (!from || !to || from === to) return skip(`token missing (attacker: ${!!from}, target: ${!!to})`);
    await safely(`${name} shot`, () => shotBetween(name, from, to));
}

/**
 * The target has answered (Dodge / Parry / Take the hit): shot, wait until it arrives, then what the result was: impact and the
 * floating number on a real hit, nothing on a miss or a full evasion. Called by the GM client once per resolved target row.
 */
export async function playResolution({ effect, attackerUuid, targetUuid, impact, lines }) {
    if (!vfxAvailable({ notify: false })) return;
    await safely('resolution', async () => {
        const from = tokenOfActor(await actorOfUuid(attackerUuid));
        const to = tokenOfActor(await actorOfUuid(targetUuid));
        if (effect && EFFECTS[effect]?.kind === 'projectile' && from && to && from !== to) await shotBetween(effect, from, to);
        if (impact) await playImpact(effect, targetUuid);
        await playFloatingNumbers(targetUuid, lines);
    });
}

async function actorOfUuid(uuid) {
    const doc = await fromUuid(uuid);
    return doc?.actor ?? doc ?? null;
}

/** A hit that really did damage (after Dodge / Parry / Take the hit): impact at the target */
export async function playImpact(effectName, targetUuid) {
    if (!effectName || EFFECTS[effectName]?.kind !== 'projectile' || !vfxAvailable({ notify: false })) return;
    const to = tokenOfActor((await fromUuid(targetUuid))?.actor ?? (await fromUuid(targetUuid)));
    if (!to) return;
    await safely(`${effectName} impact`, async () => {
        const impact = asset(effectName, 'impact');
        if (impact) await new globalThis.Sequence().effect().file(impact).atLocation(to).scaleToObject(1.4).play();
        playSound('impact');
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
        if (!ring && !burst) return skip('no JB2A asset for psychicBlast.ring / burst');
        const at = { x: centreToken.center.x, y: centreToken.center.y };
        // first the energy bolt from the psyker to the centre, the explosion starts just before it arrives
        const from = tokenOfActor(rd.sourceActor);
        const shot = from && from !== centreToken ? asset(name, 'shot') : null;
        if (shot) seq.effect().file(shot).atLocation(from).stretchTo(at).waitUntilFinished(-300);
        if (ring) seq.effect().file(ring).atLocation(at).size(squares, { gridUnits: true }).belowTokens().fadeOut(400);
        if (burst) seq.effect().file(burst).atLocation(at).size(squares, { gridUnits: true });
        playSound(name, shot ? 600 : 0);
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

/**
 * Floating number above a token ("-3" in red for lost wounds, "+4" in green for healing). Needs only Sequencer (no JB2A asset), which
 * shows it on every client. `lines`: [{ text, color }], stacked upwards.
 */
export async function playFloatingNumbers(targetUuid, lines) {
    if (!lines?.length || !vfxAvailable({ notify: false }) || safeSetting('vfx-floating-numbers') === false) return;
    const doc = await fromUuid(targetUuid);
    const token = tokenOfActor(doc?.actor ?? doc);
    if (!token) return;
    await safely('floating number', async () => {
        const seq = new globalThis.Sequence();
        lines.forEach((line, i) => {
            seq.effect()
                .atLocation(token)
                .text(String(line.text), { fill: line.color, fontSize: 44, fontWeight: 'bold', stroke: '#000000', strokeThickness: 6, dropShadow: true })
                .animateProperty('sprite', 'position.y', { from: -0.3 - i * 0.5, to: -1.3 - i * 0.5, duration: 1600, gridUnits: true, ease: 'easeOutQuad' })
                .fadeIn(150)
                .fadeOut(500)
                .duration(1800);
        });
        await seq.play();
    });
}

/** Lines for an applied damage result of applyHits(): lost wounds in red, critical damage in orange; nothing if nothing was lost */
export function damageLines(result) {
    const lines = [];
    // result.damage = wounds lost by all hits (result.wounds would be the wounds left)
    const wounds = Number(result?.damage ?? 0);
    const critical = Number(result?.critical ?? 0);
    if (wounds > 0) lines.push({ text: `-${wounds}`, color: '#ff3030' });
    if (critical > 0) lines.push({ text: `-${critical} crit.`, color: '#ff9a2e' });
    return lines;
}

/** Lines for a healing result of the healing card */
export function healingLines(result) {
    const healed = Number(result?.healed ?? result?.removed ?? 0);
    return healed > 0 ? [{ text: `+${healed}`, color: '#3ddc6b' }] : [];
}
