// Diagnose the 1M highlight case: let it run to completion and see
// whether it's slow, OOMs, or does something else bad.
import { chromium } from "@playwright/test"
import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { join, normalize, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const EXTENSION_PATH = __dirname
const FIXTURES_DIR = resolve(__dirname, "fixtures")

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost")
  let pathname = decodeURIComponent(url.pathname)
  if (pathname === "/") pathname = "/spike.html"
  try {
    const body = await readFile(join(FIXTURES_DIR, normalize(pathname)))
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end()
  }
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const baseURL = `http://127.0.0.1:${server.address().port}`

const ctx = await chromium.launchPersistentContext("", {
  channel: "chromium",
  headless: false,
  args: [
    `--disable-extensions-except=${EXTENSION_PATH}`,
    `--load-extension=${EXTENSION_PATH}`,
    "--enable-precise-memory-info",
  ],
})
const page = ctx.pages()[0] ?? await ctx.newPage()
page.on("console", (msg) => console.log("PAGE:", msg.type(), msg.text().slice(0, 200)))
page.on("pageerror", (err) => console.error("PAGEERR:", err.message))
page.on("crash", () => console.error("PAGE CRASHED"))

const SIZE = parseInt(process.argv[2] || "40000", 10)
const STRATEGY = process.argv[3] || "highlight"

console.log(`running items=${SIZE} strategy=${STRATEGY}`)
const tStart = Date.now()
await page.goto(`${baseURL}/spike.html?items=${SIZE}&strategy=${STRATEGY}`, {
  waitUntil: "domcontentloaded",
  timeout: 300_000,
})
console.log(`domcontentloaded at ${Date.now() - tStart}ms`)

// Poll manually so we can see progress
let waited = 0
while (waited < 300_000) {
  const state = await page.evaluate(() => ({
    has: typeof window.__spikeResults !== "undefined",
    ready: window.__spikeResults?.ready,
    error: window.__spikeResults?.error,
    tokens: window.__spikeResults?.tokenCount,
    renderMs: window.__spikeResults?.renderMs,
  }))
  console.log(`  [${Date.now() - tStart}ms] ${JSON.stringify(state)}`)
  if (state.ready) break
  await new Promise((r) => setTimeout(r, 2000))
  waited += 2000
}

const r = await page.evaluate(() => window.__spikeResults)
console.log("\nFINAL:", JSON.stringify(r, null, 2))

await ctx.close()
server.close()
