# json-syntax-highlighting Specification

## Purpose

TBD - created by archiving change add-json-syntax-highlighting. Update Purpose after archive.

## Requirements

### Requirement: Formatter emits token classification on opt-in

The formatter SHALL, when called with `opts.tokens === true`, return a `tokens` field on its result describing every JSON token in the output, without altering the byte content of the `output` field or the `errors` field.

#### Scenario: Default calls are unchanged

- **WHEN** `formatString(input)` or `formatBytes(input)` is called without `opts.tokens`
- **THEN** the returned object MUST contain exactly `output` and `errors` and MUST NOT contain a `tokens` field
- **AND** the bytes in `output` MUST be byte-identical to the current formatter output for that input

#### Scenario: Opt-in returns parallel typed arrays

- **WHEN** `formatString(input, { tokens: true })` is called on valid JSON
- **THEN** the result MUST contain `tokens` with fields `offsets` (`Uint32Array`), `kinds` (`Uint8Array`), and `count` (`number`)
- **AND** `offsets.length` MUST equal `count * 2`
- **AND** `kinds.length` MUST be at least `count`
- **AND** every `(offsets[2i], offsets[2i+1])` pair MUST satisfy `0 <= start < end <= output.length`

### Requirement: Token kinds cover every JSON value and structural character

The formatter SHALL classify each emitted token into exactly one of: `key`, `string`, `number`, `boolean`, `null`, `punctuation`.

#### Scenario: Object keys are distinguished from string values

- **WHEN** the input is `{"a":"b"}`
- **THEN** the tokens for the formatted output MUST include one token of kind `key` covering `"a"` and one token of kind `string` covering `"b"`

#### Scenario: Numbers, booleans, and null are classified

- **WHEN** the input is `{"n":1,"b":true,"z":null}`
- **THEN** the token stream MUST contain kinds `key, number, key, boolean, key, null` in that order (among other punctuation tokens)

#### Scenario: Structural characters are punctuation tokens

- **WHEN** the input is `[1,2]`
- **THEN** the token stream MUST include `punctuation` tokens covering each of `[`, `,`, and `]`

### Requirement: Token offsets are UTF-16 code unit indices into the decoded formatted output

The formatter SHALL emit token offsets as UTF-16 code unit indices into the decoded `output` string (not byte indices into the raw `Uint8Array`, and not indices into the input buffer), such that slicing the decoded output string by a token's `[start, end)` pair yields the token's exact textual content. For pure-ASCII JSON these indices coincide with byte offsets; for JSON containing non-ASCII characters they do not.

#### Scenario: Slicing by offsets reproduces token text for ASCII JSON

- **WHEN** a caller formats `{"k":42}` with tokens enabled and decodes the output via `new TextDecoder().decode(output)` into a string `s`
- **THEN** for every token, `s.substring(offsets[2i], offsets[2i+1])` MUST equal the token's exact textual content (including the surrounding quotes for `key` and `string` tokens)

#### Scenario: Non-ASCII keys and strings produce correct offsets

- **WHEN** a caller formats `{"café":"日本語"}` with tokens enabled and decodes the output into a string `s`
- **THEN** the `key` token MUST satisfy `s.substring(start, end) === '"café"'`
- **AND** the `string` token MUST satisfy `s.substring(start, end) === '"日本語"'`
- **AND** no token's `[start, end)` pair MUST land in the middle of a UTF-16 surrogate pair

### Requirement: Token emission preserves hot-loop allocation discipline

The formatter SHALL NOT allocate per-token JavaScript objects in the formatting hot loop. Token storage MUST be pre-allocated typed-array buffers that grow geometrically on overflow, matching the existing output-buffer growth policy.

#### Scenario: Token buffers grow without per-token allocation

- **WHEN** the formatter is invoked on an input that produces more tokens than the initial token-buffer capacity
- **THEN** the token buffers MUST be replaced by larger typed arrays using a doubling growth strategy
- **AND** the formatter MUST NOT create any intermediate `Array`, `Object`, or boxed-number instance per token

