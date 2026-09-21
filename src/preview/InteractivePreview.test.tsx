// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from 'zustand/react'
import { parseProject } from '../model'
import { createProjectStore, type ProjectStore } from '../store'
import { PREVIEW_FIXTURE_PROJECT } from '../test-fixtures'
import {
  DESCRIPTION_SUMMARY_GRAPHEMES,
  TITLE_SUMMARY_GRAPHEMES,
} from './summary'
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

function keydown(key: string, shiftKey = false) {
  fireEvent.keyDown(document, { key, shiftKey })
}

function graphemeCount(value: string): number {
  return [
    ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
      value,
    ),
  ].length
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

  it('shows a bounded plain-text summary only with hover capability', () => {
    setHoverCapability(true)
    render(<PreviewHarness store={createFixtureStore()} />)
    fireEvent.pointerEnter(marker(/^2\./))

    const tooltip = screen.getByRole('tooltip')
    const [title, description] = Array.from(tooltip.querySelectorAll('p'))
    expect(graphemeCount(title.textContent ?? '')).toBeLessThanOrEqual(
      TITLE_SUMMARY_GRAPHEMES,
    )
    expect(title.textContent?.endsWith('…')).toBe(true)
    expect(graphemeCount(description.textContent ?? '')).toBeLessThanOrEqual(
      DESCRIPTION_SUMMARY_GRAPHEMES,
    )
    expect(description.textContent?.endsWith('…')).toBe(true)
    expect(description.textContent).not.toContain('**')
    expect(description.textContent).not.toMatch(/\s{2,}/)
    expect(description.className).toContain('line-clamp-3')

    fireEvent.pointerLeave(marker(/^2\./))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('does not require hover before touch-style activation', () => {
    render(<PreviewHarness store={createFixtureStore()} />)
    const entrance = marker('1. Main entrance')
    fireEvent.pointerEnter(entrance, { pointerType: 'touch' })
    expect(screen.queryByRole('tooltip')).toBeNull()

    fireEvent.click(entrance)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})

describe('InteractivePreview card contract', () => {
  it('opens complete sanitized content and moves focus to Close', () => {
    render(<PreviewHarness store={createFixtureStore()} />)
    fireEvent.click(marker('1. Main entrance'))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading').textContent).toBe(
      'Main entrance',
    )
    expect(dialog.querySelector('strong')?.textContent).toBe('south doors')
    const link = within(dialog).getByRole('link', { name: 'arrival guide' })
    expect(link.getAttribute('href')).toBe('https://example.com/arrival')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(dialog.textContent).toContain('arrival')
    expect(dialog.textContent).toContain('accessibility')
    expect(document.activeElement).toBe(
      within(dialog).getByRole('button', { name: 'Close' }),
    )
  })

  it('activates markers with Enter and Space', () => {
    render(<PreviewHarness store={createFixtureStore()} />)
    const entrance = marker('1. Main entrance')
    entrance.focus()
    fireEvent.keyDown(entrance, { key: 'Enter' })
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    const lift = marker('3. Hotspot 3')
    lift.focus()
    fireEvent.keyDown(lift, { key: ' ' })
    expect(
      within(screen.getByRole('dialog')).getByRole('heading').textContent,
    ).toBe('Hotspot 3')
  })

  it('closes with Escape and restores focus to its triggering marker', () => {
    render(<PreviewHarness store={createFixtureStore()} />)
    const entrance = marker('1. Main entrance')
    fireEvent.click(entrance)
    keydown('Escape')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(entrance)
    expect(entrance.getAttribute('aria-expanded')).toBe('false')
  })

  it('traps forward and reverse Tab movement inside the card', () => {
    render(<PreviewHarness store={createFixtureStore()} />)
    fireEvent.click(marker('1. Main entrance'))
    const dialog = screen.getByRole('dialog')
    const link = within(dialog).getByRole('link')
    const close = within(dialog).getByRole('button', { name: 'Close' })

    expect(document.activeElement).toBe(close)
    keydown('Tab')
    expect(document.activeElement).toBe(link)
    keydown('Tab', true)
    expect(document.activeElement).toBe(close)
  })

  it('closes from the backdrop and restores focus', () => {
    render(<PreviewHarness store={createFixtureStore()} />)
    const entrance = marker('1. Main entrance')
    fireEvent.click(entrance)
    fireEvent.click(screen.getByTestId('preview-backdrop'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(entrance)
  })

  it('locks body scroll while open and restores it on close', () => {
    render(<PreviewHarness store={createFixtureStore()} />)
    expect(document.body.style.overflow).toBe('')

    const entrance = marker('1. Main entrance')
    fireEvent.click(entrance)
    expect(document.body.style.overflow).toBe('hidden')

    keydown('Escape')
    expect(document.body.style.overflow).toBe('')
  })

  it('keeps preview card state independent from editor selection', () => {
    const store = createFixtureStore()
    store.getState().actions.selectHotspot('entrance')
    render(<PreviewHarness store={store} />)

    fireEvent.click(marker(/^2\./))
    expect(store.getState().selectedHotspotId).toBe('entrance')
    expect(
      within(screen.getByRole('dialog')).getByRole('heading').textContent,
    ).toMatch(/temporary exhibition gallery/i)
  })

  it('shows the full description rather than the compact truncation', () => {
    render(<PreviewHarness store={createFixtureStore()} />)
    fireEvent.click(marker(/^2\./))
    expect(screen.getByRole('dialog').textContent).toContain(
      'Additional wayfinding notes help visitors understand the route',
    )
  })
})
