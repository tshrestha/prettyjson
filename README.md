# Pretty JSON

A high-performance streaming JSON pretty-printer available as both a Chrome extension and an embeddable JavaScript
library, with constant-memory formatting for arbitrarily large JSON.

## Table of Contents

- [Chrome Extension](#chrome-extension)
  - [Install](#install)
  - [What you'll see](#what-youll-see)
- [Library](#library)
  - [Quick (synchronous, small inputs)](#quick-synchronous-small-inputs)
  - [Recommended (async, Worker-backed)](#recommended-async-worker-backed)
  - [Error handling for malformed JSON](#error-handling-for-malformed-json)
  - [Token emission](#token-emission)
  - [API Reference](#api-reference)
  - [Options](#options)
- [Architecture & Design](#architecture--design)
  - [Directory map](#directory-map)
  - [Design Principles](#design-principles)
  - [Performance](#performance)
  - [Attribution](#attribution)
- [Development](#development)
  - [Unit tests](#unit-tests)
  - [End-to-end tests](#end-to-end-tests)

## Chrome Extension

Pretty JSON ships as a Chrome MV3 content script that auto-formats any JSON `<pre>` block on any page you visit — no
configuration, no toggle, no devtools panel. If a page serves raw JSON, the extension pretty-prints it in place.

### Install

There is no Chrome Web Store listing yet. To use the extension, load it as an unpacked extension:

1. Clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (toggle in the top-right).
4. Click **Load unpacked** and select the repository root (the folder containing `manifest.json`).

The extension is now active. Visit any URL that returns a JSON response (for example, a raw GitHub blob of a `.json`
file) and the content script will replace the raw text with a pretty-printed version.

Key wiring points inside the extension:

- `workerURL` is set to `chrome.runtime.getURL("src/worker.js")`
- Worker files and the bundled font are listed in `web_accessible_resources`
- The formatter auto-falls back to synchronous mode if Workers are unavailable

### What you'll see

The extension applies a bundled default theme unconditionally to every `<pre>` it formats (via the `.json-formatted`
class), so the look is identical on any host page:

- **Theme**: [OneDark-Pro](https://github.com/Binaryify/OneDark-Pro) colors on a `#282c34` background.
- **Font**: [JetBrains Mono](https://www.jetbrains.com/lp/mono/) Regular.
- **Syntax highlighting**: per-token coloring for keys, strings, numbers, booleans, and `null`. Punctuation
  (`{`, `}`, `[`, `]`, `,`, `:`) inherits the default foreground color. The emitted token classes are `pj-key`,
  `pj-string`, `pj-number`, `pj-boolean`, and `pj-null`, and they use `:where(...)` selectors so page CSS can override
  them without specificity battles.
- **Line numbers** down the left gutter.
- **Collapsible nodes**: click to fold any object or array.
- **Large-document fallback**: above `HIGHLIGHT_TOKEN_THRESHOLD` (250,000 tokens, roughly 2.5 MB of formatted JSON) the
  content script skips per-token span construction and renders the formatted text as plain text. The theme background
  and font still apply. The threshold constant lives in `src/constants.js`; its empirical basis is recorded in
  `openspec/changes/add-json-syntax-highlighting/design.md` and is reproducible via `spike-highlight/run.mjs`.

## Library

Pretty JSON is also an embeddable JavaScript library. It exposes a synchronous API for small inputs and a
Worker-backed async API for large or cancellable jobs, and never calls `JSON.parse` internally.

```js
import { createFormatter, formatString } from "./src/index.js"
```

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

The formatter never throws on structural errors. It always produces an `output` buffer containing the best-effort
formatted JSON, plus an `errors` array describing any problems found:

```js
const { output, errors } = formatString("{\"a\":1}}")
// output: '{\n  "a": 1\n}'
// errors: [{ type: "unbalanced_close", message: "...", offset: 7 }]
```

Error types:

- `unbalanced_close` — a `}` or `]` with no matching open bracket
- `unclosed_container` — input ended with unclosed `{` or `[`
- `unterminated_string` — input ended inside a string literal

### Token emission

Token classification is exposed on the formatter API via an opt-in:

```js
const { output, tokens } = await formatter.format(jsonString, {
  indentSize: 2,
  tokens: true,
})
// tokens = { offsets: Uint32Array, kinds: Uint8Array, count: number }
```

`offsets` holds flat pairs of `[start, end)` **UTF-16 code unit** indices into the decoded `output` string — slice
with `output.substring(start, end)` to get a token's text. `kinds` holds one `TOKEN_*` enum value per token; the
constants are re-exported from `src/index.js`:

- `TOKEN_PUNCT` — `{`, `}`, `[`, `]`, `,`, `:`
- `TOKEN_KEY` — object keys (quoted, including the quotes)
- `TOKEN_STRING` — string values
- `TOKEN_NUMBER` — numeric literals
- `TOKEN_BOOLEAN` — `true` / `false`
- `TOKEN_NULL` — `null`

### API Reference

#### `formatString(json, opts?) → { output: string, errors: FormatError[] }`

Synchronous string-to-string formatting. `errors` is `[]` on valid input.

#### `formatBytes(bytes, opts?) → { output: Uint8Array, errors: FormatError[] }`

Synchronous byte-to-byte formatting for advanced use.

#### `createFormatter(config?) → { format, destroy }`

Creates a Worker-backed formatter instance.

- `format(json, opts?) → Promise<{ output: string, errors: FormatError[] }>` — formats with progress & cancellation
- `destroy()` — terminates the worker

#### `FormatError`

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

## Architecture & Design

### Directory map

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

### Design Principles

**Zero-parse formatting.** The formatter never calls `JSON.parse`. It walks raw UTF-8 bytes in a single pass, tracking
only two bits of state (nesting depth and whether it's inside a string). Memory usage is constant regardless of input
size.

**Byte-level processing.** All work happens on `Uint8Array` buffers, avoiding V8's string encoding overhead.
Pre-computed indent lookup tables eliminate allocations in the hot loop.

**Web Worker offloading.** Formatting runs in a dedicated Worker thread with `Transferable` ArrayBuffer transfers
(zero-copy). The main thread never blocks, even on 100MB+ inputs.

**Chunked processing with cancellation.** Large inputs are processed in 2MB chunks with event-loop yielding between
each chunk. An `AbortSignal` can cancel formatting mid-stream.

### Performance

On a 2024 MacBook Pro (M3), formatting a 1MB JSON array of objects:

| Method                                   | Time                  |
| ---------------------------------------- | --------------------- |
| `JSON.stringify(JSON.parse(x), null, 2)` | ~120ms                |
| `formatString` (this library)            | ~95ms                 |
| Worker + `createFormatter`               | ~100ms (non-blocking) |

The library matches or beats `JSON.parse` + `JSON.stringify` while using constant memory and never blocking the UI
thread.

### Attribution

- Default color palette: **OneDark-Pro** by [Binaryify](https://github.com/Binaryify/OneDark-Pro), used under the MIT
  License. The source theme file is vendored at `themes/OneDark-Pro.json` as a reference; the extension extracts only
  the six JSON-relevant color values from it.
- Default code font: **JetBrains Mono** Regular by [JetBrains](https://www.jetbrains.com/lp/mono/), licensed under
  [SIL OFL 1.1](themes/fonts/OFL.txt). Bundled at `themes/fonts/JetBrainsMono-Regular.woff2`.

## Development

This section covers running the test suites locally.

### Unit tests

```bash
node --test src/formatter.test.js
```

77 tests covering: primitives, objects, arrays, deep nesting, string escaping (quotes, backslashes, unicode),
whitespace normalisation, edge cases, configurable indent, output buffer mechanics, indent cache, a 1MB performance
benchmark, and the token-emission opt-in (every kind, UTF-16 offsets, key/string disambiguation, non-ASCII + emoji
surrogate pairs).

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