### Requirement: Worker-backed formatter transfers tokens zero-copy

The `createFormatter()` Worker path SHALL, when `tokens: true` is requested, return the same `tokens` shape as the synchronous path, transferring the underlying buffers across `postMessage` via the transfer list.

#### Scenario: Tokens survive the Worker round trip

- **WHEN** `createFormatter().format(input, { tokens: true })` resolves
- **THEN** the resolved value MUST contain a `tokens` object with `Uint32Array` offsets and `Uint8Array` kinds
- **AND** the offsets and kinds MUST describe the same token set as the synchronous `formatString(input, { tokens: true })` call on the same input

#### Scenario: Default worker calls remain unchanged

- **WHEN** `createFormatter().format(input)` is called without `tokens: true`
- **THEN** the resolved value MUST NOT contain a `tokens` field
- **AND** the transferred byte output MUST match the current behavior exactly

### Requirement: Content script renders highlighted DOM for successfully formatted `<pre>` blocks

The Chrome extension content script SHALL, for each `<pre>` it successfully formats, replace the element's contents with a DOM tree containing one `<span>` per non-punctuation token (tagged with a class identifying its token kind) and plain text nodes for all whitespace and punctuation between those spans, while leaving any `<pre>` whose formatting produced errors entirely untouched.

#### Scenario: Valid JSON becomes highlighted spans

- **WHEN** a page contains `<pre>{"a":1}</pre>` and the content script runs
- **THEN** after formatting the `<pre>` MUST contain at least one descendant `<span>` with class `pj-key` whose text is `"a"`
- **AND** it MUST contain at least one descendant `<span>` with class `pj-number` whose text is `1`
- **AND** the `<pre>` MUST have the `json-formatted` class
- **AND** the `<pre>` MUST NOT contain any descendant `<span>` with class `pj-punct`
- **AND** the structural characters `{`, `}`, `:` MUST appear in the element's `textContent` as plain text (not wrapped in any `<span>`)

#### Scenario: Invalid JSON receives no spans

- **WHEN** a page contains `<pre>{"a":1}}</pre>` (trailing extra `}`)
- **THEN** the `<pre>` MUST NOT contain any descendant element with a `pj-` class prefix
- **AND** the `<pre>` MUST NOT have the `json-formatted` class

### Requirement: Token class names use the `pj-` prefix for five non-punctuation kinds

The content script SHALL apply CSS classes named `pj-key`, `pj-string`, `pj-number`, `pj-boolean`, and `pj-null` to spans corresponding to those five token kinds. Punctuation tokens SHALL NOT be emitted as spans; they are rendered as plain text nodes that inherit the default foreground color of `pre.json-formatted`.

#### Scenario: Each non-punctuation token kind maps to its class name

- **WHEN** a highlighted `<pre>` contains an object key, a string value, a number, a boolean, `null`, and structural punctuation
- **THEN** the DOM MUST contain at least one `<span>` for each of `pj-key`, `pj-string`, `pj-number`, `pj-boolean`, and `pj-null`
- **AND** the DOM MUST NOT contain any `<span>` with class `pj-punct`

### Requirement: Highlight stylesheet is injected once per page

The content script SHALL inject a single `<style data-pretty-json>` element into `document.head` on first highlight, defining the default theme and font, and SHALL NOT inject additional stylesheet elements on subsequent formats.

#### Scenario: Stylesheet is injected exactly once

- **WHEN** the content script formats multiple `<pre>` blocks on the same page
- **THEN** `document.querySelectorAll("style[data-pretty-json]").length` MUST equal `1`

#### Scenario: Injected stylesheet declares the JetBrains Mono `@font-face`

- **WHEN** the injected stylesheet is inspected
- **THEN** it MUST contain an `@font-face` rule with `font-family: "JetBrains Mono"` whose `src` URL is the extension-local URL of the bundled WOFF2 file (built at runtime via `chrome.runtime.getURL`)

#### Scenario: Injected stylesheet defines the OneDark-Pro palette on `pre.json-formatted`

