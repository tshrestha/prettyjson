## Why

Formatted JSON in `<pre>` blocks is currently rendered as plain monochrome text. Readers have to scan structure visually to distinguish keys from values, strings from numbers, and literals from punctuation. Syntax highlighting is the single largest readability improvement we can ship on top of the existing pretty-printer, and the byte-level formatter already sees every token boundary as it walks the input — we can emit highlighting information at essentially zero extra cost.

## What Changes

- Extend the streaming formatter to emit token spans (key, string, number, boolean, null, punctuation) alongside the existing byte output, without allocating per byte and without changing the plain-text `output` contract.
- Add a DOM rendering path in `content.js` that, when a `<pre>` is successfully formatted, replaces its text with highlighted `<span class="pj-…">` nodes instead of a plain string.
- Ship a small stylesheet (injected by the content script) that defines the token classes and respects the page's existing light/dark color scheme via `prefers-color-scheme`.
- Preserve the existing plain-text API: `formatString` / `formatBytes` / `createFormatter().format` continue to return the exact same `{ output, errors }` shape. Highlighting tokens are exposed through a new opt-in return field.
- Extend the e2e suite with fixtures that assert highlighted spans appear (and that invalid JSON remains untouched, with no spans injected).

## Capabilities

### New Capabilities

- `json-syntax-highlighting`: Token classification emitted by the formatter and rendered as styled DOM by the extension content script.

### Modified Capabilities

- `extension-e2e-testing`: Adds e2e scenarios asserting that successfully formatted `<pre>` blocks contain the expected highlighted span structure and that invalid JSON produces no highlight markup.

## Impact

- **Code**: `src/formatter.js` (token emission), `src/chunker.js` and `src/client.js` / `src/worker.js` (pass tokens through the Worker boundary), `content.js` (DOM rendering + style injection), `src/index.js` (re-exports).
- **API surface**: New opt-in `tokens: true` option and a new `tokens` field on the result object. No breaking changes to existing callers.
- **Performance**: Token emission must stay in the existing single-pass loop. Worker transfer must remain zero-copy for the byte output; tokens piggy-back on the same `postMessage`.
- **Tests**: New unit tests for token emission in `src/formatter.test.js`; new Playwright fixtures + assertions in `e2e/`.
- **No new runtime dependencies.** Highlighting is pure CSS + span classes.
