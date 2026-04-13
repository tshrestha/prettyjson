#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ALLOWLIST = [
  "manifest.json",
  "content.js",
  "src/index.js",
  "src/client.js",
  "src/worker.js",
  "src/formatter.js",
  "src/chunker.js",
  "src/constants.js",
  "themes/fonts/JetBrainsMono-Regular.woff2",
  "icons/logo-16.png",
  "icons/logo-32.png",
  "icons/logo-48.png",
  "icons/logo-128.png",
]

const __filename = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(__filename), "..")
process.chdir(repoRoot)

function fail(msg) {
  console.error(`package: ${msg}`)
  process.exit(1)
}

function checkZipAvailable() {
  try {
    execFileSync("zip", ["-v"], { stdio: "ignore" })
  } catch {
    fail(
      "`zip` command not found. Install it:\n"
        + "  macOS:  preinstalled (should be at /usr/bin/zip)\n"
        + "  Ubuntu: apt-get install zip\n"
        + "  Windows: use Git Bash or WSL",
    )
  }
}

function collectManifestPaths(manifest) {
  const paths = new Set()
  if (manifest.content_scripts) {
    for (const cs of manifest.content_scripts) {
      for (const js of cs.js ?? []) paths.add(js)
    }
  }
  if (manifest.web_accessible_resources) {
    for (const war of manifest.web_accessible_resources) {
      for (const r of war.resources ?? []) paths.add(r)
    }
  }
  if (manifest.icons) {
    for (const p of Object.values(manifest.icons)) paths.add(p)
  }
  return paths
}

function main() {
  checkZipAvailable()

  const manifestText = readFileSync("manifest.json", "utf8")
  const manifest = JSON.parse(manifestText)
  const version = manifest.version
  if (typeof version !== "string" || version.length === 0) {
    fail("manifest.json is missing a top-level `version` string")
  }

  const allowSet = new Set(ALLOWLIST)
  const referenced = collectManifestPaths(manifest)
  const missingFromAllowlist = [...referenced].filter((p) => !allowSet.has(p))
  if (missingFromAllowlist.length > 0) {
    fail(
      "manifest.json references files that are not in the script's ALLOWLIST:\n  "
        + missingFromAllowlist.join("\n  ")
        + "\nAdd them to ALLOWLIST in scripts/package.js.",
    )
  }

  const missingOnDisk = ALLOWLIST.filter((p) => !existsSync(p))
  if (missingOnDisk.length > 0) {
    fail(
      "allowlisted files are missing from the working tree:\n  "
        + missingOnDisk.join("\n  "),
    )
  }

  const outDir = path.join(repoRoot, "dist")
  mkdirSync(outDir, { recursive: true })
  const outZip = path.join(outDir, `prettyjson-${version}.zip`)
  if (existsSync(outZip)) unlinkSync(outZip)

  const staging = mkdtempSync(path.join(tmpdir(), "prettyjson-pkg-"))
  try {
    for (const entry of ALLOWLIST) {
      const src = path.join(repoRoot, entry)
      const dst = path.join(staging, entry)
      mkdirSync(path.dirname(dst), { recursive: true })
      copyFileSync(src, dst)
    }

    execFileSync("zip", ["-r", "-X", "-q", outZip, "."], { cwd: staging, stdio: "inherit" })
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }

  const listing = execFileSync("unzip", ["-Z1", outZip], { encoding: "utf8" })
  const entryNames = listing
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.endsWith("/"))

  if (!entryNames.includes("manifest.json")) {
    fail("produced zip is missing manifest.json at the root (or its path has a directory prefix)")
  }
  for (const allowed of ALLOWLIST) {
    if (!entryNames.includes(allowed)) {
      fail(`produced zip is missing allowlisted file: ${allowed}`)
    }
  }
  for (const actual of entryNames) {
    if (!allowSet.has(actual)) {
      fail(`produced zip contains a file not in the allowlist: ${actual}`)
    }
  }

  const zipSizeBytes = statSync(outZip).size
  const zipSizeKB = (zipSizeBytes / 1024).toFixed(1)
  const relZip = path.relative(repoRoot, outZip)

  console.log(`✓ packaged ${relZip}`)
  console.log(`  size:    ${zipSizeKB} KB (${zipSizeBytes} bytes)`)
  console.log(`  entries: ${entryNames.length}`)
  console.log(`  root:    manifest.json is at the zip root ✓`)
}

main()
