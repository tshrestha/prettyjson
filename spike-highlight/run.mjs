// Throwaway perf spike runner.
//
// - Serves spike-highlight/fixtures/ over a local HTTP server.
// - Launches Chromium via Playwright with the spike extension loaded.
// - Runs a matrix of (size × strategy) and reports a results table.
//
// Run:   node spike-highlight/run.mjs
//        HEADLESS=1 node spike-highlight/run.mjs   (for background runs)

import { chromium } from "@playwright/test"
import { readFile, stat } from "node:fs/promises"
import { createServer } from "node:http"
import { extname, join, normalize, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const EXTENSION_PATH = __dirname
const FIXTURES_DIR = resolve(__dirname, "fixtures")
const HEADLESS = process.env.HEADLESS === "1"

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
}

async function startFixtureServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost")
    let pathname = decodeURIComponent(url.pathname)
    if (pathname === "/") pathname = "/spike.html"
    const safeRelative = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "")
    const filePath = join(FIXTURES_DIR, safeRelative)
    if (!filePath.startsWith(FIXTURES_DIR)) {
      res.writeHead(403)
      res.end("Forbidden")
      return
    }
    try {
      const st = await stat(filePath)
      if (!st.isFile()) throw new Error("not a file")
      const body = await readFile(filePath)
      const type = CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream"
      res.writeHead(200, { "Content-Type": type, "Content-Length": body.length })
      res.end(body)
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
      res.end("Not Found")
    }
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const { port } = server.address()
  return { server, baseURL: `http://127.0.0.1:${port}` }
}

const SIZES = [
  { label: "1k", items: 40 },
  { label: "10k", items: 400 },
  { label: "100k", items: 4000 },
  { label: "500k", items: 18000 },
]

const STRATEGIES = ["plain", "span", "highlight"]

function fmt(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—"
  if (typeof n !== "number") return String(n)
  return n.toFixed(digits)
}

function fmtInt(n) {
  if (n === null || n === undefined) return "—"
  return n.toLocaleString()
}

function fmtBytes(n) {
  if (!n) return "—"
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MB"
  if (n >= 1024) return (n / 1024).toFixed(1) + " KB"
  return n + " B"
}

async function main() {
  const { server, baseURL } = await startFixtureServer()
  console.log(`fixture server: ${baseURL}`)

  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: HEADLESS,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--enable-precise-memory-info",
      "--js-flags=--expose-gc",
    ],
  })

  const page = context.pages()[0] ?? await context.newPage()
  page.on("pageerror", (err) => console.error("[page error]", err.message))
  page.on("console", (msg) => {
    const txt = msg.text()
    if (txt.startsWith("[spike")) console.log("  >", txt)
  })

  const results = []

  for (const size of SIZES) {
    for (const strategy of STRATEGIES) {
      const url = `${baseURL}/spike.html?items=${size.items}&strategy=${strategy}`
      const label = `${size.label.padEnd(5)} ${strategy.padEnd(9)}`
      process.stdout.write(`running ${label} ... `)
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300_000 })
        await page.waitForFunction(
          () => window.__spikeResults && window.__spikeResults.ready,
          undefined,
          { timeout: 300_000, polling: 2000 },
        )
        const r = await page.evaluate(() => window.__spikeResults)
        r.size = size.label
        r.items = size.items
        results.push(r)
        if (r.error) {
          console.log(`ERROR: ${r.error.split("\n")[0]}`)
        } else {
          console.log(
            `tokens=${fmtInt(r.tokenCount)} render=${fmt(r.renderMs)}ms `
              + `firstPaint=${fmt(r.firstPaintMs)}ms `
              + `scrollFps=${fmt(r.scrollFps)} scrollTotal=${fmt(r.scrollTotalMs, 0)}ms `
              + `p50=${fmt(r.scrollP50)}ms p95=${fmt(r.scrollP95)}ms`,
          )
        }
      } catch (err) {
        console.log(`FAILED: ${err.message}`)
        results.push({ size: size.label, strategy, error: err.message })
      }
    }
  }

  await context.close()
  server.close()

  // Print summary table.
  console.log("\n\n=== RESULTS ===\n")
  console.log(
    [
      "size".padEnd(6),
      "strategy".padEnd(10),
      "tokens".padStart(10),
      "render".padStart(9),
      "1st pnt".padStart(9),
      "scroll FPS".padStart(11),
      "scroll ms".padStart(10),
      "p50".padStart(7),
      "p95".padStart(7),
      "dom kids".padStart(9),
      "hl set".padStart(7),
    ].join(" | "),
  )
  console.log("-".repeat(125))
  for (const r of results) {
    if (r.error) {
      console.log(`${r.size.padEnd(6)} ${r.strategy.padEnd(10)} ERROR: ${r.error}`)
      continue
    }
    console.log(
      [
        r.size.padEnd(6),
        r.strategy.padEnd(10),
        fmtInt(r.tokenCount).padStart(10),
        fmt(r.renderMs).padStart(9),
        fmt(r.firstPaintMs).padStart(9),
        fmt(r.scrollFps).padStart(11),
        fmt(r.scrollTotalMs, 0).padStart(10),
        fmt(r.scrollP50).padStart(7),
        fmt(r.scrollP95).padStart(7),
        fmtInt(r.preChildElementCount).padStart(9),
        (r.strategy === "highlight" ? (r.highlightRegistered ? "yes" : "no") : "—").padStart(7),
      ].join(" | "),
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
