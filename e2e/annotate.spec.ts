import { expect, test, type Page } from '@playwright/test'
import { readdir, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

const LARGE_IMAGE_SIDE_PX = 4_096

// Performance budget: all production JavaScript combined must remain at or
// below 250 KiB gzipped. This is deliberately about twice the M10 baseline,
// leaving room for product work while guarding against a major dependency or
// accidental payload regression.
const MAX_GZIPPED_JAVASCRIPT_BYTES = 250 * 1_024

// Performance budget: a representative 4096x4096 (16.8 MP) PNG must progress
// from file selection to an interactive editor within 5 seconds. That image is
// large enough to exercise real decoding without crossing the product's 40 MP
// warning threshold; 5 seconds allows slower CI browsers while still catching
// user-visible ingestion regressions.
const MAX_LARGE_IMAGE_INGESTION_MS = 5_000

async function productionJavaScriptGzipBytes(): Promise<number> {
  const assetDirectory = new URL('../dist/assets/', import.meta.url)
  const fileNames = (await readdir(assetDirectory)).filter((fileName) =>
    fileName.endsWith('.js'),
  )
  expect(
    fileNames.length,
    'production build should contain JavaScript',
  ).toBeGreaterThan(0)

  const compressedSizes = await Promise.all(
    fileNames.map(async (fileName) => {
      const source = await readFile(new URL(fileName, assetDirectory))
      return gzipSync(source).byteLength
    }),
  )
  return compressedSizes.reduce((total, bytes) => total + bytes, 0)
}

async function createLargePng(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate((side) => {
    const canvas = document.createElement('canvas')
    canvas.width = side
    canvas.height = side
    const context = canvas.getContext('2d')
    if (!context) throw new Error('2D canvas is unavailable')

    context.fillStyle = '#0f172a'
    context.fillRect(0, 0, side, side)
    context.fillStyle = '#38bdf8'
    context.fillRect(side / 4, side / 4, side / 2, side / 2)
    return canvas.toDataURL('image/png').split(',')[1]
  }, LARGE_IMAGE_SIDE_PX)

  return Buffer.from(base64, 'base64')
}

test('uploads an image, creates a hotspot, exports it, and opens the standalone HTML', async ({
  page,
  context,
}, testInfo) => {
  expect(await productionJavaScriptGzipBytes()).toBeLessThanOrEqual(
    MAX_GZIPPED_JAVASCRIPT_BYTES,
  )

  await page.goto('/')
  const png = await createLargePng(page)
  const ingestionStartedAt = performance.now()
  await page.locator('input[type="file"]').setInputFiles({
    name: 'large-smoke-image.png',
    mimeType: 'image/png',
    buffer: png,
  })
  await expect(page.getByTestId('viewport-container')).toBeVisible()
  expect(performance.now() - ingestionStartedAt).toBeLessThanOrEqual(
    MAX_LARGE_IMAGE_INGESTION_MS,
  )

  await page.getByRole('button', { name: 'Draw hotspot' }).click()
  const viewport = page.getByTestId('viewport-container')
  const viewportBounds = await viewport.boundingBox()
  expect(viewportBounds).not.toBeNull()
  await page.mouse.click(
    viewportBounds!.x + viewportBounds!.width / 2,
    viewportBounds!.y + viewportBounds!.height / 2,
  )

  await page.getByLabel('Title').fill('Smoke test hotspot')
  await page
    .getByLabel('Description')
    .fill('The exported hotspot is interactive.')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export standalone HTML' }).click()
  const download = await downloadPromise
  const exportedPath = testInfo.outputPath('exported.html')
  await download.saveAs(exportedPath)

  const exportedPage = await context.newPage()
  await exportedPage.goto(pathToFileURL(exportedPath).href)
  const marker = exportedPage.getByRole('button', {
    name: /Smoke test hotspot/,
  })
  await expect(marker).toBeVisible()
  await marker.click()
  await expect(
    exportedPage.getByRole('dialog', { name: 'Smoke test hotspot' }),
  ).toContainText('The exported hotspot is interactive.')
})
