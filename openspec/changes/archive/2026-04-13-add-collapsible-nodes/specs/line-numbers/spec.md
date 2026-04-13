## MODIFIED Requirements

### Requirement: Content script renders a line-number gutter alongside successfully formatted `<pre>` blocks

The Chrome extension content script SHALL, for each `<pre>` it successfully formats, render a left-hand line-number gutter as a sibling of the code column inside the same `<pre>`. The gutter SHALL contain one line number per **visible** logical row of formatted output, starting at `1` and incrementing by one, where "visible" means rows whose text is rendered given the current expanded/collapsed state of any `collapsible-nodes` containers in the code column. The gutter SHALL be produced for both the highlighted-span render path and the above-threshold plain-text fallback path.

#### Scenario: Small highlighted document gets numbered gutter

- **WHEN** a page contains `<pre>{"a":1,"b":2}</pre>` and the content script formats it with highlighting enabled
- **THEN** the resulting `<pre class="json-formatted">` MUST contain a descendant element with class `pj-gutter`
- **AND** the `pj-gutter` element's `textContent` MUST be exactly the newline-joined sequence `1\n2\n3\n4` (four visible rows: `{`, `"a": 1,`, `"b": 2`, `}`)
- **AND** the `<pre>` MUST also contain a descendant element with class `pj-code` holding the formatted token spans

#### Scenario: Above-threshold document still shows a gutter

- **WHEN** the content script formats a `<pre>` whose formatted token count exceeds `HIGHLIGHT_TOKEN_THRESHOLD`
- **THEN** the `<pre>` MUST contain a `pj-gutter` element whose line count equals `countNewlines(result.output) + 1`
- **AND** the `pj-code` element MUST contain the plain formatted text (no `pj-` token spans and no `pj-container` descendants)
- **AND** the `<pre>` MUST still have the `json-formatted` class

#### Scenario: Invalid JSON renders no gutter

- **WHEN** a page contains malformed JSON (e.g. `<pre>{"a":1}}</pre>`) that the formatter reports errors for
- **THEN** the `<pre>` MUST NOT contain any descendant with class `pj-gutter`
- **AND** the `<pre>` MUST NOT have the `json-formatted` class

#### Scenario: Collapsing a container shrinks the gutter to match visible rows

- **WHEN** a user toggles a `.pj-container` inside a formatted `<pre>`
- **THEN** after the toggle, the number of newline-separated entries in the `pj-gutter` MUST equal the number of visible rows in the sibling `pj-code` element
- **AND** the last entry in the gutter MUST equal that visible row count
