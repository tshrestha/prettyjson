## Context

`content.js` today takes a successfully formatted JSON string and either (a) builds a `DocumentFragment` of tokenized `<span>`s and swaps it into the `<pre>`, or (b) for above-threshold payloads, writes the formatted text straight into `<pre>.textContent`. In both cases the `<pre>` ends up with flat inline content and no line gutter.

The formatted output uses LF (`\n`) as its only line terminator (the formatter emits newlines between structural tokens), so a line count is a cheap newline count over the already-produced string. The default OneDark-Pro theme is injected once per page via a `<style data-pretty-json>` element in `document.head`.

Key constraint from the proposal: **copy-paste must remain the raw formatted JSON**. Nothing pasted from a highlighted `<pre>` can contain line numbers. This eliminates the naive "prepend `1 ` to each line" approach and drives the DOM decisions below.

## Goals / Non-Goals

**Goals:**
- Every successfully formatted `<pre>` shows a left-hand line-number gutter aligned to code rows.
- The gutter is visually part of the OneDark-Pro theme (muted foreground, shared background, same font as the code).
- Gutter digits are not included in the user's selection or clipboard.
- Both the highlighted render path and the above-threshold plain-text fallback show line numbers.
- No changes to the `src/` formatter engine — the gutter is derived from the already-produced output.

**Non-Goals:**
- Clickable / linkable line numbers (anchor URLs like `#L42`).
- Jump-to-line search box, or any interactive gutter affordance.
- Per-line highlighting (hover states, fold controls, error markers).
- Word-wrap of long lines. `<pre>` keeps horizontal overflow as it does today, so the gutter continues to match a one-to-one row mapping.
- Changes to the formatter API or to `src/worker.js`. The gutter is a pure DOM/CSS concern of `content.js`.

## Decisions

### Decision 1 — Two-column DOM: gutter span + code span inside the `<pre>`

The content script will wrap its existing output inside a new structure:

```html
<pre class="json-formatted">
  <span class="pj-gutter" aria-hidden="true">1
2
3
…</span><span class="pj-code"><!-- existing tokenized fragment or plain text --></span>
</pre>
```

- The gutter's text is a single `\n`-joined run of line numbers from `1` to the total line count.
- The code span holds exactly what `renderHighlighted` builds today (or the plain-text fallback).
- The `<pre>` uses CSS grid to place the two spans side-by-side.

**Alternatives considered:**

1. **Wrap each logical line in its own span and use CSS counters (`::before { content: counter(line) }`).** Gives per-line accuracy and makes wrapped lines Just Work, but it requires splitting the token stream at every newline and producing N spans, which roughly doubles DOM nodes on top of the already O(tokens) cost. We already have a `HIGHLIGHT_TOKEN_THRESHOLD` precisely because DOM node count is the bottleneck — doubling it would force us to lower the threshold, which regresses the existing feature.

2. **Render line numbers in a `::before` pseudo-element on the `<pre>` itself.** Cannot produce per-line numbering from a single pseudo-element; would still need per-line wrapping.

3. **Use an HTML `<ol>` or `<table>` to get free line numbering or two columns.** Breaks `<pre>` semantics, and `<table>` inside `<pre>` loses the CSS `white-space: pre` behavior we rely on for whitespace preservation.

The two-span approach is the minimum structural change that gives us a gutter without touching the existing highlight fast path.

### Decision 2 — Gutter non-selectability via `user-select: none`

The gutter span gets `user-select: none` in the injected stylesheet. This is the mechanism that enforces the copy-paste requirement. Additionally, `aria-hidden="true"` keeps screen readers from announcing the numbers (they duplicate content and are presentational).

**Alternatives considered:**

- **Render numbers via CSS `content:` on a pseudo-element.** Pseudo-element content is not user-selectable in any current browser, which would also meet the requirement. But `content:` can only inject per-line numbers if we wrap every line (see Decision 1), and we want to avoid that cost.
- **Use a sibling `<div>` absolutely positioned outside the `<pre>`.** Works but requires tracking the pre's scroll position in JS to keep the gutter sticky during horizontal scroll, which is extra surface area for no obvious benefit.

`user-select: none` is well-supported and sufficient. One known gap: "Select All" via `Cmd+A` in some browsers can still include `user-select: none` text in the serialized selection. We will verify this in an e2e test that reads `document.execCommand("copy")` / `navigator.clipboard` output, and if the gap exists we can escalate to wrapping the gutter in a pseudo-element. But the first cut uses `user-select: none` and an e2e assertion.

### Decision 3 — Gutter width auto-sized by content

The gutter column sizes to its own content (`grid-template-columns: auto 1fr`). The widest line number (rendered as text) establishes the column width automatically, so a 12-line document gets a 2-character gutter and a 12,000-line document gets a 5-character gutter, with no JavaScript measuring step.

Right-alignment is achieved via `text-align: right` on `.pj-gutter`. Padding (e.g. `padding: 0 0.75em`) separates the gutter from the code.

### Decision 4 — Apply to both highlighted and above-threshold paths

`content.js` currently has two branches in its render loop — `renderHighlighted(...)` for token-spanned output and `el.textContent = result.output` for above-threshold output. Both branches will be funneled through a single new `renderWithGutter(el, codeFragment, lineCount)` helper that builds the outer `pre.json-formatted > pj-gutter + pj-code` structure. The old `renderHighlighted` becomes the producer of the inner `pj-code` fragment only.

For the above-threshold path, the "code fragment" is a single text node containing `result.output`. Line count is computed the same way (a newline count over `result.output`) so the logic is shared.

### Decision 5 — Line count from newline count, computed in content.js

Line count is `countNewlines(result.output) + 1`. Since the formatter always emits LF and never CRLF, this is a single pass over the string. For very large documents (the above-threshold case) this costs one linear scan of an already-in-memory string, which is negligible next to the cost of the format call itself.

**Alternatives considered:** exposing a `lineCount` field from the formatter. Pointless extra API surface — the same information is trivially recoverable from the output string.

### Decision 6 — Stylesheet delta is part of the one-shot injection

The `ensureStylesheet()` call in `content.js` currently inserts a static block of CSS once per page. We extend that block with the gutter rules (color, `user-select`, grid layout on `pre.json-formatted`). No new DOM elements, no new injection call sites — the existing one-shot guard already prevents duplicate injection.

Gutter foreground color: `#5c6370` (OneDark-Pro comment color) — dim enough to recede, still readable against `#282c34`.

## Risks / Trade-offs

- **`Cmd+A` may still copy gutter text in some browsers** → e2e test asserts that `Cmd+A` → copy → clipboard text equals the raw formatted JSON. If the assertion fails, escalate to pseudo-element content (requires per-line wrapping and reopens Decision 1).
- **Gutter widens mid-document on extremely long docs** → Because the gutter is a single pre-computed string of all numbers, the column width is fixed at render time based on the widest number. No mid-document shift.
- **Two-column grid on `<pre>` affects horizontal overflow** → The code column uses `overflow: visible` (default) inside a `<pre>` whose `white-space: pre` keeps long lines from wrapping. Horizontal scroll remains on the `<pre>` as a whole, which is the same behavior as today. E2e should sanity-check a document with a very long line.
- **Screen reader users hear duplicate numeric noise** → `aria-hidden="true"` on the gutter removes it from the a11y tree.
- **DOM node count grows by exactly two spans per formatted `<pre>`** → Negligible and independent of document size; does not affect `HIGHLIGHT_TOKEN_THRESHOLD`.
- **Plain-text-fallback path now builds a span tree** → Still just three DOM nodes (pre, gutter span, code text node). No regression for the large-document path.
