import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from 'zustand/react'
import { createProjectStore, type ProjectStore } from '../store'
import { ImageViewport } from './ImageViewport'

function mockContainerRect(rect: Partial<DOMRect>) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    right: 0,
    bottom: 0,
    x: 0,
    y: 0,
    toJSON() {
      return this
    },
    ...rect,
  } as DOMRect)
}

function readTransform() {
  const content = screen.getByTestId('viewport-content')
  return content.style.transform
}

function createEditorStore() {
  const store = createProjectStore()
  store.getState().actions.createProject({ id: 'project', name: 'Editor' })
  store.getState().actions.addPage({ id: 'page-1', width: 800, height: 600 })
  return store
}

function EditorHarness({ store }: { store: ProjectStore }) {
  const project = useStore(store, (state) => state.project)
  const selectedHotspotId = useStore(store, (state) => state.selectedHotspotId)
  const actions = useStore(store, (state) => state.actions)

  return (
    <ImageViewport
      imageUrl="blob:image"
      naturalWidth={800}
      naturalHeight={600}
      editing={{
        pageId: 'page-1',
        hotspots: project.hotspots,
        selectedHotspotId,
        actions,
      }}
    />
  )
}

function addPoint(store: ProjectStore, id = 'point-1') {
  store.getState().actions.createHotspot({
    id,
    pageId: 'page-1',
    shape: 'point',
    x: 0.5,
    y: 0.5,
    title: 'Point',
    description: '',
    tags: [],
  })
}

function addRectangle(store: ProjectStore, id = 'rect-1') {
  store.getState().actions.createHotspot({
    id,
    pageId: 'page-1',
    shape: 'rect',
    x: 0.8,
    y: 0.8,
    w: 0.1,
    h: 0.1,
    title: 'Rectangle',
    description: '',
    tags: [],
  })
}

