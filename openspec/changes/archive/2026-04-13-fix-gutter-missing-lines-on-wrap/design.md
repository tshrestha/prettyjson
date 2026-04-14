## Context

PrettyJSON renders a line-number gutter next to each formatted `<pre>` by rendering the gutter and code as two children of a `display: grid; grid-template-columns: auto 1fr` container. The gutter text is built from `countLines(result.output)` — i.e. the number of `\n` bytes in the formatter's output plus one — on both the highlighted-span path and the above-threshold plain-text path. This gives a perfect 1:1 mapping from formatted newlines to gutter rows _as long as_ each formatted newline ends a single visual row in the rendered code column.

When the extension runs inside a regular web page that holds the JSON in a hand-authored `<pre>`, the browser applies the UA default `white-space: pre` and no wrapping occurs — one formatted newline, one visual row, everything lines up. When it runs inside Chrome's native text-file viewer (the pseudo-page the browser shows for direct `text/plain` URLs, e.g. `raw.githubusercontent.com/axios/axios/.../package-lock.json`), Chrome synthesizes a `<pre>` with an inline `style="word-wrap: break-word; white-space: pre-wrap"`. Inline styles beat the injected stylesheet, so the formatted `<pre>` inherits `white-space: pre-wrap`. Long lines — integrity hashes, resolved URLs, etc. — wrap into multiple visual rows. The gutter's text still has only 11 896 numbers; the code column now has 11 896 + (number of wrapped rows) visual rows. Because the gutter and code share one grid row whose height is the taller of the two cells, the row stretches to the code's height and the tail of the gutter cell is empty. Visually: the last logical lines of the document appear without numbers.

This was verified by loading `https://raw.githubusercontent.com/axios/axios/refs/heads/v1.x/package-lock.json` in a Playwright Chromium session that mirrored the text-viewer inline style. Measurements:

- Gutter text bottom: y = 249 832 px (11 896 rows × 21 px line-height)
- Code column bottom: y = 270 160 px
- Delta: ≈ 20 328 px (≈ 968 wrapped rows at 1200-px viewport; fewer at wider viewports — a ~15-row delta is realistic for a typical wide browser window viewing this file)

The existing e2e fixtures (`gutter.html`, `gutter-large.html`, `highlight-oversized.html`) all use bare `<pre>` tags with no inline `white-space`, so the bug is invisible to the current suite.

## Goals / Non-Goals

**Goals:**

- The formatted `<pre>` never wraps long lines regardless of any `white-space` set on the host element before the content script runs.
- The existing 1:1 mapping from formatted newlines to gutter numbers continues to hold on very large real-world files like `package-lock.json`.
- The fix is covered by a regression test that asserts both the computed `white-space` on `.pj-code` and a layout invariant tying the bottom of the last gutter number to the bottom of the code column.

**Non-Goals:**

- Supporting soft-wrap with numbered wrapped rows. PrettyJSON's visual contract is "one logical formatted line per gutter row", matching editors like VS Code with word-wrap off. Implementing numbered soft-wrap would require per-row layout measurement (via `Range.getClientRects()` or similar) and a new data model; out of scope for a bug fix.
- Changing the formatter, chunker, worker, or line-counting logic. The output and its newline count are correct — only the rendering contract needs to harden.
- Overriding other user/site styles. We only override `white-space` (and only as needed) on the formatted `<pre>` and its `.pj-code` descendant.

## Decisions

### Decision 1: Force `white-space: pre` on the formatted `<pre>` via the injected stylesheet, with `!important`

Why: Chrome's native text viewer sets `white-space: pre-wrap` as an **inline** style on the host `<pre>`. Inline styles have higher specificity than any selector-based rule in an `<style>` element. The minimal way to win without resorting to JavaScript-level `element.style.whiteSpace` manipulation (which itself has ordering hazards, since content.js could race against other scripts) is to mark the injected rule `!important`. This is the same pattern used throughout modern content-script CSS injection for exactly this reason.

The rule applies to both the container `pre.json-formatted` (so `white-space` correctly inherits into `.pj-code` and its children) and explicitly to `pre.json-formatted .pj-code` as a belt-and-braces guard in case some future change introduces a conflicting rule on the code column.

