## ADDED Requirements

### Requirement: Repository provides a packaging script invocable via `npm run package`

The repository SHALL contain an executable Node script at `scripts/package.js` and a corresponding `package` entry in `package.json`'s `"scripts"` block that invokes it via `node scripts/package.js`. Running `npm run package` from the repository root SHALL be the sole supported entry point for producing an upload-ready zip of the extension.

#### Scenario: A maintainer runs the package script

- **WHEN** a maintainer runs `npm run package` from the repository root on macOS or Linux
- **THEN** Node invokes `scripts/package.js`
- **AND** the script produces a zip at `dist/prettyjson-<version>.zip` where `<version>` is taken from `manifest.json`'s `version` field
- **AND** the script exits with status `0` on success

#### Scenario: The script runs without network or install

- **WHEN** a maintainer runs `npm run package` on a machine that has already run `npm install` once
- **THEN** the script completes without making any network request
- **AND** the script does not require installing any additional npm dependency beyond what is already in `package.json`

### Requirement: The output zip contains only runtime files, with `manifest.json` at the zip root

The zip produced by `npm run package` SHALL contain exactly the files listed below, with paths relative to the zip root matching the paths that `manifest.json` uses to reference them. `manifest.json` SHALL be at the zip root, not inside any subdirectory. The zip SHALL NOT contain any file not on this list.

**Allowlist (at time of authoring — updated as the runtime footprint evolves):**

- `manifest.json`
- `content.js`
- `src/index.js`
- `src/client.js`
- `src/worker.js`
- `src/formatter.js`
- `src/chunker.js`
- `src/constants.js`
- `themes/fonts/JetBrainsMono-Regular.woff2`
- `icons/logo-16.png`
- `icons/logo-32.png`
- `icons/logo-48.png`
- `icons/logo-128.png`

The zip SHALL NOT contain any file from `node_modules/`, `e2e/`, `openspec/`, `spike-highlight/`, `themes/OneDark-Pro.json`, `themes/fonts/OFL.txt`, `icons/logo.svg`, `src/formatter.test.js`, `README.md`, `LICENSE`, `package.json`, `package-lock.json`, `dprint.json`, `.gitignore`, `.DS_Store`, `.idea/`, `.claude/`, `test-results/`, or `playwright-report/`.

#### Scenario: An uploaded zip is inspected

- **WHEN** a reviewer runs `unzip -l dist/prettyjson-<version>.zip`
- **THEN** `manifest.json` appears in the listing with no directory prefix (i.e., at the zip root, not inside a subfolder)
- **AND** every file listed above under the allowlist appears in the zip exactly once
- **AND** no file outside the allowlist appears in the zip (directory entries like `src/` are permitted as container metadata but every non-directory entry MUST be in the allowlist)

#### Scenario: A development file leaks into the zip

- **WHEN** the zip is inspected and it contains any of `node_modules/`, `e2e/`, `openspec/`, `spike-highlight/`, `src/formatter.test.js`, `package.json`, `package-lock.json`, `dprint.json`, `README.md`, `LICENSE`, `icons/logo.svg`, or any hidden dotfile
- **THEN** the packaging script is incorrect and MUST be fixed before the zip is uploaded to the Chrome Web Store

### Requirement: The script cross-checks the manifest against the allowlist and fails on mismatch

Before producing a zip, the script SHALL parse `manifest.json` and enumerate every file path it references via `content_scripts[].js`, `web_accessible_resources[].resources`, and `icons`. The script SHALL confirm that every such path is present on disk and is included in the allowlist. If any manifest-referenced path is missing on disk, or is not in the allowlist, the script SHALL print an error naming the mismatched path(s) and exit with a non-zero status without producing a zip.

#### Scenario: A new runtime file is added to `manifest.json` but not to the allowlist

- **WHEN** a contributor adds a new `web_accessible_resources[0].resources` entry to `manifest.json` that points at a file not present in `scripts/package.js`'s allowlist
- **AND** the contributor runs `npm run package`
- **THEN** the script prints an error identifying the missing path
- **AND** the script exits with a non-zero status
- **AND** no partial or corrupt zip is written to `dist/`

#### Scenario: A file referenced by `manifest.json` is deleted from disk

- **WHEN** a file referenced by `manifest.json` (for example, `src/chunker.js`) is deleted from the working tree
- **AND** a maintainer runs `npm run package`
- **THEN** the script prints an error identifying the missing file
- **AND** the script exits with a non-zero status
- **AND** no zip is written to `dist/`

### Requirement: The script derives the output filename from `manifest.json`'s version

The output zip SHALL be written to `dist/prettyjson-<version>.zip`, where `<version>` is the exact string value of `manifest.json`'s top-level `version` field (for example, `1.0.0`). The script SHALL create the `dist/` directory if it does not exist. If a file already exists at the output path, the script SHALL overwrite it without prompting.

#### Scenario: A maintainer runs the script twice in a row

- **WHEN** a maintainer runs `npm run package`
- **AND** then runs `npm run package` again without changing anything
- **THEN** both runs succeed with exit status `0`
- **AND** the second run overwrites the zip from the first run at the same path
- **AND** the second run does not error out because the file already exists

#### Scenario: The version is bumped in the manifest

- **WHEN** a maintainer edits `manifest.json` to change `"version": "1.0.0"` to `"version": "1.1.0"`
- **AND** runs `npm run package`
- **THEN** the script writes `dist/prettyjson-1.1.0.zip`
- **AND** the previously produced `dist/prettyjson-1.0.0.zip` is NOT deleted, NOT renamed, and NOT modified

### Requirement: The script prints a short success report identifying the zip and its contents

On successful completion, the script SHALL print to standard output: the absolute or repository-relative path to the produced zip, the zip's size in human-readable form (bytes or kilobytes), the number of entries in the zip, and an explicit line confirming that `manifest.json` is at the zip root. The report SHALL fit within 10 lines of terminal output.

#### Scenario: A maintainer reads the output

- **WHEN** a maintainer runs `npm run package`
- **THEN** the terminal shows the output path of the zip
- **AND** the terminal shows the zip's size
- **AND** the terminal shows the entry count
- **AND** the terminal shows a line confirming `manifest.json` is at the zip root

### Requirement: The script does not modify any repository file outside `dist/`

The script SHALL NOT modify, create, or delete any file under the repository root other than files inside `dist/` and files inside whatever temporary staging directory the script creates and cleans up. The script SHALL NOT modify `manifest.json`, any source file under `src/`, `content.js`, any file under `themes/`, any file under `icons/`, any test file, any openspec file, any package file, or any git-metadata file.

#### Scenario: A maintainer inspects the working tree after running the script

- **WHEN** a maintainer runs `npm run package`
- **AND** then runs `git status`
- **THEN** the only new or modified paths are under `dist/`
- **AND** no tracked file has been modified by the script

### Requirement: The repository's `.gitignore` excludes `dist/`

The repository's `.gitignore` SHALL contain a `dist/` entry (with or without trailing slash) so that zip artifacts produced by `npm run package` are not accidentally committed to version control.

#### Scenario: A maintainer produces a zip and runs git status

- **WHEN** a maintainer runs `npm run package`
- **AND** then runs `git status --porcelain`
- **THEN** no file under `dist/` appears in the git status output

#### Scenario: A maintainer runs git add .

- **WHEN** a maintainer runs `git add .` after producing a zip
- **THEN** no file under `dist/` is staged for commit
