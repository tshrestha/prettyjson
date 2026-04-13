## MODIFIED Requirements

### Requirement: Content script renders highlighted DOM for successfully formatted `<pre>` blocks

The Chrome extension content script SHALL, for each `<pre>` it successfully formats, replace the element's contents with a DOM tree containing:

1. A single `.pj-gutter` span holding the line-number text (see the `line-numbers` capability for gutter semantics), followed by
2. A single `.pj-code` span containing one `<span>` per non-punctuation token (tagged with a class identifying its token kind) and plain text nodes for whitespace.

Within `.pj-code`, every object `{…}` and array `[…]` in the formatted output SHALL be represented by a `.pj-container` element whose opener and closer punctuation live in its `.pj-opener` and `.pj-closer` child elements, and whose inner tokens and whitespace live in its `.pj-content` child (see the `collapsible-nodes` capability for the full container shape). Non-container punctuation (`,` and `:`) SHALL continue to appear as plain text nodes and MUST NOT be wrapped in any `<span class="pj-...">` element.

The script SHALL leave any `<pre>` whose formatting produced errors entirely untouched.

#### Scenario: Valid JSON becomes highlighted spans inside a code column

- **WHEN** a page contains `<pre>{"a":1}</pre>` and the content script runs
- **THEN** after formatting the `<pre>` MUST have the `json-formatted` class
- **AND** the `<pre>` MUST contain a descendant `.pj-code` element
- **AND** `.pj-code` MUST contain exactly one descendant `.pj-container` whose `data-kind` is `"object"`
- **AND** inside that container's `.pj-content` there MUST be at least one `<span>` with class `pj-key` whose text is `"a"`
- **AND** inside that container's `.pj-content` there MUST be at least one `<span>` with class `pj-number` whose text is `1`
- **AND** the `<pre>` MUST NOT contain any descendant `<span>` with class `pj-punct`
- **AND** the structural characters `,` and `:` MUST appear in `.pj-code`'s visible `textContent` as plain text (not wrapped in any `<span class="pj-...">`)

#### Scenario: Invalid JSON receives no spans, no gutter, and no containers

- **WHEN** a page contains `<pre>{"a":1}}</pre>` (trailing extra `}`)
- **THEN** the `<pre>` MUST NOT contain any descendant element with a `pj-` class prefix (no `pj-key`, `pj-string`, `pj-gutter`, `pj-code`, `pj-container`, etc.)
- **AND** the `<pre>` MUST NOT have the `json-formatted` class