- **WHEN** the injected stylesheet is inspected
- **THEN** it MUST set `pre.json-formatted` `background-color` to `#282c34` and `color` to `#abb2bf`
- **AND** it MUST set `pre.json-formatted` `font-family` to a list starting with `"JetBrains Mono"` and ending with a system-monospace fallback chain
- **AND** it MUST define `color` rules for `.pj-key` (`#e06c75`), `.pj-string` (`#98c379`), `.pj-number` (`#d19a66`), `.pj-boolean` (`#56b6c2`), and `.pj-null` (`#56b6c2`), each scoped under `pre.json-formatted` and using `:where(...)` for zero-specificity so page CSS can override

### Requirement: Successfully formatted `<pre>` blocks render with the default theme

The content script SHALL apply the default theme (OneDark-Pro background, OneDark-Pro default foreground, and JetBrains Mono font-family) to every `<pre>` it successfully formats, via the `.json-formatted` class it already adds today, unconditionally and regardless of the host page's existing styling or the user's `prefers-color-scheme` preference.

#### Scenario: Computed background color matches OneDark-Pro

- **WHEN** a `<pre>` is successfully formatted
- **THEN** `getComputedStyle(pre).backgroundColor` MUST correspond to `#282c34` (i.e. `rgb(40, 44, 52)`)

#### Scenario: Computed font-family starts with JetBrains Mono

- **WHEN** a `<pre>` is successfully formatted
- **THEN** `getComputedStyle(pre).fontFamily` MUST contain `"JetBrains Mono"` as the first family in the list

### Requirement: Content script preloads the default font before rendering spans

The content script SHALL wait for the `"JetBrains Mono"` font to be loaded by the browser before building the `DocumentFragment` of spans for a `<pre>`. Loading SHALL be initiated via `document.fonts.load()` or equivalent and SHALL be awaited so that the first paint of any successfully formatted `<pre>` renders in JetBrains Mono (not a fallback font followed by a swap).

#### Scenario: Font is ready before spans appear

- **WHEN** a page opens for the first time with the extension enabled and the content script successfully formats a `<pre>`
- **THEN** when the spans first become visible in the `<pre>`, `document.fonts.check('400 13px "JetBrains Mono"')` MUST return `true`
- **AND** the font load MUST NOT block rendering for longer than a practical upper bound of a few hundred milliseconds (the font is a local `chrome-extension://` resource, not a network fetch)

#### Scenario: Font load failure degrades gracefully

- **WHEN** the browser fails to load the bundled font (e.g. a restrictive page CSP `font-src` directive)
- **THEN** the content script MUST still render highlighted spans
- **AND** the `<pre>` MUST still receive the `json-formatted` class and the OneDark-Pro background
- **AND** the rendered text MUST fall through to the next family in the `font-family` fallback chain without throwing an uncaught error

### Requirement: Highlighting falls back to plain text when it cannot be applied

The content script SHALL, if style injection or DOM construction fails (for example due to page CSP or an oversized payload exceeding a configured threshold), fall back to the existing plain-text rendering path such that the `<pre>` still receives the formatted text and the `json-formatted` class, without throwing an uncaught error.

#### Scenario: Style injection failure degrades gracefully

- **WHEN** appending the injected stylesheet to `document.head` throws
- **THEN** the `<pre>` MUST still receive the plain formatted text via `textContent`
- **AND** the `<pre>` MUST still have the `json-formatted` class
- **AND** no uncaught exception MUST escape the content script

#### Scenario: Oversized payload skips highlight rendering

- **WHEN** the token count for a successfully formatted `<pre>` exceeds `HIGHLIGHT_TOKEN_THRESHOLD` (initial value `250_000`)
- **THEN** the `<pre>` MUST receive the plain formatted text via `textContent`
- **AND** the `<pre>` MUST have the `json-formatted` class
- **AND** the `<pre>` MUST still receive the OneDark-Pro background and JetBrains Mono font (the theme applies even when highlighting spans are skipped for size)
- **AND** no `pj-` spans MUST be inserted into that `<pre>`
