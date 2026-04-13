## Context

`content.js` currently builds a `DocumentFragment` for each formatted `<pre>` by walking the flat token stream emitted from the formatter. The resulting DOM is one level deep: a sequence of `<span class="pj-...">` children inside a `.pj-code` wrapper, with plain text nodes for whitespace and punctuation. The sibling `.pj-gutter` holds a pre-computed `"1\n2\n3\n…"` string.

The tokens from `src/` are an ordered list with kinds (`key`, `string`, `number`, `boolean`, `null`, `punct`) and UTF-16 offsets into the decoded formatted output. Structural containers (`{…}` / `[…]`) are expressed *implicitly* as a sequence of punctuation tokens — there is no "open/close pair" metadata. This is deliberate; the formatter's job is pure emission, not tree-building.

Two facts about the existing output shape are load-bearing for this change:

1. The formatter always puts the opening bracket at the end of a line, the contents indented on new lines, and the closing bracket on its own line aligned with the container's parent. So the whitespace *between* the opener and the first inner token always starts with `\n`, and the whitespace *between* the last inner token and the closer always starts with `\n`.
2. Because of fact 1, wrapping the inner content of a container in a `display: none` block removes the contained text, all inner newlines, and both gutter-relevant line counts — which is exactly what we want when collapsing.

## Goals / Non-Goals

**Goals:**
- Every container in a highlighted `<pre>` collapses and expands on click.
- Toggle state is independent per container.
- Collapsed containers render `{ … }` / `[ … ]` on one line and take one gutter row.
- Line-number gutter always has exactly one number per visible row.
- Toggle targets meet basic keyboard and a11y expectations (role, tabindex, aria-expanded, Space/Enter).
- Existing syntax-highlighting and line-number features continue to pass their specs without regression.

**Non-Goals:**
- Persistence of collapsed state across page reloads or between navigations.
- "Collapse all" / "expand all" controls, search/find, or any kind of chrome outside the `<pre>`.
- Collapsibles on above-threshold payloads (the fallback plain-text path). Out of scope — the fallback has no token stream to pair brackets.
- Copy fidelity across collapsed regions. A partial copy returns the visible text, which includes the ellipsis placeholder and is not valid JSON. This is an accepted trade-off and matches VS Code / GitHub behavior.
- Animations. Expand/collapse is instantaneous.
- Formatter or worker changes. The engine stays byte-identical.

## Decisions

### Decision 1 — Bracket pairing happens in the content script, in one pass

The content script's existing token-walking loop (`buildCodeFragment`) is extended with a stack of "currently-open containers". When a punct token is `{` or `[`, a new container wrapper is created, pushed onto the stack, and becomes the new append target. When a punct token is `}` or `]`, the matching wrapper is popped. All other tokens and whitespace append to whatever is on top of the stack.

**Why not move this into the formatter or expose new token kinds?** Because the bracket-pair relationship is not information the formatter needs, and the existing byte-identical-output guarantees are valuable — anything that extends the formatter API would need to be opt-in, plumbed through the Worker boundary, and tested against the 77 existing unit tests. A O(tokens) pass in the content script is ~20 lines and needs no API change. The hot-loop allocation discipline required of the formatter does not apply here; this runs once on content script startup, not in a streaming inner loop.

**Why is punct kind sufficient?** A punct token's textual range is always exactly one character (`{`, `}`, `[`, `]`, `,`, or `:`). The content script already reads `output.substring(start, end)` for every token to emit text content. Branching on that single character is free.

### Decision 2 — Container DOM shape

Every container produces this tree inside `.pj-code`:

```html
<span class="pj-container" data-kind="object|array" aria-expanded="true">
  <span class="pj-opener" role="button" tabindex="0">{</span>
  <span class="pj-content">   <!-- inner whitespace + children + inner whitespace -->
    \n
    ...  "k": <value>,
    ... (nested .pj-container if any) ...
    \n
  </span>
  <span class="pj-placeholder" hidden> … </span>
  <span class="pj-closer" role="button" tabindex="0">}</span>
</span>
```

