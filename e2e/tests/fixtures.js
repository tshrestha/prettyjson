import { chromium, test as base } from "@playwright/test"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const EXTENSION_PATH = resolve(__dirname, "..", "..")
const HEADLESS = process.env.HEADLESS === "1"

export const test = base.extend({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: HEADLESS,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    })
    await use(context)
    await context.close()
  },
  page: async ({ context }, use) => {
    const page = context.pages()[0] ?? await context.newPage()
    await use(page)
  },
  baseURL: async ({}, use) => {
    await use(process.env.E2E_BASE_URL)
  },
})

export const expect = test.expect
