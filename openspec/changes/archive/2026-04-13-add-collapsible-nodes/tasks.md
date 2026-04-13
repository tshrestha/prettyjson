## 1. Stylesheet delta

- [x] 1.1 Extend `ensureStylesheet()` CSS in `content.js` with a `pre.json-formatted :where(.pj-opener, .pj-closer)` block setting `cursor: pointer` and a subtle `:hover` background (e.g. `rgba(255, 255, 255, 0.08)` with `border-radius: 2px`)
- [x] 1.2 Add `pre.json-formatted :where(.pj-opener, .pj-closer):focus-visible` rule with a 1–2px outline using `#61afef` (OneDark-Pro blue)
- [x] 1.3 Add `pre.json-formatted :where(.pj-placeholder) { color: #5c6370; }` so the ellipsis looks like a comment
- [x] 1.4 Confirm only one `<style data-pretty-json>` element is still injected

## 2. Bracket pairing and container builder

- [x] 2.1 In `content.js`, rename `buildCodeFragment(output, tokens, kindToClass, puncCode)` to a top-level function and rework its body to maintain a `stack` of append targets where `stack[0]` is the outer fragment and each push is a new `.pj-container` scaffold
- [x] 2.2 When a punct token's character is `{` or `[`, create the container scaffold (`.pj-container` + `.pj-opener` + empty `.pj-content` + `.pj-placeholder` + empty `.pj-closer`), set `data-kind`, `aria-expanded="true"`, attach opener/closer `role="button"` and `tabindex="0"`, fill the opener's text with the bracket char, append the scaffold to the current top of stack, then push the new `.pj-content` onto the stack
- [x] 2.3 When a punct token's character is `}` or `]`, set the top-of-stack's parent's `.pj-closer` text to the bracket char, then pop the stack
- [x] 2.4 For all other tokens (non-container punct, keys, strings, numbers, booleans, null) and whitespace runs, append to the top of the stack as before (span for typed tokens, text node for whitespace and non-container punct)
- [x] 2.5 Defensive guard: if the token stream ends with a non-empty stack (malformed), fall through to plain-text render — do not emit partial containers

## 3. Initial render and gutter integration

- [x] 3.1 Update the highlighted branch of the `for (const el of candidates)` loop so `buildCodeFragment` returns a fragment whose top-level children are either tokens or complete containers
- [x] 3.2 `renderWithGutter` stays unchanged — it already wraps the returned fragment in a `.pj-code` span next to a `.pj-gutter`
- [x] 3.3 Confirm line-count for initial gutter is still `countLines(result.output)` (no containers are collapsed yet)
- [x] 3.4 Above-threshold branch is untouched — no containers, no click handler

## 4. Delegated toggle handler and gutter recompute

- [x] 4.1 Add a `toggleContainer(containerEl)` helper: flip `aria-expanded`, toggle `hidden` on `.pj-content` and `.pj-placeholder`, then call `recomputeGutter(pre)`
- [x] 4.2 Add `recomputeGutter(pre)`: read `pre.querySelector(".pj-code").innerText`, count visible rows as `1 + number of \n`, write `buildGutterText(rows)` back into `.pj-gutter.textContent`
- [x] 4.3 After `renderWithGutter`, attach a single `click` listener to the `.pj-code` element: use `e.target.closest(".pj-opener, .pj-closer")` and call `toggleContainer(target.closest(".pj-container"))` if that match is non-null
- [x] 4.4 Attach a single `keydown` listener to `.pj-code`: on `Enter` or `Space` when the focused element matches the opener/closer selector, `preventDefault` and toggle the same way
- [x] 4.5 Focus is not moved during toggle; verify the `preventDefault` on Space also prevents page scroll

## 5. E2E coverage — core behavior

- [x] 5.1 Add fixture `e2e/fixtures/collapsible.html` with `<pre>{"a":[1,2,3],"b":{"c":true}}</pre>`
- [x] 5.2 Add `e2e/tests/collapsible.spec.js` test: formatted `<pre>` has exactly two top-level containers (one object, one array or nested object depending on structure — verify counts and `data-kind`)
- [x] 5.3 Test: every `.pj-container` has one `.pj-opener`, one `.pj-content`, one `.pj-placeholder`, and one `.pj-closer` child
- [x] 5.4 Test: initial `.pj-placeholder` has `hidden` attribute; initial `.pj-content` does not; initial `aria-expanded="true"`
- [x] 5.5 Test: clicking the outer `.pj-opener` collapses the container (`aria-expanded="false"`, `.pj-content[hidden]`, `.pj-placeholder` visible)
- [x] 5.6 Test: clicking the outer `.pj-closer` of a collapsed container re-expands it
- [x] 5.7 Test: collapsing one container does not affect a sibling container's `aria-expanded`
- [x] 5.8 Test: collapsing an outer, then re-expanding it, preserves a previously-set inner `aria-expanded="false"`

## 6. E2E coverage — keyboard and a11y

- [x] 6.1 Test: `role="button"` and `tabindex="0"` present on every `.pj-opener` and `.pj-closer`
- [x] 6.2 Test: pressing `Enter` on a focused opener toggles the container and leaves focus on the same opener
- [x] 6.3 Test: pressing `Space` on a focused closer toggles the container and does not scroll the page
- [x] 6.4 Test: hover state has `cursor: pointer` (check `getComputedStyle(opener).cursor === "pointer"`)

## 7. E2E coverage — gutter sync

- [x] 7.1 Test: on `collapsible.html`, record the initial gutter text, collapse the outer object, assert the new gutter text has strictly fewer entries and each entry is `1`..`N-K`
- [x] 7.2 Test: re-expanding restores the exact original gutter text
- [x] 7.3 Test: on a multi-line array fixture, collapse the array and verify `pre.querySelector(".pj-code").innerText.split("\n").length` equals the gutter entry count

## 8. E2E coverage — non-regression

- [x] 8.1 Test: `highlight-oversized.html` has zero `.pj-container`, `.pj-opener`, and `.pj-closer` descendants
- [x] 8.2 Update existing highlight.spec.js tests that assert `"{"` / `"}"` appear as plain text in `.pj-code.textContent` — these still pass since the opener/closer text nodes count as plain text via `textContent`. Run the suite to confirm.
- [x] 8.3 Update existing format.spec.js `EXPECTED_OBJECT` assertion if `textContent` vs `innerText` behavior differs; prefer `innerText` for readability-aware text

## 9. Manual verification

- [x] 9.1 Load unpacked extension, open a multi-nested fixture, click multiple containers, confirm instant collapse with no layout glitches
- [x] 9.2 Keyboard-only: Tab through openers/closers, use Enter and Space, confirm visible focus outline
- [x] 9.3 Collapse the root-level container, verify gutter shows exactly 1 row
- [x] 9.4 Nest deeply (e.g. 6 levels), collapse the innermost, verify all outer gutters still track correctly
- [x] 9.5 Copy a region that spans a collapsed container, confirm the visible ellipsis shows in the clipboard (documented limitation, not a bug)
