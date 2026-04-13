## ADDED Requirements

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
