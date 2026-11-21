/**
 * Visual effects: which action gets which animation (pure, no Foundry, no Sequencer).
 *
 * Every asset is a Sequencer database key of JB2A Free (module "JB2A_DnD5e", checked against its file dev/dist/animations_flat.json,
 * version 0.9.4). A slot lists CANDIDATES: the first one that the installed database knows is used, so an older or newer JB2A
 * version does not break anything, and a missing asset only drops that part of the effect.
 *
 * To add an effect (Bolter, Autogun, melee, Barrage, Storm, healing ...): add an entry to EFFECTS and a rule to EFFECT_RULES.
 */

export const REQUIRED_MODULES = { sequencer: 'sequencer', jb2a: 'JB2A_DnD5e' };

/**
 * kind: 'projectile' (source -> target, then an impact on a hit) or 'area' (at a point, sized to a radius in metres)
 */
export const EFFECTS = {
    laser: {
        label: 'Las weapon (red energy beam)',
        kind: 'projectile',
        muzzle: ['jb2a.muzzle_flash.single.01.yellow'],
        shot: ['jb2a.lasershot.red', 'jb2a.lasershot.orange'],
        impact: ['jb2a.impact.007.orange', 'jb2a.impact.005.orange', 'jb2a.impact.001.blue'],
    },
    psychicBolt: {
        label: 'Psychic Bolt (warp energy)',
        kind: 'projectile',
        shot: ['jb2a.eldritch_blast.purple', 'jb2a.magic_missile.purple', 'jb2a.energy_beam.normal.bluepink.02'],
        impact: ['jb2a.impact.003.blue', 'jb2a.impact.001.blue'],
    },
    psychicBlast: {
        label: 'Psychic Blast (warp explosion)',
        kind: 'area',
        shot: ['jb2a.eldritch_blast.purple', 'jb2a.magic_missile.purple'],
        ring: ['jb2a.magic_signs.circle.02.illusion.complete.dark_purple', 'jb2a.magic_signs.circle.02.illusion.complete.purple'],
        burst: ['jb2a.explosion.04.blue', 'jb2a.explosion.02.blue', 'jb2a.explosion.01.orange'],
    },
};

/** Rules: the first rule that matches decides. `attack` is { weapon: {type, name, class}|null, power: {attackType, name}|null } */
export const EFFECT_RULES = [
    { effect: 'laser', match: ({ weapon }) => String(weapon?.type ?? '').toLowerCase() === 'las' },
    { effect: 'psychicBolt', match: ({ power }) => String(power?.attackType ?? '').toLowerCase() === 'psychic bolt' },
    { effect: 'psychicBlast', match: ({ power }) => String(power?.attackType ?? '').toLowerCase() === 'psychic blast' },
];

/** @returns {string|null} key of EFFECTS, or null if the action has no effect */
export function effectFor(attack) {
    return EFFECT_RULES.find((rule) => rule.match(attack ?? {}))?.effect ?? null;
}

/** First candidate the database knows, or null */
export function resolveAsset(candidates, exists) {
    for (const key of candidates ?? []) {
        try {
            if (exists(key)) return key;
        } catch {
            // an unknown key is simply not available
        }
    }
    return null;
}

/** Diameter of a blast in grid squares: radius and grid distance are in the same unit (metres) */
export function blastDiameterInSquares(radius, gridDistance) {
    const r = Number(radius);
    const g = Number(gridDistance);
    if (!Number.isFinite(r) || r <= 0 || !Number.isFinite(g) || g <= 0) return null;
    return (2 * r) / g;
}

/**
 * Does a result of the attack card deserve an impact animation? Only if damage was really applied: a miss, a prevented hit or a
 * successful evasion shows none.
 */
export function showsImpact(entry) {
    if (!entry || entry.state !== 'done') return false;
    if (entry.outcome?.missed) return false;
    const r = entry.result;
    if (!r) return false;
    // applyHits() returns the hits that were really applied: none left means everything was prevented
    return Array.isArray(r.hits) && r.hits.length > 0;
}
