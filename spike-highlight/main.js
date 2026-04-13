// MAIN world content script.
//
// Lives in the page's JavaScript realm, which is the only realm whose
// CSS.highlights registry is actually consulted when Blink paints the
// document. This is the entire point of the spike.
//
// Strategy is picked from ?strategy=span|highlight on the page URL.
;(() => {
  console.log("[spike main] booting")
  const KIND_PUNCT = 0
  const KIND_KEY = 1
  const KIND_STRING = 2
  const KIND_NUMBER = 3
  const KIND_BOOLEAN = 4
  const KIND_NULL = 5

  const KIND_NAME = ["pj-punct", "pj-key", "pj-string", "pj-number", "pj-boolean", "pj-null"]

  const params = new URLSearchParams(location.search)
  const strategy = params.get("strategy") || "highlight"

  const results = {
    strategy,
    ready: false,
    error: null,
    tokenCount: 0,
    formatMs: 0,
    tokenizeMs: 0,
    renderMs: 0,
    firstPaintMs: 0,
    preNodeCount: 0,
    preChildElementCount: 0,
    highlightRegistered: false,
    scrollP50: 0,
    scrollP95: 0,
    scrollP99: 0,
    scrollMax: 0,
    scrollFrames: 0,
    scrollTotalMs: 0,
    scrollFps: 0,
    heapBefore: 0,
    heapAfter: 0,
  }
  window.__spikeResults = results

  const STYLE_ID = "spike-style"
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement("style")
    style.id = STYLE_ID
    style.textContent = `
      ::highlight(pj-punct)   { color: #666666; }
      ::highlight(pj-key)     { color: #a31515; }
      ::highlight(pj-string)  { color: #0451a5; }
      ::highlight(pj-number)  { color: #09885a; }
      ::highlight(pj-boolean) { color: #0000ff; }
      ::highlight(pj-null)    { color: #0000ff; }

      .pj-punct   { color: #666666; }
      .pj-key     { color: #a31515; }
      .pj-string  { color: #0451a5; }
      .pj-number  { color: #09885a; }
      .pj-boolean { color: #0000ff; }
      .pj-null    { color: #0000ff; }
    `
    document.head.appendChild(style)
  }

  function renderSpans(pre, formatted, offsets, kinds) {
    const count = kinds.length
    const frag = document.createDocumentFragment()
    let cursor = 0
    for (let t = 0; t < count; t++) {
      const start = offsets[t * 2]
      const end = offsets[t * 2 + 1]
      if (start > cursor) {
        frag.appendChild(document.createTextNode(formatted.substring(cursor, start)))
      }
      const span = document.createElement("span")
      span.className = KIND_NAME[kinds[t]]
      span.textContent = formatted.substring(start, end)
      frag.appendChild(span)
      cursor = end
    }
    if (cursor < formatted.length) {
      frag.appendChild(document.createTextNode(formatted.substring(cursor)))
    }
    pre.replaceChildren(frag)
  }

  function renderHighlights(pre, formatted, offsets, kinds) {
    pre.textContent = formatted
    const textNode = pre.firstChild
    const count = kinds.length

    // Skip punctuation — default fg is the correct color for {}[]:,.
    // Cuts ~35% of ranges and proportionally reduces paint work.
    const highlights = KIND_NAME.map(() => new Highlight())
    for (let t = 0; t < count; t++) {
      const kind = kinds[t]
      if (kind === KIND_PUNCT) continue
      const start = offsets[t * 2]
      const end = offsets[t * 2 + 1]
      const range = new StaticRange({
        startContainer: textNode,
        startOffset: start,
        endContainer: textNode,
        endOffset: end,
      })
      highlights[kind].add(range)
    }
    for (let k = 0; k < KIND_NAME.length; k++) {
      if (highlights[k].size > 0) {
        CSS.highlights.set(KIND_NAME[k], highlights[k])
      }
    }
  }

  async function measureScroll(pre) {
    // Measure REAL wall-clock time between rAF callbacks using
    // performance.now() inside the callback (not the DOMHighResTimeStamp
    // argument, which is the scheduled frame start time and can report
    // artificially small deltas when Chrome backlogs rAFs after a slow
    // paint). Also record total wall-clock duration.
    const warmup = 5
    const sampleFrames = 60
    const frameTimes = []
    const walkStart = performance.now()
    return new Promise((resolve) => {
      let last = performance.now()
      let frameCount = 0
      function tick() {
        const now = performance.now()
        const delta = now - last
        last = now
        if (frameCount >= warmup) {
          frameTimes.push(delta)
        }
        frameCount++
        window.scrollBy(0, 20)
        if (frameCount < warmup + sampleFrames) {
          requestAnimationFrame(tick)
        } else {
          const walkEnd = performance.now()
          resolve({ frameTimes, totalMs: walkEnd - walkStart })
        }
      }
      requestAnimationFrame(tick)
    })
  }

  function percentile(sorted, p) {
    if (sorted.length === 0) return 0
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
    return sorted[idx]
  }

  document.addEventListener("spike:formatted", async (ev) => {
    console.log("[spike main] got event, strategy=", strategy)
    try {
      const { formatted, offsets, kinds, tokenCount, formatMs, tokenizeMs } = ev.detail
      results.tokenCount = tokenCount
      results.formatMs = formatMs
      results.tokenizeMs = tokenizeMs

      const pre = document.querySelector("pre#target")
      if (!pre) throw new Error("no #target")

      if (performance.memory) results.heapBefore = performance.memory.usedJSHeapSize

      ensureStyle()

      const tRenderStart = performance.now()
      if (strategy === "span") {
        renderSpans(pre, formatted, offsets, kinds)
      } else if (strategy === "highlight") {
        renderHighlights(pre, formatted, offsets, kinds)
      } else if (strategy === "plain") {
        pre.textContent = formatted
      } else {
        throw new Error("unknown strategy: " + strategy)
      }
      const tRenderEnd = performance.now()
      results.renderMs = tRenderEnd - tRenderStart

      // Confirm the highlight path actually registered against the
      // page's registry (this is the whole point of main-world).
      if (strategy === "highlight") {
        results.highlightRegistered = CSS.highlights.has("pj-key")
      }

      results.preChildElementCount = pre.childElementCount
      results.preNodeCount = pre.childNodes.length

      // Wait one frame for first paint to settle, then measure.
      await new Promise((r) => requestAnimationFrame(() => r()))
      results.firstPaintMs = performance.now() - tRenderStart

      // Scroll benchmark — percentiles over the warmed-up sample
      const { frameTimes, totalMs } = await measureScroll(pre)
      if (frameTimes.length > 0) {
        const sorted = frameTimes.slice().sort((a, b) => a - b)
        results.scrollP50 = percentile(sorted, 50)
        results.scrollP95 = percentile(sorted, 95)
        results.scrollP99 = percentile(sorted, 99)
        results.scrollMax = sorted[sorted.length - 1]
        results.scrollFrames = frameTimes.length
      }
      results.scrollTotalMs = totalMs
      // Total frames include the 5 warmup frames.
      results.scrollFps = totalMs > 0 ? (65 * 1000) / totalMs : 0

      if (performance.memory) results.heapAfter = performance.memory.usedJSHeapSize

      results.ready = true
    } catch (err) {
      results.error = String(err && err.stack || err)
      results.ready = true
    }
  })
})()
