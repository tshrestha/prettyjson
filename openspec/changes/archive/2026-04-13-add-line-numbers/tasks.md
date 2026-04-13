## 1. Stylesheet delta

- [x] 1.1 Extend the CSS literal in `ensureStylesheet()` in `content.js` to set `pre.json-formatted { display: grid; grid-template-columns: auto 1fr; }`
- [x] 1.2 Add `pre.json-formatted .pj-gutter { color: #5c6370; text-align: right; padding: 0 0.75em 0 0.25em; user-select: none; -webkit-user-select: none; }`
- [x] 1.3 Add `pre.json-formatted .pj-code { min-width: 0; }` so the code column can shrink/overflow correctly inside the grid
- [x] 1.4 Verify `document.querySelectorAll("style[data-pretty-json]").length === 1` is still true (no new style element was introduced)

## 2. Gutter text builder

- [x] 2.1 Add a `countLines(str)` helper in `content.js` that returns `1 + (number of \n characters)` — single linear scan, no regex allocation
- [x] 2.2 Add a `buildGutterText(lineCount)` helper that returns a `\n`-joined string from `1` to `lineCount`
- [x] 2.3 Add a unit-test-free sanity check: inline comment example shows `buildGutterText(4)` → `"1\n2\n3\n4"`

## 3. Unified gutter render path

- [x] 3.1 Extract the existing span-building body of `renderHighlighted` into a helper `buildCodeFragment(output, tokens, kindToClass, puncCode)` that returns a `DocumentFragment` (no DOM mutation)
- [x] 3.2 Add `renderWithGutter(el, codeFragment, lineCount)` that creates `<span class="pj-gutter" aria-hidden="true">{buildGutterText}</span>` and `<span class="pj-code">{codeFragment}</span>`, then calls `el.replaceChildren(gutter, code)`
- [x] 3.3 Update the highlighted branch of the `for (const el of candidates)` loop to call `buildCodeFragment` + `renderWithGutter`
- [x] 3.4 Update the above-threshold branch to build a single text node with `result.output`, wrap it in a `DocumentFragment`, and call `renderWithGutter` with it
- [x] 3.5 Keep the existing DOM-failure `try/catch` fallback: on render error, log a warning and set `el.textContent = result.output` (no gutter, no `pj-code` — matches existing graceful-degrade behavior)

## 4. E2E coverage

- [x] 4.1 Add an e2e fixture page containing a simple `<pre>` with a multi-line JSON object (4–6 lines)
- [x] 4.2 Assert the formatted `<pre>` contains exactly one `.pj-gutter` and one `.pj-code`, and that `.pj-gutter` text equals the expected newline-joined numbers
- [x] 4.3 Add a fixture with a large above-threshold JSON payload (≥ `HIGHLIGHT_TOKEN_THRESHOLD` tokens) and assert the `<pre>` still has `.pj-gutter` alongside the plain-text `.pj-code`
- [x] 4.4 Add a clipboard-fidelity test: focus the formatted `<pre>`, issue Select All, copy, and assert the clipboard text equals the original raw formatted JSON (no leading digits)
- [x] 4.5 Add a computed-style assertion: `getComputedStyle(pre).display === "grid"` and the gutter's computed `color` matches `rgb(92, 99, 112)` (OneDark-Pro comment color)
- [x] 4.6 Add a large-document fixture (≥ 100 lines) and assert `.pj-gutter` contains every line number from `1` to the last

## 5. Manual verification

- [x] 5.1 Load the unpacked extension in Chrome, visit the e2e fixture pages, and eyeball that the gutter is aligned, right-justified, and visually muted
- [x] 5.2 Select all text in a formatted `<pre>` by mouse drag across both columns, copy, and paste into a text editor — confirm only formatted JSON (no numbers) is pasted
- [x] 5.3 Test `Cmd+A` → `Cmd+C` specifically (the case flagged as a risk in `design.md`) and confirm clipboard content is clean
- [x] 5.4 Test a `<pre>` with one very long line and confirm horizontal scroll works and the gutter stays at column 1
