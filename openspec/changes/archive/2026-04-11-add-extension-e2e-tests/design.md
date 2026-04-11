## Context

Pretty JSON is a Manifest V3 Chrome extension. `content.js` runs at `document_end` on every page, scans for `<pre>` blocks whose first non-whitespace character is `{` or `[`, dynamically imports `src/index.js` via `chrome.runtime.getURL(...)` (requires `web_accessible_resources`), spins up a Web Worker from `src/worker.js`, and rewrites the element's `textContent` with the formatted output plus a `json-formatted` class.

Current test coverage is limited to `src/formatter.test.js`, which exercises the pure formatter via `node --test`. Nothing tests the extension glue: manifest correctness, content-script matches, dynamic import path, worker bootstrap, or the actual DOM mutation. A silent failure in any of those would ship without any automated signal.

**Constraints:**

- Extension is MV3; content scripts cannot use ES-module `import` statements directly — they rely on dynamic `import(chrome.runtime.getURL(...))`. The test harness must load the extension as an unpacked directory, not bundle it.
- The project uses plain ESM with no build step. The e2e tooling must not force a bundler on the rest of the repo.
- The only existing dev dependency is `dprint`. Keep the footprint small.

## Goals / Non-Goals

**Goals:**

- Launch a real Chromium instance with the unpacked extension loaded, open a fixture page, and assert the content script pretty-printed the `<pre>`.
- Cover the user-visible contract across the main branches in `content.js`: valid object, valid array, whitespace-prefixed JSON, invalid JSON (left alone), non-JSON `<pre>` (left alone), and a large payload that forces the worker's chunked formatting path.
- Make the suite runnable with a single `npm run test:e2e` command and keep the fast unit-test command (`npm test`) untouched.

**Non-Goals:**

- Cross-browser testing (Firefox, Edge). Chromium is the only target.
- Publishing-pipeline testing (Chrome Web Store packaging, update manifests).
- Visual regression / screenshot testing of the formatted output styling.
- Continuous integration wiring — this change produces a locally-runnable suite; CI is a follow-up.
- Replacing the unit tests in `src/formatter.test.js`.

## Decisions

### Decision: Use Playwright as the e2e runner

Playwright has first-class support for loading unpacked Chrome extensions via `chromium.launchPersistentContext` with `--disable-extensions-except=<path>` and `--load-extension=<path>`. It bundles its own Chromium, has a stable test runner with fixtures and parallelism, and ships TypeScript types but runs plain JS fine.

**Alternatives considered:**

- **Puppeteer** — also supports unpacked extensions, but its built-in test runner story is weaker (you bring your own, e.g. Mocha). More wiring for the same result.
- **Selenium WebDriver** — heavier, slower, more flake-prone for MV3 extensions. No advantage here.
- **Hand-rolled Node script driving headless Chrome via CDP** — maximum control but reinvents the wheel and adds maintenance cost.

Playwright wins on ergonomics and the fact that it is the current de-facto standard for this kind of test.

### Decision: Headed mode with `launchPersistentContext`, not headless

MV3 service workers and content scripts historically misbehave in Chromium's old headless mode. Playwright's docs explicitly recommend headed mode (or `--headless=new`) for extension tests. We will use `launchPersistentContext` with `headless: false` locally, and `headless: "new"` if/when we move to CI. Persistent context is required because extensions can't be loaded in a regular browser context.

### Decision: Serve fixtures from a local static HTTP server, not `file://`

`file://` URLs work with the manifest's `file:///*` match, but some Chromium behaviors (CORS, dynamic module import, worker URLs) are subtly different on `file://`. Serving fixtures over `http://localhost:<port>` matches the real-world usage pattern and avoids an entire class of "works on file:// but not on the web" surprises. We will start a tiny Node `http.createServer` in a Playwright global setup hook and tear it down on teardown. No extra dependency.

**Alternative:** use `file://` directly. Rejected because the extension's primary use case is web pages, and we would rather catch web-page regressions than file-specific ones.

### Decision: Assert on `textContent` + `json-formatted` class, not pixel-perfect output

The unit tests in `src/formatter.test.js` already verify exact formatter output for a wide range of inputs. The e2e suite's job is to prove the extension wiring works, not to re-test the formatter. Each e2e assertion will check:

1. The `<pre>`'s `textContent` differs from the original (for success cases) or is unchanged (for failure cases).
2. The `json-formatted` class is present / absent as expected.
3. For one canonical case, the output matches an expected pretty-printed string exactly — as a sanity check that the extension is actually using the real formatter and not some stub.

### Decision: Wait for format completion via `expect.poll`, not fixed timeouts

`content.js` formats asynchronously (dynamic import → worker round-trip). Tests will use Playwright's `expect.poll(...).toBe(...)` or `locator.toHaveClass("json-formatted")` with the default auto-waiting, which retries until the assertion passes or times out. No `page.waitForTimeout` — that is flaky and slow.

### Decision: Keep e2e tests in a top-level `e2e/` directory

- `e2e/playwright.config.js` — config, test dir, global setup
- `e2e/fixtures/*.html` — fixture pages
- `e2e/tests/format.spec.js` — the actual tests
- `e2e/global-setup.js` — starts and stops the fixture HTTP server

Top-level `e2e/` keeps it clearly separate from `src/` (unit-testable pure code) and the extension root files (`content.js`, `manifest.json`).

## Risks / Trade-offs

- **Playwright adds ~300MB (Chromium download) to dev installs** → Mitigation: document that `npm run test:e2e` is opt-in; do not run it from the default `npm test`. Developers who only touch the formatter core can skip installing browsers.
- **MV3 extension loading is sensitive to Chromium version drift** → Mitigation: pin `@playwright/test` to a known-good minor version; bump deliberately. Document the pinned version in README.
- **Headed mode is annoying on developer machines** → Mitigation: support `HEADLESS=1 npm run test:e2e` that passes `headless: "new"` through the config, for developers who want to run it in the background.
- **Flake from the worker bootstrap race** → Mitigation: auto-waiting assertions plus a generous per-test timeout (e.g. 10s). If flake appears we can add a retry count in the config.
- **Fixture HTTP server port collision** → Mitigation: bind to port 0 and read the assigned port in global setup; expose it to tests via `process.env.E2E_BASE_URL`.

## Migration Plan

No runtime migration — this change adds only test infrastructure. Rollback is deleting `e2e/` and reverting `package.json` + `.gitignore`.
