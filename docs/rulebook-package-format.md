# Rulebook package format 1.0

One package = one chapter. Every chapter uses exactly this structure, so all chapters can be imported the same way with the
macro **Import Rulebook Pages** (see [rulebook-import.md](rulebook-import.md)). Packages contain copyrighted material and stay in
your own Foundry Data folder; they never go into the repository.

## Folder layout (in the Foundry Data folder)

```
Data/dh2_rulebook/                      <- one folder for the whole book (any name, the macro asks for it)
    kapitel-01/                         <- one folder per chapter
        metadata.json
        chapter.fragment.html
        kapitel.css
        assets/                         <- images used by the css / fragment (ornaments, backgrounds, artwork)
        originalseiten/                 <- optional: images of the original pages for comparison
    kapitel-02/
        ...
```

The importer takes every folder below the chosen one that contains a `metadata.json` (up to five levels deep) and imports all of them in one go.
Importing again updates the journals; nothing is duplicated.

## metadata.json

```json
{
  "schema_version": "1.0",
  "id": "dh2-core-chapter-1",
  "title": "Chapter I: Playing the Game",
  "language": "en",
  "source": { "document": "Dark Heresy Second Edition Core Rulebook", "printed_pages": { "first": 20, "last": 26 } },
  "entry_points": { "fragment": "chapter.fragment.html", "stylesheet": "kapitel.css" },
  "status": {
    "transcription_verified": false,
    "ready_for_production_import": false,
    "limitations": ["PDF text extraction includes encoding errors."]
  },
  "rights": "Private use"
}
```

Required: `schema_version` (`"1.0"`), `id` (unique per chapter, lowercase letters/digits/hyphens), `title`, `entry_points.fragment`, `entry_points.stylesheet`.
`status` is optional. If `transcription_verified` or `ready_for_production_import` is `false` (or `limitations` are given) the importer adds a first page
**Import notes** that lists the limitations, so a draft is never mistaken for a checked text.

## Fragment

* One `<section class="page" id="seite-NN">` per printed page, `NN` = the printed page number. Each section becomes one journal page named `Page NN`
  (journal search finds text per page; the page order follows the number).
* The first `<h2>` of a section is dropped (the page name is shown by Foundry). Put chapter / section headings below it as `<h2>`, `<h3>`.
* Everything outside the sections (preview header, navigation) is ignored.
* No `<script>`, no external URLs. Images with relative paths (`assets/...`, `originalseiten/...`), resolved from the package folder.
* Links between pages: `<a href="#seite-21">`. IDs must be unique within the chapter.
* Tables as real `<table>` markup, not as preformatted text.

## Stylesheet

Plain CSS for the fragment. Global selectors (`body`, `*`, `h2`, ...) are allowed: the importer limits every rule to the imported pages. Images in the CSS
are relative to the package folder (`url(assets/page-background.jpg)`).

## Check before you upload

```bash
node scripts/validate-rulebook-package.mjs path/to/kapitel-01 path/to/kapitel-02
```

It checks `metadata.json`, the files named in it, missing images, duplicate ids and broken page links. Fix everything marked `X`.

## Instruction for GPT (copy into the prompt for every chapter)

> Create the package for chapter N as a folder `kapitel-0N` exactly in "Rulebook package format 1.0": `metadata.json` (schema_version "1.0", id `dh2-core-chapter-N`,
> title, entry_points.fragment `chapter.fragment.html`, entry_points.stylesheet `kapitel.css`, status with `transcription_verified` and `limitations`),
> the fragment with one `<section class="page" id="seite-NN">` per printed page (NN = printed page number, first element `<h2>Seite NN</h2>`), headings as h2/h3,
> tables as `<table>`, no `<script>`, no `<pre>` for running text, images under `assets/` and optional page images under `originalseiten/`, links only as `#seite-NN` or to anchors that exist.
> Use the same `kapitel.css` and the same `assets/` as chapter 1 unless a chapter needs more. Mark every passage you are unsure about with `<mark>` and list it in `status.limitations`.
> Do not shorten or summarise the text.

## Single page packages (older format)

The first package (`DH2_Page22_Integrationspaket`: `fragment`, `stylesheet`, `printed_page` at the top level, no `schema_version`) is still imported, as one page of the
journal *Rulebook (private import)*. Use format 1.0 for everything new.
