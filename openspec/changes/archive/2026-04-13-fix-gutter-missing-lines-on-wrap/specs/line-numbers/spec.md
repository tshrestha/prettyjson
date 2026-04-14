## ADDED Requirements

### Requirement: Formatted code column never soft-wraps regardless of host `<pre>` styles

The injected stylesheet SHALL force `white-space: pre` on the formatted `<pre class="json-formatted">` and its `.pj-code` descendant with sufficient specificity (including `!important`) to override any inline `white-space` already set on the host `<pre>` — notably the `white-space: pre-wrap` that Chrome's built-in `text/plain` viewer applies inline. This preserves the existing 1:1 mapping from formatted newlines to gutter line numbers: every row the user sees in the code column corresponds to exactly one number in the gutter column, and the last gutter number aligns with the last visible row of code.

#### Scenario: Computed `white-space` on the code column is `pre` even when the host `<pre>` has an inline `white-space: pre-wrap`

- **WHEN** a page contains `<pre id="target" style="white-space: pre-wrap; word-wrap: break-word">` holding a valid JSON payload with at least one logical line long enough to wrap at the default Playwright viewport width
- **AND** the content script successfully formats it
- **THEN** `getComputedStyle(target.querySelector(".pj-code")).whiteSpace` MUST equal `"pre"`
- **AND** `getComputedStyle(target).whiteSpace` MUST equal `"pre"`

#### Scenario: Gutter's last line number aligns with the bottom of the code column on a wrap-prone host

- **WHEN** the same inline-`pre-wrap` host from the previous scenario is formatted
- **THEN** the `DOMRect` of the gutter's text (via `Range.selectNodeContents` on the gutter's text node) MUST have a `bottom` within one computed `line-height` of the `bottom` of the `.pj-code` element's `getBoundingClientRect()`
- **AND** the last newline-separated entry in `gutter.textContent` MUST equal the split count of `code.textContent.split("\n")`

#### Scenario: Formatted pages on `raw.githubusercontent.com`-style viewers do not drop trailing line numbers

- **WHEN** a `<pre>` that already carries `style="word-wrap: break-word; white-space: pre-wrap"` (the inline style Chrome's built-in text viewer synthesizes for `text/plain` resources) contains a multi-thousand-line JSON document with long string values (e.g. an npm `package-lock.json`-style payload with integrity hashes and registry URLs)
- **AND** the content script successfully formats it
- **THEN** the computed `white-space` on `.pj-code` MUST be `pre` (verified in the first scenario)
- **AND** no horizontal line-wrapping MUST occur inside `.pj-code`, so long lines extend into horizontal overflow rather than creating unnumbered visual rows beneath the last gutter number

## MODIFIED Requirements

### Requirement: Stylesheet injection covers gutter rules without adding elements

The single `<style data-pretty-json>` element injected by `ensureStylesheet` SHALL include all gutter-related CSS (grid layout on `pre.json-formatted`, plus color, `user-select`, alignment, and padding rules for `.pj-gutter`, plus a `white-space: pre !important` rule on `pre.json-formatted` and `pre.json-formatted .pj-code` that beats inline `white-space` on the host `<pre>`). No additional `<style>`, `<link>`, or class attributes on `document.head` SHALL be introduced for line numbers.

#### Scenario: Still exactly one pretty-json style element

- **WHEN** the content script formats multiple `<pre>` blocks on the same page
- **THEN** `document.querySelectorAll("style[data-pretty-json]").length` MUST equal `1`
- **AND** that single stylesheet's `textContent` MUST contain a `.pj-gutter` selector block with `user-select: none`

#### Scenario: Injected stylesheet contains a `white-space: pre !important` rule on the formatted code column

- **WHEN** the injected `<style data-pretty-json>` is inspected after the content script runs
- **THEN** its `textContent` MUST contain a rule setting `white-space: pre !important` that targets `pre.json-formatted` (and/or `pre.json-formatted .pj-code`), so that the formatted code column always inherits `white-space: pre` regardless of any inline `white-space` already set on the host `<pre>`
