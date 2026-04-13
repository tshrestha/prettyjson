// Minimal diagnostic: does the content script fire at all?
import { chromium } from "@playwright/test"
import { readFile, stat } from "node:fs/promises"
import { createServer } from "node:http"
import { extname, join, normalize, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const EXTENSION_PATH = __dirname
const FIXTURES_DIR = resolve(__dirname, "fixtures")

async function startServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost")
    let pathname = decodeURIComponent(url.pathname)
    if (pathname === "/") pathname = "/spike.html"
    const filePath = join(FIXTURES_DIR, normalize(pathname))
    try {
      const body = await readFile(filePath)
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      res.end(body)
    } catch {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  return { server, port: server.address().port }
}

const { server, port } = await startServer()
const baseURL = `http://127.0.0.1:${port}`
console.log("server:", baseURL)

const ctx = await chromium.launchPersistentContext("", {
  channel: "chromium",
  headless: false,
  args: [
    `--disable-extensions-except=${EXTENSION_PATH}`,
    `--load-extension=${EXTENSION_PATH}`,
  ],
})
const page = ctx.pages()[0] ?? await ctx.newPage()
page.on("console", (msg) => console.log("PAGE:", msg.type(), msg.text()))
page.on("pageerror", (err) => console.error("PAGEERR:", err.message))

console.log("navigating...")
await page.goto(`${baseURL}/spike.html?items=40&strategy=highlight`, { waitUntil: "domcontentloaded" })
console.log("waiting 3s...")
await new Promise((r) => setTimeout(r, 3000))

const state = await page.evaluate(() => ({
  hasResults: typeof window.__spikeResults !== "undefined",
  results: window.__spikeResults || null,
  preText: document.querySelector("pre#target")?.textContent?.slice(0, 100) || "",
  preChildren: document.querySelector("pre#target")?.childNodes?.length || 0,
}))
console.log("state:", JSON.stringify(state, null, 2))

await ctx.close()
server.close()
