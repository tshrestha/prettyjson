## Context

The current `README.md` opens with a `src/` directory tree and a discussion of the zero-parse streaming formatter before mentioning either the Chrome extension or how to call the library. That order reflects the historical development of the project — the formatter engine was the first thing built — but it no longer matches how people arrive at the repository. The Chrome extension is the most visible artifact (it auto-formats JSON on any page a user visits), and the library has a documented public API (`formatString`, `createFormatter`, token emission). Both audiences are served but neither is served first.

This change rewrites `README.md` in place. No source code is touched. The goal is a reorganization that preserves every existing fact (API signatures, option defaults, performance numbers, attribution, test commands) while putting the right section in front of the right reader. The design below locks in the section ordering and the Table of Contents as a durable requirement so future edits don't drift back toward "architecture first."

## Goals / Non-Goals

**Goals:**

- Lead with a one-line description of what the project is, then a Table of Contents so all audiences can jump directly to their section.
- Chrome Extension section comes first: what it does, how to load the unpacked extension, what a user sees when it runs (auto-formatted JSON, syntax highlighting, line numbers, collapsible nodes, large-document fallback).
- Library section comes second and covers everything a developer needs in one contiguous block: quick synchronous API, Worker-backed async API, error handling, token emission for syntax highlighting, the full API reference, and the options table.
- Architecture & Design section comes third: directory map, design principles (zero-parse, byte-level, Worker offloading, chunked processing), performance table, attribution.
- Development section comes last: running unit tests and Playwright e2e tests.
- Every fact in the current README is retained somewhere in the new structure. Nothing is silently dropped.
- The TOC uses GitHub-flavored anchor links (auto-generated from heading text) so it works on github.com without extra tooling.

**Non-Goals:**

- No changes to any source file, test, build, manifest, or extension asset.
- No changes to the public library API, option names, or defaults.
- No rewrite of the content itself beyond what's needed to fit the new ordering and to introduce each section with a single framing sentence. This is not a copy-editing pass on the existing prose.
- No new performance numbers, benchmarks, or screenshots.
- No new sections beyond what the current README already contains (Installation, Usage, Error handling, Syntax Highlighting, Performance, Tests, API Reference). They are re-grouped, not added to.
- No `docs/` split. The README stays a single file.

## Decisions

### Decision: Put Chrome Extension first, Library second, Architecture third

**What**: The top-level section order is (1) Chrome Extension for end users, (2) Library for developers, (3) Architecture & Design, (4) Development.

**Why**: This matches the funnel. The extension is the most common entry point — it's what a user sees when they land on the repo from the Chrome Web Store or a blog post. A developer evaluating the library is the second-most-common visitor and needs a contiguous "install → quickstart → API → options" block. Architecture is valuable but belongs to a narrower audience (contributors, reviewers, people curious about internals) and should not gate the first two.

**Alternatives considered**:

- _Library first, extension second._ Rejected: the extension is the more discoverable artifact and the more common first contact. Putting the library first would bury it.
- _Two README files (`README.md` + `README.dev.md`)._ Rejected: splits attention, breaks GitHub's default rendering of a single README, and creates a maintenance burden for a small project.
- _A `docs/` site._ Rejected: overkill for a single-file project and out of scope.

### Decision: Table of Contents immediately after the one-line description

**What**: A bulleted TOC with anchor links sits right under the project tagline and before the first section.

**Why**: All three audiences benefit. An extension user can click straight to "Install the Chrome Extension." A library user can jump to "API Reference." A contributor can jump to "Architecture." On github.com, anchor links are auto-generated from heading text, so no extra tooling is needed.

**Alternatives considered**:

- _No TOC, rely on GitHub's auto-generated outline button._ Rejected: the outline button is discoverable only to users who know it exists, and it's not present on other Markdown renderers (npmjs.com, editor previews).
- _A collapsible `<details>` TOC._ Rejected: adds markup noise for no benefit; the TOC is short enough to display inline.

### Decision: Preserve every fact from the current README verbatim where possible

**What**: The rewrite is a reorganization, not a content refresh. API signatures, option names and defaults, the performance table, the attribution block, and the test commands are copied into the new structure unchanged. Short framing sentences may be added at the top of each new section for flow.

**Why**: This change is explicitly scoped to ordering. Rewriting prose at the same time as restructuring makes it much harder to review the diff and much easier to accidentally drop a fact. The tasks phase includes a pre-rewrite snapshot diff check to verify nothing is lost.

**Alternatives considered**:

- _Combine the rewrite with a copy-edit pass._ Rejected: couples two unrelated changes. If the prose needs editing, that should be a follow-up change.

### Decision: Install section describes "load unpacked" only

**What**: The Chrome Extension install section tells users to clone the repo and load the directory as an unpacked extension via `chrome://extensions`. It does not claim a Chrome Web Store listing.

**Why**: There is no published Web Store listing for this project today. Promising one in the README would be inaccurate. If a listing is published later, the section is short enough to update in a follow-up.

**Alternatives considered**:

- _Omit install instructions entirely._ Rejected: the extension section exists to serve end users, and end users need install instructions.

### Decision: Library section is self-contained

**What**: The Library section contains, in order: import snippet, synchronous usage (`formatString`), Worker-backed async usage (`createFormatter`), error handling, token emission, full API reference, and the options table. A developer who skips the Chrome Extension section should not need to jump back to it for anything.

**Why**: Today these facts are scattered — "Usage" sits above "Error handling," "Syntax Highlighting" sits below "Chrome Extension," and "API Reference" sits at the very bottom. Grouping them under a single Library heading means a developer can read top-to-bottom without hunting.

**Alternatives considered**:

- _Keep API Reference as its own top-level section._ Rejected: conceptually part of "using the library" and benefits from sitting next to the usage examples.

## Risks / Trade-offs

- **[Risk] Silent content loss during reorganization** → Mitigation: the tasks phase includes a step that diffs the set of facts in the old README (API signatures, option names, test commands, performance numbers, attribution links, error type names) against the rewritten file to confirm nothing was dropped. If anything is missing, the task is not complete.

- **[Risk] Anchor links in the TOC drift out of sync with heading text** → Mitigation: use headings that are unlikely to change ("Chrome Extension," "Library," "Architecture," "Development") and verify each TOC link resolves by rendering the README via `openspec` or by preview in an editor before committing.

- **[Risk] Readers who previously relied on the architecture-first ordering miss the design principles** → Mitigation: the Architecture section is still in the README, still complete, and still linked from the TOC. It's one click away, not deleted.

- **[Trade-off] Longer README** → Adding a TOC and section framing sentences makes the file slightly longer than the current one. Acceptable: the new structure makes the longer file easier to navigate than the shorter unordered one.

- **[Trade-off] No copy-editing of existing prose** → Some sentences in the current README could be tightened. This change deliberately does not touch them to keep the diff reviewable as "reordering only." A follow-up change can copy-edit if desired.
