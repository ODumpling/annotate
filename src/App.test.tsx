import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { exportFileName } from './export'
import { clearBlobs, IMAGE_PIXEL_LIMITS } from './ingest'
import { projectStore } from './store'

function u32be(value: number): number[] {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]
}

function asciiBytes(text: string): number[] {
  return Array.from(text).map((char) => char.charCodeAt(0))
}

function pngChunk(type: string, dataLength = 0): number[] {
  return [
    ...u32be(dataLength),
    ...asciiBytes(type),
    ...new Array<number>(dataLength).fill(0),
    ...u32be(0),
  ]
}

function validPngFile(name = 'photo.png'): File {
  const bytes = new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...pngChunk('IHDR', 13),
    ...pngChunk('IDAT', 0),
    ...pngChunk('IEND', 0),
  ])
  return new File([bytes] as BlobPart[], name, { type: 'image/png' })
}

function getFileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement
}

beforeEach(() => {
  clearBlobs()
  projectStore.getState().actions.resetProject()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App shell', () => {
  it('renders the placeholder heading', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Annotate' }),
    ).toBeTruthy()
  })
})

describe('App image upload', () => {
  it('shows an actionable error for an unsupported file', async () => {
    render(<App />)
    const file = new File([new Uint8Array([1, 2, 3])], 'note.txt', {
      type: 'text/plain',
    })

    fireEvent.change(getFileInput(), { target: { files: [file] } })

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/unsupported file type/i)
  })

  it('ingests a dropped image and renders the viewport', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() })),
    )
    render(<App />)
    const file = validPngFile()

    fireEvent.drop(screen.getByText(/drag and drop/i), {
      dataTransfer: { files: [file] },
    })

    const image = await screen.findByRole('img', {
      name: /uploaded document page/i,
    })
    expect(image.getAttribute('width')).toBe('800')
    expect(image.getAttribute('height')).toBe('600')
    expect(projectStore.getState().project.pages).toHaveLength(1)
  })

  it('surfaces a warning for images above the recommended pixel size', async () => {
    const side = Math.ceil(
      Math.sqrt(IMAGE_PIXEL_LIMITS.warnMegapixels * 1_000_000),
    )
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({
        width: side + 1,
        height: side + 1,
        close: vi.fn(),
      })),
    )
    render(<App />)
    const file = validPngFile()

    fireEvent.drop(screen.getByText(/drag and drop/i), {
      dataTransfer: { files: [file] },
    })

    const status = await screen.findByRole('status')
    expect(status.textContent).toMatch(/larger than the recommended/i)
  })

  it('ignores a second upload while one is still in flight', async () => {
    let releaseFirstDecode!: () => void
    const firstDecode = new Promise<void>((resolve) => {
      releaseFirstDecode = resolve
    })
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        await firstDecode
        return { width: 800, height: 600, close: vi.fn() }
      }),
    )
    render(<App />)

    fireEvent.drop(screen.getByText(/drag and drop/i), {
      dataTransfer: { files: [validPngFile('first.png')] },
    })
    await screen.findByText(/reading image/i)

    // A second drop while the first is still pending must be a no-op.
    fireEvent.drop(screen.getByText(/drag and drop/i), {
      dataTransfer: { files: [validPngFile('second.png')] },
    })

    releaseFirstDecode()
    await screen.findByRole('img', { name: /uploaded document page/i })

    expect(projectStore.getState().project.pages).toHaveLength(1)
    expect(projectStore.getState().project.source).toMatchObject({
      fileName: 'first.png',
    })
  })
})

describe('App inspector and export wiring', () => {
  it('shows created hotspots in the inspector and exports a standalone file', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() })),
    )
    render(<App />)
    fireEvent.drop(screen.getByText(/drag and drop/i), {
      dataTransfer: { files: [validPngFile()] },
    })
    await screen.findByRole('img', { name: /uploaded document page/i })

    const pageId = projectStore.getState().project.pages[0].id
    projectStore.getState().actions.createHotspot({
      id: 'hotspot-1',
      pageId,
      shape: 'point',
      x: 0.5,
      y: 0.5,
      title: 'Entrance',
      description: '',
      tags: [],
    })

    const inspector = await screen.findByRole('complementary', {
      name: 'Hotspot inspector',
    })
    expect(
      within(inspector).getByRole('button', { name: 'Entrance' }),
    ).toBeTruthy()

    let downloadAnchor: HTMLAnchorElement | undefined
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    const originalAppendChild = document.body.appendChild.bind(document.body)
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node instanceof HTMLAnchorElement) {
        downloadAnchor = node
      }
      return originalAppendChild(node)
    })

    fireEvent.click(
      screen.getByRole('button', { name: /export standalone html/i }),
    )

    await waitFor(() => expect(clickSpy).toHaveBeenCalledOnce())
    expect(downloadAnchor?.href).toMatch(/^blob:/)
    expect(downloadAnchor?.download).toBe(
      exportFileName(projectStore.getState().project),
    )
  })
})
