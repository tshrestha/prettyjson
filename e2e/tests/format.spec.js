import { expect, test } from "./fixtures.js"

const EXPECTED_OBJECT = `{
  "a": 1,
  "b": [
    2,
    3
  ]
}`

test("valid JSON object is pretty-printed", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/object.html`)
  const pre = page.locator("#target")
  await expect(pre).toHaveClass(/json-formatted/)
  await expect(pre).toHaveText(EXPECTED_OBJECT)
})

test("valid JSON array is pretty-printed", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/array.html`)
  const pre = page.locator("#target")
  await expect(pre).toHaveClass(/json-formatted/)
  const text = await pre.textContent()
  expect(text).not.toBe("[1,2,{\"k\":\"v\"}]")
  expect(text).toContain("\n")
})

test("whitespace-prefixed JSON is pretty-printed", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/whitespace.html`)
  const pre = page.locator("#target")
  await expect(pre).toHaveClass(/json-formatted/)
  const text = await pre.textContent()
  expect(text).toContain("\"ok\": true")
})

test("invalid JSON is left untouched", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/invalid.html`)
  const pre = page.locator("#target")
  // Give the async format path a chance to run — if it were going to mutate,
  // it would have by now. Poll briefly to avoid racing the worker bootstrap.
  await expect.poll(async () => (await pre.textContent())?.trim(), {
    timeout: 3_000,
  }).toBe("{\"a\":1}}")
  await expect(pre).not.toHaveClass(/json-formatted/)
})

test("non-JSON pre is ignored", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/plain.html`)
  const pre = page.locator("#target")
  await expect.poll(async () => await pre.textContent(), {
    timeout: 3_000,
  }).toBe("hello world")
  await expect(pre).not.toHaveClass(/json-formatted/)
})

test("large JSON payload is pretty-printed via the worker", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/large.html`)
  const pre = page.locator("#target")
  await expect(pre).toHaveClass(/json-formatted/, { timeout: 8_000 })
  const text = await pre.textContent()
  expect(text).toContain("\n")
  expect(text.length).toBeGreaterThan(100_000)
})

test("multiple pres on one page are independently processed", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/multi.html`)
  await expect(page.locator("#obj")).toHaveClass(/json-formatted/)
  await expect(page.locator("#arr")).toHaveClass(/json-formatted/)
  await expect.poll(async () => await page.locator("#plain").textContent(), {
    timeout: 3_000,
  }).toBe("hello world")
  await expect(page.locator("#plain")).not.toHaveClass(/json-formatted/)
})
