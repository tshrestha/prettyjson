## Why

The current README leads with internal architecture (`src/` tree, zero-parse design principles) before telling a reader how to actually use the project. The repository ships two distinct audiences worth of value — a Chrome extension end-users can install today, and a JavaScript library developers can embed — but neither audience is served first. A Chrome Web Store visitor who clicks through to the repo has to scroll past a worker-thread architecture discussion to learn what the extension does. A developer evaluating the library has their install/usage story fragmented across the middle of the file.

Reordering the README so that extension users come first, library developers second, and architecture/design notes last matches the actual funnel of visitors and makes the project easier to adopt.

## What Changes

- Rewrite `README.md` with a new top-to-bottom ordering:
  1. A one-line project description and a Table of Contents.
  2. **Chrome Extension** section for end users — what it does, how to install (load unpacked), what to expect when it runs (auto-formats JSON `<pre>` blocks, syntax highlighting, line numbers, collapsible nodes, large-document fallback).
  3. **Library** section for developers — install/import, quick synchronous usage, Worker-backed async usage, error handling, token emission, full API reference, and options table.
  4. **Architecture & Design** section — directory map, design principles, performance numbers, and attribution.
  5. **Development** section — running unit tests and Playwright e2e tests.
- Add an anchor-linked Table of Contents immediately after the one-line description so all three audiences can jump straight to their section.
- Preserve every fact already present in the README (API signatures, option names, performance table, attribution, test commands). This is a reorganization, not a content change.
- No code changes. No behavior changes. No API surface changes.

## Capabilities

### New Capabilities

- `readme-documentation`: governs the top-level `README.md` — what sections it must contain, the order those sections appear in, and which audience each section targets. Establishes the user-first → developer-second → architecture-third ordering as a durable requirement so future edits preserve the funnel.

### Modified Capabilities

_None. Existing capability specs (`collapsible-nodes`, `extension-e2e-testing`, `json-syntax-highlighting`, `line-numbers`) describe runtime behavior and are unaffected by a README rewrite._

## Impact

- **Affected files**: `README.md` only.
- **Affected code**: none. No source file, test, build step, or API changes.
- **Affected users**:
  - Chrome extension visitors — faster path to install instructions.
  - Library consumers — a single contiguous "use it as a library" section instead of install/API/options scattered across the file.
  - Contributors — the architecture discussion moves down but is not removed; anyone landing on the file for internals just scrolls or uses the TOC.
- **Risk**: very low. A documentation-only change with no runtime surface. The only regression risk is content loss during reorganization, which the tasks phase will check against the pre-rewrite copy.
