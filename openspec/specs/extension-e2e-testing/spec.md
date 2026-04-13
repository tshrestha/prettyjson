# extension-e2e-testing Specification

## Purpose

TBD - created by archiving change add-extension-e2e-tests. Update Purpose after archive.

## Requirements

### Requirement: Unpacked extension loads in Chromium

The e2e suite SHALL launch a Chromium instance with the repository's unpacked extension loaded, such that `content.js` runs on pages served by the fixture HTTP server.

#### Scenario: Extension is active on a fixture page

- **WHEN** the suite opens any fixture page served by the fixture HTTP server
- **THEN** the extension's content script MUST execute at `document_end` against that page's DOM

#### Scenario: Extension is loaded from the repository root

- **WHEN** the Playwright runner launches Chromium
- **THEN** it MUST pass the repository root as the unpacked extension path via `--disable-extensions-except` and `--load-extension`
- **AND** it MUST use `launchPersistentContext` so the extension is actually loaded (regular contexts cannot load extensions)

### Requirement: Valid JSON object is pretty-printed

The extension SHALL format a `<pre>` containing a valid JSON object and mark it with the `json-formatted` class.

#### Scenario: Minified JSON object becomes indented

- **WHEN** a fixture page contains `<pre>{"a":1,"b":[2,3]}</pre>`
- **THEN** the `<pre>`'s `textContent` MUST be the formatter's 2-space indented output
- **AND** the `<pre>` MUST have the `json-formatted` class

### Requirement: Valid JSON array is pretty-printed

The extension SHALL format a `<pre>` containing a valid JSON array and mark it with the `json-formatted` class.

#### Scenario: Minified JSON array becomes indented

- **WHEN** a fixture page contains `<pre>[1,2,{"k":"v"}]</pre>`
- **THEN** the `<pre>`'s `textContent` MUST differ from the original minified string
- **AND** the `<pre>` MUST have the `json-formatted` class

### Requirement: Whitespace-prefixed JSON is pretty-printed

The extension SHALL format a `<pre>` whose content starts with whitespace before the opening `{` or `[`.

#### Scenario: JSON with leading newlines and spaces

- **WHEN** a fixture page contains a `<pre>` whose `textContent` begins with several spaces and a newline before `{"ok":true}`
- **THEN** the `<pre>` MUST be formatted
- **AND** the `<pre>` MUST have the `json-formatted` class

### Requirement: Invalid JSON is left untouched

The extension SHALL NOT modify a `<pre>` whose content produces any formatter errors (`unbalanced_close`, `unclosed_container`, or `unterminated_string`).

#### Scenario: Unbalanced close brace is preserved

- **WHEN** a fixture page contains `<pre>{"a":1}}</pre>` (trailing extra `}`)
- **THEN** the `<pre>`'s `textContent` MUST equal the original string
- **AND** the `<pre>` MUST NOT have the `json-formatted` class

### Requirement: Non-JSON `<pre>` blocks are ignored

The extension SHALL NOT modify a `<pre>` whose first non-whitespace character is neither `{` nor `[`.

#### Scenario: Plain-text pre is preserved

- **WHEN** a fixture page contains `<pre>hello world</pre>`
- **THEN** the `<pre>`'s `textContent` MUST equal `hello world`
- **AND** the `<pre>` MUST NOT have the `json-formatted` class

### Requirement: Large JSON payload is pretty-printed via the worker

The extension SHALL format large JSON payloads by delegating to the Web Worker chunked path without blocking or erroring.

#### Scenario: Multi-kilobyte JSON payload succeeds

- **WHEN** a fixture page contains a `<pre>` with a generated JSON payload of at least 100 KB
- **THEN** the `<pre>` MUST end up with the `json-formatted` class within the test timeout
- **AND** the `<pre>`'s `textContent` MUST contain newline characters (proving it was indented)

### Requirement: Multiple `<pre>` blocks on one page are all processed

The extension SHALL independently format every qualifying `<pre>` on the page.

#### Scenario: Mixed page with several pres

- **WHEN** a fixture page contains one valid JSON object `<pre>`, one valid JSON array `<pre>`, and one plain-text `<pre>`
- **THEN** the two JSON `<pre>`s MUST both have the `json-formatted` class
- **AND** the plain-text `<pre>` MUST NOT have that class

### Requirement: Test suite is runnable via npm script

The repository SHALL expose the e2e suite as `npm run test:e2e` and keep it separate from the existing unit-test command.

#### Scenario: Dedicated e2e command exists

- **WHEN** a developer runs `npm run test:e2e`
- **THEN** Playwright MUST execute the suite under `e2e/tests/`
- **AND** the default `npm test` command MUST continue to run only `src/formatter.test.js`

#### Scenario: Fixture HTTP server lifecycle

- **WHEN** the e2e suite starts
- **THEN** a local HTTP server MUST be started in Playwright's global setup serving the `e2e/fixtures/` directory
- **AND** the server MUST be stopped in global teardown
- **AND** tests MUST read the server base URL from a single source (e.g. `process.env.E2E_BASE_URL`) rather than hard-coding a port

### Requirement: E2E suite asserts highlighted span structure for successful formats

The e2e suite SHALL include at least one fixture page and test that verifies a successfully formatted `<pre>` contains the expected highlighted span structure emitted by the content script.

#### Scenario: Object fixture produces key and value spans

- **WHEN** the e2e suite opens a fixture page containing `<pre>{"a":1,"s":"v","b":true,"z":null}</pre>`
- **THEN** the `<pre>` MUST have the `json-formatted` class
- **AND** the `<pre>` MUST contain at least one descendant `span.pj-key`
- **AND** the `<pre>` MUST contain at least one descendant `span.pj-number`
- **AND** the `<pre>` MUST contain at least one descendant `span.pj-string`
- **AND** the `<pre>` MUST contain at least one descendant `span.pj-boolean`
- **AND** the `<pre>` MUST contain at least one descendant `span.pj-null`
- **AND** the `<pre>` MUST contain at least one descendant `span.pj-punct`

#### Scenario: Large payload still renders highlighted spans below the size threshold

- **WHEN** the e2e suite opens a fixture page containing a generated JSON payload that is large enough to take the worker path but small enough to stay below the highlight size threshold
- **THEN** the `<pre>` MUST end up with the `json-formatted` class within the test timeout
- **AND** the `<pre>` MUST contain at least one descendant `span.pj-punct`

### Requirement: E2E suite asserts no highlight markup on invalid JSON

The e2e suite SHALL verify that `<pre>` blocks whose content produces formatter errors receive neither the `json-formatted` class nor any `pj-`-prefixed descendant elements.

#### Scenario: Invalid JSON fixture has no highlight spans

- **WHEN** the e2e suite opens a fixture page containing `<pre>{"a":1}}</pre>`
- **THEN** the `<pre>`'s `textContent` MUST equal the original string
- **AND** the `<pre>` MUST NOT have the `json-formatted` class
- **AND** the `<pre>` MUST NOT contain any descendant element whose `className` begins with `pj-`

### Requirement: E2E suite asserts a single stylesheet is injected per page

The e2e suite SHALL verify that the content script injects exactly one identifiable stylesheet into a page that contains multiple highlightable `<pre>` blocks.

#### Scenario: Only one `data-pretty-json` style element exists

- **WHEN** the e2e suite opens a fixture page containing multiple valid JSON `<pre>` blocks
- **THEN** `document.querySelectorAll("style[data-pretty-json]").length` MUST equal `1` after the suite waits for the `<pre>`s to be marked with `json-formatted`
