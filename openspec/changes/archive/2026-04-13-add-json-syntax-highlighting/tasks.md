## 1. Token infrastructure in constants and formatter

- [x] 1.1 Add token-kind byte enum (`TOKEN_KEY`, `TOKEN_STRING`, `TOKEN_NUMBER`, `TOKEN_BOOLEAN`, `TOKEN_NULL`, `TOKEN_PUNCT`), initial token-buffer capacity, and `HIGHLIGHT_TOKEN_THRESHOLD = 250_000` to `src/constants.js`. `TOKEN_PUNCT` stays in the formatter-side enum even though the renderer skips emitting spans for it, so future consumers can still get punctuation classification
- [x] 1.2 Add a `createTokenBuffer` helper in `src/formatter.js` that owns `offsets: Uint32Array`, `kinds: Uint8Array`, a `count` index, and a `push(kind, start, end)` that grows both arrays geometrically on overflow with zero per-token allocation
- [x] 1.3 Thread an optional token buffer through the existing formatter state so the hot loop writes `[start, end)` UTF-16 code unit offsets into the decoded output as each token is emitted
- [x] 1.4 Maintain a `utf16Cursor` in the formatter hot loop alongside `byteCursor`: increment by 1 for ASCII bytes, 0 for UTF-8 continuation bytes (`10xxxxxx`), 1 for 2-byte and 3-byte lead bytes, 2 for 4-byte lead bytes (surrogate pair). Use `utf16Cursor` when recording token start/end offsets

## 1a. Vendored theme and font assets

