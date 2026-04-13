# collapsible-nodes Specification

## Purpose

TBD - created by archiving change add-collapsible-nodes. Update Purpose after archive.

## Requirements

### Requirement: Content script wraps every container in a collapsible element

The content script SHALL, for every object `{…}` and array `[…]` in a successfully highlighted `<pre>`, build a DOM element with class `pj-container` that groups the container's opener, inner content, collapsed-state placeholder, and closer. The element SHALL expose its kind via `data-kind="object"` or `data-kind="array"` and its expanded/collapsed state via `aria-expanded` (`"true"` on initial render). Top-level and nested containers SHALL both be wrapped; nested `pj-container` elements live inside their parent container's `pj-content` wrapper.

#### Scenario: Object and array produce matching containers

- **WHEN** a page contains `<pre>{"a":[1,2]}</pre>` and the content script formats it with highlighting
- **THEN** the resulting `.pj-code` MUST contain exactly one `.pj-container[data-kind="object"]`
- **AND** that object container MUST contain exactly one descendant `.pj-container[data-kind="array"]` inside its `.pj-content`
- **AND** both containers MUST have `aria-expanded="true"` on initial render

#### Scenario: Every container has opener, content, placeholder, and closer

- **WHEN** a `.pj-container` is inspected
- **THEN** it MUST have exactly one direct child with class `pj-opener`
- **AND** exactly one direct child with class `pj-content`
- **AND** exactly one direct child with class `pj-placeholder`
- **AND** exactly one direct child with class `pj-closer`
- **AND** the opener's `textContent` MUST be `{` for `data-kind="object"` and `[` for `data-kind="array"`
- **AND** the closer's `textContent` MUST be `}` for `data-kind="object"` and `]` for `data-kind="array"`
- **AND** the placeholder's `textContent` MUST be ` … ` (space, horizontal ellipsis U+2026, space)

#### Scenario: Invalid JSON receives no containers

- **WHEN** a page contains malformed JSON (e.g. `<pre>{"a":1}}</pre>`)
- **THEN** the `<pre>` MUST NOT contain any descendant with class `pj-container`

### Requirement: Clicking the opener or closer toggles the container

The content script SHALL install a single delegated `click` handler on `.pj-code` that, when the clicked target is an `.pj-opener` or `.pj-closer` element, toggles the `aria-expanded` attribute of that element's nearest ancestor `.pj-container` between `"true"` and `"false"`, and toggles the `hidden` attribute on that container's `.pj-content` and `.pj-placeholder` children so that exactly one of them is visible at a time.

#### Scenario: Clicking the opener collapses the container

- **WHEN** the user clicks the opener bracket of an expanded `.pj-container`
- **THEN** the container's `aria-expanded` MUST become `"false"`
- **AND** the container's `.pj-content` descendant MUST have the `hidden` attribute set
- **AND** the container's `.pj-placeholder` descendant MUST NOT have the `hidden` attribute
- **AND** the visible text of the container MUST contain ` … ` (the ellipsis) between its opener and closer

#### Scenario: Clicking the closer of a collapsed container re-expands it

- **WHEN** the user clicks the closer bracket of a collapsed `.pj-container`
- **THEN** the container's `aria-expanded` MUST become `"true"`
- **AND** the container's `.pj-content` descendant MUST NOT have the `hidden` attribute
- **AND** the container's `.pj-placeholder` descendant MUST have the `hidden` attribute

#### Scenario: Toggling one container does not affect its siblings

- **WHEN** a `<pre>` contains two sibling containers and the user clicks the opener of only the first
- **THEN** the first container's `aria-expanded` MUST be `"false"`
- **AND** the second container's `aria-expanded` MUST remain `"true"`

#### Scenario: Collapsing an outer container preserves inner state

- **WHEN** a user collapses an inner container and then collapses its outer container
- **THEN** both `aria-expanded` attributes MUST be `"false"`
- **AND** re-expanding the outer container MUST leave the inner container's `aria-expanded` as `"false"` (the inner state was preserved, not reset)

### Requirement: Keyboard activation toggles focused containers

The opener and closer of every container SHALL be keyboard-focusable and SHALL expose button semantics. A single delegated `keydown` handler on `.pj-code` SHALL, when the focused element is an `.pj-opener` or `.pj-closer` and the pressed key is `Enter` or `Space`, prevent the default browser action and toggle the ancestor `.pj-container` using the same logic as a click. Focus SHALL remain on the originally-focused element after the toggle.

