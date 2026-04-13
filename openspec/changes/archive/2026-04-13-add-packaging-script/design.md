## Context

The Pretty JSON repository is a monorepo-ish layout: the extension runtime (`manifest.json`, `content.js`, `src/*.js`, `themes/`, `icons/`) sits next to the unit test suite (`src/formatter.test.js`), the Playwright e2e suite (`e2e/`), documentation tooling (`openspec/`), experimental spikes (`spike-highlight/`), development configs (`dprint.json`, `package.json`, `package-lock.json`), and standard developer cruft (`node_modules/`, `test-results/`, `playwright-report/`, `.idea/`, `.DS_Store`, `.claude/`).

Chrome Web Store's [packaging requirements](https://developer.chrome.com/docs/webstore/prepare) boil down to three hard rules:

1. `manifest.json` must be at the **root** of the zip, not inside a subdirectory.
2. Every file `manifest.json` references must be present in the zip, at the path the manifest declares.
3. Total zip size must be ≤ 2 GB.

Everything else is judgment. There is no official list of "forbidden" files — the Web Store will accept an extension with a `README.md` or a stray `.gitignore`, but doing so bloats the upload and exposes implementation details to anyone who unzips it. The cleanest uploads contain only what the extension needs to run.

The current `manifest.json` references:

- `content.js`
- `src/index.js`, `src/client.js`, `src/worker.js`, `src/formatter.js`, `src/chunker.js`, `src/constants.js` (via `web_accessible_resources`)
- `themes/fonts/JetBrainsMono-Regular.woff2` (via `web_accessible_resources`)
- `icons/logo-16.png`, `icons/logo-32.png`, `icons/logo-48.png`, `icons/logo-128.png` (via `icons`)

Twelve runtime files total, plus `manifest.json` itself. Everything else in the repository is dev/test/tooling and should not ship.

## Goals / Non-Goals

**Goals:**

- Produce an upload-ready `dist/prettyjson-<version>.zip` with a single command: `npm run package`.
- Include **exactly** the 13 runtime files listed above (manifest + 12 referenced files). Nothing more, nothing less.
- Place `manifest.json` at the **root** of the zip, not inside a `prettyjson/` subdirectory. This is a Chrome Web Store requirement.
- Derive the version number from `manifest.json`'s `version` field so the output path is predictable and consecutive releases don't overwrite each other.
- Exit with a non-zero status if any manifest-referenced file is missing on disk, so a broken source tree can't produce a silently-corrupt upload.
- Print a one-screen summary on success: output path, size, entry count, and confirmation that manifest sits at the root.
- No new npm dependencies. Use only Node built-ins and the system `zip` command.

**Non-Goals:**

- No code minification, tree-shaking, or bundling. The extension ships the same source files Chrome loads in the Load-unpacked flow. If that ever changes (e.g., to rollup the worker), it's a separate change.
- No code signing, no `.crx` generation. The Web Store uses zip uploads; `.crx` is the older self-hosted format and is out of scope.
- No Chrome Web Store upload automation. This change produces the artifact; uploading is still a manual step.
- No cross-platform `zip` shim. macOS and Linux have `zip` out of the box; Windows users would need to install it (via Git Bash, WSL, or `7z`). That's consistent with the repo's existing baseline (Playwright, dprint) and doesn't justify a Node-zip dependency for a one-file script.
- No watch mode or incremental packaging. The whole zip is rebuilt every run. At ~13 small files this takes a fraction of a second.
- No version bumping — the script reads the version, it does not write it. Version bumps are a human editorial decision.
- No inclusion of `README.md`, `LICENSE`, or the SVG source (`icons/logo.svg`). They are not referenced by the runtime. Attribution is already baked into the README served from the repo; shipping it inside the zip duplicates it for no benefit.

## Decisions

### Decision: Explicit allowlist, not glob exclusion

**What**: The script contains a literal JavaScript array of the 13 runtime file paths. To add a runtime file to the extension, a future contributor must add it to that array.

