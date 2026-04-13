## Context

The current formatter (`src/formatter.js`) is a single-pass, zero-allocation, byte-level state machine. It walks a `Uint8Array` and emits formatted bytes into a growable output buffer, tracking only `depth` and `inString`. It already distinguishes every token the highlighter needs — quoted strings vs. unquoted scalars vs. structural punctuation — because it has to decide when to insert whitespace.

The Chrome extension's `content.js` currently assigns `el.textContent = output`, losing any structural information the DOM could render. It also respects `manifest.json` MV3 constraints: no inline scripts, no `eval`, and all worker resources must be declared in `web_accessible_resources`.

Two boundaries matter for this design:

1. **The formatter boundary.** Adding highlighting must not pessimize the hot loop, must not allocate per byte, and must keep the existing `{ output, errors }` return shape so existing callers don't break.
2. **The Worker boundary.** `createFormatter()` transfers the output `ArrayBuffer` zero-copy across `postMessage`. Tokens need the same treatment — we can't serialize an array of objects per token without giving up the performance story.

## Goals / Non-Goals

**Goals:**

- Classify every JSON token into one of a small fixed set: `key`, `string`, `number`, `boolean`, `null`, `punctuation`.
- Render a highlighted DOM inside the `<pre>` when formatting succeeds.
- Keep the plain-text `output` byte-identical to today for every existing test.
- Keep the hot loop allocation-free. Tokens accumulate into two pre-grown typed arrays (offsets + kinds), not an `Array<{…}>`.
- Preserve zero-copy Worker transfer.
- Opt-in at the API level: callers that don't pass `tokens: true` pay nothing extra.
- Ship a committed default theme (OneDark-Pro) and a committed default code font (JetBrains Mono Regular) so the extension produces the same look on every page regardless of the host page's own CSS.

**Non-Goals:**

- Collapsible/expandable tree view. Out of scope — this is only coloring.
- Search, copy-button, or any other interactive UI.
- Theming configuration or user-selectable palettes. One default dark theme (OneDark-Pro) is enough for v1.
- Light-mode companion palette. Explicitly deferred to a follow-up change; the stylesheet structure reserves a slot for it so adding it later is additive.
- Reading the page's `prefers-color-scheme` to adapt. The extension always renders its own self-contained code block.
- Highlighting input that produced formatter errors. Today the extension leaves error cases untouched; we preserve that exactly.
- Web page CSP bypass. If a page's CSP blocks our injected `<style>` or `@font-face`, we degrade gracefully to plain text (same as today).

## Decisions

### Decision: Emit tokens as two parallel typed arrays, not objects

We add two pre-allocated buffers alongside the output buffer:

- `tokenOffsets: Uint32Array` — pairs of `[startByte, endByte)` into the **output** (not the input), one pair per token.
- `tokenKinds: Uint8Array` — one byte per token with the token kind (from a fixed enum).

The hot loop appends to these arrays via a single index increment, same pattern as the existing output buffer. No per-token object allocation. The buffers grow geometrically on overflow, mirroring `createOutputBuffer`.

**Alternatives considered:**

- _Array of `{ kind, start, end }` objects._ Rejected — allocates per token, destroys the zero-allocation property, and serializes poorly across the Worker boundary.
- _Inline sentinel bytes in the output stream._ Rejected — corrupts the `output` contract and would require a second pass to strip for callers who only want text.
- _Re-tokenize in `content.js` after formatting._ Rejected — duplicates work the formatter already does and re-introduces the parse cost the zero-parse formatter exists to avoid.

### Decision: Token offsets reference the output, not the input

The DOM renderer works on the formatted string. Pointing offsets into the input would force the renderer to re-walk input→output mapping. Offsets into the output let the renderer slice directly.

