import { expect, test } from "./fixtures.js"

test("containers wrap every object and array with the expected shape", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/collapsible.html`)
  const pre = page.locator("#target")
  await expect(pre).toHaveClass(/json-formatted/, { timeout: 5_000 })

  // {"a":[1,2,3],"b":{"c":true}} → 3 containers: outer object, inner array, inner object.
  await expect(pre.locator(".pj-container")).toHaveCount(3)
  await expect(pre.locator('.pj-container[data-kind="object"]')).toHaveCount(2)
  await expect(pre.locator('.pj-container[data-kind="array"]')).toHaveCount(1)

  // Top-level (direct child of .pj-code) is exactly one container, the outer object.
  await expect(pre.locator(".pj-code > .pj-container")).toHaveCount(1)
  await expect(pre.locator('.pj-code > .pj-container[data-kind="object"]')).toHaveCount(1)
})

test("every container has opener, content, placeholder, and closer children", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/collapsible.html`)
  const pre = page.locator("#target")
  await expect(pre).toHaveClass(/json-formatted/, { timeout: 5_000 })

  const shapeCheck = await pre.evaluate((el) => {
    const containers = el.querySelectorAll(".pj-container")
    const problems = []
    containers.forEach((c, i) => {
      const opener = c.querySelector(":scope > .pj-opener")
      const content = c.querySelector(":scope > .pj-content")
      const placeholder = c.querySelector(":scope > .pj-placeholder")
      const closer = c.querySelector(":scope > .pj-closer")
      if (!opener || !content || !placeholder || !closer) {
        problems.push({ i, missing: { opener: !opener, content: !content, placeholder: !placeholder, closer: !closer } })
        return
      }
      const kind = c.getAttribute("data-kind")
      const expectedOpen = kind === "object" ? "{" : "["
      const expectedClose = kind === "object" ? "}" : "]"
      if (opener.textContent !== expectedOpen) problems.push({ i, opener: opener.textContent })
      if (closer.textContent !== expectedClose) problems.push({ i, closer: closer.textContent })
      if (placeholder.textContent !== " \u2026 ") problems.push({ i, placeholder: placeholder.textContent })
    })
    return { total: containers.length, problems }
  })
  expect(shapeCheck.problems).toEqual([])
  expect(shapeCheck.total).toBe(3)
})

test("initial containers are expanded with placeholder hidden", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/collapsible.html`)
  const pre = page.locator("#target")
  await expect(pre).toHaveClass(/json-formatted/, { timeout: 5_000 })

  const state = await pre.evaluate((el) => {
    return Array.from(el.querySelectorAll(".pj-container")).map((c) => ({
      ariaExpanded: c.getAttribute("aria-expanded"),
      contentHidden: c.querySelector(":scope > .pj-content").hidden,
      placeholderHidden: c.querySelector(":scope > .pj-placeholder").hidden,
    }))
  })
  for (const s of state) {
    expect(s.ariaExpanded).toBe("true")
    expect(s.contentHidden).toBe(false)
    expect(s.placeholderHidden).toBe(true)
  }
})

test("clicking the outer opener collapses the container", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/collapsible.html`)
  const pre = page.locator("#target")
  await expect(pre).toHaveClass(/json-formatted/, { timeout: 5_000 })

  const outer = pre.locator(".pj-code > .pj-container").first()
  await outer.locator(":scope > .pj-opener").click()

  await expect(outer).toHaveAttribute("aria-expanded", "false")
  const state = await outer.evaluate((el) => ({
    content: el.querySelector(":scope > .pj-content").hidden,
    placeholder: el.querySelector(":scope > .pj-placeholder").hidden,
  }))
  expect(state.content).toBe(true)
  expect(state.placeholder).toBe(false)

  const visible = await pre.locator(".pj-code").evaluate((el) => el.innerText)
  expect(visible).toContain("\u2026")
})

test("clicking the closer of a collapsed container re-expands it", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/collapsible.html`)
  const pre = page.locator("#target")
  await expect(pre).toHaveClass(/json-formatted/, { timeout: 5_000 })

  const outer = pre.locator(".pj-code > .pj-container").first()
  await outer.locator(":scope > .pj-opener").click()
  await expect(outer).toHaveAttribute("aria-expanded", "false")

  await outer.locator(":scope > .pj-closer").click()
  await expect(outer).toHaveAttribute("aria-expanded", "true")
})

test("toggling one container does not affect its siblings", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/collapsible.html`)
  const pre = page.locator("#target")
  await expect(pre).toHaveClass(/json-formatted/, { timeout: 5_000 })

  // The two inner containers (array for "a", object for "b") are siblings
  // inside the outer object's .pj-content.
  const innerArr = pre.locator('.pj-container[data-kind="array"]').first()
  const innerObj = pre.locator('.pj-container[data-kind="object"]').nth(1) // outer object is nth(0)

  await innerArr.locator(":scope > .pj-opener").click()
  await expect(innerArr).toHaveAttribute("aria-expanded", "false")
  await expect(innerObj).toHaveAttribute("aria-expanded", "true")
})