- [x] 1a.1 Create `themes/` at the repo root
- [x] 1a.2 Download `OneDark-Pro.json` from [Binaryify/OneDark-Pro](https://github.com/Binaryify/OneDark-Pro/blob/master/themes/OneDark-Pro.json) and place it at `themes/OneDark-Pro.json` as a vendored reference (not parsed at runtime)
- [x] 1a.3 Remove any stale theme reference files from the repo root (e.g. the earlier `OneDark.json` if present)
- [x] 1a.4 Create `themes/fonts/`
- [x] 1a.5 Download the official JetBrains Mono Regular 400 WOFF2 from [JetBrains/JetBrainsMono releases](https://github.com/JetBrains/JetBrainsMono/releases) and place it at `themes/fonts/JetBrainsMono-Regular.woff2`. Use the full file (~92 KB), not a subset
- [x] 1a.6 Place the SIL OFL 1.1 license text at `themes/fonts/OFL.txt` (from the same JetBrains Mono distribution)

## 2. Token classification in the hot loop

- [x] 2.1 Emit a `punctuation` token for each structural byte (`{`, `}`, `[`, `]`, `,`, `:`) at the exact output offset where it is written
- [x] 2.2 Emit `string` tokens for quoted scalars, capturing `[openingQuoteOffset, closingQuoteOffset+1)` in the output buffer
- [x] 2.3 Disambiguate keys from string values by peeking the next non-whitespace input byte after a closing quote; if it is `:`, retroactively flip the just-pushed token kind from `string` to `key`
- [x] 2.4 Emit `number`, `boolean`, and `null` tokens for unquoted scalars by tracking the output offset where the scalar starts and closing the token at the first delimiter byte
- [x] 2.5 Verify no new allocations in the hot loop via a targeted microbenchmark (informal — compare allocation counts with and without `tokens: true`)

## 3. Public API opt-in

- [x] 3.1 Accept `opts.tokens === true` in `formatString` and `formatBytes`; when set, attach `tokens: { offsets, kinds, count }` to the returned object
- [x] 3.2 Ensure the default (no `tokens` option) code path returns byte-identical `output` and returns an object with exactly `output` and `errors` — no `tokens` field
- [x] 3.3 Re-export token-kind constants from `src/index.js` so DOM consumers can switch on them symbolically

## 4. Worker boundary

- [x] 4.1 Teach `src/chunker.js` to plumb through the optional token buffer across chunks without per-chunk allocation
- [x] 4.2 In `src/worker.js`, when the incoming message requests tokens, serialize `tokens.offsets.buffer` and `tokens.kinds.buffer` on the response and add both to the `postMessage` transfer list alongside the existing output transfer
- [x] 4.3 In `src/client.js`, forward `opts.tokens` to the worker and reconstruct the `tokens` object on the result
- [x] 4.4 Confirm the default path (no `tokens` option) remains a single-buffer zero-copy transfer with no behavior change

## 5. Formatter unit tests

- [x] 5.1 Add tests to `src/formatter.test.js` that exercise every token kind on a representative `{"a":1,"s":"v","b":true,"z":null,"arr":[1,2]}` input and assert both `count` and the kind/offset of each token
- [x] 5.2 Add tests asserting that `decodedOutput.substring(offsets[2i], offsets[2i+1])` reproduces the token's literal text for every token
- [x] 5.3 Add a test asserting that omitting `tokens` leaves the result shape unchanged and byte-identical to today
- [x] 5.4 Add a test that forces token-buffer growth by generating an input with many tokens and asserts correctness post-growth
- [x] 5.5 Add a test for the key-vs-string disambiguation edge cases: string value that happens to equal a key-looking literal, nested objects, and empty objects
- [x] 5.6 Add a non-ASCII test: `{"café":"日本語","emoji":"🎉"}`. Assert that every token's `[start, end)` pair correctly slices the decoded string, including the 4-byte emoji which spans a UTF-16 surrogate pair (so its token length is 2 code units, not 1)

## 6. Content script rendering

- [x] 6.1 Update `content.js` to call `formatter.format(text, { indentSize: 2, tokens: true })`
- [x] 6.2 Add a `renderHighlighted(el, outputString, tokens)` helper that walks the token arrays and builds a single `DocumentFragment`. For each token: if its kind is `TOKEN_PUNCT`, append a plain text node with the punctuation character; otherwise append a `<span class="pj-…">` with the token text. Whitespace gaps between tokens become plain text nodes. Finish with `el.replaceChildren(fragment)`
- [x] 6.3 Map the five non-punctuation token-kind bytes to `pj-key`, `pj-string`, `pj-number`, `pj-boolean`, `pj-null`. `TOKEN_PUNCT` has no class — the renderer skips creating a span for it
- [x] 6.4 Preserve the existing `el.classList.add("json-formatted")` behavior alongside highlighted rendering
- [x] 6.5 Implement the oversized-payload fallback: if `tokens.count > HIGHLIGHT_TOKEN_THRESHOLD` (250,000), skip span rendering and fall back to `el.textContent = outputString`. The `<pre>` still gets the `json-formatted` class so the theme background and font apply. Empirical basis for the constant is recorded in `design.md` and reproducible via `spike-highlight/run.mjs`
- [x] 6.6 Before calling `renderHighlighted()` for the first time per page, `await document.fonts.load('400 13px "JetBrains Mono"')` to preload the bundled font. This eliminates FOUC by ensuring the first paint of any highlighted `<pre>` uses JetBrains Mono, not a fallback-then-swap

## 7. Stylesheet injection (OneDark-Pro + JetBrains Mono)

- [x] 7.1 Add a one-shot `ensureStylesheet()` helper in `content.js` that injects a `<style data-pretty-json>` element into `document.head` on first call and is a no-op on subsequent calls (guard by querying for the attribute)
- [x] 7.2 Build the stylesheet string at runtime. Substitute `chrome.runtime.getURL("themes/fonts/JetBrainsMono-Regular.woff2")` into an `@font-face` declaration:
  ```css
  @font-face {
    font-family: "JetBrains Mono";
    src: url("…chrome-extension URL…") format("woff2");
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }
  ```
- [x] 7.3 Define structural rules on `pre.json-formatted` that unconditionally set `background-color: #282c34`, `color: #abb2bf`, and `font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`. Do not touch padding, border, margin, width, or line-height — respect the host page's layout for those
- [x] 7.4 Define per-class color rules for the five non-punctuation token classes, scoped under `pre.json-formatted` and using `:where(.pj-…)` for zero specificity so page CSS can override:
  - `.pj-key` → `#e06c75`
  - `.pj-string` → `#98c379`
  - `.pj-number` → `#d19a66`
  - `.pj-boolean` → `#56b6c2`
  - `.pj-null` → `#56b6c2`
- [x] 7.5 Reserve an empty `/* v2: @media (prefers-color-scheme: light) { … } */` comment block in the stylesheet so a future light companion is an additive change, not a rewrite. No light rules in v1
- [x] 7.6 Wrap `ensureStylesheet()`, the font preload await, and `renderHighlighted()` in try/catch so that any DOM/CSP/font-load failure falls back to `el.textContent = outputString` without throwing. On font-load failure specifically, the `font-family` fallback chain still applies, so the `<pre>` renders in a system monospace rather than failing

## 8. E2E fixtures and tests

- [x] 8.1 Add a fixture HTML page under `e2e/fixtures/` with a mixed `<pre>` containing a key, string, number, boolean, null, and punctuation
- [x] 8.2 Add a Playwright test asserting each of `span.pj-key`, `span.pj-string`, `span.pj-number`, `span.pj-boolean`, and `span.pj-null` exist inside the formatted `<pre>`, AND asserting that `span.pj-punct` does NOT exist (punctuation must render as plain text)
- [x] 8.3 Add a fixture + test asserting that an invalid-JSON `<pre>` has neither `json-formatted` nor any `pj-`-prefixed descendants
- [x] 8.4 Add a fixture + test asserting that a page with multiple highlightable `<pre>` blocks contains exactly one `style[data-pretty-json]` element
- [x] 8.5 Add a fixture + test for the worker path asserting a large-but-under-threshold JSON payload still produces highlighted spans (assert on `span.pj-string` or `span.pj-number`; do NOT assert on `pj-punct`)
- [x] 8.6 Add a fixture + test for the oversized-payload fallback: a `<pre>` whose token count exceeds `HIGHLIGHT_TOKEN_THRESHOLD` receives the formatted plain text and the `json-formatted` class but contains no `pj-` descendants, AND its computed `background-color` still matches OneDark-Pro's `#282c34`
- [x] 8.7 Add a test asserting the theme is applied to successfully formatted `<pre>` blocks: `getComputedStyle(pre).backgroundColor === "rgb(40, 44, 52)"` and `getComputedStyle(pre).fontFamily` starts with `"JetBrains Mono"`
- [x] 8.8 Add a test asserting the injected stylesheet contains an `@font-face` rule referencing the `chrome-extension://.../themes/fonts/JetBrainsMono-Regular.woff2` URL

## 9. Manifest and wrap-up

- [x] 9.1 Add `themes/fonts/JetBrainsMono-Regular.woff2` to `manifest.json` `web_accessible_resources` so the content script's injected `@font-face` can resolve the font via `chrome.runtime.getURL`. Pattern should match the same `<all_urls>` / `file:///*` list the existing `src/…` entries use
- [x] 9.2 Run `node --test src/formatter.test.js` and confirm all pre-existing tests still pass alongside the new ones
- [x] 9.3 Run `npm run test:e2e` and confirm the full e2e suite passes, including the new fixtures
- [x] 9.4 Update the top-level `README.md` with (a) a short "Syntax highlighting" section describing the `tokens` option and the five `pj-*` class names, (b) an attribution line for OneDark-Pro ("Default color palette: OneDark-Pro by Binaryify, used under the MIT License. See `themes/OneDark-Pro.json`."), and (c) an attribution line for JetBrains Mono ("Default code font: JetBrains Mono by JetBrains, licensed under SIL OFL 1.1. See `themes/fonts/OFL.txt`.")
