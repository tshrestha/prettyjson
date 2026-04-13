# Pretty JSON

A high-performance, streaming JSON pretty-printer designed for Chrome extensions and browser environments. Handles
arbitrarily large JSON with constant memory usage.

## Architecture

```
src/
├── constants.js      Shared character codes & defaults
├── formatter.js      Pure-functional streaming state machine (core engine)
├── chunker.js        Non-blocking chunked processing with AbortSignal
├── worker.js         Web Worker entry point
├── client.js         Main-thread Promise API (manages the Worker)
├── index.js          Barrel export
└── formatter.test.js 65 tests (node --test)

content.js            Chrome extension content script
manifest.json         Chrome extension manifest (MV3)
```

## Design Principles

**Zero-parse formatting.** The formatter never calls `JSON.parse`. It walks raw UTF-8 bytes in a single pass, tracking
only two bits of state (nesting depth and whether it's inside a string). Memory usage is constant regardless of input
size.

**Byte-level processing.** All work happens on `Uint8Array` buffers, avoiding V8's string encoding overhead.
Pre-computed indent lookup tables eliminate allocations in the hot loop.

**Web Worker offloading.** Formatting runs in a dedicated Worker thread with `Transferable` ArrayBuffer transfers (
zero-copy). The main thread never blocks, even on 100MB+ inputs.

**Chunked processing with cancellation.** Large inputs are processed in 2MB chunks with event-loop yielding between each
chunk. An `AbortSignal` can cancel formatting mid-stream.

## Usage

### Quick (synchronous, small inputs)

```js
import { formatString } from "./src/index.js"

const { output, errors } = formatString("{\"a\":1,\"b\":[2,3]}")
// errors is [] on valid input.
```

### Recommended (async, Worker-backed)

```js
import { createFormatter } from "./src/index.js"

const formatter = createFormatter()

const { output, errors } = await formatter.format(hugeJsonString, {
  indentSize: 2,
  onProgress: (percent) => updateProgressBar(percent),
  signal: abortController.signal,
})

if (errors.length > 0) {
  // Formatting still succeeded — the output buffer contains the
  // formatted JSON up to the error. Surface the errors alongside
  // the output so the user can see both.
  showErrorBanner(errors)
}

formatter.destroy() // when done
```

### Error handling for malformed JSON

The formatter never throws on structural errors. It always produces an
`output` buffer containing the best-effort formatted JSON, plus an
`errors` array describing any problems found:

```js
const { output, errors } = formatString("{\"a\":1}}")
// output: '{\n  "a": 1\n}'
// errors: [{ type: "unbalanced_close", message: "...", offset: 7 }]
```

Error types:

- `unbalanced_close` — a `}` or `]` with no matching open bracket
- `unclosed_container` — input ended with unclosed `{` or `[`
- `unterminated_string` — input ended inside a string literal

### Chrome Extension

`content.js` and `manifest.json` at the repo root wire the formatter up as a Chrome MV3 content script that auto-formats
JSON `<pre>` blocks on any page.

Key points:

- Set `workerURL` to `chrome.runtime.getURL("src/worker.js")`
- List worker files and the bundled font in `web_accessible_resources`
- The formatter auto-falls back to synchronous mode if Workers are unavailable

## Syntax Highlighting

The Chrome extension renders successfully formatted JSON with a bundled default theme — **OneDark-Pro** colors on a
`#282c34` background, set in **JetBrains Mono** Regular. The theme applies unconditionally to every `<pre>` the
extension formats (via the `.json-formatted` class), so the look is the same on any host page.

Token classification is exposed on the formatter API via an opt-in:

```js
const { output, tokens } = await formatter.format(jsonString, {
  indentSize: 2,
  tokens: true,
})
// tokens = { offsets: Uint32Array, kinds: Uint8Array, count: number }
```

`offsets` holds flat pairs of `[start, end)` **UTF-16 code unit** indices into the decoded `output` string — slice with
`output.substring(start, end)` to get a token's text. `kinds` holds one `TOKEN_*` enum value per token; the constants
are re-exported from `src/index.js`:

- `TOKEN_PUNCT` — `{`, `}`, `[`, `]`, `,`, `:`
- `TOKEN_KEY` — object keys (quoted, including the quotes)
- `TOKEN_STRING` — string values
- `TOKEN_NUMBER` — numeric literals
- `TOKEN_BOOLEAN` — `true` / `false`
- `TOKEN_NULL` — `null`

The content script emits one `<span>` per token except for `TOKEN_PUNCT`, which is rendered as plain text and inherits
the default foreground color from `pre.json-formatted`. The five emitted classes are `pj-key`, `pj-string`, `pj-number`,
`pj-boolean`, and `pj-null`; they use `:where(...)` selectors so page CSS can override without specificity battles.

### Performance threshold

Above `HIGHLIGHT_TOKEN_THRESHOLD` (250,000 tokens, roughly 2.5 MB of formatted JSON) the content script skips span
construction and renders the formatted text as plain text — the theme background and font still apply. The threshold
constant lives in `src/constants.js`; the empirical basis for it is recorded in `openspec/changes/add-json-syntax-highlighting/design.md`
and reproducible via `spike-highlight/run.mjs`.

### Attribution

- Default color palette: **OneDark-Pro** by [Binaryify](https://github.com/Binaryify/OneDark-Pro), used under the MIT
  License. The source theme file is vendored at `themes/OneDark-Pro.json` as a reference; the extension extracts only
  the six JSON-relevant color values from it.
- Default code font: **JetBrains Mono** Regular by [JetBrains](https://www.jetbrains.com/lp/mono/), licensed under
  [SIL OFL 1.1](themes/fonts/OFL.txt). Bundled at `themes/fonts/JetBrainsMono-Regular.woff2`.

## Performance

On a 2024 MacBook Pro (M3), formatting a 1MB JSON array of objects:

| Method                                   | Time                  |
| ---------------------------------------- | --------------------- |
| `JSON.stringify(JSON.parse(x), null, 2)` | ~120ms                |
| `formatString` (this library)            | ~95ms                 |
| Worker + `createFormatter`               | ~100ms (non-blocking) |

The library matches or beats `JSON.parse` + `JSON.stringify` while using constant memory and never blocking the UI
thread.

## Running Tests

### Unit tests

```bash
node --test src/formatter.test.js
```

77 tests covering: primitives, objects, arrays, deep nesting, string escaping (quotes, backslashes, unicode), whitespace
normalisation, edge cases, configurable indent, output buffer mechanics, indent cache, a 1MB performance benchmark, and
the token-emission opt-in (every kind, UTF-16 offsets, key/string disambiguation, non-ASCII + emoji surrogate pairs).

### End-to-end tests

The `e2e/` suite loads the unpacked extension into a real Chromium instance via Playwright and verifies that the
content script pretty-prints `<pre>` blocks on a set of fixture pages served by a local HTTP server.

```bash
npm install
npx playwright install chromium
npm run test:e2e
```

The runner is pinned to `@playwright/test ~1.56.0` and defaults to **headed** mode. Chromium's legacy headless runtime
has historically misbehaved with MV3 extensions, so the headed default trades a visible window for far less flake. To
run in the background (for example on CI), set `HEADLESS=1`:

```bash
HEADLESS=1 npm run test:e2e
```

## API Reference

### `formatString(json, opts?) → { output: string, errors: FormatError[] }`

Synchronous string-to-string formatting. `errors` is `[]` on valid input.

### `formatBytes(bytes, opts?) → { output: Uint8Array, errors: FormatError[] }`

Synchronous byte-to-byte formatting for advanced use.

### `createFormatter(config?) → { format, destroy }`

Creates a Worker-backed formatter instance.

- `format(json, opts?) → Promise<{ output: string, errors: FormatError[] }>` — formats with progress & cancellation
- `destroy()` — terminates the worker

### `FormatError`

```ts
{ type: "unbalanced_close" | "unclosed_container" | "unterminated_string",
  message: string,
  offset: number }
```

### Options

- `indentSize` (number, default `2`) — spaces per indent level
- `onProgress` (function) — called with percent complete (0–100)
- `signal` (AbortSignal) — cancels formatting mid-stream
- `chunkSize` (number, default `2097152`) — bytes per async processing chunk
- `tokens` (boolean, default `false`) — when `true`, the result also contains `tokens: { offsets, kinds, count }`
  describing every JSON token in the formatted output. Omit or set to `false` for byte-identical legacy behavior with
  no extra work.
