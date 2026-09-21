import {
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { exportFileName } from './export'
import { clearBlobs, BYTES_PER_MIB, IMAGE_PIXEL_LIMITS, putBlob } from './ingest'
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

// happy-dom's DragEvent constructor ignores a `relatedTarget` init option,
// so it must be attached to the event object after construction.
function dragLeaveWithRelatedTarget(node: Element, relatedTarget: Node) {
  const event = createEvent.dragLeave(node)
  Object.defineProperty(event, 'relatedTarget', { value: relatedTarget })
  fireEvent(node, event)
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

    const status = await screen.findByText(/larger than the recommended/i)
    expect(status.closest('[role="status"]')).not.toBeNull()
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

  it('cancels drops outside the dropzone so the browser never navigates away', () => {
    render(<App />)

    // A drop landing on the page body — outside the dropzone label — must
    // be cancelled: without the guard, the browser default navigates to the
    // dropped file and destroys all in-memory work. fireEvent returns false
    // exactly when the dispatched event was cancelled.
    expect(fireEvent.dragOver(document.body)).toBe(false)
    expect(
      fireEvent.drop(document.body, {
        dataTransfer: { files: [validPngFile()] },
      }),
    ).toBe(false)

    // The stray drop is swallowed, not ingested.
    expect(
      screen.queryByRole('img', { name: /uploaded document page/i }),
    ).toBeNull()
    expect(projectStore.getState().project.source).toBeNull()
  })

  it('highlights the dropzone while a drag hovers it and ignores child churn', () => {
    render(<App />)
    const dropzone = screen.getByText(/drag and drop/i)

    fireEvent.dragEnter(dropzone)
    expect(dropzone.getAttribute('data-drag-active')).toBe('true')

    // Moving between the label's own children must not clear the highlight.
    dragLeaveWithRelatedTarget(dropzone, getFileInput())
    expect(dropzone.getAttribute('data-drag-active')).toBe('true')

    // Leaving the dropzone entirely clears it.
    dragLeaveWithRelatedTarget(dropzone, document.body)
    expect(dropzone.getAttribute('data-drag-active')).toBe('false')

    // A completed drop also clears it.
    fireEvent.dragEnter(dropzone)
    fireEvent.drop(dropzone, { dataTransfer: { files: [] } })
    expect(dropzone.getAttribute('data-drag-active')).toBe('false')
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

  it('announces export success so it is not silent for screen reader users', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() })),
    )
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<App />)
    fireEvent.drop(screen.getByText(/drag and drop/i), {
      dataTransfer: { files: [validPngFile()] },
    })
    await screen.findByRole('img', { name: /uploaded document page/i })

    fireEvent.click(
      screen.getByRole('button', { name: /export standalone html/i }),
    )

    const status = await screen.findByText(/^Exported .*\.html\.$/)
    expect(status.closest('[role="status"]')).not.toBeNull()
  })

  it('warns when an export exceeds the recommended size', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const blobKey = putBlob(new Blob([new Uint8Array(20 * BYTES_PER_MIB)]))
    projectStore.getState().actions.attachSource({
      kind: 'image',
      fileName: 'big.png',
      mimeType: 'image/png',
      blobKey,
    })
    projectStore.getState().actions.addPage({
      id: 'page-1',
      width: 800,
      height: 600,
    })
    render(<App />)
    await screen.findByRole('img', { name: /uploaded document page/i })

    fireEvent.click(
      screen.getByRole('button', { name: /export standalone html/i }),
    )

    const warning = await screen.findByText(/larger than the recommended/i)
    expect(warning.closest('[role="status"]')).not.toBeNull()
  })
})

describe('App loading announcements', () => {
  it('announces image-reading progress via a status role', async () => {
    let releaseDecode!: () => void
    const decode = new Promise<void>((resolve) => {
      releaseDecode = resolve
    })
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        await decode
        return { width: 800, height: 600, close: vi.fn() }
      }),
    )
    render(<App />)

    fireEvent.drop(screen.getByText(/drag and drop/i), {
      dataTransfer: { files: [validPngFile()] },
    })

    const status = await screen.findByText(/reading image/i)
    expect(status.closest('[role="status"]')).not.toBeNull()
    releaseDecode()
  })
})

describe('App edit/preview mode toggle', () => {
  it('switches to a read-only preview and back without touching editor state', async () => {
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

    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }))

    expect(
      screen.queryByRole('complementary', { name: 'Hotspot inspector' }),
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: /export standalone html/i }),
    ).toBeNull()
    expect(screen.queryByText(/drag and drop/i)).toBeNull()
    const preview = screen.getByRole('region', { name: 'Interactive preview' })
    expect(
      within(preview).getByRole('button', { name: /entrance/i }),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Edit' }))
    expect(
      screen.getByRole('complementary', { name: 'Hotspot inspector' }),
    ).toBeTruthy()
    expect(projectStore.getState().selectedHotspotId).toBeNull()
  })
})
