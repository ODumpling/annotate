import type { Hotspot } from '../model'
import type { SanitizedHtml } from './markdown'
import { serializeScriptSafeJson } from './serialize'

export interface ExportedPageData {
  id: string
  width: number
  height: number
  imageDataUrl: string
}

export interface ExportedHotspotData {
  id: string
  pageId: string
  shape: Hotspot['shape']
  x: number
  y: number
  w?: number
  h?: number
  title: string
  descriptionHtml: SanitizedHtml
  tags: string[]
  color: string
}

export type ExportTheme = 'dark' | 'light'

export interface ExportedViewerData {
  schemaVersion: 1
  name: string
  showBadgeNumbers: boolean
  exportTheme?: ExportTheme
  pages: ExportedPageData[]
  hotspots: ExportedHotspotData[]
}

interface ThemePalette {
  background: string
  text: string
  overlayScrim: string
  markerBorder: string
  markerShadow: string
  cardBackground: string
  cardBorder: string
  codeBackground: string
  blockquoteText: string
  tagBackground: string
  link: string
  focusOutline: string
}

const DARK_PALETTE: ThemePalette = {
  background: '#0f172a',
  text: '#e2e8f0',
  overlayScrim: 'rgba(2, 6, 23, 0.12)',
  markerBorder: '#fff',
  markerShadow: 'rgba(2, 6, 23, 0.55)',
  cardBackground: '#1e293b',
  cardBorder: '#334155',
  codeBackground: '#0f172a',
  blockquoteText: '#94a3b8',
  tagBackground: '#334155',
  link: '#93c5fd',
  focusOutline: '#fbbf24',
}

// Light-theme swap of the same layout: navy surfaces become white/slate, and
// text/border/link colors invert to keep the same WCAG AA contrast ratios
// (see src/a11y/contrast.ts) against the new backgrounds.
const LIGHT_PALETTE: ThemePalette = {
  background: '#f8fafc',
  text: '#0f172a',
  overlayScrim: 'rgba(15, 23, 42, 0.08)',
  markerBorder: '#0f172a',
  markerShadow: 'rgba(15, 23, 42, 0.35)',
  cardBackground: '#ffffff',
  cardBorder: '#cbd5e1',
  codeBackground: '#e2e8f0',
  blockquoteText: '#475569',
  tagBackground: '#e2e8f0',
  link: '#1d4ed8',
  focusOutline: '#b45309',
}

function paletteFor(theme: ExportTheme | undefined): ThemePalette {
  return theme === 'light' ? LIGHT_PALETTE : DARK_PALETTE
}

