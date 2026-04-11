## 1. Project Setup

- [x] 1.1 Add `@playwright/test` as a devDependency in `package.json` at a pinned minor version
- [x] 1.2 Add `test:e2e` script to `package.json` that runs `playwright test --config e2e/playwright.config.js`
- [x] 1.3 Install the pinned Playwright Chromium browser binary (`npx playwright install chromium`) and document the step in `README.md`
- [x] 1.4 Append Playwright output directories (`test-results/`, `playwright-report/`, `e2e/.cache/`) to `.gitignore`

## 2. Fixture HTTP Server

- [x] 2.1 Create `e2e/global-setup.js` that starts a Node `http.createServer` serving files from `e2e/fixtures/` on an ephemeral port
- [x] 2.2 Expose the server base URL via `process.env.E2E_BASE_URL` so tests read a single source of truth
- [x] 2.3 Create a matching teardown hook that stops the server after the run
- [x] 2.4 Verify the server returns `text/html` for `.html` requests and 404s for missing files

## 3. Playwright Configuration

- [x] 3.1 Create `e2e/playwright.config.js` with `testDir: "./tests"`, `globalSetup`, `globalTeardown`, and a 10-second per-test timeout
- [x] 3.2 Configure a single Chromium project using `launchPersistentContext` with `--disable-extensions-except=<repo root>` and `--load-extension=<repo root>`
- [x] 3.3 Default to `headless: false`; switch to `headless: "new"` when `process.env.HEADLESS === "1"`
- [x] 3.4 Resolve the extension path relative to `e2e/playwright.config.js` so the config works regardless of invocation CWD

## 4. Fixture Pages

- [x] 4.1 Create `e2e/fixtures/object.html` with a single `<pre>` containing a minified JSON object
- [x] 4.2 Create `e2e/fixtures/array.html` with a single `<pre>` containing a minified JSON array
- [x] 4.3 Create `e2e/fixtures/whitespace.html` with a `<pre>` whose JSON is preceded by spaces and newlines
- [x] 4.4 Create `e2e/fixtures/invalid.html` with a `<pre>` containing `{"a":1}}` (unbalanced close — triggers a formatter error so content.js leaves it alone)
- [x] 4.5 Create `e2e/fixtures/plain.html` with a `<pre>` containing `hello world`
- [x] 4.6 Create `e2e/fixtures/large.html` with an inline `<script>` that builds a ≥100 KB JSON payload and writes it into a `<pre>` before `document_end`
- [x] 4.7 Create `e2e/fixtures/multi.html` with three `<pre>` blocks: one object, one array, one plain text

## 5. Test Spec

- [x] 5.1 Create `e2e/tests/format.spec.js` importing `@playwright/test`
- [x] 5.2 Add a test that opens `object.html` and asserts the `<pre>` gains `json-formatted` AND its `textContent` matches the expected pretty-printed string (canonical sanity check)
- [x] 5.3 Add a test that opens `array.html` and asserts `json-formatted` class + `textContent` changed
- [x] 5.4 Add a test that opens `whitespace.html` and asserts `json-formatted` class is added
- [x] 5.5 Add a test that opens `invalid.html` and asserts `textContent` is unchanged AND no `json-formatted` class
- [x] 5.6 Add a test that opens `plain.html` and asserts `textContent === "hello world"` AND no `json-formatted` class
- [x] 5.7 Add a test that opens `large.html` and asserts the `<pre>` gains `json-formatted` within the timeout AND output contains `\n`
- [x] 5.8 Add a test that opens `multi.html` and asserts both JSON pres gain `json-formatted` while the plain pre does not
- [x] 5.9 Use auto-waiting assertions (`toHaveClass`, `expect.poll`) — no `page.waitForTimeout`

## 6. Documentation

- [x] 6.1 Add a "Running end-to-end tests" section to `README.md` covering: `npm install`, `npx playwright install chromium`, `npm run test:e2e`, and the `HEADLESS=1` opt-in
- [x] 6.2 Note the pinned Playwright version and the rationale for headed-by-default in the README section

## 7. Verification

- [x] 7.1 Run `npm run test:e2e` locally and confirm all specs pass
- [x] 7.2 Run `npm test` and confirm the unit-test command is unchanged and still green
- [x] 7.3 Temporarily break `content.js` (e.g. comment out the `el.classList.add` line) and confirm the suite fails loudly, proving the tests actually exercise the extension
- [x] 7.4 Revert the temporary break and re-run to confirm green
- [x] 7.5 Run `dprint fmt` to ensure new files match repo formatting
