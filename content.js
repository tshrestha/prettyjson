;(() => {
  const pres = document.querySelectorAll("pre")
  if (pres.length === 0) return

  const candidates = []
  for (const el of pres) {
    const text = el.textContent
    const len = text.length
    let i = 0
    while (i < len && text.charCodeAt(i) <= 32) i++
    if (i === len) continue
    const ch = text.charCodeAt(i)
    if (ch !== 0x7B && ch !== 0x5B) continue
    candidates.push(el)
  }
  if (candidates.length === 0) return

  const FONT_URL = chrome.runtime.getURL("themes/fonts/JetBrainsMono-Regular.woff2")
  const STYLE_MARKER = "data-pretty-json"

  /**
   * Inject the default-theme stylesheet once per page. No-op on
   * subsequent calls. Wrapped in try/catch so a restrictive page CSP
   * or DOM error falls through to plain-text rendering rather than
   * crashing the content script.
   */
  function ensureStylesheet() {
    if (document.querySelector(`style[${STYLE_MARKER}]`)) return
    try {
      const style = document.createElement("style")
      style.setAttribute(STYLE_MARKER, "")
      style.textContent = `
html {
  background: #282c34;
}
@font-face {
  font-family: "JetBrains Mono";
  src: url("${FONT_URL}") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
pre.json-formatted {
  background-color: #282c34;
  color: #abb2bf;
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  display: grid;
  grid-template-columns: auto 1fr;
  /* !important beats the inline white-space:pre-wrap that Chrome's native
     text-file viewer sets on <pre> for raw .json URLs — without this, long
     lines wrap and the gutter's row count falls short of the visible rows. */
  white-space: pre !important;
}
pre.json-formatted :where(.pj-gutter) {
  color: #5c6370;
  text-align: right;
  padding: 0 0.75em 0 0.25em;
  user-select: none;
  -webkit-user-select: none;
}
pre.json-formatted :where(.pj-code) {
  min-width: 0;
  white-space: pre !important;
}
pre.json-formatted :where(.pj-opener, .pj-closer) {
  cursor: pointer;
  border-radius: 2px;
}
pre.json-formatted :where(.pj-opener, .pj-closer):hover {
  background: rgba(255, 255, 255, 0.08);
}
pre.json-formatted :where(.pj-opener, .pj-closer):focus-visible {
  outline: 2px solid #61afef;
  outline-offset: 1px;
}
pre.json-formatted :where(.pj-placeholder) {
  color: #5c6370;
}
pre.json-formatted :where(.pj-key)     { color: #e06c75; }
pre.json-formatted :where(.pj-string)  { color: #98c379; }
pre.json-formatted :where(.pj-number)  { color: #d19a66; }
pre.json-formatted :where(.pj-boolean) { color: #56b6c2; }
pre.json-formatted :where(.pj-null)    { color: #56b6c2; }
/* v2: @media (prefers-color-scheme: light) { ... } */
`
      document.head.appendChild(style)
    } catch (err) {
      console.warn("Pretty JSON: stylesheet injection failed:", err.message)
    }
  }

  /**
   * Ask the browser to load the bundled font before we start rendering
   * spans, so the first paint of any highlighted <pre> uses JetBrains
   * Mono instead of a fallback-then-swap. Silently degrades to the
   * fallback chain on failure.
   */
  async function preloadFont() {
    try {
      if (document.fonts && typeof document.fonts.load === "function") {
        await document.fonts.load("400 13px \"JetBrains Mono\"")
      }
    } catch {
      // Non-fatal — the CSS font-family fallback chain takes over.
    }
  }

  function countLines(str) {
    let n = 1
    for (let i = 0; i < str.length; i++) {
      if (str.charCodeAt(i) === 10) n++
    }
    return n
  }

  // buildGutterText(4) → "1\n2\n3\n4"
  function buildGutterText(lineCount) {
    let s = "1"
    for (let i = 2; i <= lineCount; i++) s += "\n" + i
    return s
  }

  /**
   * Build a DocumentFragment of tokenized spans for the formatted output.
   * Emits <span class="pj-..."> for the five non-punctuation token kinds;
   * non-container punctuation and whitespace go in as plain text nodes.
   * Each `{…}` and `[…]` container is wrapped in a .pj-container with
   * opener/content/placeholder/closer children for interactive collapse.
   */
  function buildCodeFragment(output, tokens, kindToClass, puncCode) {
    const root = document.createDocumentFragment()
    // stack[top] is where new content appends. Either the root fragment
    // or the .pj-content element of an open container.
    const stack = [root]
    // containers[i] is the .pj-container whose .pj-content is stack[i+1].
    // Used to find the matching opener's closer when a bracket closes.
    const containers = [null]
    const { offsets, kinds, count } = tokens
    let cursor = 0

    function currentTarget() {
      return stack[stack.length - 1]
    }

    for (let t = 0; t < count; t++) {
      const start = offsets[t * 2]
      const end = offsets[t * 2 + 1]
      if (start > cursor) {
        currentTarget().appendChild(
          document.createTextNode(output.substring(cursor, start)),
        )
      }
      const kind = kinds[t]
      const text = output.substring(start, end)
      if (kind === puncCode) {
        const ch = text.charCodeAt(0)
        if (ch === 0x7B || ch === 0x5B) {
          // Opening bracket: create a new container scaffold and push.
          const kindName = ch === 0x7B ? "object" : "array"
          const container = document.createElement("span")
          container.className = "pj-container"
          container.dataset.kind = kindName
          container.setAttribute("aria-expanded", "true")

          const opener = document.createElement("span")
          opener.className = "pj-opener"
          opener.setAttribute("role", "button")
          opener.setAttribute("tabindex", "0")
          opener.textContent = text

          const content = document.createElement("span")
          content.className = "pj-content"

          const placeholder = document.createElement("span")
          placeholder.className = "pj-placeholder"
          placeholder.hidden = true
          placeholder.textContent = " \u2026 "

          const closer = document.createElement("span")
          closer.className = "pj-closer"
          closer.setAttribute("role", "button")
          closer.setAttribute("tabindex", "0")
          // closer text is filled in when the matching bracket arrives.

          container.append(opener, content, placeholder, closer)
          currentTarget().appendChild(container)
          stack.push(content)
          containers.push(container)
        } else if (ch === 0x7D || ch === 0x5D) {
          // Closing bracket: fill the top container's closer and pop.
          const container = containers[containers.length - 1]
          if (!container) {
            // Unbalanced close (formatter should never emit this, but
            // be safe): emit as plain text into the root.
            root.appendChild(document.createTextNode(text))
          } else {
            container.querySelector(":scope > .pj-closer").textContent = text
            stack.pop()
            containers.pop()
          }
        } else {
          // Non-container punctuation (`,` or `:`): plain text node.
          currentTarget().appendChild(document.createTextNode(text))
        }
      } else {
        const span = document.createElement("span")
        span.className = kindToClass[kind]
        span.textContent = text
        currentTarget().appendChild(span)
      }
      cursor = end
    }
    if (cursor < output.length) {
      currentTarget().appendChild(document.createTextNode(output.substring(cursor)))
    }
    if (stack.length !== 1) {
      // Unbalanced open: the formatter already produced successful
      // output with [] errors, so this shouldn't happen. Throw so the
      // caller's try/catch falls back to plain-text rendering.
      throw new Error("unbalanced container stack: " + stack.length)
    }
    return root
  }

  function recomputeGutter(preEl) {
    const code = preEl.querySelector(".pj-code")
    const gutter = preEl.querySelector(".pj-gutter")
    if (!code || !gutter) return
    const visibleText = code.innerText
    let rows = 1
    for (let i = 0; i < visibleText.length; i++) {
      if (visibleText.charCodeAt(i) === 10) rows++
    }
    gutter.textContent = buildGutterText(rows)
  }

  function toggleContainer(container, preEl) {
    const isOpen = container.getAttribute("aria-expanded") === "true"
    const next = isOpen ? "false" : "true"
    container.setAttribute("aria-expanded", next)
    const content = container.querySelector(":scope > .pj-content")
    const placeholder = container.querySelector(":scope > .pj-placeholder")
    if (content) content.hidden = isOpen
    if (placeholder) placeholder.hidden = !isOpen
    recomputeGutter(preEl)
  }

  function attachToggleHandlers(preEl) {
    const code = preEl.querySelector(".pj-code")
    if (!code) return
    const isToggle = (target) => target && target.closest && target.closest(".pj-opener, .pj-closer")
    code.addEventListener("click", (e) => {
      const hit = isToggle(e.target)
      if (!hit) return
      const container = hit.closest(".pj-container")
      if (container) toggleContainer(container, preEl)
    })
    code.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return
      const hit = isToggle(e.target)
      if (!hit) return
      e.preventDefault()
      const container = hit.closest(".pj-container")
      if (container) toggleContainer(container, preEl)
    })
  }

  function renderWithGutter(el, codeFragment, lineCount) {
    const gutter = document.createElement("span")
    gutter.className = "pj-gutter"
    gutter.setAttribute("aria-hidden", "true")
    gutter.textContent = buildGutterText(lineCount)
    const code = document.createElement("span")
    code.className = "pj-code"
    code.appendChild(codeFragment)
    el.replaceChildren(gutter, code)
  }

  import(chrome.runtime.getURL("src/index.js"))
    .then(async (mod) => {
      const {
        createFormatter,
        HIGHLIGHT_TOKEN_THRESHOLD,
        TOKEN_PUNCT,
        TOKEN_KEY,
        TOKEN_STRING,
        TOKEN_NUMBER,
        TOKEN_BOOLEAN,
        TOKEN_NULL,
      } = mod

      const kindToClass = new Array(6)
      kindToClass[TOKEN_KEY] = "pj-key"
      kindToClass[TOKEN_STRING] = "pj-string"
      kindToClass[TOKEN_NUMBER] = "pj-number"
      kindToClass[TOKEN_BOOLEAN] = "pj-boolean"
      kindToClass[TOKEN_NULL] = "pj-null"

      const formatter = createFormatter({
        workerURL: chrome.runtime.getURL("src/worker.js"),
      })

      // One-shot page setup: inject the stylesheet and preload the
      // default font before we start rendering. Either step failing is
      // non-fatal — the render path degrades to fallback typography.
      ensureStylesheet()
      await preloadFont()

      for (const el of candidates) {
        const text = el.textContent.trim()
        try {
          const result = await formatter.format(text, { indentSize: 2, tokens: true })
          if (result.errors.length > 0) continue

          el.classList.add("json-formatted")

          const tokens = result.tokens
          const underThreshold = tokens && tokens.count <= HIGHLIGHT_TOKEN_THRESHOLD
          const lineCount = countLines(result.output)

          if (underThreshold) {
            try {
              const codeFrag = buildCodeFragment(result.output, tokens, kindToClass, TOKEN_PUNCT)
              renderWithGutter(el, codeFrag, lineCount)
              attachToggleHandlers(el)
            } catch (err) {
              // DOM/rendering failure — fall back to plain formatted
              // text. The theme background + font still apply via the
              // json-formatted class.
              console.warn("Pretty JSON: render failed, falling back:", err.message)
              el.textContent = result.output
            }
          } else {
            // Above HIGHLIGHT_TOKEN_THRESHOLD: the DOM cost of hundreds
            // of thousands of spans outweighs the readability win.
            // Render plain formatted text inside the gutter+code layout
            // so line numbers still display.
            try {
              const codeFrag = document.createDocumentFragment()
              codeFrag.appendChild(document.createTextNode(result.output))
              renderWithGutter(el, codeFrag, lineCount)
            } catch (err) {
              console.warn("Pretty JSON: render failed, falling back:", err.message)
              el.textContent = result.output
            }
          }
        } catch (err) {
          if (err.name !== "AbortError") {
            console.warn("Pretty JSON: format failed:", err.message)
          }
        }
      }
    })
    .catch((err) => {
      console.error("Pretty JSON: failed to load formatter module:", err)
    })
})()