function viewerCss(theme: ExportTheme | undefined): string {
  const palette = paletteFor(theme)
  return `* { box-sizing: border-box; }
body { margin: 0; background: ${palette.background}; color: ${palette.text}; font: 16px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
.annotate { max-width: 960px; margin: 0 auto; padding: 24px 16px 64px; }
.annotate-header { margin: 0 0 20px; }
.annotate-title { margin: 0; font-size: 1.5rem; letter-spacing: -0.01em; }
.annotate-page { margin: 0 0 32px; }
.annotate-viewport { position: relative; width: 100%; margin: 0 auto; }
.annotate-image { display: block; width: 100%; height: auto; border-radius: 6px; }
.annotate-overlay { position: absolute; inset: 0; }
.annotate-marker { position: absolute; transform: translate(-50%, -50%); width: 28px; height: 28px; padding: 0; border: 2px solid ${palette.markerBorder}; border-radius: 999px; background: var(--marker-color, #2563eb); color: #fff; font: 600 13px/1 system-ui; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 0 0 2px ${palette.markerShadow}; }
.annotate-marker-rect { transform: none; width: auto; height: auto; border: 2px solid var(--marker-color, #2563eb); background: ${palette.overlayScrim}; border-radius: 4px; }
.annotate-marker-rect .annotate-badge { position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); }
.annotate-badge { pointer-events: none; }
.annotate-marker:focus-visible, .annotate-card-close:focus-visible, .annotate-card a:focus-visible { outline: 3px solid ${palette.focusOutline}; outline-offset: 2px; }
.annotate-backdrop { position: fixed; inset: 0; background: ${palette.markerShadow}; }
.annotate-card { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 20; width: min(480px, 92vw); max-height: 80vh; overflow: auto; background: ${palette.cardBackground}; color: ${palette.text}; border: 1px solid ${palette.cardBorder}; border-radius: 12px; padding: 20px 20px 18px; box-shadow: 0 24px 48px ${palette.markerShadow}; }
.annotate-card-title { margin: 0 0 12px; font-size: 1.2rem; }
.annotate-card-body p { margin: 0 0 10px; }
.annotate-card-body :is(ul, ol) { margin: 0 0 10px; padding-left: 22px; }
.annotate-card-body blockquote { margin: 0 0 10px; padding: 4px 12px; border-left: 3px solid ${palette.cardBorder}; color: ${palette.blockquoteText}; }
.annotate-card-body code { background: ${palette.codeBackground}; border-radius: 4px; padding: 1px 5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
.annotate-card-body pre { background: ${palette.codeBackground}; border-radius: 8px; padding: 12px; overflow: auto; }
.annotate-card-body pre code { background: none; padding: 0; }
.annotate-card a { color: ${palette.link}; }
.annotate-card-tags { margin: 10px 0 0; }
.annotate-tag { display: inline-block; margin: 0 6px 6px 0; padding: 2px 10px; background: ${palette.tagBackground}; border-radius: 999px; font-size: 12px; }
.annotate-card-close { position: absolute; right: 10px; top: 10px; border: 1px solid ${palette.cardBorder}; background: ${palette.background}; color: ${palette.text}; border-radius: 8px; padding: 6px 10px; cursor: pointer; }
.annotate-noscript { color: ${palette.text}; padding: 16px; }`
}

