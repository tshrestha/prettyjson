import { expect, test } from "./fixtures.js"

test("highlighted <pre> contains all five non-punctuation classes and no pj-punct", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/highlight.html`)
  const pre = page.locator("#target")
  await expect(pre).toHaveClass(/json-formatted/, { timeout: 5_000 })
  // Five non-punctuation classes must each have at least one span.
  for (const cls of ["pj-key", "pj-string", "pj-number", "pj-boolean", "pj-null"]) {
    await expect(pre.locator(`span.${cls}`).first()).toBeVisible()
  }
  // Punctuation MUST NOT be emitted as spans.
  await expect(pre.locator("span.pj-punct")).toHaveCount(0)
  // Structural punctuation still appears as text (as plain text nodes).
  const text = await pre.textContent()
  expect(text).toContain("{")
  expect(text).toContain("}")
  expect(text).toContain(":")
  expect(text).toContain(",")
})

test("invalid JSON has no json-formatted class and no pj- descendants", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/invalid.html`)
  const pre = page.locator("#target")
  // Poll briefly so the async format path has a chance to run.
  await expect.poll(async () => (await pre.textContent())?.trim(), { timeout: 3_000 })
    .toBe("{\"a\":1}}")
  await expect(pre).not.toHaveClass(/json-formatted/)
  // Any element whose class attribute starts with "pj-" would be
  // a regression. Use a CSS attribute selector.
  const pjCount = await pre.locator("[class^='pj-']").count()
  expect(pjCount).toBe(0)
})

test("multiple highlightable <pre>s share a single injected stylesheet", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/highlight-multi.html`)
  await expect(page.locator("#first")).toHaveClass(/json-formatted/, { timeout: 5_000 })
  await expect(page.locator("#second")).toHaveClass(/json-formatted/, { timeout: 5_000 })
  await expect(page.locator("#third")).toHaveClass(/json-formatted/, { timeout: 5_000 })
  // Exactly one stylesheet with data-pretty-json.
  const styleCount = await page.locator("style[data-pretty-json]").count()
  expect(styleCount).toBe(1)
})

test("large-but-under-threshold payload still produces highlighted spans", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/highlight-large.html`)
  const pre = page.locator("#target")
  await expect(pre).toHaveClass(/json-formatted/, { timeout: 10_000 })
  // At least one string and one number span must exist.
  await expect(pre.locator("span.pj-string").first()).toBeVisible()
  await expect(pre.locator("span.pj-number").first()).toBeVisible()
  // Still no pj-punct spans.
  await expect(pre.locator("span.pj-punct")).toHaveCount(0)
})

test("oversized payload falls back to plain text but retains the theme", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/highlight-oversized.html`)
  const pre = page.locator("#target")
  await expect(pre).toHaveClass(/json-formatted/, { timeout: 30_000 })
  // No highlighted token spans — fallback rendered plain text inside
  // the gutter+code layout.
  for (const cls of ["pj-key", "pj-string", "pj-number", "pj-boolean", "pj-null"]) {
    await expect(pre.locator(`span.${cls}`)).toHaveCount(0)
  }
  // But the theme background still applies.
  const bg = await pre.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(bg).toBe("rgb(40, 44, 52)")
  // And the text content is still formatted (contains newlines and indent).
  const text = await pre.locator(".pj-code").textContent()
  expect(text.length).toBeGreaterThan(100_000)
  expect(text).toContain("\n")
})

test("successfully formatted <pre> receives the default theme background and font", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/highlight.html`)
  const pre = page.locator("#target")
  await expect(pre).toHaveClass(/json-formatted/, { timeout: 5_000 })
  const computed = await pre.evaluate((el) => {
    const cs = getComputedStyle(el)
    return { bg: cs.backgroundColor, font: cs.fontFamily }
  })
  // OneDark-Pro editor.background = #282c34
  expect(computed.bg).toBe("rgb(40, 44, 52)")
  // First family in the font-family stack must be JetBrains Mono.
  expect(computed.font.toLowerCase()).toContain("jetbrains mono")
  // Computed value starts with "JetBrains Mono" (possibly quoted).
  const first = computed.font.split(",")[0].trim().replace(/^"|"$/g, "")
  expect(first.toLowerCase()).toBe("jetbrains mono")
})

test("injected stylesheet declares the JetBrains Mono @font-face with extension URL", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/highlight.html`)
  await expect(page.locator("#target")).toHaveClass(/json-formatted/, { timeout: 5_000 })
  const css = await page.locator("style[data-pretty-json]").first().textContent()
  expect(css).toContain("@font-face")
  expect(css).toContain("JetBrains Mono")
  expect(css).toMatch(/chrome-extension:\/\/[^)"\s]+\/themes\/fonts\/JetBrainsMono-Regular\.woff2/)
})
