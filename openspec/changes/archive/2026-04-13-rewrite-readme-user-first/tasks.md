## 1. Capture baseline facts from the current README

- [x] 1.1 Read the current `README.md` top to bottom and list every factual claim that must survive the rewrite: public API signatures (`formatString`, `formatBytes`, `createFormatter`, `FormatError`), every option name and default (`indentSize`, `onProgress`, `signal`, `chunkSize`, `tokens`), every error type (`unbalanced_close`, `unclosed_container`, `unterminated_string`), every token kind constant (`TOKEN_PUNCT`, `TOKEN_KEY`, `TOKEN_STRING`, `TOKEN_NUMBER`, `TOKEN_BOOLEAN`, `TOKEN_NULL`), the performance comparison table, the `HIGHLIGHT_TOKEN_THRESHOLD` (250,000 tokens ≈ 2.5 MB) note, the unit test command (`node --test src/formatter.test.js`), the Playwright e2e commands and the `HEADLESS=1` flag, the OneDark-Pro attribution and link, and the JetBrains Mono attribution and SIL OFL link. Keep this list handy for the final content-preservation check.

## 2. Draft the new top-to-bottom structure

- [x] 2.1 Write the new one-sentence project description that will sit directly under the `# Pretty JSON` title. It should name the two audiences implicitly ("Chrome extension and embeddable library").
- [x] 2.2 Draft the Table of Contents as a bulleted list with GitHub-flavored anchor links. Entries, in order: Chrome Extension, Library, Architecture & Design, Development.
- [x] 2.3 Confirm the four top-level section headings are stable enough to anchor against and that each heading text yields a predictable GitHub anchor slug.

## 3. Write the Chrome Extension section (audience #1)

- [x] 3.1 Write a short framing sentence describing what the extension does on a page it runs on (auto-formats any JSON `<pre>` block).
- [x] 3.2 Write the install subsection. Describe loading the repository as an unpacked Chrome MV3 extension via `chrome://extensions`. Do not claim a Chrome Web Store listing.
- [x] 3.3 Write a "What you'll see" subsection listing the user-visible features: OneDark-Pro theme on `#282c34` background, JetBrains Mono font, per-token syntax highlighting, line numbers, collapsible nodes, and the large-document plain-text fallback above `HIGHLIGHT_TOKEN_THRESHOLD` (with the 250,000 tokens / ~2.5 MB figure).

## 4. Write the Library section (audience #2)

- [x] 4.1 Write the import snippet (`import { formatString, createFormatter } from "./src/index.js"`).
- [x] 4.2 Move the existing "Quick (synchronous, small inputs)" example under the Library section as the first usage subsection.
- [x] 4.3 Move the existing "Recommended (async, Worker-backed)" example under the Library section as the second usage subsection, including the progress/abort/destroy lines.
- [x] 4.4 Move the "Error handling for malformed JSON" subsection under the Library section, preserving the example output and the three error type descriptions.
- [x] 4.5 Move the "Syntax Highlighting" token-emission subsection (the `tokens: true` opt-in, the `offsets`/`kinds`/`count` shape, the UTF-16 offset note, and the six `TOKEN_*` constants) under the Library section. Keep the content about what the extension renders by default (theme + `.json-formatted` class) in the Chrome Extension section — the library subsection is only about the API.
- [x] 4.6 Move the "API Reference" block (`formatString`, `formatBytes`, `createFormatter`, `FormatError` type) under the Library section.
- [x] 4.7 Move the "Options" list under the Library section and keep it as the final Library subsection so developers can scan it last.

## 5. Write the Architecture & Design section (audience #3)

- [x] 5.1 Move the `src/` directory map into this section unchanged.
- [x] 5.2 Move the four "Design Principles" (zero-parse formatting, byte-level processing, Web Worker offloading, chunked processing with cancellation) into this section unchanged.
- [x] 5.3 Move the "Performance" comparison table and the one-line summary beneath it into this section unchanged.
- [x] 5.4 Move the "Attribution" block (OneDark-Pro + JetBrains Mono links and license references) into this section unchanged.

## 6. Write the Development section

- [x] 6.1 Write a short framing sentence. Keep the two existing subsections: "Unit tests" with the `node --test src/formatter.test.js` command and the test-count summary, and "End-to-end tests" with the `npm install` / `npx playwright install chromium` / `npm run test:e2e` commands plus the headed-default explanation and the `HEADLESS=1` opt-in.

## 7. Assemble and write `README.md`

- [x] 7.1 Assemble the sections in order: title, one-sentence description, Table of Contents, Chrome Extension, Library, Architecture & Design, Development.
- [x] 7.2 Overwrite `README.md` with the new content.
- [x] 7.3 Run `npx prettier --check README.md` (or the repo's existing formatter) if one is configured; otherwise verify manually that line wrapping matches surrounding docs style.

## 8. Verify the rewrite

- [x] 8.1 Content-preservation check: walk the baseline facts list from task 1.1 and confirm every item appears somewhere in the new `README.md`. If anything is missing, restore it before marking the change complete.
- [x] 8.2 Table of Contents link check: for each TOC entry, confirm the anchor resolves to an existing heading in the new file. Verify by rendering the README in a Markdown preview or on a GitHub commit view.
- [x] 8.3 Ordering check: confirm the first top-level section after the TOC is Chrome Extension, the second is Library, the third is Architecture & Design, and the fourth is Development. Confirm no design-principle or directory-map content appears above the Library section.
- [x] 8.4 Self-containment check: read the Library section in isolation and confirm a developer could install, use the sync API, use the async Worker API, handle errors, opt into tokens, and look up every option without leaving the section.
- [x] 8.5 `openspec validate rewrite-readme-user-first --strict` passes.
