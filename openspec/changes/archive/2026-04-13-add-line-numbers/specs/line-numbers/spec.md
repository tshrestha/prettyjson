## ADDED Requirements

### Requirement: Content script renders a line-number gutter alongside successfully formatted `<pre>` blocks

The Chrome extension content script SHALL, for each `<pre>` it successfully formats, render a left-hand line-number gutter as a sibling of the code column inside the same `<pre>`. The gutter SHALL contain one line number per logical line of formatted output, starting at `1` and incrementing by one. The gutter SHALL be produced for both the highlighted-span render path and the above-threshold plain-text fallback path.

#### Scenario: Small highlighted document gets numbered gutter

- **WHEN** a page contains `<pre>{"a":1,"b":2}</pre>` and the content script formats it with highlighting enabled
- **THEN** the resulting `<pre class="json-formatted">` MUST contain a descendant element with class `pj-gutter`
- **AND** the `pj-gutter` element's `textContent` MUST be exactly the newline-joined sequence `1\n2\n3\n4` (four lines: `{`, `"a": 1,`, `"b": 2`, `}`)
- **AND** the `<pre>` MUST also contain a descendant element with class `pj-code` holding the formatted token spans

#### Scenario: Above-threshold document still shows a gutter

- **WHEN** the content script formats a `<pre>` whose formatted token count exceeds `HIGHLIGHT_TOKEN_THRESHOLD`
- **THEN** the `<pre>` MUST contain a `pj-gutter` element whose line count equals `countNewlines(result.output) + 1`
- **AND** the `pj-code` element MUST contain the plain formatted text (no `pj-` token spans)
- **AND** the `<pre>` MUST still have the `json-formatted` class

#### Scenario: Invalid JSON renders no gutter

- **WHEN** a page contains malformed JSON (e.g. `<pre>{"a":1}}</pre>`) that the formatter reports errors for
- **THEN** the `<pre>` MUST NOT contain any descendant with class `pj-gutter`
- **AND** the `<pre>` MUST NOT have the `json-formatted` class

### Requirement: Gutter text is excluded from text selection and clipboard

The gutter element SHALL have CSS `user-select: none` applied via the injected stylesheet, and SHALL carry `aria-hidden="true"`. Selection performed inside or across the formatted `<pre>` MUST NOT include gutter digits.

#### Scenario: Select-all then copy yields only formatted JSON

- **WHEN** the user focuses a successfully formatted `<pre>`, invokes Select All, and copies
- **THEN** the clipboard text MUST equal the raw formatted JSON output exactly, with no line-number characters prepended to any line

#### Scenario: Gutter is aria-hidden

- **WHEN** a successfully formatted `<pre>` is inspected
- **THEN** its `pj-gutter` descendant MUST have attribute `aria-hidden="true"`

### Requirement: Gutter column auto-sizes to the widest line number

The `<pre class="json-formatted">` element SHALL use a CSS grid layout that places the gutter as a first column sized to its own content and the code as a second column that consumes the remaining space. The gutter text SHALL be right-aligned so that all line numbers end on the same column boundary regardless of digit count.

#### Scenario: Grid template auto-sizes the gutter

- **WHEN** a `<pre class="json-formatted">` is inspected via `getComputedStyle`
- **THEN** its `display` MUST be `grid`
- **AND** its `grid-template-columns` MUST place the `pj-gutter` before the `pj-code` and size the gutter to its content (not a fixed width in px)

#### Scenario: Gutter text is right-aligned

- **WHEN** the injected stylesheet is inspected
- **THEN** it MUST contain a rule setting `text-align: right` on `pre.json-formatted .pj-gutter`

#### Scenario: Long documents produce wider gutters without overlap

- **WHEN** the content script formats a document whose formatted output contains at least 100 lines
- **THEN** every line number rendered in the gutter (from `1` through the last line) MUST appear in the gutter's `textContent` in order, separated by `\n`
- **AND** the visual right edge of the three-digit and two-digit numbers MUST align (verified by the right-alignment rule above)

### Requirement: Gutter is themed to match OneDark-Pro

The injected stylesheet SHALL style the gutter with a muted foreground color, the same `#282c34` background as the code column, and the same `"JetBrains Mono"` font-family as `pre.json-formatted`, so that the gutter row height matches the code row height exactly.

#### Scenario: Gutter foreground uses OneDark-Pro comment color

- **WHEN** the injected stylesheet is inspected
- **THEN** it MUST set `color: #5c6370` on `pre.json-formatted .pj-gutter`

#### Scenario: Gutter inherits code font

- **WHEN** a `<pre class="json-formatted">` is inspected after format
- **THEN** `getComputedStyle` of its `pj-gutter` descendant MUST report a `font-family` starting with `"JetBrains Mono"`
- **AND** its computed `font-size` and `line-height` MUST equal those of its `pj-code` sibling

### Requirement: Stylesheet injection covers gutter rules without adding elements

The single `<style data-pretty-json>` element injected by `ensureStylesheet` SHALL include all gutter-related CSS (grid layout on `pre.json-formatted`, plus color, `user-select`, alignment, and padding rules for `.pj-gutter`). No additional `<style>`, `<link>`, or class attributes on `document.head` SHALL be introduced for line numbers.

#### Scenario: Still exactly one pretty-json style element

- **WHEN** the content script formats multiple `<pre>` blocks on the same page
- **THEN** `document.querySelectorAll("style[data-pretty-json]").length` MUST equal `1`
- **AND** that single stylesheet's `textContent` MUST contain a `.pj-gutter` selector block with `user-select: none`
