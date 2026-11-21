import test from 'node:test';
import assert from 'node:assert/strict';
import { assetUrl, buildPageHtml, collectIds, rewriteCssUrls, rewriteFragment, scopeCss } from '../src/module/tools/rulebook-import-lib.mjs';

const css = "*{box-sizing:border-box}body{margin:0;background:#29241c}.dh2-page{position:relative;background:url(assets/page-background.jpg) center no-repeat}h2,h3{color:#211407}#mechanic,#dice{font-size:30px}.rule:before,.rule:after{content:''}@media(max-width:700px){.dh2-page{padding:40px}.dh2-grid{gap:12px}}";
const fragment = '<article class="dh2-page"><h2 id="dice">Game Dice</h2><img class="dice" src="assets/dice.png"/><a href="#dice">Game Dice</a><a href="https://example.org">x</a></article>';

test('css is limited to the wrapper: no global selectors remain', () => {
    const out = scopeCss(css, { ids: ['dice', 'mechanic'], prefix: 'p22-' });
    assert.match(out, /\.dh2-rulebook \*\{box-sizing/);
    assert.match(out, /\.dh2-rulebook\{margin:0/); // body -> wrapper
    assert.match(out, /\.dh2-rulebook h2,\.dh2-rulebook h3\{/);
    assert.match(out, /\.dh2-rulebook #p22-mechanic,\.dh2-rulebook #p22-dice\{/);
    assert.match(out, /\.dh2-rulebook \.rule:before,\.dh2-rulebook \.rule:after\{/);
    assert.match(out, /@media\(max-width:700px\)\{\.dh2-rulebook \.dh2-page\{padding:40px\}/);
    for (const line of out.split('\n')) assert.ok(!/^(\*|body|h2|h3|p|a)[{,]/.test(line), line);
});

test('ids and anchors get a prefix, assets point to the package folder', () => {
    const { html, ids } = rewriteFragment(fragment, { prefix: 'p22-', base: 'dh2-rulebook/Seite 22' });
    assert.deepEqual(ids, ['dice']);
    assert.match(html, /id="p22-dice"/);
    assert.match(html, /href="#p22-dice"/);
    assert.match(html, /href="https:\/\/example.org"/); // external links stay
    assert.match(html, /src="dh2-rulebook\/Seite%2022\/assets\/dice\.png"/);
});

test('css urls are rewritten, data and absolute urls are not', () => {
    const out = rewriteCssUrls("a{background:url(assets/x.png)}b{background:url('/abs.png')}c{background:url(data:image/png;base64,AAA)}", 'pkg');
    assert.match(out, /url\(pkg\/assets\/x\.png\)/);
    assert.match(out, /url\('\/abs\.png'\)/);
    assert.match(out, /url\(data:/);
});

test('complete page html: style, wrapper, fragment', () => {
    const html = buildPageHtml({ fragment, css, prefix: 'p22-', base: 'dh2-rulebook/page22' });
    assert.match(html, /^<style>/);
    assert.match(html, /<div class="dh2-rulebook"><article/);
    assert.match(html, /url\(dh2-rulebook\/page22\/assets\/page-background\.jpg\)/);
    assert.deepEqual(collectIds(fragment), ['dice']);
    assert.equal(assetUrl('a/b/', './c d.png'), 'a/b/c%20d.png');
});

test('the real package css (if present locally) scopes without global selectors', async (t) => {
    const fs = await import('node:fs');
    const file = process.env.DH2_PACKAGE_CSS;
    if (!file || !fs.existsSync(file)) return t.skip('no local package');
    const out = scopeCss(fs.readFileSync(file, 'utf8'), { ids: ['dice', 'mechanic'], prefix: 'p22-' });
    assert.ok(!/(^|\n)(\*|body|h2|h3|p|a)[{,]/.test(out));
});
