## Why

The Pretty JSON Chrome extension has unit tests for the formatter core (`src/formatter.test.js`) but zero coverage for the extension integration itself — manifest loading, content-script injection, dynamic module import of `src/index.js`, Web Worker bootstrap from `src/worker.js`, and DOM rewriting of `<pre>` blocks. Regressions in `content.js`, `manifest.json`, or the worker wiring can only be caught by manual browser testing, which is slow and easily skipped. An automated end-to-end test suite that actually loads the unpacked extension in a real Chromium instance would lock in the user-visible contract: "open a page with a JSON `<pre>`, and it gets pretty-printed."

## What Changes

- Add a Playwright-based end-to-end test suite that launches Chromium with the unpacked extension loaded via `--disable-extensions-except` / `--load-extension`.
- Add fixture HTML pages served from a local static server (or `file://`) that exercise the content script: valid JSON object, valid JSON array, whitespace-prefixed JSON, invalid JSON (should be left alone), non-JSON `<pre>` (should be left alone), and a large JSON payload that forces the worker's chunked path.
- Assert the post-format DOM state: `<pre>` text content is re-indented, the `json-formatted` class is present on success, and untouched on failure cases.
- Wire the suite into `package.json` as `npm run test:e2e` and keep it separate from the fast unit test command.
- Add a short README section documenting how to run the e2e suite locally.

## Capabilities

### New Capabilities

- `extension-e2e-testing`: Automated end-to-end verification that the Chrome extension formats JSON `<pre>` blocks in a real browser, covering content-script injection, worker bootstrap, and DOM mutation.

### Modified Capabilities

<!-- None — no existing specs to modify. -->

## Impact

- **New dev dependency**: `@playwright/test` (and the Chromium browser binary it downloads).
- **New files**: `e2e/` directory containing the test runner config, fixture HTML pages, and spec files.
- **Modified files**: `package.json` (new script + devDependency), `README.md` (test instructions), `.gitignore` (Playwright artifacts: `test-results/`, `playwright-report/`).
- **No runtime code changes**: the extension itself (`content.js`, `manifest.json`, `src/`) is not modified by this change.
- **CI**: Not wired up in this change — the test command is runnable locally; CI integration is a follow-up.
