// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from 'zustand/react'
import { parseProject } from '../model'
import { createProjectStore, type ProjectStore } from '../store'
import { PREVIEW_FIXTURE_PROJECT } from '../test-fixtures'
import { InteractivePreview } from './InteractivePreview'

function createFixtureStore() {
  return createProjectStore({
    initialProject: structuredClone(PREVIEW_FIXTURE_PROJECT),
  })
}

function PreviewHarness({ store }: { store: ProjectStore }) {
  const project = useStore(store, (state) => state.project)
  const page = project.pages[0]
  return (
    <InteractivePreview
      hotspots={project.hotspots}
      imageAlt={project.name}
      imageUrl="blob:fixture-image"
      pageHeight={page.height}
      pageId={page.id}
      pageWidth={page.width}
      showBadgeNumbers={project.settings.showBadgeNumbers}
    />
  )
}

function setHoverCapability(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches }),
  })
}

function marker(name: string | RegExp): HTMLButtonElement {
  return screen.getByRole('button', { name }) as HTMLButtonElement
}

function keydown(key: string) {
  fireEvent.keyDown(document, { key })
}

beforeEach(() => {
  setHoverCapability(false)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('shared preview fixture', () => {
  it('is valid versioned project data', () => {
    expect(parseProject(PREVIEW_FIXTURE_PROJECT)).toEqual(
      PREVIEW_FIXTURE_PROJECT,
    )
  })
})

describe('InteractivePreview rendering', () => {
  it('renders a static fit-width page with ordered point and rectangle markers', () => {
    render(<PreviewHarness store={createFixtureStore()} />)

    const page = screen.getByTestId('preview-page')
    expect(page.style.maxWidth).toBe('1200px')
    const image = screen.getByRole('img', { name: 'Museum floor plan review' })
    expect(image.getAttribute('width')).toBe('1200')
    expect(image.getAttribute('height')).toBe('800')

    const markers = screen.getAllByRole('button')
    expect(markers.map((button) => button.getAttribute('aria-label'))).toEqual([
      '1. Main entrance',
      '2. Temporary exhibition gallery with an intentionally long descriptive title that exceeds the compact preview limit',
      '3. Hotspot 3',
    ])
    expect(markers[0].parentElement?.style.left).toBe('18%')
    expect(markers[0].parentElement?.style.top).toBe('72%')
    expect(markers[1].parentElement?.dataset.hotspotShape).toBe('rect')
    expect(markers[1].parentElement?.style.width).toBe('32%')
    expect(
      Number.parseFloat(markers[1].parentElement?.style.height ?? ''),
    ).toBeCloseTo(28)

    expect(document.querySelector('input, textarea, select')).toBeNull()
    expect(
      screen.queryByRole('button', { name: /draw|delete|resize/i }),
    ).toBeNull()
  })

  it('shows a loading status until the image loads, then an alert if it errors', () => {
    render(<PreviewHarness store={createFixtureStore()} />)
    const image = screen.getByRole('img', { name: 'Museum floor plan review' })
    expect(screen.getByRole('status').textContent).toMatch(/loading image/i)

    fireEvent.error(image)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('alert').textContent).toMatch(
      /could not load the image/i,
    )
  })

  it('clears the loading status once the image loads', () => {
    render(<PreviewHarness store={createFixtureStore()} />)
    const image = screen.getByRole('img', { name: 'Museum floor plan review' })

    fireEvent.load(image)

    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the full tooltip on hover only with hover capability', () => {
    vi.useFakeTimers()
    try {
      setHoverCapability(true)
      render(<PreviewHarness store={createFixtureStore()} />)
      const second = marker(/^2\./)
      fireEvent.pointerEnter(second)

      const tooltip = screen.getByRole('dialog')
      expect(tooltip.getAttribute('aria-modal')).toBeNull()
      expect(second.getAttribute('aria-expanded')).toBe('true')
      expect(second.getAttribute('aria-controls')).toBe(tooltip.id)
      expect(tooltip.textContent).toContain(
        'Additional wayfinding notes help visitors understand the route',
      )

      fireEvent.pointerLeave(second)
      expect(screen.queryByRole('dialog')).not.toBeNull()
      act(() => vi.advanceTimersByTime(200))
      expect(screen.queryByRole('dialog')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a hover tooltip open while the pointer moves onto it', () => {
    vi.useFakeTimers()
    try {
      setHoverCapability(true)
      render(<PreviewHarness store={createFixtureStore()} />)
      fireEvent.pointerEnter(marker(/^2\./))
      fireEvent.pointerLeave(marker(/^2\./))
      fireEvent.pointerEnter(screen.getByRole('dialog'))
      act(() => vi.advanceTimersByTime(200))
      expect(screen.queryByRole('dialog')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not require hover before touch-style activation', () => {
    render(<PreviewHarness store={createFixtureStore()} />)
    const entrance = marker('1. Main entrance')
    fireEvent.pointerEnter(entrance, { pointerType: 'touch' })
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(entrance)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})

describe('InteractivePreview tooltip contract', () => {
  it('shows complete sanitized content on click', () => {
    render(<PreviewHarness store={createFixtureStore()} />)
    fireEvent.click(marker('1. Main entrance'))

    const tooltip = screen.getByRole('dialog', { name: 'Main entrance' })
    expect(tooltip.querySelector('strong')?.textContent).toBe('south doors')
    const link = within(tooltip).getByRole('link', { name: 'arrival guide' })
    expect(link.getAttribute('href')).toBe('https://example.com/arrival')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(tooltip.textContent).toContain('accessibility')
  })

  it('pins on click so leaving the marker keeps it open, and unpins on a second click', () => {
    vi.useFakeTimers()
    try {
      setHoverCapability(true)
      render(<PreviewHarness store={createFixtureStore()} />)
      const entrance = marker('1. Main entrance')
      fireEvent.pointerEnter(entrance)
      fireEvent.click(entrance)
      fireEvent.pointerLeave(entrance)
      act(() => vi.advanceTimersByTime(200))
      expect(screen.queryByRole('dialog')).not.toBeNull()

      fireEvent.click(entrance)
      expect(screen.queryByRole('dialog')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores hover on other markers while one is pinned', () => {
    setHoverCapability(true)
    render(<PreviewHarness store={createFixtureStore()} />)
    fireEvent.click(marker('1. Main entrance'))
    fireEvent.pointerEnter(marker(/^2\./))
    expect(screen.getByRole('dialog', { name: 'Main entrance' })).toBeTruthy()
  })

  it('replaces the open tooltip when another marker is clicked', () => {
    render(<PreviewHarness store={createFixtureStore()} />)
    const entrance = marker('1. Main entrance')
    fireEvent.click(entrance)
    fireEvent.pointerDown(marker('3. Hotspot 3'))
    fireEvent.click(marker('3. Hotspot 3'))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: 'Hotspot 3' })).toBeTruthy()
    expect(entrance.getAttribute('aria-expanded')).toBe('false')
  })

  it('shows on keyboard focus and closes with Escape, keeping focus on the marker', () => {
    render(<PreviewHarness store={createFixtureStore()} />)
    const entrance = marker('1. Main entrance')
    act(() => entrance.focus())
    expect(screen.getByRole('dialog', { name: 'Main entrance' })).toBeTruthy()

    keydown('Escape')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(entrance)
    expect(entrance.getAttribute('aria-expanded')).toBe('false')
  })

  it('places the tooltip right after its marker so Tab reaches its links', () => {
    render(<PreviewHarness store={createFixtureStore()} />)
    const entrance = marker('1. Main entrance')
    fireEvent.click(entrance)
    expect(entrance.nextElementSibling).toBe(screen.getByRole('dialog'))
  })

  it('closes on a pointer press outside the marker and tooltip', () => {
    render(<PreviewHarness store={createFixtureStore()} />)
    fireEvent.click(marker('1. Main entrance'))
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps preview tooltip state independent from editor selection', () => {
    const store = createFixtureStore()
    store.getState().actions.selectHotspot('entrance')
    render(<PreviewHarness store={store} />)

    fireEvent.click(marker(/^2\./))
    expect(store.getState().selectedHotspotId).toBe('entrance')
    expect(
      within(screen.getByRole('dialog')).getByRole('heading').textContent,
    ).toMatch(/temporary exhibition gallery/i)
  })
})
