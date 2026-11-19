const gulp = require('gulp');
const prefix = require('gulp-autoprefixer');
const yaml = require("js-yaml");
const merge = require("merge-stream");
const clean = require("gulp-clean");
const sourcemaps = require('gulp-sourcemaps');
const sass = require('gulp-sass')(require('sass'));
const fs = require("fs");
const path = require("path");
const zip = require("gulp-zip");

const util = require('util');
if (!util.isDate) {
  util.isDate = (d) => Object.prototype.toString.call(d) === '[object Date]';
}

const SYSTEM = JSON.parse(fs.readFileSync("src/system.json"));
const SYSTEM_SCSS = ["src/scss/**/*.scss"];
const STATIC_FILES = [
  "src/icons/**/*",
  "src/module/**/*",
  "!src/module/foundry-core/**",
  "src/templates/**/*",
  "src/images/**/*",
  "src/*.json"
];
const PACK_SRC = "src/packs";
const BUILD_DIR = "build/dark-heresy-2nd";

/* ----------------------------------------- */
/*  Compile Packs
/* ----------------------------------------- */

/**
 * Compiles the YAML sources in src/packs/<name>/*.yml into LevelDB compendium packs
 * (the only format Foundry V13+ can load).
 * Documents are normalised on the way: legacy `data` is renamed to `system` and a stable
 * `_id` / `_key` is generated when the source does not provide one.
 */
async function compilePacks() {
  const { compilePack } = await import("@foundryvtt/foundryvtt-cli");
  const crypto = require("crypto");
  const folders = fs.readdirSync(PACK_SRC).filter((file) => fs.statSync(path.join(PACK_SRC, file)).isDirectory());
  const tmpRoot = path.resolve(__dirname, "build", ".pack-tmp");
  fs.rmSync(tmpRoot, { recursive: true, force: true });

  const stableId = (pack, name, index) =>
    crypto.createHash("sha1").update(`${pack}:${name}:${index}`).digest("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 16);

  for (const folder of folders) {
    const meta = SYSTEM.packs.find((p) => p.name === folder);
    const docType = meta?.type ?? "Item";
    const collection = docType === "RollTable" ? "tables" : "items";
    const tmpDir = path.join(tmpRoot, folder);
    fs.mkdirSync(tmpDir, { recursive: true });

    const seen = new Set();
    let counter = 0;
    for (const file of fs.readdirSync(path.join(PACK_SRC, folder)).filter((f) => f.endsWith(".yml"))) {
      const docs = yaml.loadAll(fs.readFileSync(path.join(PACK_SRC, folder, file), "utf8")).filter(Boolean);
      for (const doc of docs) {
        if (doc.data !== undefined && doc.system === undefined) {
          doc.system = doc.data;
          delete doc.data;
        }
        doc._id = doc._id ?? stableId(folder, doc.name, counter);
        while (seen.has(doc._id)) doc._id = stableId(folder, doc.name, ++counter);
        seen.add(doc._id);
        counter++;
        doc._key = `!${collection}!${doc._id}`;
        // Embedded documents need their own key as well
        for (const [i, result] of (doc.results ?? []).entries()) {
          result._id = result._id ?? stableId(`${folder}.results`, `${doc.name}${i}`, i);
          result._key = `!${collection}.results!${doc._id}.${result._id}`;
        }
        for (const [i, effect] of (doc.effects ?? []).entries()) {
          effect._id = effect._id ?? stableId(`${folder}.effects`, `${doc.name}${i}`, i);
          effect._key = `!${collection}.effects!${doc._id}.${effect._id}`;
        }
        fs.writeFileSync(path.join(tmpDir, `${doc._id}.json`), JSON.stringify(doc));
      }
    }
    const dest = path.resolve(__dirname, BUILD_DIR, "packs", folder);
    fs.rmSync(dest, { recursive: true, force: true });
    await compilePack(tmpDir, dest);
    console.log(`Compiled pack ${folder} (${seen.size} documents)`);
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

/* ----------------------------------------- */
/*  Compile Sass
/* ----------------------------------------- */

// Small error handler helper function.
function handleError(err) {
  console.log(err.toString());
  this.emit('end');
}

function compileScss() {
  // Configure options for sass output. For example, 'expanded' or 'nested'
  let options = {
    outputStyle: 'expanded'
  };
  return gulp.src(SYSTEM_SCSS)
    .pipe(
      sass(options)
        .on('error', handleError)
    )
    .pipe(prefix({
      cascade: false
    }))
    .pipe(gulp.dest(BUILD_DIR + "/css"))
}
const css = gulp.series(compileScss);

/* ----------------------------------------- */
/*  Copy Static
/* ----------------------------------------- */

function copyFiles() {
  return gulp.src(STATIC_FILES, {base: "src",}).pipe(gulp.dest(BUILD_DIR));
}

/* ----------------------------------------- */
/*  Other
/* ----------------------------------------- */

function cleanBuild() {
  return gulp.src(`${BUILD_DIR}`, { allowEmpty: true }, { read: false }).pipe(clean({force: true}));
}

function watchUpdates() {
  return gulp.watch(STATIC_FILES, gulp.series(cleanBuild, compileScss, compilePacks, copyFiles));
}

function watchCopy() {
  return gulp.watch(STATIC_FILES, gulp.series(copyFiles));
}

function createArchive() {
  return gulp.src(`${BUILD_DIR}/**`)
      .pipe(zip(`dark-heresy-2nd-${SYSTEM.version}.zip`))
      .pipe(gulp.dest('./archive'));
}

/* ----------------------------------------- */
/*  Export Tasks
/* ----------------------------------------- */

exports.clean = gulp.series(cleanBuild);
exports.scss = gulp.series(compileScss);
exports.packs = gulp.series(compilePacks);
exports.copy = gulp.series(copyFiles, watchCopy);
exports.build = gulp.series(cleanBuild, compileScss, copyFiles, compilePacks, createArchive);
exports.default = gulp.series(cleanBuild, compileScss, copyFiles, compilePacks, watchUpdates);
