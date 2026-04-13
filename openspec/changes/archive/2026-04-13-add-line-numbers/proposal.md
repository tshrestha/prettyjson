## Why

Formatted JSON documents can be hundreds or thousands of lines long, and users frequently need to reference a specific line — when sharing output with a teammate, cross-referencing an error message that quotes a line number, or simply keeping their place while scrolling. Without a visible line gutter, they have to count by hand or paste into a different editor. Adding line numbers to the Chrome extension's rendered output closes that gap so the extension is usable as a standalone JSON viewer.

## What Changes

- Render a left-hand gutter of line numbers alongside every `<pre class="json-formatted">` the content script produces.
- Numbers start at 1, right-aligned, and widen automatically for large documents so columns stay aligned.
- Gutter is styled as part of the default OneDark-Pro theme (muted foreground, same background as the pre block) and uses the same JetBrains Mono font so row heights line up exactly with the code.
- Gutter digits are **not selectable** — copying text from the `<pre>` must still yield the raw formatted JSON, with no leading numbers polluting the clipboard.
- Apply to both the highlighted path and the above-threshold plain-text fallback so line numbers are visible on documents of any size.

## Capabilities

### New Capabilities

- `line-numbers`: gutter rendering for formatted JSON in the Chrome extension — structural contract for how the line gutter is composed, styled, and kept in sync with the code column (including non-selectability of gutter text).

### Modified Capabilities

- `json-syntax-highlighting`: the content script's render pipeline now produces a two-column layout (gutter + code) instead of writing tokens directly into the `<pre>`. The requirement that formatted output preserves copy-paste fidelity is extended to cover the new gutter.

## Impact

- `content.js` — render pipeline changes to wrap the formatted output in a gutter + code structure; stylesheet injection grows to cover the gutter.
- No changes to `src/` formatter internals — the gutter is derived from the already-produced formatted string by counting newlines. The formatter API stays byte-identical.
- `e2e/` — new Playwright assertions covering gutter presence, alignment for multi-digit line counts, and copy-paste fidelity (clipboard must not contain line numbers).
- No new dependencies.