beforeEach(() => {
  mockContainerRect({ width: 400, height: 300 })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ImageViewport', () => {
  it('renders the image with its natural dimensions', () => {
    render(
      <ImageViewport
        imageUrl="blob:image"
        naturalWidth={800}
        naturalHeight={600}
      />,
    )

    const image = screen.getByRole('img', { name: /uploaded document page/i })
    expect(image.getAttribute('src')).toBe('blob:image')
    expect(image.getAttribute('width')).toBe('800')
    expect(image.getAttribute('height')).toBe('600')
  })

  it('fits to the container width on mount', () => {
    render(
      <ImageViewport
        imageUrl="blob:image"
        naturalWidth={800}
        naturalHeight={600}
      />,
    )

    expect(screen.getByTestId('zoom-level').textContent).toBe('50%')
    expect(readTransform()).toContain('scale(0.5)')
  })

  it('zooms in and out via the buttons, clamped to the supported range', () => {
    render(
      <ImageViewport
        imageUrl="blob:image"
        naturalWidth={800}
        naturalHeight={600}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByTestId('zoom-level').textContent).toBe('63%')

    for (let i = 0; i < 20; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    }
    expect(screen.getByTestId('zoom-level').textContent).toBe('10%')
  })

  it('resets pan and zoom for a replacement image with identical dimensions', () => {
    const { rerender } = render(
      <ImageViewport
        imageUrl="blob:image-1"
        naturalWidth={800}
        naturalHeight={600}
      />,
    )
    const container = screen.getByTestId('viewport-container')
    fireEvent.pointerDown(container, { pointerId: 1, clientX: 50, clientY: 40 })
    fireEvent.pointerMove(container, { pointerId: 1, clientX: 80, clientY: 65 })
    expect(readTransform()).toContain('translate(30px, 25px)')

    rerender(
      <ImageViewport
        imageUrl="blob:image-2"
        naturalWidth={800}
        naturalHeight={600}
      />,
    )

    expect(screen.getByTestId('zoom-level').textContent).toBe('50%')
    expect(readTransform()).toContain('translate(0px, 0px)')
  })

  it('restores the fit-to-width scale when requested', () => {
    render(
      <ImageViewport
        imageUrl="blob:image"
        naturalWidth={800}
        naturalHeight={600}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByTestId('zoom-level').textContent).not.toBe('50%')

    fireEvent.click(screen.getByRole('button', { name: 'Fit to width' }))
    expect(screen.getByTestId('zoom-level').textContent).toBe('50%')
  })

  // happy-dom's WheelEvent does not carry MouseEvent's clientX/clientY, so
  // cursor-anchored positioning can't be exercised through a DOM event here;
  // that anchor math is covered directly in viewportMath.test.ts. This test
  // still exercises the component's real wheel-to-zoom-factor wiring.
  it('zooms in and out on wheel scroll', () => {
    render(
      <ImageViewport
        imageUrl="blob:image"
        naturalWidth={800}
        naturalHeight={600}
      />,
    )
    const container = screen.getByTestId('viewport-container')

    fireEvent.wheel(container, { deltaY: -200 })
    expect(screen.getByTestId('zoom-level').textContent).toBe('65%')

    fireEvent.wheel(container, { deltaY: 200 })
    expect(screen.getByTestId('zoom-level').textContent).toBe('45%')
  })

  // React registers its delegated wheel listener as passive, so a page would
  // still scroll while zooming if the handler relied on that prop; only a
  // real native, non-passive addEventListener('wheel', ...) can cancel the
  // default. fireEvent.wheel dispatches a real event too, but it doesn't
  // prove the listener is non-passive — a genuine WheelEvent with
  // cancelable: true, checked for defaultPrevented, does.
  it('cancels the native wheel event so the page does not scroll while zooming', () => {
    render(
      <ImageViewport
        imageUrl="blob:image"
        naturalWidth={800}
        naturalHeight={600}
      />,
    )
    const container = screen.getByTestId('viewport-container')

    const event = new WheelEvent('wheel', {
      deltaY: -200,
      clientX: 0,
      clientY: 0,
      bubbles: true,
      cancelable: true,
    })
    act(() => {
      container.dispatchEvent(event)
    })

    expect(event.defaultPrevented).toBe(true)
    expect(screen.getByTestId('zoom-level').textContent).toBe('65%')
  })

  it('pans with a single pointer drag', () => {
    render(
      <ImageViewport
        imageUrl="blob:image"
        naturalWidth={800}
        naturalHeight={600}
      />,
    )
    const container = screen.getByTestId('viewport-container')

    fireEvent.pointerDown(container, { pointerId: 1, clientX: 50, clientY: 40 })
    fireEvent.pointerMove(container, { pointerId: 1, clientX: 80, clientY: 65 })

    expect(readTransform()).toContain('translate(30px, 25px)')
  })

  it('pans with a two-finger drag at constant distance', () => {
    render(
      <ImageViewport
        imageUrl="blob:image"
        naturalWidth={800}
        naturalHeight={600}
      />,
    )
    const container = screen.getByTestId('viewport-container')

    fireEvent.pointerDown(container, {
      pointerId: 1,
      clientX: 150,
      clientY: 100,
    })
    fireEvent.pointerDown(container, {
      pointerId: 2,
      clientX: 250,
      clientY: 100,
    })
    // Both fingers move by the same (20, 10) delta: distance is unchanged, so
    // this should pan, not leave the image in place.
    fireEvent.pointerMove(container, {
      pointerId: 1,
      clientX: 170,
      clientY: 110,
    })
    fireEvent.pointerMove(container, {
      pointerId: 2,
      clientX: 270,
      clientY: 110,
    })

    expect(readTransform()).toContain('translate(20px, 10px) scale(0.5)')
  })

  it('pinch-zooms while keeping the stationary finger anchored to its image point', () => {
    render(
      <ImageViewport
        imageUrl="blob:image"
        naturalWidth={800}
        naturalHeight={600}
      />,
    )
    const container = screen.getByTestId('viewport-container')

    // Left finger stays put at (150, 100); only the right finger moves,
    // doubling the distance from 100px to 200px.
    fireEvent.pointerDown(container, {
      pointerId: 1,
      clientX: 150,
      clientY: 100,
    })
    fireEvent.pointerDown(container, {
      pointerId: 2,
      clientX: 250,
      clientY: 100,
    })
    fireEvent.pointerMove(container, {
      pointerId: 2,
      clientX: 350,
      clientY: 100,
    })

    // With the initial fit-to-width transform (scale 0.5, translate 0,0),
    // the image point under the stationary finger is (300, 200); it must
    // still be there after the gesture.
    const match =
      /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/.exec(
        readTransform(),
      )!
    const [, tx, ty, scale] = match.map(Number)
    expect(scale).toBeCloseTo(1, 5)
    expect((150 - tx) / scale).toBeCloseTo(300, 5)
    expect((100 - ty) / scale).toBeCloseTo(200, 5)
  })

  it('stops treating a released pointer as active', () => {
    render(
      <ImageViewport
        imageUrl="blob:image"
        naturalWidth={800}
        naturalHeight={600}
      />,
    )
    const container = screen.getByTestId('viewport-container')

    fireEvent.pointerDown(container, { pointerId: 1, clientX: 50, clientY: 40 })
    fireEvent.pointerUp(container, { pointerId: 1, clientX: 50, clientY: 40 })
    const beforeStray = readTransform()

    fireEvent.pointerMove(container, {
      pointerId: 1,
      clientX: 200,
      clientY: 200,
    })

    expect(readTransform()).toBe(beforeStray)
  })
})