test("re-expanding an outer container preserves inner collapsed state", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/collapsible.html`)
  const pre = page.locator("#target")
  await expect(pre).toHaveClass(/json-formatted/, { timeout: 5_000 })

  const outer = pre.locator(".pj-code > .pj-container").first()
  const innerArr = pre.locator('.pj-container[data-kind="array"]').first()

  // Collapse inner, collapse outer, expand outer. Inner should still be collapsed.
  await innerArr.locator(":scope > .pj-opener").click()
  await expect(innerArr).toHaveAttribute("aria-expanded", "false")

  await outer.locator(":scope > .pj-opener").click()
  await expect(outer).toHaveAttribute("aria-expanded", "false")

  await outer.locator(":scope > .pj-opener").click()
  await expect(outer).toHaveAttribute("aria-expanded", "true")
  await expect(innerArr).toHaveAttribute("aria-expanded", "false")
})

test("opener and closer expose button semantics", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/collapsible.html`)
  const pre = page.locator("#target")
  await expect(pre).toHaveClass(/json-formatted/, { timeout: 5_000 })

  const openers = pre.locator(".pj-opener")
  const closers = pre.locator(".pj-closer")
  const openerCount = await openers.count()
  const closerCount = await closers.count()
  expect(openerCount).toBe(3)
  expect(closerCount).toBe(3)

  for (let i = 0; i < openerCount; i++) {
    await expect(openers.nth(i)).toHaveAttribute("role", "button")
    await expect(openers.nth(i)).toHaveAttribute("tabindex", "0")
  }
  for (let i = 0; i < closerCount; i++) {
    await expect(closers.nth(i)).toHaveAttribute("role", "button")
    await expect(closers.nth(i)).toHaveAttribute("tabindex", "0")
  }
})

test("Enter on a focused opener toggles and keeps focus", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/collapsible.html`)
  const pre = page.locator("#target")
  await expect(pre).toHaveClass(/json-formatted/, { timeout: 5_000 })

  const outer = pre.locator(".pj-code > .pj-container").first()
  const opener = outer.locator(":scope > .pj-opener")
  await opener.focus()
  await page.keyboard.press("Enter")

  await expect(outer).toHaveAttribute("aria-expanded", "false")
  const activeClass = await page.evaluate(() => document.activeElement && document.activeElement.className)
  expect(activeClass).toBe("pj-opener")
})

test("Space on a focused closer toggles the container", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/collapsible.html`)
  const pre = page.locator("#target")
  await expect(pre).toHaveClass(/json-formatted/, { timeout: 5_000 })

  const outer = pre.locator(".pj-code > .pj-container").first()
  const closer = outer.locator(":scope > .pj-closer")
  await closer.focus()
  await page.keyboard.press(" ")

  await expect(outer).toHaveAttribute("aria-expanded", "false")
})

test("opener has cursor: pointer", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/collapsible.html`)
  const pre = page.locator("#target")
  await expect(pre).toHaveClass(/json-formatted/, { timeout: 5_000 })
  const cursor = await pre
    .locator(".pj-opener")
    .first()
    .evaluate((el) => getComputedStyle(el).cursor)
  expect(cursor).toBe("pointer")
})

test("collapsing an outer container shrinks the gutter to match visible rows", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/collapsible.html`)
  const pre = page.locator("#target")
  await expect(pre).toHaveClass(/json-formatted/, { timeout: 5_000 })

  const initialGutter = await pre.locator(".pj-gutter").textContent()

  const outer = pre.locator(".pj-code > .pj-container").first()
  await outer.locator(":scope > .pj-opener").click()

  const { gutter, visibleRows } = await pre.evaluate((el) => {
    return {
      gutter: el.querySelector(".pj-gutter").textContent,
      visibleRows: el.querySelector(".pj-code").innerText.split("\n").length,
    }
  })
  // Outer object collapsed to a single visible row: `{ … }`
  expect(visibleRows).toBe(1)
  expect(gutter).toBe("1")

  // Re-expanding restores the exact original gutter.
  await outer.locator(":scope > .pj-opener").click()
  await expect(pre.locator(".pj-gutter")).toHaveText(initialGutter)
})

test("oversized payload has no container descendants", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/highlight-oversized.html`)
  const pre = page.locator("#target")
  await expect(pre).toHaveClass(/json-formatted/, { timeout: 30_000 })

  await expect(pre.locator(".pj-container")).toHaveCount(0)
  await expect(pre.locator(".pj-opener")).toHaveCount(0)
  await expect(pre.locator(".pj-closer")).toHaveCount(0)
})