Trade-off: callers who wanted to highlight the _original_ unformatted input (we don't know of any) would be out of luck. Acceptable — the only known consumer is the extension, which renders the formatted output.

### Decision: Offsets are UTF-16 code unit indices, not byte indices

The renderer builds `<span>` text via `decodedOutput.substring(start, end)`. JavaScript strings are UTF-16 code units, so the formatter must emit offsets in UTF-16 code units to match, not byte offsets into the underlying `Uint8Array`. For pure-ASCII JSON (the common case) these coincide; for JSON containing non-ASCII keys or string values (e.g. `"café"`, `"日本語"`, emoji) they diverge.

The formatter tracks a `utf16Cursor` alongside its existing `byteCursor` in the hot loop. Increment rules, decided from the lead byte of each UTF-8 code point:

- `0xxxxxxx` (1-byte, ASCII) → `utf16Cursor += 1`
- `110xxxxx` (2-byte) → `utf16Cursor += 1`
- `1110xxxx` (3-byte) → `utf16Cursor += 1`
- `11110xxx` (4-byte, surrogate pair in UTF-16) → `utf16Cursor += 2`
- `10xxxxxx` (continuation byte) → `utf16Cursor += 0`

This adds one branch per byte to the hot loop. For pure-ASCII JSON the branch is fully predicted and the cost is negligible.

**Alternative considered:** Emit byte offsets and convert to UTF-16 offsets in a second pass over the decoded string. Rejected — moves correctness-critical work out of the formatter where it has byte-level visibility and into the renderer, where reconstructing the byte-to-codeunit mapping requires re-walking the string.

### Decision: Distinguish keys from values by the next non-whitespace byte

JSON keys and JSON string values are lexically identical — both are `"…"`. The formatter already knows which is which implicitly: keys are always followed (after optional whitespace) by `:`. We extend the string-exit logic: when a closing quote is seen, peek ahead at the next meaningful input byte. If it's `:`, the just-closed string is a key; otherwise it's a string value.

This peek is O(1) amortized because JSON has no comments and the formatter is already skipping whitespace. No look-behind, no buffering, no second pass.

**Alternative considered:** Classify everything as `string` and let the renderer walk output a second time looking for trailing `:`. Rejected — moves the work out of the formatter's already-optimal single pass and into JS string scanning.

### Decision: Tokens opt-in via `opts.tokens === true`

Default callers get `{ output, errors }` exactly as today. When `tokens: true`, the result also contains `tokens: { offsets: Uint32Array, kinds: Uint8Array, count: number }`. This keeps the fast path fast for anyone who doesn't want highlighting and keeps the change backward-compatible.

### Decision: Worker transfer piggybacks on the existing message

`worker.js` already posts `{ output, errors }` back with the output's `ArrayBuffer` in the transfer list. When `tokens` are requested, it adds `tokens.offsets.buffer` and `tokens.kinds.buffer` to the same transfer list. Still zero-copy, one `postMessage` per format call.

### Decision: Rendering strategy — one `<span>` per token in a `DocumentFragment`, single swap

`content.js` builds one `DocumentFragment` containing all highlighted spans and the interleaved whitespace text nodes, then does a single `el.replaceChildren(fragment)`. This avoids layout thrash and keeps DOM churn proportional to token count, not byte count.

Between tokens the formatter's own whitespace (newlines + indent) lives in the output buffer — the renderer slices those gaps as plain text nodes. That means the visible text is still byte-identical to the non-highlighted path.

**Empirical validation.** A throwaway perf spike (`spike-highlight/`) benchmarked this strategy against the CSS Custom Highlight API on headed Chromium at 1k / 10k / 100k / 500k token payloads with a wall-clock scroll FPS metric. Summary on a 120Hz ProMotion display:

| Tokens  | Spans setup | Spans scroll FPS | Highlight setup | Highlight scroll FPS |
| ------- | ----------- | ---------------- | --------------- | -------------------- |
| 1,125   | 1 ms        | 120              | 0.5 ms          | 120                  |
| 11,205  | 8 ms        | 116              | 2.4 ms          | 119                  |
| 112,005 | 66 ms       | 76               | 12 ms           | 40                   |
| 504,005 | 259 ms      | 29               | 61 ms           | 3                    |

Spans lose on one-shot setup but win decisively on sustained scroll, which is the dimension the user actually feels. Custom Highlight API is setup-fast because it skips DOM allocation, but slow during scroll because Blink's paint pipeline re-consults the highlight registry on every repaint and that consultation is not O(visible tokens), it is closer to O(all tokens in the registry) in current Chrome. The `<pre>`-with-many-spans path is handled more efficiently by the compositor because each span is a regular DOM element that can be culled per scroll region.

**Alternatives considered:**

- **CSS Custom Highlight API (`CSS.highlights` + `::highlight()` pseudo).** Would avoid creating any DOM nodes inside the `<pre>` and theoretically scale better. Requires a split-world architecture because `CSS.highlights` is per-realm and the default content-script isolated world cannot register highlights that apply to page paint — validated via a Chromium blink-dev thread and reproduced in the spike. Split-world works (the spike confirmed `highlightRegistered: yes` with a `"world": "MAIN"` content script), but sustained scroll degrades sharply above ~50k tokens: 40 FPS at 100k, 3 FPS at 500k. Rejected. See `spike-highlight/` for the reproducible benchmark.
- **Canvas text rendering.** Rejected. Breaks `Ctrl+F`, select/copy, and screen-reader access — loses everything that makes highlighting a UX win.
- **Virtualized rendering (render only visible tokens).** Rejected for a content-script context. The content script doesn't own the scrollable viewport — the page does. Implementing virtualization on top of an arbitrary page's scroll container is fragile.

### Decision: Style injection via a single `<style>` element appended to `<head>`

One `<style>` element, injected once per page on first format, tagged with `data-pretty-json`. Uses `:where(.pj-key) { color: … }` so page CSS can override without specificity battles. The stylesheet carries three things: the `@font-face` rule for JetBrains Mono, the `pre.json-formatted` structural rules (background, foreground, font-family), and the per-token-class color rules. The dark palette lives in an un-gated block; a future light companion would go in a sibling `@media (prefers-color-scheme: light)` block without touching any existing rules.

### Decision: Five span classes, punctuation rendered as plain text

The content script emits five `pj-*` classes: `pj-key`, `pj-string`, `pj-number`, `pj-boolean`, `pj-null`. **Punctuation tokens are not emitted as spans** — the `{`, `}`, `[`, `]`, `,`, `:` characters are placed in the `DocumentFragment` as plain text nodes and inherit the default foreground color from `pre.json-formatted`.

Two reasons, both aligned:

1. **OneDark-Pro agrees.** The theme has no JSON-specific override for punctuation; it renders `{}[]:,` as `editor.foreground` (`#abb2bf`), which is identical to the default color of the `<pre>` block. Emitting a `pj-punct` span would set the same color the text would have without any span at all. Zero visual difference.
2. **~35% of tokens disappear.** In the spike's synthetic corpus roughly 35% of tokens are punctuation. Dropping them from the DOM proportionally shrinks setup time, reduces scroll-path layout work, and raises the practical ceiling under `HIGHLIGHT_TOKEN_THRESHOLD`.

**Important separation of concerns:** the _formatter_ still emits `TOKEN_PUNCT` in the token stream for universality — any future consumer (a different theme, a tree view, an analytics pass) that wants punctuation info can still get it. Only the _content script renderer_ is opinionated about not producing a span for them.

### Decision: Default theme — OneDark-Pro (Binaryify), dark-only for v1

Source: `OneDark-Pro.json` from [Binaryify/OneDark-Pro](https://github.com/Binaryify/OneDark-Pro), MIT licensed. Vendored at `themes/OneDark-Pro.json` as a reference; the actual color values are extracted into the injected stylesheet, not parsed at runtime.

Extracted palette (JSON-relevant subset only):

| Role                  | Token class          | Color     | Name              |
| --------------------- | -------------------- | --------- | ----------------- |
| background            | `pre.json-formatted` | `#282c34` | editor.background |
| default / punctuation | `pre.json-formatted` | `#abb2bf` | editor.foreground |
| key                   | `.pj-key`            | `#e06c75` | red               |
| string                | `.pj-string`         | `#98c379` | green             |
| number                | `.pj-number`         | `#d19a66` | orange            |
| boolean               | `.pj-boolean`        | `#56b6c2` | cyan              |
| null                  | `.pj-null`           | `#56b6c2` | cyan              |

Contrast on the `#282c34` background (WCAG AA for normal text requires ≥ 4.5):

- `#e06c75` red → ~4.9 ✓
- `#98c379` green → ~6.8 ✓
- `#d19a66` orange → ~6.1 ✓
- `#56b6c2` cyan → ~6.4 ✓
- `#abb2bf` gray → ~8.7 ✓

All pass AA for normal text.

**Light companion is explicitly deferred.** The injected stylesheet does not read `prefers-color-scheme` — OneDark is applied unconditionally. The architectural slot for a future `@media (prefers-color-scheme: light)` block is reserved by comment, but no light palette is shipped in v1.

**Attribution** lives in the top-level `README.md` with a line of the form: "Default color palette: OneDark-Pro by Binaryify, used under the MIT License. See `themes/OneDark-Pro.json` for the full source."

### Decision: Unconditional background override on `pre.json-formatted`

When the content script successfully formats a `<pre>`, it applies the OneDark-Pro background (`#282c34`) to that element via the `.json-formatted` class **unconditionally**, regardless of the host page's own `<pre>` styling or `prefers-color-scheme`. This turns the element into a self-contained code block.

**Rationale.** OneDark-Pro's foreground colors were designed to be read on `#282c34`. On a random white page those colors look washed out; `#e06c75` red and `#d19a66` orange in particular lose their pop. The honest call is to commit to "render as a code block with its own background," not "sprinkle colors onto the page's existing `<pre>`." The cost is one more pixel of visual footprint; the benefit is the theme actually looks like itself everywhere.

**What we do not override:** padding, border, margin, width, line-height. If the page already styles its `<pre>` with a specific layout, we leave that alone and only change colors + font. Minimal intervention.

**Resolves the previous "dark-mode detection can be wrong on pages with their own dark theme" risk.** We're no longer reading the page's theme at all. We render our own. The risk is retired.

### Decision: Default font — JetBrains Mono Regular, bundled WOFF2

**File:** `themes/fonts/JetBrainsMono-Regular.woff2` — the full (not subset) JetBrains Mono Regular 400, ~110 KB. License: SIL Open Font License 1.1, `OFL.txt` shipped alongside the font file.

**Why full, not subset.** A Latin-only subset would be ~30 KB but would render any non-Latin JSON string values (CJK, Arabic, emoji) in the fallback system monospace, producing mixed-font output for those characters. For a "super high performance, UX matters" extension, consistent rendering for any JSON content beats a 70 KB download saving. The extension's total bundle size with the font is still under 150 KB.

**Injection path.** The content script's `ensureStylesheet()` injects an `@font-face` rule as part of the same stylesheet that carries the color rules. The font URL is built dynamically with `chrome.runtime.getURL("themes/fonts/JetBrainsMono-Regular.woff2")`, which requires declaring the file in `manifest.json` `web_accessible_resources`.

```css
@font-face {
  font-family: "JetBrains Mono";
  src: url("<chrome-extension url>") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
pre.json-formatted {
  font-family:
    "JetBrains Mono",
    ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
}
```

**Preload before first render to eliminate FOUC.** After `ensureStylesheet()` injects the `@font-face`, the content script awaits `document.fonts.load('400 13px "JetBrains Mono"')` (or equivalent) before calling `renderHighlighted()`. This blocks ~10–30 ms on first format, invisible compared to the format step itself, and guarantees the user sees the formatted JSON in the correct font on the first frame rather than seeing a system-monospace flash followed by a re-layout in JetBrains Mono.

**Fallback chain** in the `font-family` list handles the case where the `@font-face` load fails (rare — restrictive page CSP `font-src` directive). The user sees a high-quality system monospace (`ui-monospace` resolves to SF Mono on macOS, Cascadia on Windows, etc.). No error, no regression from today.

**Weights / styles.** Regular 400 only. No bold, no italic — neither is used in the highlighting design, and bundling additional weights would triple the font payload for no visual gain.

**Ligatures.** JetBrains Mono's programming ligatures (`=>`, `!=`, `<=`) don't fire on JSON because canonical JSON has no arrow or comparison operators. We leave ligatures at the CSS default and JSON renders identically either way.

**Attribution** in the top-level `README.md`: "Default code font: JetBrains Mono by JetBrains, licensed under SIL OFL 1.1. The font file and its license are bundled at `themes/fonts/`."

## Risks / Trade-offs

- **Token buffer growth under adversarial input** → Mitigation: geometric growth with the same doubling policy as the output buffer. A single 1MB JSON file averages ~1 token per 8-10 output bytes, so worst-case the token buffer is roughly 1/2 the size of the output buffer. Acceptable.

- **Large DOM with hundreds of thousands of spans makes scrolling janky** → Mitigation: fall back to plain-text rendering above a `HIGHLIGHT_TOKEN_THRESHOLD` constant of `250_000` tokens. The spike numbers justify this value: at 100k tokens spans give 76 FPS (smooth), at 500k they give 29 FPS (visibly janky but still readable). 250k is the conservative "feels smooth on every tested machine" bound and corresponds to roughly 2.5 MB of formatted JSON — larger than any realistic API response. Highlighting is a nice-to-have; above the threshold we still render formatted plain text with the `json-formatted` class and the OneDark-Pro background + JetBrains Mono font, preserving today's behavior for huge files and the v1 look. The constant lives in `src/constants.js` so it can be tuned without touching the content script. Note: because punctuation tokens are not emitted as spans, ~35% of the raw token count never produces DOM nodes, giving the threshold meaningful headroom compared to a naïve one-span-per-token strategy.

- **Key vs. string disambiguation gets the peek wrong on malformed input** → Mitigation: if the formatter later records an error for the containing object, the extension already leaves the `<pre>` untouched. So misclassification only happens on input we wouldn't render anyway.

- **Page CSP blocks the injected `<style>`** → Mitigation: wrap the `document.head.appendChild(style)` in try/catch; on failure, skip highlighting and fall back to `el.textContent = output` (today's behavior). No regression.

- **Page CSP blocks loading the bundled font via `chrome-extension://`** → Mitigation: the `font-family` declaration lists `"JetBrains Mono"` first but falls through to `ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`. If the `@font-face` load fails, the browser silently uses the next available family and the user sees a high-quality system monospace. No exception, no regression. `font-display: swap` in the `@font-face` rule ensures the text never stalls waiting for a font that won't arrive.

- **Bundled font file increases extension size by ~110 KB** → Accepted. The font is the single largest asset but the total bundle is still well under 150 KB — small by extension standards — and the consistent cross-page rendering it buys is the point of shipping it.

- **Worker transfer list grows to three buffers** → Trivial; `postMessage` handles any number of transferables. No meaningful overhead.

## Migration Plan

No data migration. The change is additive:

1. Land formatter token emission behind the `opts.tokens` opt-in with unit tests; existing tests keep passing because the default path is unchanged.
2. Thread tokens through chunker → worker → client, preserving zero-copy transfer.
3. Update `content.js` to request tokens and render spans. Inject stylesheet on first highlight.
4. Add e2e fixtures that assert span structure for happy-path and assert absence of spans for error cases.
5. Ship.

Rollback: revert the `content.js` change. The formatter changes are inert without a caller passing `tokens: true`, so they can stay in place with no user-visible effect.

## Open Questions

- **Should errored `<pre>` blocks still get partial highlighting up to the error offset?** Default answer: no. Today's behavior is "invalid JSON stays untouched" and the e2e suite asserts that. Preserve it unless there's a strong reason to change.

## Resolved Questions

- ~~**What's the exact byte-size / token-count threshold above which we skip highlighting?**~~ Resolved: `250_000` tokens. See the "Large DOM" risk above for the empirical justification; the reproducible benchmark lives in `spike-highlight/` at the repo root.
- ~~**Does the CSS Custom Highlight API from a Chrome extension content script work at all?**~~ Resolved: yes, from a `"world": "MAIN"` content script (isolated-world highlights are not consulted during paint because `CSS.highlights` is per-realm — confirmed via Chromium blink-dev and reproduced in the spike). Not used in the final design because sustained scroll is too slow at the sizes we care about, even though the mechanism is sound.
- ~~**Which default color palette?**~~ Resolved: **OneDark-Pro** from [Binaryify/OneDark-Pro](https://github.com/Binaryify/OneDark-Pro), MIT licensed. Dark only for v1; light companion deferred. Source vendored at `themes/OneDark-Pro.json`; the 6 extracted color values live in the injected stylesheet.
- ~~**Which default code font?**~~ Resolved: **JetBrains Mono Regular** (full file, not subset), SIL OFL 1.1, bundled as WOFF2 at `themes/fonts/JetBrainsMono-Regular.woff2`. Preloaded via `document.fonts.load()` before first render to eliminate FOUC. Fallback chain to system monospace for CSP edge cases.
- ~~**Do we emit `pj-punct` spans?**~~ Resolved: no. Punctuation renders as the default foreground color (which matches OneDark-Pro's own punctuation styling), and dropping the spans cuts DOM node count by ~35%. The formatter still classifies `TOKEN_PUNCT` for universality; only the renderer is opinionated. See the "Five span classes" decision above.
- ~~**Should highlighting adapt to `prefers-color-scheme`?**~~ Resolved: no, not for v1. The extension renders its own self-contained code block regardless of page theme or OS preference. A `@media (prefers-color-scheme: light)` slot is reserved in the stylesheet structure for a future light companion but contains no rules in v1.