describe('ImageViewport hotspot editing', () => {
  it('creates and selects a point from a click in draw mode', () => {
    const store = createEditorStore()
    render(<EditorHarness store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Draw hotspot' }))
    const container = screen.getByTestId('viewport-container')

    fireEvent.pointerDown(container, {
      pointerId: 1,
      clientX: 100,
      clientY: 75,
    })
    fireEvent.pointerUp(container, {
      pointerId: 1,
      clientX: 100,
      clientY: 75,
    })

    const [hotspot] = store.getState().project.hotspots
    expect(hotspot).toMatchObject({ shape: 'point', x: 0.25, y: 0.25 })
    expect(store.getState().selectedHotspotId).toBe(hotspot.id)
  })

  it.each([
    ['down-right', { x: 80, y: 60 }, { x: 280, y: 210 }],
    ['up-left', { x: 280, y: 210 }, { x: 80, y: 60 }],
    ['up-right', { x: 80, y: 210 }, { x: 280, y: 60 }],
    ['down-left', { x: 280, y: 60 }, { x: 80, y: 210 }],
  ])('creates normalized rectangles when drawing %s', (_, start, end) => {
    const store = createEditorStore()
    render(<EditorHarness store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Draw hotspot' }))
    const container = screen.getByTestId('viewport-container')

    fireEvent.pointerDown(container, {
      pointerId: 1,
      clientX: start.x,
      clientY: start.y,
    })
    fireEvent.pointerMove(container, {
      pointerId: 1,
      clientX: end.x,
      clientY: end.y,
    })
    fireEvent.pointerUp(container, {
      pointerId: 1,
      clientX: end.x,
      clientY: end.y,
    })

    const hotspot = store.getState().project.hotspots[0]
    expect(hotspot).toMatchObject({
      shape: 'rect',
      x: 0.2,
      y: 0.2,
    })
    expect(hotspot.shape === 'rect' && hotspot.w).toBeCloseTo(0.5)
    expect(hotspot.shape === 'rect' && hotspot.h).toBeCloseTo(0.5)
  })

  it('rejects a dragged rectangle below 12 rendered pixels', () => {
    const store = createEditorStore()
    render(<EditorHarness store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Draw hotspot' }))
    const container = screen.getByTestId('viewport-container')

    fireEvent.pointerDown(container, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    })
    fireEvent.pointerMove(container, {
      pointerId: 1,
      clientX: 111,
      clientY: 111,
    })
    fireEvent.pointerUp(container, {
      pointerId: 1,
      clientX: 111,
      clientY: 111,
    })

    expect(store.getState().project.hotspots).toEqual([])
  })

  it('creates a point from a touch tap that drifts into the 4-12px band', () => {
    const store = createEditorStore()
    render(<EditorHarness store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Draw hotspot' }))
    const container = screen.getByTestId('viewport-container')

    // A 10px touch drift is above the 4px mouse tap threshold but below
    // the 12px rectangle minimum: previously a silent dead zone.
    fireEvent.pointerDown(container, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
    })
    fireEvent.pointerMove(container, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 108,
      clientY: 106,
    })
    fireEvent.pointerUp(container, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 108,
      clientY: 106,
    })

    const [hotspot] = store.getState().project.hotspots
    expect(hotspot).toMatchObject({ shape: 'point' })
    expect(hotspot.shape === 'point' && hotspot.x).toBeCloseTo(0.27)
    expect(hotspot.shape === 'point' && hotspot.y).toBeCloseTo(0.353333, 5)
    expect(store.getState().selectedHotspotId).toBe(hotspot.id)
  })

  it('still creates a rectangle for a touch drag above the touch threshold', () => {
    const store = createEditorStore()
    render(<EditorHarness store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Draw hotspot' }))
    const container = screen.getByTestId('viewport-container')

    fireEvent.pointerDown(container, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 80,
      clientY: 60,
    })
    fireEvent.pointerMove(container, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 280,
      clientY: 210,
    })
    fireEvent.pointerUp(container, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 280,
      clientY: 210,
    })

    expect(store.getState().project.hotspots[0]).toMatchObject({
      shape: 'rect',
      x: 0.2,
      y: 0.2,
    })
  })

  it('clamps a rectangle draw to page bounds after zooming', () => {
    const store = createEditorStore()
    render(<EditorHarness store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    fireEvent.click(screen.getByRole('button', { name: 'Draw hotspot' }))
    const container = screen.getByTestId('viewport-container')

    fireEvent.pointerDown(container, {
      pointerId: 1,
      clientX: -100,
      clientY: -100,
    })
    fireEvent.pointerMove(container, {
      pointerId: 1,
      clientX: 1000,
      clientY: 1000,
    })
    fireEvent.pointerUp(container, {
      pointerId: 1,
      clientX: 1000,
      clientY: 1000,
    })

    expect(store.getState().project.hotspots[0]).toMatchObject({
      shape: 'rect',
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    })
  })

  it('selects visibly from the keyboard and deletes with Delete', () => {
    const store = createEditorStore()
    addPoint(store)
    render(<EditorHarness store={store} />)
    const hotspot = screen.getByRole('button', { name: 'Point' })

    fireEvent.keyDown(hotspot, { key: 'Enter' })
    expect(store.getState().selectedHotspotId).toBe('point-1')
    expect(hotspot.getAttribute('aria-pressed')).toBe('true')

    fireEvent.keyDown(hotspot, { key: 'Delete' })
    expect(store.getState().project.hotspots).toEqual([])
  })

  it('deletes the selected hotspot with the visible action', () => {
    const store = createEditorStore()
    addPoint(store)
    store.getState().actions.selectHotspot('point-1')
    render(<EditorHarness store={store} />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete selected hotspot' }),
    )

    expect(store.getState().project.hotspots).toEqual([])
  })

  it('moves points and clamps rectangles at the page boundary', () => {
    const pointStore = createEditorStore()
    addPoint(pointStore)
    const { unmount } = render(<EditorHarness store={pointStore} />)
    const point = screen.getByRole('button', { name: 'Point' })
    fireEvent.pointerDown(point, { pointerId: 1, clientX: 200, clientY: 150 })
    fireEvent.pointerMove(point, { pointerId: 1, clientX: 240, clientY: 180 })
    fireEvent.pointerUp(point, { pointerId: 1, clientX: 240, clientY: 180 })
    expect(pointStore.getState().project.hotspots[0]).toMatchObject({
      x: 0.6,
      y: 0.6,
    })
    unmount()

    const rectangleStore = createEditorStore()
    addRectangle(rectangleStore)
    render(<EditorHarness store={rectangleStore} />)
    const rectangle = screen.getByRole('button', { name: 'Rectangle' })
    fireEvent.pointerDown(rectangle, {
      pointerId: 2,
      clientX: 340,
      clientY: 255,
    })
    fireEvent.pointerMove(rectangle, {
      pointerId: 2,
      clientX: 540,
      clientY: 455,
    })
    fireEvent.pointerUp(rectangle, {
      pointerId: 2,
      clientX: 540,
      clientY: 455,
    })
    expect(rectangleStore.getState().project.hotspots[0]).toMatchObject({
      x: 0.9,
      y: 0.9,
      w: 0.1,
      h: 0.1,
    })
  })

  it('resizes rectangles from the handle and clamps the far edge', () => {
    const store = createEditorStore()
    addRectangle(store)
    store.getState().actions.selectHotspot('rect-1')
    render(<EditorHarness store={store} />)
    const handle = screen.getByRole('button', { name: 'Resize Rectangle' })

    fireEvent.pointerDown(handle, {
      pointerId: 1,
      clientX: 360,
      clientY: 270,
    })
    fireEvent.pointerMove(handle, {
      pointerId: 1,
      clientX: 760,
      clientY: 670,
    })
    fireEvent.pointerUp(handle, {
      pointerId: 1,
      clientX: 760,
      clientY: 670,
    })

    const resized = store.getState().project.hotspots[0]
    expect(resized).toMatchObject({
      shape: 'rect',
      x: 0.8,
      y: 0.8,
    })
    expect(resized.shape === 'rect' && resized.w).toBeCloseTo(0.2)
    expect(resized.shape === 'rect' && resized.h).toBeCloseTo(0.2)
  })

  it('promotes an active hotspot move to a pinch when a second pointer lands on the viewport', () => {
    const store = createEditorStore()
    addPoint(store)
    render(<EditorHarness store={store} />)
    const container = screen.getByTestId('viewport-container')
    const point = screen.getByRole('button', { name: 'Point' })

    // First finger starts moving the hotspot.
    fireEvent.pointerDown(point, { pointerId: 1, clientX: 200, clientY: 150 })

    // A second finger lands elsewhere in the viewport, not on the hotspot
    // itself — this must promote the gesture to a pinch rather than running
    // a hotspot move and a container pan/zoom at once.
    fireEvent.pointerDown(container, {
      pointerId: 2,
      clientX: 300,
      clientY: 150,
    })
    fireEvent.pointerMove(container, {
      pointerId: 2,
      clientX: 400,
      clientY: 150,
    })

    const match = /scale\(([\d.]+)\)/.exec(readTransform())!
    expect(Number(match[1])).toBeCloseTo(1, 5)
    expect(store.getState().project.hotspots[0]).toMatchObject({
      x: 0.5,
      y: 0.5,
    })
  })

  it('keeps single-pointer pan available outside draw mode', () => {
    const store = createEditorStore()
    render(<EditorHarness store={store} />)
    const container = screen.getByTestId('viewport-container')

    fireEvent.pointerDown(container, { pointerId: 1, clientX: 50, clientY: 40 })
    fireEvent.pointerMove(container, { pointerId: 1, clientX: 80, clientY: 65 })

    expect(readTransform()).toContain('translate(30px, 25px)')
    expect(store.getState().project.hotspots).toEqual([])
  })
})

