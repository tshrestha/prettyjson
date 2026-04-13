## Why

Pretty JSON is a Chrome MV3 extension that is currently installable only via **Load unpacked** from a cloned repository. Publishing it to the Chrome Web Store (or sharing a pre-built package with a tester) requires a single `.zip` file whose root contains `manifest.json` and every file the manifest references — and _only_ the runtime files. Today, there is no way to produce that zip without a developer manually hand-selecting files, which is error-prone: it's easy to accidentally include `node_modules/`, `e2e/`, `openspec/`, tests, dev tooling configs, or OS junk like `.DS_Store`, any of which either bloats the upload or triggers a Web Store rejection.

A repeatable, source-controlled packaging script removes the manual step. It produces an identical, minimal, upload-ready zip every time, named after the current `manifest.json` version so consecutive releases don't collide. It also codifies the allowlist of what ships as the extension runtime — a useful artifact in its own right, because right now "what does the extension actually need at runtime?" is only answerable by reading `manifest.json` and `content.js` together.

## What Changes

- Add a new `scripts/package.js` executable Node script that builds a Chrome Web Store-compatible zip from the current working tree.
- Add a new `package` npm script in `package.json` that invokes `node scripts/package.js`. Running `npm run package` is the sole public entry point.
- The script SHALL stage files into a temporary directory, copy the allowlist (manifest, `content.js`, `src/*.js` except test files, `themes/fonts/JetBrainsMono-Regular.woff2`, and the four `icons/logo-*.png` files referenced by `manifest.json`), zip the staged contents with `manifest.json` at the zip root, and emit the result to `dist/prettyjson-<version>.zip` where `<version>` comes from `manifest.json`'s `version` field.
- The script SHALL exclude everything else by default. No glob patterns, no implicit inclusion — if a file is not on the allowlist, it is not in the zip.
- The script SHALL print a short report on success: the zip path, its size in KB, the number of entries, and confirmation that `manifest.json` is at the zip root.
- Add a new `dist/` directory to `.gitignore` so release artifacts are not committed.
- No changes to any source file under `src/`, any test, the content script, or the extension's runtime behavior. This is a build/packaging addition only.

## Capabilities

### New Capabilities

- `extension-packaging`: governs the repeatable build process that produces a Chrome Web Store-compatible zip of the extension. Establishes the allowlist of files that ship at runtime, the output path/naming convention (`dist/prettyjson-<manifest-version>.zip`), the requirement that `manifest.json` sit at the zip root, and the rule that the script exits non-zero if the staged output is missing any manifest-referenced file.

### Modified Capabilities

_None. No existing capability describes a build or packaging step today._

## Impact

- **New files**:
  - `scripts/package.js` — the packaging script.
  - `.gitignore` — one new line: `dist/`.
- **Modified files**:
  - `package.json` — add a `"package"` entry under `"scripts"`.
- **Affected code**: none of the extension's runtime source. No changes to `content.js`, `src/**`, `themes/`, `icons/`, or `manifest.json`.
- **Affected users**:
  - Maintainers can now run `npm run package` to produce a Web Store-ready zip.
  - End users are unaffected until a packaged zip is actually uploaded to the Web Store. This change only adds the _ability_ to produce one.
- **New dependencies**: none. The script uses only Node built-ins (`node:fs`, `node:path`, `node:child_process`) and the system `zip` command, which is present on macOS by default. Linux has `zip` in every common distro's package list; Windows native does not ship it, but the project's existing tooling (`dprint`, `playwright`) already targets a POSIX-ish dev environment, so this is consistent with the current baseline.
- **Risk**: low. The script never touches any source file — it reads, copies to a staging dir, zips, and deletes the staging dir. Its only filesystem side effect outside the staging area is writing to `dist/`. If the script breaks, the worst case is a missing or malformed zip; the repository is untouched. The script never runs as part of the default test suite or `npm install`, so a broken script cannot break unit tests or CI.