**Why**: This is the safest default for a Chrome extension. If the packaging logic were "include everything except X" with a blacklist of dev files, a new directory added to the repo in the future would be silently picked up and shipped to users. A new file of secrets, a new spike, a new half-finished feature — all would leak into the next upload. An allowlist makes the failure mode "I forgot to add my new file to `scripts/package.js`, so it's missing from the zip" — which is caught by the script's own missing-file check, then fixed in one line. The failure mode of the blacklist approach is "I shipped something I didn't mean to," which is unrecoverable once uploaded.

**Alternatives considered**:

- _Blacklist (include everything except `node_modules`, `e2e`, etc.)_: the inverse of the above. Silent-add is a real hazard for an extension that runs on every page of every tab a user visits — leaking test fixtures or internal spikes to the Web Store would be embarrassing at best.
- _Use `git archive`_: ships exactly tracked files, which excludes `node_modules` and `.DS_Store` for free. But it _includes_ `e2e/`, `openspec/`, `README.md`, tests, and everything else that is tracked. We'd still need a post-archive filter, which defeats the simplicity.
- _Derive allowlist from `manifest.json` programmatically_: parse the manifest and walk its references (`content_scripts[].js`, `web_accessible_resources[].resources`, `icons{}`). This would make adding a new runtime file automatic. Rejected for a first cut because it adds a small JSON-walker with its own edge cases (e.g., `background.service_worker` doesn't exist in this extension today, but if it were added the walker would need a new case). The literal array is a dozen strings; the programmatic version is a hundred lines of manifest-shape knowledge. We can always upgrade to it later if the allowlist grows.

### Decision: System `zip` via `child_process.execFileSync`, not a Node zip library

**What**: The script shells out to the system `zip` command to produce the archive. The repo gains no new npm dependencies.

**Why**: `archiver`, `jszip`, and `adm-zip` are all reasonable choices for a Node-native approach, but every one of them is a new `devDependency`, a new entry in `package-lock.json`, a new audit surface, and a new thing a future `npm audit` can flag. System `zip` has been shipping in macOS and every mainstream Linux distro for 30+ years and is byte-stable. For a 13-file static archive there is nothing a Node library does better.

**Alternatives considered**:

- _`archiver` as a devDependency_: cleanest Node API, cross-platform Windows-included. Rejected for the no-new-deps goal. Reconsider only if a Windows contributor actually files an issue.
- _Hand-rolled zip encoder using `node:zlib`_: technically possible (PKZip format isn't complex for stored/deflated entries), but several hundred lines of code to replace two lines of `execFileSync`. Overkill.
- _`npx archiver-cli ...`_: downloads on every run, slow, and defeats the offline-friendly goal.

### Decision: Stage to a temp directory, then zip the staging directory's _contents_

**What**: The script creates a scratch directory (e.g., `dist/.stage-<timestamp>`), copies each allowlisted file into it at the path that matches the manifest's references, then invokes `zip -r ../prettyjson-<version>.zip .` from inside the staging directory. This produces a zip whose entries are `manifest.json`, `content.js`, `src/index.js`, etc. — with `manifest.json` at the root, which is what Chrome requires.

**Why**: The naive alternative — zipping the file paths relative to the repo root — works, but only because the runtime files happen to already live at paths that match the manifest's references. If we ever move `content.js` out of the repo root, the naive approach would break. Staging makes the zip-root invariant explicit and decouples the on-disk layout from the zip layout.

**Alternatives considered**:

- _Zip directly from the repo root with an explicit file list_: simpler, works today, but implicitly couples repo layout to zip layout. If the extension runtime is ever reorganized (for example, moved under a `runtime/` folder to make room for a build output in the repo root), the naive approach silently produces a wrong zip.
- _Generate the zip file entries manually via a zip library's stream API_: same result, more code, and pulls in a dep.

### Decision: Output path is `dist/prettyjson-<version>.zip`, version read from `manifest.json`

**What**: The script parses `manifest.json`, reads the `version` field (a string like `"1.0.0"`), and writes to `dist/prettyjson-<version>.zip`. The `dist/` directory is created if missing. Existing files at the output path are **overwritten** without prompting.

**Why**: Predictable, versioned, and scriptable from CI. "Overwrite without prompting" is safer than "fail if exists" because re-running the script after fixing a build issue is the common case during a release, and failing out would force the human to manually delete the stale zip. The Chrome Web Store accepts only one active upload at a time anyway, so there's no risk of confusing "which zip is the current one" — the one on disk matches the current `manifest.json`.

**Alternatives considered**:

- _Include a timestamp in the filename_: `dist/prettyjson-1.0.0-2026-04-13.zip`. Defeats the "predictable name CI can reference" goal.
- _Put the zip at `build/`, `out/`, or `release/`_: `dist/` is the most common convention in the JS ecosystem for built artifacts. No strong opinion; `dist/` it is.
- _Fail if the output file exists_: rejected above.

### Decision: Script exits non-zero if any manifest-referenced file is missing

**What**: Before zipping, the script walks its allowlist and confirms each path exists on disk. If any are missing, it prints an error listing the missing files and exits with status `1`.

**Why**: Silent success on a broken source tree is exactly the failure mode a packaging script is supposed to prevent. A missing `src/chunker.js` in the zip would cause the extension to fail to load for end users; catching that locally before upload is cheap insurance.

**Alternatives considered**:

- _Warn but continue_: the zip would still be produced and could be uploaded. Unacceptable for an extension where runtime missing-file means broken user experience.

### Decision: Do not ship `README.md`, `LICENSE`, or `icons/logo.svg`

**What**: The allowlist excludes all three. The zip contains only runtime files.

**Why**: `README.md` and `LICENSE` are useful on the repo, not inside the extension's runtime bundle — they don't get displayed to end users in any Chrome surface. The Chrome Web Store has its own metadata fields for description and license. `icons/logo.svg` is the source-of-truth SVG that the four PNG exports are generated from; the extension only references the PNGs (via `manifest.json`'s `icons` field), so the SVG is dev-only.

**Alternatives considered**:

- _Include `LICENSE` for compliance_: some developers ship the MIT license inside the extension "just in case." The license's terms are satisfied by it being present in the source repo, which is already public, and the Chrome Web Store listing surfaces license information separately. No functional benefit.
- _Include `README.md` so users who unzip the file see a description_: the target audience for `unzip prettyjson-1.0.0.zip` is essentially "Chrome Web Store reviewers and deeply curious users." Both groups can read the README on GitHub.

## Risks / Trade-offs

- **[Risk] A new runtime file is added in a future change and the contributor forgets to update `scripts/package.js`** → Mitigation: the script fails loud at package time (missing-file check) if the manifest references a file that isn't in the allowlist — because the missing-file check walks the allowlist and the missing file is literally not there. Actually this mitigation is backwards; see the stronger mitigation below.
- **[Risk, stronger framing] A new runtime file is referenced by `manifest.json` but not added to the allowlist** → Mitigation: the script parses `manifest.json` and cross-checks every path referenced (in `content_scripts[].js`, `web_accessible_resources[].resources`, and `icons{}`) against the allowlist. If the manifest references a file the allowlist doesn't include, the script fails with a clear error naming the missing path. This turns "silently ship an incomplete zip" into "visible failure with an actionable fix — add the path to the allowlist in `scripts/package.js`."
- **[Risk] System `zip` not present on a contributor's machine** → Mitigation: the script checks for `zip` on startup and exits with a clear error telling the contributor how to install it (macOS: built-in; Ubuntu: `apt install zip`; Windows: install Git Bash or WSL). This is a one-time, one-line install for new contributors.
- **[Risk] `dist/` tracked in git by accident** → Mitigation: `.gitignore` entry added in the same change. The script itself does not `git add`.
- **[Risk] The produced zip is larger than a Chrome Web Store upload limit** → Mitigation: the runtime footprint is currently ~100 KB (the JetBrainsMono woff2 is the biggest file, at ~31 KB uncompressed; everything else is JS source totaling ~60 KB). The Web Store limit is 2 GB. There is no realistic risk of exceeding it with this allowlist. The script can print a warning if the zip is over a soft limit (e.g., 10 MB) as a sanity check.
- **[Trade-off] Adding a runtime file requires editing both `manifest.json` and `scripts/package.js`** → Yes, that's the cost of the allowlist approach. Design decision above explains why this is preferable to the alternative. Future upgrade path: derive the allowlist from the manifest automatically. Out of scope for this change.
- **[Trade-off] No Windows support out of the box** → Consistent with the repo's existing baseline. Filing a Windows issue can be a separate change that either adds a Node zip library or provides a PowerShell shim.
