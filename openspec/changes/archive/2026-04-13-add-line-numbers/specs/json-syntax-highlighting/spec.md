## MODIFIED Requirements

### Requirement: Content script renders highlighted DOM for successfully formatted `<pre>` blocks

The Chrome extension content script SHALL, for each `<pre>` it successfully formats, replace the element's contents with a DOM tree containing:

1. A single `.pj-gutter` span holding the line-number text (see the `line-numbers` capability for gutter semantics), followed by
2. A single `.pj-code` span containing one `<span>` per non-punctuation token (tagged with a class identifying its token kind) and plain text nodes for all whitespace and punctuation between those spans.

The script SHALL leave any `<pre>` whose formatting produced errors entirely untouched.

#### Scenario: Valid JSON becomes highlighted spans inside a code column

- **WHEN** a page contains `<pre>{"a":1}</pre>` and the content script runs
- **THEN** after formatting the `<pre>` MUST have the `json-formatted` class
- **AND** the `<pre>` MUST contain a descendant `.pj-code` element
- **AND** inside `.pj-code` there MUST be at least one `<span>` with class `pj-key` whose text is `"a"`
- **AND** inside `.pj-code` there MUST be at least one `<span>` with class `pj-number` whose text is `1`
- **AND** the `<pre>` MUST NOT contain any descendant `<span>` with class `pj-punct`
- **AND** the structural characters `{`, `}`, `:` MUST appear in the `.pj-code` element's `textContent` as plain text (not wrapped in any `<span>`)

#### Scenario: Invalid JSON receives no spans and no gutter

- **WHEN** a page contains `<pre>{"a":1}}</pre>` (trailing extra `}`)
- **THEN** the `<pre>` MUST NOT contain any descendant element with a `pj-` class prefix (no `pj-key`, `pj-string`, `pj-gutter`, `pj-code`, etc.)
- **AND** the `<pre>` MUST NOT have the `json-formatted` class

### Requirement: Highlighting falls back to plain text when it cannot be applied

The content script SHALL, if style injection or DOM construction fails (for example due to page CSP or an oversized payload exceeding a configured threshold), fall back to the existing plain-text rendering path such that the `<pre>` still receives the formatted text and the `json-formatted` class, without throwing an uncaught error. In the fallback, the formatted text SHALL be placed inside the `.pj-code` column alongside the `.pj-gutter` so that line numbers still display.

#### Scenario: Style injection failure degrades gracefully

- **WHEN** appending the injected stylesheet to `document.head` throws
- **THEN** the `<pre>` MUST still receive the plain formatted text (either via `textContent` on the `<pre>` directly or inside a `.pj-code` child)
- **AND** the `<pre>` MUST still have the `json-formatted` class
- **AND** no uncaught exception MUST escape the content script

#### Scenario: Oversized payload skips highlight rendering but keeps the gutter

- **WHEN** the token count for a successfully formatted `<pre>` exceeds `HIGHLIGHT_TOKEN_THRESHOLD` (initial value `250_000`)
- **THEN** the `<pre>` MUST contain a `.pj-code` element whose text content is the plain formatted output
- **AND** the `<pre>` MUST contain a `.pj-gutter` element whose line count matches the number of lines in the formatted output
- **AND** the `<pre>` MUST have the `json-formatted` class
- **AND** the `<pre>` MUST still receive the OneDark-Pro background and JetBrains Mono font
- **AND** no `pj-` token spans (`pj-key`, `pj-string`, `pj-number`, `pj-boolean`, `pj-null`) MUST be inserted into that `<pre>`
