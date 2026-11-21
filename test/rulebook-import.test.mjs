import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, normalizeMetadata, splitPages, assetUrl, decodePath, normalizeFolder, buildPageHtml, collectIds, rewriteCssUrls, rewriteFragment, scopeCss } from '../src/module/tools/rulebook-import-lib.mjs';

const css = "*{box-sizing:border-box}body{margin:0;background:#29241c}.dh2-page{position:relative;background:url(assets/page-background.jpg) center no-repeat}h2,h3{color:#211407}#mechanic,#dice{font-size:30px}.rule:before,.rule:after{content:''}@media(max-width:700px){.dh2-page{padding:40px}.dh2-grid{gap:12px}}";
const fragment = '<article class="dh2-page"><h2 id="dice">Game Dice</h2><img class="dice" src="assets/dice.png"/><a href="#dice">Game Dice</a><a href="https://example.org">x</a></article>';

test('css is limited to the wrapper: no global selectors remain', () => {
    const out = scopeCss(css, { ids: ['dice', 'mechanic'], prefix: 'p22-' });
    const W = '\\.dh2-rulebook\\.dh2-rulebook\\.dh2-rulebook\\.dh2-rulebook';
    assert.match(out, new RegExp(`${W} \\*\\{box-sizing`));
    assert.match(out, new RegExp(`${W}\\{margin:0`)); // body -> wrapper
    assert.match(out, new RegExp(`${W} h2,${W} h3\\{`));
    assert.match(out, new RegExp(`${W} #p22-mechanic,${W} #p22-dice\\{`));
    assert.match(out, new RegExp(`${W} \\.rule:before,${W} \\.rule:after\\{`));
    assert.match(out, new RegExp(`@media\\(max-width:700px\\)\\{${W} \\.dh2-page\\{padding:40px\\}`));
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
    const { html, css: scoped } = buildPageHtml({ fragment, css, prefix: 'p22-', base: 'dh2-rulebook/page22' });
    assert.ok(!html.includes('<style'), 'Foundry removes style elements from journal pages');
    assert.match(html, /^<div class="dh2-rulebook"><article/);
    assert.match(scoped, /url\(dh2-rulebook\/page22\/assets\/page-background\.jpg\)/);
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

test('folder input: relative, full server path and windows slashes all end up relative to the Data folder', () => {
    assert.equal(normalizeFolder('dh2-rulebook'), 'dh2-rulebook');
    assert.equal(normalizeFolder(' /dh2-rulebook/ '), 'dh2-rulebook');
    assert.equal(normalizeFolder('/home/amp/.ampdata/instances/TTRPGServer01/foundry-vtt/data/Data/dh2-rulebook'), 'dh2-rulebook');
    assert.equal(normalizeFolder('C:\\FoundryData\\Data\\dh2-rulebook\\page 22'), 'dh2-rulebook/page 22');
    assert.equal(normalizeFolder('dh2-rulebook/data/pages'), 'dh2-rulebook/data/pages'); // relative folders stay as typed
    assert.equal(normalizeFolder(''), '');
});

test('encoded paths from the file browser are not encoded twice', () => {
    assert.equal(decodePath('dh2-rulebook/Seite%2022'), 'dh2-rulebook/Seite 22');
    assert.equal(assetUrl('dh2-rulebook/Seite%2022', 'assets/dice.png'), 'dh2-rulebook/Seite%2022/assets/dice.png');
    assert.equal(decodePath('100%'), '100%'); // not decodable: unchanged
});

const chapterFragment = '<header><h1>Chapter</h1><nav><a href="#seite-20">20</a></nav></header><main><section class="page" id="seite-20"><h2>Seite 20</h2><details><summary>Original</summary><img src="originalseiten/pdf-021.png" alt="x"></details><div class="columns"><div><pre>A</pre></div></div></section><section class="page" id="seite-21"><h2>Seite 21</h2><p><a href="#seite-20">back</a></p></section></main>';

test('metadata: format 1.0 (entry_points) and the first single page format are both read', () => {
    const modern = normalizeMetadata({ schema_version: '1.0', id: 'dh2-core-chapter-1', title: 'Chapter I', entry_points: { fragment: 'c.html', stylesheet: 'k.css' }, status: { transcription_verified: false, limitations: ['a', 'b'] } }, 'kapitel-1');
    assert.deepEqual(modern.errors, []);
    assert.equal(modern.modern, true);
    assert.equal(modern.fragment, 'c.html');
    assert.equal(modern.stylesheet, 'k.css');
    assert.equal(modern.verified, false);
    assert.deepEqual(modern.limitations, ['a', 'b']);
    const legacy = normalizeMetadata({ title: 'p22', printed_page: 22, fragment: 'f.html', stylesheet: 's.css' }, 'x');
    assert.deepEqual(legacy.errors, []);
    assert.equal(legacy.modern, false);
    assert.equal(legacy.id, 'page-22');
    assert.equal(legacy.verified, true);
});

test('metadata: missing entries give readable errors instead of a request for "undefined"', () => {
    const bad = normalizeMetadata({ schema_version: '1.0', title: 'x', entry_points: {} }, 'k');
    assert.deepEqual(bad.errors, ['metadata.json: entry_points.fragment is missing', 'metadata.json: entry_points.stylesheet is missing']);
    assert.equal(normalizeMetadata(null, 'k').errors.length, 2);
});

test('a chapter fragment is split into its pages, the preview header is dropped', () => {
    const pages = splitPages(chapterFragment);
    assert.equal(pages.length, 2);
    assert.deepEqual(pages.map((p) => [p.id, p.number, p.name]), [['seite-20', 20, 'Page 20'], ['seite-21', 21, 'Page 21']]);
    assert.ok(!pages[0].html.includes('<h2')); // the page name is shown by Foundry
    assert.ok(pages[0].html.includes('<details>'));
    assert.ok(!pages.some((p) => p.html.includes('<nav')));
    const single = splitPages('<article class="dh2-page">x</article>');
    assert.equal(single.length, 1);
    assert.equal(single[0].single, true);
});

test('anchors between the pages of a chapter keep working after the id prefix', () => {
    const ids = collectIds(chapterFragment);
    const [a, b] = splitPages(chapterFragment);
    const page = rewriteFragment(b.html, { prefix: 'ch1-', base: 'pkg', ids });
    assert.match(page.html, /href="#ch1-seite-20"/);
    const first = rewriteFragment(a.html, { prefix: 'ch1-', base: 'dh2 rulebook/kapitel', ids });
    assert.match(first.html, /src="dh2%20rulebook\/kapitel\/originalseiten\/pdf-021\.png"/);
});

test('html in the notes is escaped', () => {
    assert.equal(escapeHtml('<b>"x" & y</b>'), '&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;');
});

test('the real chapter package (if present locally) is read and split into 7 pages', async (t) => {
    const fs = await import('node:fs');
    const dir = process.env.DH2_CHAPTER_DIR;
    if (!dir || !fs.existsSync(`${dir}/metadata.json`)) return t.skip('no local package');
    const meta = normalizeMetadata(JSON.parse(fs.readFileSync(`${dir}/metadata.json`, 'utf8')), 'kapitel');
    assert.deepEqual(meta.errors, []);
    const pages = splitPages(fs.readFileSync(`${dir}/${meta.fragment}`, 'utf8'));
    assert.equal(pages.length, 7);
    assert.equal(meta.verified, false);
});
