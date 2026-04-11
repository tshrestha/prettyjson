import { readFile, stat } from "node:fs/promises"
import { createServer } from "node:http"
import { extname, join, normalize, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const FIXTURES_DIR = resolve(__dirname, "fixtures")

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
}

let server

export default async function globalSetup() {
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost")
    let pathname = decodeURIComponent(url.pathname)
    if (pathname === "/") pathname = "/index.html"

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
  const baseURL = `http://127.0.0.1:${port}`
  process.env.E2E_BASE_URL = baseURL

  return async () => {
    await new Promise((r) => server.close(r))
  }
}
