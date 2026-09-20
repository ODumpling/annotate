import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
