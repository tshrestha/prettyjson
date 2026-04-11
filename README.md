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

examples/
└── chrome-extension.js   Drop-in Chrome extension integration
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

See `examples/chrome-extension.js` for a complete integration pattern including manifest.json configuration and content
script setup.

Key points:

- Set `workerURL` to `chrome.runtime.getURL("src/worker.js")`
- List worker files in `web_accessible_resources`
- The formatter auto-falls back to synchronous mode if Workers are unavailable

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

```bash
node --test src/formatter.test.js
```

65 tests covering: primitives, objects, arrays, deep nesting, string escaping (quotes, backslashes, unicode), whitespace
normalisation, edge cases, configurable indent, output buffer mechanics, indent cache, and a 1MB performance benchmark.

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