#### Scenario: Opener and closer are focusable buttons

- **WHEN** a `.pj-container` is inspected
- **THEN** its `.pj-opener` descendant MUST have `role="button"` and `tabindex="0"`
- **AND** its `.pj-closer` descendant MUST have `role="button"` and `tabindex="0"`

#### Scenario: Pressing Enter on a focused opener toggles the container

- **WHEN** a `.pj-opener` is focused and the user presses `Enter`
- **THEN** its ancestor `.pj-container`'s `aria-expanded` MUST flip
- **AND** the active element MUST still be that same `.pj-opener` after the event

#### Scenario: Pressing Space on a focused closer toggles the container

- **WHEN** a `.pj-closer` is focused and the user presses `Space`
- **THEN** its ancestor `.pj-container`'s `aria-expanded` MUST flip
- **AND** the browser's default scroll-on-space action MUST be prevented

### Requirement: Gutter stays synchronized with visible rows on toggle

When a `.pj-container` is toggled (via click or keyboard), the content script SHALL recompute the `.pj-gutter` text for the enclosing `<pre class="json-formatted">` so that its line count equals the number of visible rows in the sibling `.pj-code` element. Visible rows SHALL be determined by the rendered text of `.pj-code` (i.e. respecting `hidden` descendants).

#### Scenario: Collapsing a container shrinks the gutter

- **WHEN** a `<pre>` is initially formatted with N total rows and the user collapses a container whose content spans K rows (K >= 1)
- **THEN** after the toggle, the `.pj-gutter` element's text MUST list exactly `N - K` numbered rows, from `1` through `N - K`, newline-separated
- **AND** the last number in the gutter MUST equal the count of `\n` characters in `.pj-code`'s visible text plus one

#### Scenario: Re-expanding restores the previous gutter

- **WHEN** a container is collapsed and then re-expanded by the user
- **THEN** after the second toggle, the `.pj-gutter` text MUST be identical to the text it had before the collapse

### Requirement: Stylesheet defines hover and collapsed-state styling

The injected `<style data-pretty-json>` element SHALL define CSS rules that give `.pj-opener` and `.pj-closer` a visible hover affordance (e.g. a background highlight), and SHALL define rules that cause the `hidden` attribute to suppress rendering of `.pj-content` and `.pj-placeholder` as appropriate. The stylesheet MUST continue to be a single `<style data-pretty-json>` element — no additional style elements are introduced for collapsibles.

#### Scenario: Still exactly one pretty-json style element

- **WHEN** the content script formats multiple `<pre>` blocks on the same page that each contain collapsible containers
- **THEN** `document.querySelectorAll("style[data-pretty-json]").length` MUST equal `1`
- **AND** the stylesheet's `textContent` MUST contain a `.pj-opener` selector and a `.pj-closer` selector each with a `:hover` rule
- **AND** the stylesheet MUST contain a rule that gives `.pj-opener` and `.pj-closer` `cursor: pointer`

#### Scenario: Collapsibles do not break host-page CSS specificity

- **WHEN** a host page provides its own `pre` and `span` style rules
- **THEN** the extension's new `.pj-container`, `.pj-opener`, `.pj-closer`, `.pj-content`, and `.pj-placeholder` rules MUST be written using `:where(...)` (zero specificity) so that host-page rules still win

### Requirement: Collapsibles are skipped on the above-threshold fallback path

The content script SHALL NOT build `.pj-container` elements for `<pre>` blocks whose token count exceeds `HIGHLIGHT_TOKEN_THRESHOLD`. The above-threshold fallback path continues to render plain text into `.pj-code` with no interactive affordances.

#### Scenario: Oversized payload has no pj-container descendants

- **WHEN** the token count for a successfully formatted `<pre>` exceeds `HIGHLIGHT_TOKEN_THRESHOLD`
- **THEN** the `<pre>` MUST NOT contain any descendant with class `pj-container`
- **AND** the `<pre>` MUST NOT contain any descendant with class `pj-opener`
- **AND** the `<pre>` MUST NOT contain any descendant with class `pj-closer`
- **AND** the `<pre>` MUST still have the `json-formatted` class and the gutter from the `line-numbers` capability
