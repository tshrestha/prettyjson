import { expect, test } from "./fixtures.js"

const EXPECTED_SMALL_CODE = `{
  "name": "Alice",
  "age": 30,
  "admin": true
}`

test("small highlighted <pre> has a gutter of numbered lines next to a pj-code column", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/gutter.html`)
  const pre = page.locator("#target")
  await expect(pre).toHaveClass(/json-formatted/, { timeout: 5_000 })

  await expect(pre.locator(".pj-gutter")).toHaveCount(1)
  await expect(pre.locator(".pj-code")).toHaveCount(1)
  await expect(pre.locator(".pj-gutter")).toHaveText("1\n2\n3\n4\n5")
  const codeText = await pre.locator(".pj-code").evaluate((el) => el.innerText)
  expect(codeText).toBe(EXPECTED_SMALL_CODE)
  await expect(pre.locator(".pj-gutter")).toHaveAttribute("aria-hidden", "true")
})

test("pre.json-formatted computed display is grid and gutter color matches OneDark-Pro comment", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/gutter.html`)
  const pre = page.locator("#target")
  await expect(pre).toHaveClass(/json-formatted/, { timeout: 5_000 })

  const display = await pre.evaluate((el) => getComputedStyle(el).display)
  expect(display).toBe("grid")

  const gutterColor = await pre
    .locator(".pj-gutter")
    .evaluate((el) => getComputedStyle(el).color)
  expect(gutterColor).toBe("rgb(92, 99, 112)")

  // Gutter inherits the JetBrains Mono font from pre.json-formatted.
  const gutterFont = await pre
    .locator(".pj-gutter")
    .evaluate((el) => getComputedStyle(el).fontFamily)
  expect(gutterFont.toLowerCase()).toContain("jetbrains mono")
})

test("injected stylesheet declares user-select:none on .pj-gutter", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/gutter.html`)
  await expect(page.locator("#target")).toHaveClass(/json-formatted/, { timeout: 5_000 })
  const css = await page.locator("style[data-pretty-json]").first().textContent()
  expect(css).toContain(".pj-gutter")
  expect(css).toMatch(/user-select:\s*none/)
})

test("oversized payload still renders a gutter alongside plain-text code", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/highlight-oversized.html`)
  const pre = page.locator("#target")
  await expect(pre).toHaveClass(/json-formatted/, { timeout: 30_000 })

  await expect(pre.locator(".pj-gutter")).toHaveCount(1)
  await expect(pre.locator(".pj-code")).toHaveCount(1)

  const { codeLines, gutterLines } = await pre.evaluate((el) => {
    const code = el.querySelector(".pj-code").textContent
    const gutter = el.querySelector(".pj-gutter").textContent
    const newlineCount = (s) => {
      let n = 0
      for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++
      return n
    }
    return { codeLines: newlineCount(code) + 1, gutterLines: newlineCount(gutter) + 1 }
  })
  expect(gutterLines).toBe(codeLines)
  expect(gutterLines).toBeGreaterThan(100)
})

test("large document gutter lists every line number from 1 to the last", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/gutter-large.html`)
  const pre = page.locator("#target")
  await expect(pre).toHaveClass(/json-formatted/, { timeout: 10_000 })

  const { gutterText, codeLines } = await pre.evaluate((el) => {
    return {
      gutterText: el.querySelector(".pj-gutter").textContent,
      codeLines: el.querySelector(".pj-code").textContent.split("\n").length,
    }
  })

  expect(codeLines).toBeGreaterThanOrEqual(100)
  const numbers = gutterText.split("\n")
  expect(numbers.length).toBe(codeLines)
  for (let i = 0; i < numbers.length; i++) {
    expect(numbers[i]).toBe(String(i + 1))
  }
})

test("keyboard select-all serializes the formatted <pre> without gutter digits", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/gutter.html`)
  const pre = page.locator("#target")
  await expect(pre).toHaveClass(/json-formatted/, { timeout: 5_000 })

  // Simulate Cmd+A / Ctrl+A on the page. Chromium's text serialization
  // of the resulting Selection respects user-select: none, so the
  // returned string is what the user would paste after Cmd+C.
  await page.locator("body").click()
  await page.keyboard.press("ControlOrMeta+A")
  const selected = await page.evaluate(() => window.getSelection().toString())

  expect(selected).toContain(EXPECTED_SMALL_CODE)
  expect(selected).not.toMatch(/1\n2\n3\n4\n5/)
})