Alternatives considered:

- **Set `pre.style.whiteSpace = "pre"` directly in content.js.** Rejected: inline style mutation of the host element is observably different from stylesheet-driven layout, may conflict with MutationObservers on the host page, and diverges from the "one stylesheet, declarative" pattern the existing line-numbers spec enforces.
- **Apply `word-break: keep-all; overflow-wrap: normal;` instead of touching `white-space`.** Rejected: `white-space: pre-wrap` wraps on _any_ whitespace (including the leading indentation spaces between tokens), not only on break opportunities, so those word/overflow rules do not stop the wrap. `white-space: pre` is the only value that truly disables soft-wrap in this browser pathway.
- **Teach `countLines` / `recomputeGutter` to measure rendered rows via `Range.getClientRects()`.** Rejected as the fix for this bug (see Non-Goals), but noted as the path if we ever want opt-in word-wrap.

### Decision 2: Regression test via an inline-style fixture, not a Chrome-flag toggle

Why: We cannot programmatically toggle Chrome's built-in text viewer's "Line wrap" button from Playwright, and loading an actual `text/plain` resource routes through Chrome's viewer which is not guaranteed stable across Chromium versions. A hand-rolled fixture with `<pre style="white-space: pre-wrap">...long JSON...</pre>` reproduces the exact CSS condition (inline `white-space: pre-wrap` on the host `<pre>`) that the bug depends on, gives a deterministic DOM we can assert against, and fits the existing fixture harness.

The fixture payload is a JSON array of strings long enough to force wrapping at the default `e2e` viewport — this is much smaller than `package-lock.json` while still exercising the exact CSS path. The test asserts:

1. `getComputedStyle(code).whiteSpace === "pre"` — the fix is live.
2. The `Range` around the gutter's text node has `bottom` within one computed `line-height` of `code.getBoundingClientRect().bottom` — the layout invariant the user's bug report was about.

### Decision 3: Scope the CSS change strictly to the formatted `<pre>`

The new `white-space: pre !important` rule is scoped under `pre.json-formatted` — it only fires after the content script successfully formats a `<pre>` and tags it. Pages whose `<pre>` was _not_ a JSON document (or failed to format) are unaffected, keeping the "no-op on non-JSON pages" guarantee from the original line-numbers spec intact.

## Risks / Trade-offs

- **[Risk] Users who preferred Chrome's built-in "Line wrap" behavior lose it inside formatted JSON.** → Mitigation: This is a conscious trade-off — soft-wrapped JSON is genuinely hard to read because indentation is lost mid-line, and the gutter-vs-code mismatch is strictly worse than the horizontal-scroll alternative. The bare-`<pre>` code path (by far the most common) already behaves this way today, so the fix converges Chrome-text-viewer behavior onto the existing default. If opt-in soft-wrap is ever requested, it becomes a future feature with its own spec.
- **[Risk] `!important` can be surprising in a shared CSS namespace.** → Mitigation: The injected `<style data-pretty-json>` element is an extension-private stylesheet that only targets `pre.json-formatted` and its descendants. No host-page selector will conflict because the `json-formatted` class is added by the extension and not used elsewhere.
- **[Risk] Horizontal scroll on long lines can hide content behind a scrollbar on short viewports.** → Mitigation: Standard behavior for any monospaced code viewer (matches the bare-`<pre>` path already). The `<pre>` default `overflow: visible` lets long lines extend into the page's horizontal scroll region, which is how the extension has worked for all other host pages since launch.
- **[Risk] The regression test relies on the test runner's default viewport producing at least one wrapped line.** → Mitigation: Construct the fixture with a single very long JSON string (≥ 500 chars in one value) that is guaranteed to exceed any reasonable viewport width once combined with indentation, making the wrapping deterministic.

## Migration Plan

No data migration. The change is a single CSS-string edit in `content.js` inside `ensureStylesheet` plus one new fixture and one new e2e test. Rollback is a git revert of that commit. No persisted state, no stored user preferences.
