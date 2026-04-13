## 1. Pre-flight

- [x] 1.1 Confirm the system has `/usr/bin/zip` (macOS and Linux ship it by default). On a dev machine without `zip`, install it (macOS: preinstalled; Debian/Ubuntu: `apt-get install zip`; Windows: install via Git Bash or WSL). The script will also include its own runtime check.
- [x] 1.2 Re-read `manifest.json` and confirm the 12 runtime files referenced from it match the allowlist in `design.md`: `content.js`, the six `src/*.js` files, `themes/fonts/JetBrainsMono-Regular.woff2`, and the four `icons/logo-*.png` files. If the manifest has drifted, update `design.md` and `specs/extension-packaging/spec.md` to match before writing the script.

## 2. Author `scripts/package.js`

- [x] 2.1 Create the `scripts/` directory at the repository root.
- [x] 2.2 Author `scripts/package.js` as an ES module (`#!/usr/bin/env node` shebang, `import` syntax since `package.json` sets `"type": "module"`). Use only Node built-ins: `node:fs`, `node:fs/promises`, `node:path`, `node:url`, `node:child_process`, `node:os`.
- [x] 2.3 At the top of the script, declare a single `const ALLOWLIST = [...]` array listing exactly the 13 runtime files from the spec (manifest + 12 referenced files). This is the source of truth for what ships.
- [x] 2.4 Read and parse `manifest.json`. Extract the `version` field. Extract every file path referenced via `content_scripts[].js`, `web_accessible_resources[].resources`, and `icons`. Build a `Set` of these referenced paths.
- [x] 2.5 Cross-check: confirm every path in the referenced set is also in `ALLOWLIST`. If any referenced path is missing from `ALLOWLIST`, print an error naming the path(s) and `process.exit(1)` before doing any filesystem work.
- [x] 2.6 Cross-check: confirm every path in `ALLOWLIST` exists on disk via `fs.existsSync`. If any are missing, print an error naming the missing file(s) and `process.exit(1)`.
- [x] 2.7 Verify the system `zip` command is present by checking that `child_process.execFileSync('zip', ['-v'])` succeeds. If it throws, print an install hint and `process.exit(1)`.
- [x] 2.8 Compute the output path: `dist/prettyjson-${manifest.version}.zip`. Create `dist/` if it does not exist via `fs.mkdirSync('dist', { recursive: true })`. Remove any existing file at the output path.
- [x] 2.9 Create a staging directory under the OS temp dir, e.g. via `fs.mkdtempSync(path.join(os.tmpdir(), 'prettyjson-pkg-'))`. For each path in `ALLOWLIST`, `fs.mkdirSync(path.join(staging, path.dirname(entry)), { recursive: true })` and `fs.copyFileSync(entry, path.join(staging, entry))`.
- [x] 2.10 Invoke `zip` from inside the staging directory to produce the archive, using `child_process.execFileSync('zip', ['-r', '-X', outputZipAbsPath, '.'], { cwd: staging, stdio: 'inherit' })`. The `-X` flag strips extra file attributes (e.g., macOS extended attributes) so the zip is byte-identical across machines. The trailing `.` (not `prettyjson/`) ensures files are at the zip root.
- [x] 2.11 Immediately delete the staging directory via `fs.rmSync(staging, { recursive: true, force: true })`. Place this in a `try/finally` so the staging dir is cleaned up even if `zip` fails.
- [x] 2.12 Verify the produced zip by running `unzip -l <outputZipAbsPath>` via `execFileSync` and parsing the listing. Confirm that (a) `manifest.json` is present and at the zip root (no directory prefix), (b) the entry count equals `ALLOWLIST.length`, and (c) every allowlisted path appears in the listing. Fail with a clear error if any check fails.
- [x] 2.13 Print the success report: output path (relative to repo root), size in KB (via `fs.statSync`), entry count, and a line confirming `manifest.json` is at the zip root. Keep it under 10 lines.
- [x] 2.14 `chmod +x scripts/package.js` so it can be invoked directly (`./scripts/package.js`), though the canonical invocation is via `npm run package`.

## 3. Wire into `package.json` and `.gitignore`

- [x] 3.1 Add `"package": "node scripts/package.js"` to the `"scripts"` block of `package.json`. Place it alphabetically between `"fmt"` and `"test"` if those are the surrounding keys, or wherever matches the existing key order.
- [x] 3.2 Add `dist/` to `.gitignore` (as a new line). Keep existing entries unchanged.
- [x] 3.3 Run `npm run fmt` so `dprint` reformats `package.json` and any other touched files.

## 4. Verify the script end-to-end

- [x] 4.1 Run `npm run package` from a clean working tree. Confirm it exits with status `0` and prints the success report.
- [x] 4.2 Run `unzip -l dist/prettyjson-1.0.0.zip` manually and confirm: (a) `manifest.json` is the first entry and has no directory prefix, (b) the entry count is exactly 13, (c) every file in the `ALLOWLIST` from `scripts/package.js` appears exactly once, (d) no file from `node_modules/`, `e2e/`, `openspec/`, `spike-highlight/`, `src/formatter.test.js`, `themes/OneDark-Pro.json`, `themes/fonts/OFL.txt`, `icons/logo.svg`, `package.json`, `README.md`, or any hidden dotfile appears.
- [x] 4.3 Extract the zip to a temp directory (`mkdir /tmp/pj-test && cd /tmp/pj-test && unzip ~/projects/prettyjson/dist/prettyjson-1.0.0.zip`). Inside `/tmp/pj-test`, load the directory as an unpacked extension in `chrome://extensions` and confirm it loads without errors — this proves the zip is self-contained and Chrome accepts it as a valid extension directory structure. Verified by the user.
- [x] 4.4 Run `npm run package` a second time without any changes. Confirm it still succeeds and overwrites `dist/prettyjson-1.0.0.zip` without prompting.
- [x] 4.5 Temporarily rename `src/chunker.js` to `src/chunker.js.bak` and run `npm run package`. Confirm it fails with a clear error identifying the missing file and exits non-zero. Restore `src/chunker.js` and rerun `npm run package` to confirm success.
- [x] 4.6 Run `git status` and confirm the only tracked file changes are `package.json`, `.gitignore`, and the new `scripts/package.js`. Confirm no file inside `dist/` appears in `git status` (it should be ignored).

## 5. Scope and content-preservation checks

- [x] 5.1 Run `npm test` and confirm the unit test suite still reports 77/77 passing. (Sanity check — the packaging script doesn't touch `src/`, but this is cheap insurance.)
- [x] 5.2 Run `git diff --stat -- content.js 'src/**' 'e2e/**' 'themes/**' icons/` and confirm the output is empty. The packaging change must not touch any runtime source.
- [x] 5.3 Run `openspec validate add-packaging-script --strict` and confirm it passes.
