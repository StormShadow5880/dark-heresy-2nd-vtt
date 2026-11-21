import test from 'node:test';
import assert from 'node:assert/strict';
import { EFFECTS, blastDiameterInSquares, effectFor, resolveAsset, showsImpact } from '../src/module/vfx/vfx-config.mjs';
import { readFileSync } from 'node:fs';

test('mapping: Las weapons, Psychic Bolt and Blast; everything else has no effect', () => {
    assert.equal(effectFor({ weapon: { type: 'Las', name: 'Lasgun' } }), 'laser');
    assert.equal(effectFor({ weapon: { type: 'Las', name: 'Laspistol' } }), 'laser');
    assert.equal(effectFor({ weapon: { type: 'Bolt', name: 'Boltgun' } }), null);
    assert.equal(effectFor({ power: { attackType: 'Psychic Bolt' } }), 'psychicBolt');
    assert.equal(effectFor({ power: { attackType: 'Psychic Blast' } }), 'psychicBlast');
    assert.equal(effectFor({ power: { attackType: 'Psychic Barrage' } }), null);
    assert.equal(effectFor(null), null);
});

test('assets: first known candidate, missing assets give null, errors are swallowed', () => {
    assert.equal(resolveAsset(['a', 'b'], (k) => k === 'b'), 'b');
    assert.equal(resolveAsset(['a'], () => false), null);
    assert.equal(resolveAsset(['a'], () => { throw new Error('x'); }), null);
});

test('assets: every first-choice key exists in the JB2A Free database list (when the checked-out list is available)', () => {
    // fixture: the keys of the mapping, taken from JB2A_DnD5e dev/dist/animations_flat.json (module version 0.9.4)
    const keys = new Set(JSON.parse(readFileSync(new URL('./fixtures/jb2a-free-keys.json', import.meta.url), 'utf8')).keys);
    const has = (k) => keys.has(k) || [...keys].some((x) => x.startsWith(`${k}.`));
    for (const [name, def] of Object.entries(EFFECTS)) {
        for (const slot of Object.keys(def).filter((k) => Array.isArray(def[k]))) assert.ok(def[slot].some(has), `${name}.${slot} has no known asset`);
    }
});

test('blast size follows the radius', () => {
    assert.equal(blastDiameterInSquares(2, 1), 4);
    assert.equal(blastDiameterInSquares(3, 1.5), 4);
    assert.equal(blastDiameterInSquares(4, 2), 4);
    assert.equal(blastDiameterInSquares(0, 1), null);
    assert.equal(blastDiameterInSquares(2, 0), null);
});

test('impact only after a real hit: miss, full evasion and prevented hits show none', async () => {
    assert.equal(showsImpact({ state: 'open' }), false);
    assert.equal(showsImpact({ state: 'done', outcome: { missed: true }, result: null }), false);
    assert.equal(showsImpact({ state: 'done', outcome: { prevented: 1, missed: false }, result: { hits: [] } }), false);
    assert.equal(showsImpact({ state: 'done', outcome: { prevented: 0, missed: false }, result: { hits: [{}] } }), true);
});

/* ---- runtime with fake Foundry / Sequencer globals ---- */
async function runtime({ sequencer = true, jb2a = true, enabled = true, known = () => true } = {}) {
    const played = [];
    class Seq {
        constructor() { this.steps = []; }
        effect() { const step = { calls: [] }; this.steps.push(step); const proxy = new Proxy({}, { get: (_, m) => (...a) => { step.calls.push([m, a]); return proxy; } }); return proxy; }
        async play() { played.push(this.steps); }
    }
    globalThis.Sequence = Seq;
    globalThis.Sequencer = { Database: { entryExists: known } };
    globalThis.canvas = { scene: { grid: { distance: 1 } } };
    globalThis.ui = { notifications: { info() {}, warn() {} } };
    globalThis.fromUuid = async () => null;
    globalThis.game = {
        user: { isGM: false },
        settings: { get: () => enabled },
        modules: { get: (id) => ({ active: id === 'sequencer' ? sequencer : jb2a }) },
    };
    const vfx = await import('../src/module/vfx/vfx.mjs');
    return { vfx, played };
}
const token = (x = 0) => ({ center: { x, y: 0 } });
const rollOf = (extra = {}) => ({ weapon: { type: 'Las', name: 'Lasgun', system: { type: 'Las' } }, sourceActor: { getActiveTokens: () => [token(0)] }, targetActor: { getActiveTokens: () => [token(300)] }, ...extra });

test('runtime: lasgun with a target plays muzzle flash and shot once', async () => {
    const { vfx, played } = await runtime();
    await vfx.playShot(rollOf());
    assert.equal(played.length, 1);
    assert.equal(played[0].length, 2);
});

test('runtime: no target token, no effect (and no error)', async () => {
    const { vfx, played } = await runtime();
    await vfx.playShot(rollOf({ targetActor: { getActiveTokens: () => [] } }));
    assert.equal(played.length, 0);
});

test('runtime: without Sequencer or JB2A, or switched off, nothing plays and nothing throws', async () => {
    for (const opts of [{ sequencer: false }, { jb2a: false }, { enabled: false }]) {
        const { vfx, played } = await runtime(opts);
        await vfx.playShot(rollOf());
        await vfx.playImpact('laser', 'x');
        assert.equal(played.length, 0);
    }
});

test('runtime: missing assets only drop the effect; a failing Sequence does not throw', async () => {
    const { vfx, played } = await runtime({ known: () => false });
    await vfx.playShot(rollOf());
    assert.equal(played.length, 0);
    const r = await runtime();
    globalThis.Sequence = class { effect() { throw new Error('boom'); } };
    await r.vfx.playShot(rollOf());
});

test('runtime: psychic bolt uses its own effect; blast is sized to the radius of the rules', async () => {
    const { vfx, played } = await runtime();
    await vfx.playShot({ power: { name: 'Bolt', system: { attackType: 'Psychic Bolt' } }, sourceActor: rollOf().sourceActor, targetActor: rollOf().targetActor });
    assert.equal(played.length, 1);
    const blast = { power: { name: 'Blast', system: { attackType: 'Psychic Blast' } } };
    for (const radius of [2, 5]) {
        await vfx.playBlast(blast, token(100), radius);
        const sizes = played.at(-1).map((s) => s.calls.find(([m]) => m === 'size')[1][0]);
        assert.deepEqual(sizes, [radius * 2, radius * 2]);
    }
    // blast is not shot like a projectile
    const before = played.length;
    await vfx.playShot({ ...blast, sourceActor: rollOf().sourceActor, targetActor: rollOf().targetActor });
    assert.equal(played.length, before);
});
