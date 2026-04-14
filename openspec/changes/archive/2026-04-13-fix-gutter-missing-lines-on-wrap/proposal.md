## Why

When the Pretty JSON content script runs inside Chrome's built-in text viewer (the `view-source`-like page Chrome renders for `text/plain` resources such as `https://raw.githubusercontent.com/axios/axios/refs/heads/v1.x/package-lock.json`), the browser wraps the payload in a `<pre>` that carries an inline `style="word-wrap: break-word; white-space: pre-wrap"`. Our injected stylesheet does not override `white-space`, and inline styles beat class selectors, so the code column ends up with `white-space: pre-wrap`. Long lines (e.g. `"integrity": "sha512-..."`) then wrap into multiple visual rows while the gutter still renders exactly one number per logical formatted line. The grid row stretches to the taller code column, leaving a blank strip of gutter at the bottom — the user sees the last group of code lines with no line numbers next to them. With the axios `package-lock.json` at a typical viewport, the last few logical lines (hashes + trailing closers) visibly tail off below line number 11896.

## What Changes

- Force `white-space: pre` on `pre.json-formatted` and its `.pj-code` descendant in the injected stylesheet, with high enough specificity (or `!important`) to beat Chrome's inline `white-space: pre-wrap`, so formatted output never wraps mid-line and the existing 1:1 mapping from formatted newlines to gutter numbers holds.
- Add a regression e2e fixture/test that reproduces the Chrome text-viewer condition by setting `style="word-wrap: break-word; white-space: pre-wrap"` directly on a large `<pre>` with long lines, then asserts that after formatting (a) computed `white-space` on `.pj-code` is `pre` and (b) the bottom of the gutter's last line number sits within one line-height of the bottom of the `.pj-code` box.
- No change to the formatter, chunker, worker, or line-counting logic — only the gutter/code CSS contract widens to cover the "host `<pre>` already had a conflicting inline `white-space`" case.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `line-numbers`: The stylesheet-injection requirement tightens so that the injected rules guarantee `white-space: pre` on the formatted `<pre>` and its code column regardless of any inline `white-space` already set on the host `<pre>`. The "gutter column auto-sizes" requirement gains a scenario that the gutter's last visible number aligns with the bottom of the code column on documents with very long lines inside a `pre-wrap` host.

## Impact

- **Code**: `content.js` — extend the `ensureStylesheet` CSS string with a `white-space: pre` rule (likely `!important`) on `pre.json-formatted` and `pre.json-formatted .pj-code`. No other module touched.
- **Specs**: `openspec/specs/line-numbers/spec.md` — delta via `specs/line-numbers/spec.md` in this change.
- **Tests**: `e2e/fixtures/` gains a fixture that mirrors Chrome's native text-viewer `<pre>` (inline `white-space: pre-wrap`) with a many-long-line payload; `e2e/tests/gutter.spec.js` gains a regression test against it.
- **Dependencies**: none.
- **User-visible**: long lines will now overflow horizontally (scroll) inside the formatted `<pre>` on pages like `raw.githubusercontent.com/...` instead of wrapping. This matches the behavior already seen on test pages that use a bare `<pre>` without inline styles, and is the established PrettyJSON look.
