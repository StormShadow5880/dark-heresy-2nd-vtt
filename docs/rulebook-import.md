# Rulebook import (private)

Package structure (for every chapter) and a prompt for GPT: [rulebook-package-format.md](rulebook-package-format.md).

Rulebook page packages (HTML fragment + CSS + assets, e.g. `DH2_Page22_Integrationspaket`) contain copyrighted material
and are marked for private use. They are therefore **not part of this repository** (see `.gitignore`) and are never built into a
release. The system only ships the importer.

## Use

1. Copy the package folder into your Foundry **Data** directory, e.g. `Data/dh2-rulebook/DH2_Page22_Integrationspaket/`
   (the folder that contains `metadata.json`). A folder with several packages as sub folders works as well.
2. In Foundry run the macro **Import Rulebook Pages** (created once for the GM when the world starts) or `await game.dh.importRulebookPages();`
   and confirm the folder (default `dh2-rulebook`).
3. Every package becomes a journal in the folder **Rulebook (private import)**, one journal page per printed page (format 1.0). Running the macro again updates them. The macro imports ALL packages below the folder in one go, so you can drop in chapter after chapter and run it again.

## What the import does

* Limits the package CSS to a wrapper class (`body`, `*`, `h2`, ... would restyle the whole of Foundry).
* Prefixes ids and in-page anchors (`#dice` -> `#p22-dice`) so pages do not clash.
* Points the images to the package folder in your data directory.
* Foundry removes `<style>` from journal pages. The scoped CSS is therefore stored in a flag of the page (`flags.dark-heresy-2nd.rulebookCss`) and injected into the document as one style element (`#dh2-rulebook-css`) when the world starts and whenever a journal page changes. Its rules all start with the wrapper class, so nothing else is affected.
* Edit the package and import again instead of editing the page.

Code: `src/module/tools/rulebook-import.mjs` (Foundry part), `rulebook-import-lib.mjs` (pure helpers, tested in `test/rulebook-import.test.mjs`).