const VIEWER_JS = `(function () {
  'use strict'
  var ACCENT_COLOR = '#2563eb'
  var dataElement = document.getElementById('annotate-data')
  var data = null
  try {
    data = dataElement ? JSON.parse(dataElement.textContent) : null
  } catch (error) {
    data = null
  }
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.pages) || !Array.isArray(data.hotspots)) {
    return
  }

  var openCard = null

  function element(tag, className, text) {
    var node = document.createElement(tag)
    if (className) {
      node.className = className
    }
    if (text !== undefined && text !== null) {
      node.textContent = text
    }
    return node
  }

  function percent(value) {
    return value * 100 + '%'
  }

  function buildMarker(hotspot, number) {
    var marker = element(
      'button',
      'annotate-marker' + (hotspot.shape === 'rect' ? ' annotate-marker-rect' : '')
    )
    marker.type = 'button'
    marker.style.left = percent(hotspot.x)
    marker.style.top = percent(hotspot.y)
    if (hotspot.shape === 'rect') {
      marker.style.width = percent(hotspot.w)
      marker.style.height = percent(hotspot.h)
    }
    marker.style.setProperty('--marker-color', hotspot.color || ACCENT_COLOR)
    marker.setAttribute('aria-haspopup', 'dialog')
    marker.setAttribute('aria-expanded', 'false')
    marker.setAttribute(
      'aria-label',
      (data.showBadgeNumbers ? number + '. ' : '') + hotspot.title
    )
    if (data.showBadgeNumbers) {
      marker.appendChild(element('span', 'annotate-badge', String(number)))
    }
    marker.addEventListener('click', function () {
      openCardFor(hotspot, marker)
    })
    return marker
  }

  function buildPage(page, pageIndex) {
    var section = element('section', 'annotate-page')
    section.setAttribute('aria-label', 'Page ' + (pageIndex + 1))
    var viewport = element('div', 'annotate-viewport')
    viewport.style.maxWidth = page.width + 'px'
    var image = element('img', 'annotate-image')
    image.alt = data.name
    image.src = page.imageDataUrl
    var overlay = element('div', 'annotate-overlay')
    viewport.appendChild(image)
    viewport.appendChild(overlay)
    data.hotspots.forEach(function (hotspot) {
      if (hotspot.pageId === page.id) {
        overlay.appendChild(buildMarker(hotspot, overlay.children.length + 1))
      }
    })
    section.appendChild(viewport)
    return section
  }

  function focusableItems(root) {
    var nodes = root.querySelectorAll('button, a[href]')
    return Array.prototype.filter.call(nodes, function (node) {
      return !node.disabled
    })
  }

  function handleKeydown(event) {
    if (!openCard) {
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closeCard(true)
      return
    }
    if (event.key !== 'Tab') {
      return
    }
    var items = focusableItems(openCard.card)
    if (items.length === 0) {
      event.preventDefault()
      return
    }
    var first = items[0]
    var last = items[items.length - 1]
    var active = document.activeElement
    if (event.shiftKey) {
      if (active === first || !openCard.card.contains(active)) {
        event.preventDefault()
        last.focus()
      }
    } else if (active === last || !openCard.card.contains(active)) {
      event.preventDefault()
      first.focus()
    }
  }

  function openCardFor(hotspot, marker) {
    if (openCard) {
      closeCard(false)
    }
    var backdrop = element('div', 'annotate-backdrop')
    var card = element('div', 'annotate-card')
    card.setAttribute('role', 'dialog')
    card.setAttribute('aria-modal', 'true')
    var title = element('h2', 'annotate-card-title', hotspot.title)
    title.id = 'annotate-card-title'
    card.setAttribute('aria-labelledby', 'annotate-card-title')
    var body = element('div', 'annotate-card-body')
    body.innerHTML = hotspot.descriptionHtml
    var close = element('button', 'annotate-card-close', 'Close')
    close.type = 'button'
    close.addEventListener('click', function () {
      closeCard(true)
    })
    backdrop.addEventListener('click', function () {
      closeCard(true)
    })
    card.appendChild(title)
    card.appendChild(body)
    if (Array.isArray(hotspot.tags) && hotspot.tags.length > 0) {
      var tags = element('div', 'annotate-card-tags')
      hotspot.tags.forEach(function (tag) {
        tags.appendChild(element('span', 'annotate-tag', tag))
      })
      card.appendChild(tags)
    }
    card.appendChild(close)
    document.body.appendChild(backdrop)
    document.body.appendChild(card)
    openCard = { card: card, backdrop: backdrop, marker: marker }
    marker.setAttribute('aria-expanded', 'true')
    document.addEventListener('keydown', handleKeydown)
    close.focus()
  }

  function closeCard(restoreFocus) {
    if (!openCard) {
      return
    }
    var current = openCard
    openCard = null
    document.removeEventListener('keydown', handleKeydown)
    current.card.remove()
    current.backdrop.remove()
    current.marker.setAttribute('aria-expanded', 'false')
    if (restoreFocus) {
      current.marker.focus()
    }
  }

  var main = element('main', 'annotate')
  var header = element('header', 'annotate-header')
  header.appendChild(element('h1', 'annotate-title', data.name))
  main.appendChild(header)
  data.pages.forEach(function (page, index) {
    main.appendChild(buildPage(page, index))
  })
  document.body.appendChild(main)
})()`

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderExportHtml(data: ExportedViewerData): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'\">",
    `<title>${escapeHtmlText(data.name)}</title>`,
    `<style>${viewerCss(data.exportTheme)}</style>`,
    '</head>',
    '<body>',
    '<noscript><p class="annotate-noscript">This exported file requires JavaScript to display its annotations.</p></noscript>',
    `<script type="application/json" id="annotate-data">${serializeScriptSafeJson(data)}</script>`,
    `<script>${VIEWER_JS}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n')
}