- `.pj-container` is the stable selector for toggling. Its `aria-expanded` mirrors state.
- `.pj-opener` and `.pj-closer` are the click targets. Both receive `role="button"` / `tabindex="0"`. Placing the button role on the bracket characters themselves (rather than an extra caret glyph) keeps layout identical to today — no gutter realignment, no shifted indentation.
- `.pj-content` holds every token and whitespace between the brackets. When hidden, its absence collapses both the inner text and all inner newlines, which is how the container fits on one line.
- `.pj-placeholder` is an inline span whose text is ` … ` (with surrounding spaces). It is `hidden` by default and `hidden="false"` when collapsed. Toggling `hidden` on these two siblings is the full mechanism for showing/hiding state.
- Nested containers: `.pj-content` of an outer container holds inner `.pj-container` elements. Toggling the outer element hides everything, including any inner collapsed/expanded state, which is preserved in the DOM and reappears as-is when the outer is expanded again.

**Alternatives considered:**

- **A `<details>` / `<summary>` pair.** Native semantics, but `<summary>` insists on being the first child and forcibly wraps the bracket with a marker disclosure-triangle pseudo-element that cannot be styled away on all browsers. It also makes the closing bracket live *outside* the element, which breaks the symmetry needed for "click the closer to collapse".
- **A single `hidden` attribute on a flat list of descendants.** Requires per-node state or repeatedly walking siblings on toggle. The wrapper approach is O(1) per toggle.
- **Caret glyph before the opener.** Considered and rejected: either it shifts the opener one column to the right (breaks indent alignment and gutter mapping) or it is `position: absolute` (complicates the grid layout inside the existing `.pj-code` column). Using the bracket itself as the affordance, with a hover highlight, is lighter and layout-neutral.

### Decision 3 — Collapsed placeholder is a static ` … `

The collapsed text is the literal `" … "` (space, horizontal ellipsis, space). No count like "3 items", no type annotation. Reasons:

- Counts would require a second pass over the tokens per container. That pass has to run even for containers that never collapse.
- Counts inside strings (commas within `"a,b"`) make "number of items" subtle to compute correctly.
- Visual noise. `{ … }` reads clearly and matches GitHub's and JSONView's minimal style.

The ellipsis is wrapped in spaces so the visible line reads `{ … }`, not `{…}`, which is easier to parse visually and matches how DevTools renders collapsed objects.

### Decision 4 — Toggle state lives in DOM attributes, not a JS map

`aria-expanded` on `.pj-container` is the source of truth. The click handler flips that attribute and toggles `hidden` on `.pj-content` and `.pj-placeholder`. CSS selectors (`.pj-container[aria-expanded="false"] .pj-content`) could carry the whole show/hide rule, but toggling `hidden` directly is one attribute write and avoids relying on CSS specificity fights.

No JS state object, no `WeakMap<Element, boolean>`. Everything is readable from the DOM by inspection, which makes e2e assertions trivial and avoids stale-state bugs when the DOM is replaced.

### Decision 5 — Single delegated click/keydown handler on `.pj-code`

Rather than attaching one listener per opener and closer (potentially hundreds of thousands), a single `click` and single `keydown` listener are attached to the `.pj-code` wrapper. They use `event.target.closest(".pj-opener, .pj-closer")` to find the toggle target and walk up to the containing `.pj-container`. This gives O(1) per-render setup and O(1) per-toggle work.

### Decision 6 — Gutter is recomputed from visible rows on every toggle

The current `buildGutterText(countLines(output))` is fine for the initial render (nothing is collapsed yet). After the first toggle, however, the visible row count can drop or grow, so a new helper `recomputeGutter(pre)` counts the visible rows inside `.pj-code` and rewrites `.pj-gutter`'s text content.

