## 1. Reproduce the bug in the existing e2e harness

- [x] 1.1 Add a new fixture `e2e/fixtures/gutter-pre-wrap.html` containing a `<pre id="target" style="word-wrap: break-word; white-space: pre-wrap">` with a JSON payload that has at least one logical line long enough (≥ 500 characters) to force a soft-wrap at the Playwright default viewport width — e.g. an array with one very long string value plus a few shorter lines.
- [x] 1.2 Add a failing regression test in `e2e/tests/gutter.spec.js` that loads `gutter-pre-wrap.html`, waits for `.json-formatted`, and asserts `getComputedStyle(pre.querySelector(".pj-code")).whiteSpace === "pre"`. Confirm it fails on the current `content.js`.
- [x] 1.3 In the same test, measure the bottom of the gutter's text via `Range.selectNodeContents(gutter.firstChild).getBoundingClientRect().bottom` and the bottom of `.pj-code` via `getBoundingClientRect().bottom`. Assert the delta is `<= lineHeight` (one row of slack). Confirm it fails today.

## 2. Fix the CSS in the content script

- [x] 2.1 In `content.js` inside `ensureStylesheet`, extend the injected CSS string with `pre.json-formatted { white-space: pre !important; }` and `pre.json-formatted :where(.pj-code) { white-space: pre !important; }`. Place the rules alongside the existing `pre.json-formatted { ... display: grid; ... }` block so the diff stays contained to the gutter theming section.
- [x] 2.2 Re-run the two regression assertions from tasks 1.2 and 1.3 and confirm they pass against a fresh unpacked-extension reload.
- [x] 2.3 Run the full existing e2e suite (`npm run test:e2e`) and confirm no existing gutter/highlight/collapsible test regresses — in particular the `Stylesheet injection covers gutter rules without adding elements` and the `Computed display is grid` scenarios.

## 3. Manual verification against the real-world case from the bug report

- [x] 3.1 Load `https://raw.githubusercontent.com/axios/axios/refs/heads/v1.x/package-lock.json` in a Chrome session with the built extension loaded, scroll to the bottom, and confirm the last gutter number (11896) sits directly next to the final `}` of the document with no un-numbered rows beneath it. _(Automated via a throwaway Playwright test that hit the real URL: `lastGutter: "11896"`, `gutterCount === codeCount === 11896`, `whiteSpaceCode: "pre"`, `delta: 0`.)_
- [x] 3.2 Also load a short JSON document (e.g. `e2e/fixtures/gutter.html`) and confirm the gutter still renders `1\n2\n3\n4\n5` correctly — i.e. the `!important` rule did not accidentally alter the small-document path. _(Covered by the already-green `small highlighted <pre> has a gutter of numbered lines next to a pj-code column` test in `gutter.spec.js`.)_
- [x] 3.3 Resize the browser window narrow enough that the integrity-hash lines in the axios file would previously have wrapped, and confirm they now overflow horizontally (page-level or `<pre>`-level horizontal scroll) instead of creating unnumbered visual rows. _(Automated at 900-px viewport on the real axios URL: `codeScrollWidth: 2006 > codeClientWidth: 820`, `delta: 0` — long lines overflow horizontally and the gutter still aligns to the last row.)_

## 4. Update the spec and archive the change

- [x] 4.1 Once the implementation is in and tests are green, confirm that the delta spec at `openspec/changes/fix-gutter-missing-lines-on-wrap/specs/line-numbers/spec.md` accurately reflects the shipped CSS (rule text in the MODIFIED `Stylesheet injection` requirement, scenarios in the ADDED `never soft-wraps` requirement). _(Shipped CSS: `pre.json-formatted { ... white-space: pre !important; }` and `pre.json-formatted :where(.pj-code) { min-width: 0; white-space: pre !important; }` — matches the delta spec's MODIFIED body and the `Injected stylesheet contains a white-space: pre !important rule` scenario.)_
- [ ] 4.2 Run `/opsx:archive fix-gutter-missing-lines-on-wrap` to merge the delta into `openspec/specs/line-numbers/spec.md` and move the change into `openspec/changes/archive/`.
