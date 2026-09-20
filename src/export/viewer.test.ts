// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { Project } from '../model'
import { exportProject } from './index'

const TIMESTAMP = '2026-09-20T12:00:00.000Z'
const PNG_BYTES = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmKMAAAAABJRU5ErkJggg==',
  ),
  (char) => char.charCodeAt(0),
)

function pngBlob(): Blob {
  return new Blob([PNG_BYTES], { type: 'image/png' })
}

function fixtureProject(overrides: Partial<Project> = {}): Project {
  return {
    schemaVersion: 1,
    id: 'project-1',
    name: 'Viewer fixture',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    source: {
      kind: 'image',
      fileName: 'photo.png',
      mimeType: 'image/png',
      blobKey: 'blob-1',
    },
    pages: [{ id: 'page-1', index: 0, width: 1200, height: 800 }],
    hotspots: [
      {
        id: 'point-1',
        pageId: 'page-1',
        shape: 'point',
        x: 0.5,
        y: 0.5,
        title: 'First </script> hotspot',
        description: '**bold** [link](https://example.com)',
        color: '#12abef',
        tags: ['alpha', 'line\u2028sep'],
        order: 0,
      },
      {
        id: 'rect-1',
        pageId: 'page-1',
        shape: 'rect',
        x: 0.1,
        y: 0.1,
        w: 0.3,
        h: 0.2,
        title: 'Second',
        description: 'plain description',
        tags: [],
        order: 1,
      },
    ],
    settings: { showBadgeNumbers: true, exportedListView: false },
    ...overrides,
  }
}

async function bootViewer(project: Project) {
  const { html } = await exportProject(project, (key) =>
    key === 'blob-1' ? pngBlob() : undefined,
  )
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const jsonText = doc.getElementById('annotate-data')?.textContent ?? ''
  const viewerScript = Array.from(doc.querySelectorAll('script'))
    .filter((script) => script.type !== 'application/json')
    .map((script) => script.textContent)
    .join('\n')
  document.body.innerHTML = ''
  document.body.innerHTML = `<script type="application/json" id="annotate-data">${jsonText}</script>`
  new Function(viewerScript)()
}

function markers(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll('button.annotate-marker'))
}

function dialog(): Element | null {
  return document.querySelector('[role="dialog"]')
}

function keydown(key: string, shiftKey = false) {
  document.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      shiftKey,
      bubbles: true,
      cancelable: true,
    }),
  )
}

beforeEach(async () => {
  await bootViewer(fixtureProject())
})

describe('exported viewer rendering', () => {
  it('renders the project, image, and percentage-positioned markers', () => {
    expect(document.querySelector('main.annotate')).not.toBeNull()
    expect(document.querySelector('h1.annotate-title')?.textContent).toBe(
      'Viewer fixture',
    )
    const section = document.querySelector('section.annotate-page')
    expect(section?.getAttribute('aria-label')).toBe('Page 1')
    const image = document.querySelector<HTMLImageElement>('img.annotate-image')
    expect(image?.getAttribute('alt')).toBe('Viewer fixture')
    expect(image?.src.startsWith('data:image/png;base64,')).toBe(true)
    expect(
      image?.closest('.annotate-viewport')?.getAttribute('style'),
    ).toContain('max-width: 1200px')

    const [point, rect] = markers()
    expect(point).toBeDefined()
    expect(rect).toBeDefined()
    expect(point.className).not.toContain('annotate-marker-rect')
    expect(rect.className).toContain('annotate-marker-rect')
    expect(point.style.left).toBe('50%')
    expect(point.style.top).toBe('50%')
    expect(rect.style.width).toBe('30%')
    expect(rect.style.height).toBe('20%')
    expect(point.style.getPropertyValue('--marker-color')).toBe('#12abef')
    expect(rect.style.getPropertyValue('--marker-color')).toBe('#2563eb')
    expect(point.getAttribute('aria-haspopup')).toBe('dialog')
    expect(point.getAttribute('aria-label')).toBe('1. First </script> hotspot')
    expect(rect.getAttribute('aria-label')).toBe('2. Second')
    expect(point.querySelector('.annotate-badge')?.textContent).toBe('1')
    expect(rect.querySelector('.annotate-badge')?.textContent).toBe('2')
  })

  it('omits badges and number prefixes when badge numbers are off', async () => {
    await bootViewer(
      fixtureProject({
        settings: { showBadgeNumbers: false, exportedListView: false },
      }),
    )
    expect(document.querySelectorAll('.annotate-badge')).toHaveLength(0)
    expect(markers()[0].getAttribute('aria-label')).toBe(
      'First </script> hotspot',
    )
  })
})

describe('exported viewer activation and focus', () => {
  it('opens an accessible dialog card on click and focuses it', () => {
    const [point] = markers()
    point.click()

    const card = dialog()
    expect(card).not.toBeNull()
    expect(card?.getAttribute('aria-modal')).toBe('true')
    expect(card?.getAttribute('aria-labelledby')).toBe('annotate-card-title')
    expect(card?.querySelector('.annotate-card-title')?.textContent).toBe(
      'First </script> hotspot',
    )

    const link = card?.querySelector('a')
    expect(link?.getAttribute('href')).toBe('https://example.com')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer')

    expect(card?.querySelectorAll('.annotate-tag')[0].textContent).toBe('alpha')
    expect(card?.querySelectorAll('.annotate-tag')[1].textContent).toBe(
      'line\u2028sep',
    )

    const close = card?.querySelector('.annotate-card-close')
    expect(document.activeElement).toBe(close)
    expect(point.getAttribute('aria-expanded')).toBe('true')
  })

  it('closes on Escape and restores focus to the marker', () => {
    const [point] = markers()
    point.click()
    keydown('Escape')
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(point)
    expect(point.getAttribute('aria-expanded')).toBe('false')
  })

  it('closes on backdrop click and restores focus', () => {
    const [point] = markers()
    point.click()
    document
      .querySelector('.annotate-backdrop')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(point)
  })

  it('traps Tab focus inside the open card', () => {
    const [point] = markers()
    point.click()
    const card = dialog() as HTMLElement
    const link = card.querySelector('a') as HTMLAnchorElement
    const close = card.querySelector(
      '.annotate-card-close',
    ) as HTMLButtonElement
    expect(document.activeElement).toBe(close)

    keydown('Tab')
    expect(document.activeElement).toBe(link)

    keydown('Tab', true)
    expect(document.activeElement).toBe(close)
  })

  it('uses native button semantics for keyboard and touch activation', () => {
    for (const marker of markers()) {
      expect(marker.tagName).toBe('BUTTON')
      expect(marker.getAttribute('type')).toBe('button')
      marker.focus()
      expect(document.activeElement).toBe(marker)
    }
    const [, rect] = markers()
    rect.focus()
    rect.click()
    expect(dialog()).not.toBeNull()
    expect(dialog()?.querySelector('.annotate-card-title')?.textContent).toBe(
      'Second',
    )
  })

  it('replaces the open card when another marker is activated', () => {
    const [point, rect] = markers()
    point.click()
    rect.click()
    const cards = document.querySelectorAll('[role="dialog"]')
    expect(cards.length).toBe(1)
    expect(cards[0].querySelector('.annotate-card-title')?.textContent).toBe(
      'Second',
    )
    expect(point.getAttribute('aria-expanded')).toBe('false')
    expect(rect.getAttribute('aria-expanded')).toBe('true')
  })
})