Counting visible rows: walk text nodes of `.pj-code` and count `\n` occurrences where the nearest ancestor with `hidden` is either absent or set to `false`. Equivalently (and faster): rely on `innerText` of `.pj-code`, which browsers compute respecting `hidden`/`display: none`, and count its newlines. `innerText` is more expensive than `textContent` but is the exact "what does the user see" abstraction we need and only runs on toggle, not on every render.

The plus-one rule for the gutter (number of visible rows = newlines in innerText + 1) still holds.

**Alternative considered:** track a running row-count delta per container at build time, stored as `data-row-count` on the container, and add/subtract it on toggle. Faster per-toggle (O(1) vs. O(visible text length)) but requires the delta to be correct in the face of nested toggles, and any bug in the delta causes the gutter to desync from reality. Stick with `innerText` until we see profiling data that says it's too slow.

### Decision 7 — Skip collapsibles on the above-threshold fallback path

The above-threshold branch of the render loop in `content.js` writes plain text into `.pj-code` with no token information. Pairing brackets there would require a scan of the output string (not the token stream), plus a decision about what to do when the output is 10+ MB of raw text. That is a different design problem — solve it later if users ask. For v1, above-threshold `<pre>`s keep the current behavior (plain text + gutter, no interactive affordance).

The existing "oversized payload" e2e test already asserts no token-class spans are present; the new spec for this capability will explicitly state that no `.pj-container` exists in the oversized path either, so the skip is a testable contract.

### Decision 8 — A11y: bracket is the button, container is the region

The opener and closer both get `role="button"` / `tabindex="0"`. Focus order follows document order, which is the natural "top-down" reading order of the JSON. Keyboard activation: `keydown` listener intercepts `Enter` and `Space` on a focused opener or closer and toggles the container. Focus is not moved across toggles — Space on an opener keeps focus on that opener so the user can keep cycling. `aria-expanded` on the container communicates state to AT.

We do not use `aria-controls` pointing at `.pj-content`. The relationship is obvious from the DOM hierarchy, and `aria-controls` requires a stable id which we'd have to mint per container.

**Limitation accepted:** double-tab through an opener and closer gives two tab stops per container. For deeply nested documents this is a lot of tab stops. Acceptable for v1 — users who rely on keyboard nav primarily use search, not tab. Revisit if there's feedback.

## Risks / Trade-offs

- **Click on `{` or `}` when the user wanted to select text** → a click shorter than a drag selection still triggers toggle. Mitigation: only toggle on `click` events, not `mousedown`, so drag-to-select (which fires `mouseup` outside the target) doesn't toggle. This is default browser behavior for `click`.
- **`innerText` on toggle is O(visible text)** → For a 200-line document this is microseconds. For a 200,000-line document, this could be measurable, but that is over `HIGHLIGHT_TOKEN_THRESHOLD` and is already on the skip path. Non-issue in practice.
- **Gutter width recomputes on every toggle** → Because the gutter column is `auto`-sized by CSS, expanding from 10 visible rows to 10,000 will widen the gutter column. This is fine (no JS work) but may cause a visible layout jump on the first expansion of a huge container. Accepted.
- **Copy fidelity is worse when any container is collapsed** → Documented as a known limitation. The ellipsis placeholder shows in the clipboard. Users who want clean JSON expand first. An escape hatch (custom copy handler that ignores `hidden` and serializes the real content) is possible but scoped out of v1.
- **Tab focus count grows linearly with containers** → Two stops per container. Documented; revisit if feedback comes in.
- **A nested toggle's state is preserved while its ancestor is collapsed** → Intentional. DOM nodes are not removed, only hidden. Re-expanding the ancestor reveals the previously-set inner state.
- **Test flake: clicking via Playwright on a `<span>` with `role="button"`** → Playwright handles this natively. Verified by the existing highlight tests, which already click into `<pre>`s.
- **CSS cascade conflict with host pages** → All new selectors use the same `:where(...)` wrapping pattern as the existing token classes so host-page CSS still wins specificity fights.