describe('ImageViewport zoom-invariant target sizes', () => {
  it('keeps the point marker at a constant rendered size regardless of zoom', () => {
    const store = createEditorStore()
    addPoint(store)
    render(<EditorHarness store={store} />)
    const marker = screen.getByRole('button', { name: 'Point' })

    // Fit-to-width scale is 0.5 (400px container / 800px natural width).
    expect(marker.style.transform).toBe('translate(-50%, -50%) scale(2)')

    for (let i = 0; i < 20; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    }
    // Clamped at the 10% zoom floor.
    expect(marker.style.transform).toBe('translate(-50%, -50%) scale(10)')
  })

  it('grows the resize handle to compensate for zoom, independent of the rectangle', () => {
    const store = createEditorStore()
    addRectangle(store)
    store.getState().actions.selectHotspot('rect-1')
    render(<EditorHarness store={store} />)

    for (let i = 0; i < 20; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    }
    const handle = screen.getByRole('button', { name: 'Resize Rectangle' })
    expect(handle.style.transform).toBe('scale(10)')
  })

  it('grows the invisible hit area, not the visible outline, for a small or zoomed-out rectangle', () => {
    const store = createEditorStore()
    addRectangle(store) // w: 0.1, h: 0.1 on an 800x600 page
    render(<EditorHarness store={store} />)
    const rectangle = screen.getByRole('button', { name: 'Rectangle' })
    const visibleOutline = rectangle.parentElement as HTMLElement

    for (let i = 0; i < 20; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    }
    // At the 10% zoom floor: 0.1 * 800 * 0.1 = 8px wide (needs 24/8 = 3x),
    // 0.1 * 600 * 0.1 = 6px tall (needs 24/6 = 4x) — independent per axis.
    expect(rectangle.style.transform).toBe('scale(3, 4)')
    expect(visibleOutline.style.width).toBe('10%')
    expect(visibleOutline.style.height).toBe('10%')
    expect(visibleOutline.style.transform).toBe('')
  })

  it('grows each hit-area axis independently for a thin, wide rectangle', () => {
    const store = createEditorStore()
    store.getState().actions.createHotspot({
      id: 'thin-rect',
      pageId: 'page-1',
      shape: 'rect',
      x: 0.1,
      y: 0.1,
      w: 0.5,
      h: 0.01,
      title: 'Thin banner',
      description: '',
      tags: [],
    })
    render(<EditorHarness store={store} />)
    const rectangle = screen.getByRole('button', { name: 'Thin banner' })

    // Fit-to-width scale is 0.5: width renders at 0.5*800*0.5=200px (already
    // well above 24px, no growth needed); height renders at
    // 0.01*600*0.5=3px (needs 24/3=8x). A uniform scale derived from the
    // shorter axis would balloon the already-adequate width to 1600px.
    expect(rectangle.style.transform).toBe('scale(1, 8)')
  })
})
