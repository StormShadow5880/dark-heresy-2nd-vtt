import test from 'node:test';
import assert from 'node:assert/strict';
import { readReaction, reactionsLeft, useReaction, forceReaction, addExtraReaction, forfeitReaction, restoreReaction, reactionView } from '../src/module/rules/reactions.mjs';

const fresh = (round = 1) => readReaction(null, round);

test('one Reaction per round; a new round gives it back', () => {
    let s = fresh();
    assert.equal(reactionsLeft(s), 1);
    s = useReaction(s, 'a:1').state;
    assert.equal(reactionsLeft(s), 0);
    assert.equal(useReaction(s, 'b:1').status, 'none-left');
    assert.equal(reactionsLeft(readReaction(s, 1)), 0, 'same round: still used');
    assert.equal(reactionsLeft(readReaction(s, 2)), 1, 'next round: available again');
});

test('the same event never uses a second Reaction (repeated socket message, redraw)', () => {
    let s = addExtraReaction(fresh());
    const first = useReaction(s, 'attack1:target');
    assert.equal(first.status, 'used');
    const again = useReaction(first.state, 'attack1:target');
    assert.equal(again.status, 'already');
    assert.equal(reactionsLeft(again.state), 1, 'the extra Reaction is not spent by the repeat');
    assert.equal(useReaction(again.state, 'attack2:target').status, 'used');
});

test('Defensive Stance gives one more, All Out Attack gives it up', () => {
    assert.equal(reactionsLeft(addExtraReaction(fresh())), 2);
    assert.equal(reactionsLeft(forfeitReaction(fresh())), 0);
    assert.equal(useReaction(forfeitReaction(fresh()), 'x').status, 'none-left');
});

test('the GM can allow a Reaction that is not left; it is shown as over the limit', () => {
    let s = useReaction(fresh(), 'a').state;
    const forced = forceReaction(s, 'b');
    assert.equal(forced.status, 'forced');
    assert.equal(reactionView(forced.state).over, true);
    assert.equal(reactionsLeft(forced.state), 0);
});

test('restore takes the last Reaction back', () => {
    const s = useReaction(fresh(), 'a').state;
    const back = restoreReaction(s);
    assert.equal(reactionsLeft(back), 1);
    assert.deepEqual(back.keys, []);
    assert.equal(restoreReaction(fresh()).used, 0);
});

test('the view', () => {
    assert.equal(reactionView(fresh()).text, '1 Reaction left');
    assert.equal(reactionView(useReaction(fresh(), 'a').state).text, 'No Reaction left');
    assert.equal(reactionView(forfeitReaction(fresh())).text, 'Reaction given up this round');
    assert.deepEqual(reactionView(addExtraReaction(fresh())).pips.map((p) => p.on), [true, true]);
});
